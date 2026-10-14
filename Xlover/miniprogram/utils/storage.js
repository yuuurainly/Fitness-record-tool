/**
 * 本地数据层
 *
 * 只负责「存」：命名空间、分片、版本迁移、校验、导入导出。
 * 「算」的部分在 utils/nutrition.js，两边分离，便于单独测试。
 *
 * 设计要点：
 *  - 所有写入先校验，校验失败不落盘，绝不覆盖已有数据
 *  - 历史目标快照按日期冻结，切换减脂/增肌不会改写历史
 *  - 训练记录按月分片，避免单 key 触顶
 *  - 导入前自动留一份本地备份，可回滚
 *
 * 适配器可注入：小程序运行时用 wx 适配器，测试时用内存适配器。
 */

const nutrition = require('./nutrition.js')
const foodLibrary = require('./foodLibrary.js')

const NS = 'xlover.v1'
const SCHEMA_VERSION = 1
const DATA_FORMAT = 'xlover.data'
const MAX_PRE_IMPORT_BACKUPS = 3

const KEYS = {
  schema: `${NS}.schema`,
  profile: `${NS}.profile`,
  settings: `${NS}.settings`,
  nutritionPlan: `${NS}.nutritionPlan`,
  bodyRecords: `${NS}.bodyRecords`,
  customFoods: `${NS}.customFoods`,
  libVersion: `${NS}.libVersion`,
  backupIndex: `${NS}.backupIndex`
}

const WORKOUT_PREFIX = `${NS}.workoutLogs.`
const FOOD_LOG_PREFIX = `${NS}.foodLogs.`
const SNAPSHOT_PREFIX = `${NS}.targets.`
const PRE_IMPORT_PREFIX = `${NS}.backup.preImport.`

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ============================ 适配器 ============================ */

function createMemoryAdapter (seed) {
  const map = new Map(Object.entries(seed || {}))
  return {
    name: 'memory',
    get (key) {
      return map.has(key) ? JSON.parse(JSON.stringify(map.get(key))) : null
    },
    set (key, value) {
      map.set(key, JSON.parse(JSON.stringify(value)))
    },
    remove (key) {
      map.delete(key)
    },
    keys () {
      return [...map.keys()]
    },
    info () {
      return { keys: [...map.keys()], currentSize: 0, limitSize: 10240 }
    }
  }
}

function createWxAdapter () {
  return {
    name: 'wx',
    get (key) {
      try {
        const v = wx.getStorageSync(key)
        return v === '' || v === undefined ? null : v
      } catch (e) {
        return null
      }
    },
    set (key, value) {
      wx.setStorageSync(key, value)
    },
    remove (key) {
      wx.removeStorageSync(key)
    },
    keys () {
      try {
        return wx.getStorageInfoSync().keys || []
      } catch (e) {
        return []
      }
    },
    info () {
      try {
        const i = wx.getStorageInfoSync()
        return { keys: i.keys || [], currentSize: i.currentSize, limitSize: i.limitSize }
      } catch (e) {
        return { keys: [], currentSize: null, limitSize: null }
      }
    }
  }
}

/* ============================ 工具 ============================ */

function todayStr (date) {
  const d = date ? new Date(date) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthOf (dateStr) {
  return String(dateStr).slice(0, 7)
}

let idSeq = 0
function newId (prefix) {
  idSeq += 1
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}`
}

function isPlainObject (v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function sortByDateAsc (list) {
  return list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/* ============================ 迁移 ============================ */

const MIGRATIONS = {
  0: function (ctx) {
    ctx.set(KEYS.schema, { schemaVersion: 1, createdAt: ctx.now, appVersion: ctx.appVersion })
  }
}

/* ============================ Store ============================ */

function createStore (options) {
  const opts = options || {}
  const adapter = opts.adapter || createWxAdapter()
  const appVersion = opts.appVersion || ''

  function read (key, fallback) {
    const v = adapter.get(key)
    return v === null || v === undefined ? fallback : v
  }

  function keysWithPrefix (prefix) {
    return adapter.keys().filter(k => k.indexOf(prefix) === 0)
  }

  /* ---------- 版本 ---------- */

  function init () {
    const raw = adapter.get(KEYS.schema)
    let version = 0
    if (isPlainObject(raw) && typeof raw.schemaVersion === 'number') version = raw.schemaVersion

    if (version > SCHEMA_VERSION) {
      return {
        ok: false,
        schemaVersion: version,
        applied: [],
        errors: [`本地数据版本(${version})高于当前小程序支持的版本(${SCHEMA_VERSION})，请升级小程序后再使用`]
      }
    }

    // 需要升级且已经存在业务数据时，先自动留一份升级前备份，升级失败可回滚
    const needsUpgrade = version < SCHEMA_VERSION
    const hasExistingData = needsUpgrade && adapter.keys().some(k => k.indexOf(NS + '.') === 0 && k !== KEYS.schema)
    let migrationBackupKey = null
    if (hasExistingData) {
      const backup = createPreImportBackup()
      migrationBackupKey = backup.ok ? backup.key : null
    }

    const applied = []
    while (version < SCHEMA_VERSION) {
      const migrate = MIGRATIONS[version]
      if (!migrate) break
      migrate({ set: adapter.set, now: new Date().toISOString(), appVersion })
      version += 1
      applied.push(version)
    }

    if (!adapter.get(KEYS.schema)) {
      adapter.set(KEYS.schema, { schemaVersion: SCHEMA_VERSION, createdAt: new Date().toISOString(), appVersion })
    }

    return { ok: true, schemaVersion: SCHEMA_VERSION, applied, migrationBackupKey, errors: [] }
  }

  function getSchema () {
    return adapter.get(KEYS.schema)
  }

  /* ---------- 身体资料 ---------- */

  function getProfile () {
    return read(KEYS.profile, null)
  }

  function saveProfile (patch) {
    if (!isPlainObject(patch)) return { ok: false, errors: ['资料格式不正确'], warnings: [] }
    const merged = Object.assign({}, getProfile() || {}, patch)
    const check = nutrition.validateProfile(merged, { requireActivity: false })
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings }

    merged.heightCm = Number(merged.heightCm)
    merged.weightKg = Number(merged.weightKg)
    merged.age = Number(merged.age)
    merged.updatedAt = new Date().toISOString()

    adapter.set(KEYS.profile, merged)
    return { ok: true, profile: merged, warnings: check.warnings }
  }

  /* ---------- 体重历史 ---------- */

  function getBodyRecords () {
    const list = read(KEYS.bodyRecords, [])
    return Array.isArray(list) ? sortByDateAsc(list) : []
  }

  function getLatestBodyRecord () {
    const list = getBodyRecords()
    return list.length ? list[list.length - 1] : null
  }

  function addBodyRecord (record) {
    const check = nutrition.validateBodyRecord(record)
    if (!check.ok) return { ok: false, errors: check.errors, warnings: [] }

    const profile = getProfile()
    const bmiRes = profile && profile.heightCm
      ? nutrition.calculateBMI({ weightKg: record.weightKg, heightCm: profile.heightCm })
      : { ok: false, value: null }

    const entry = {
      id: record.id || newId('body'),
      date: record.date,
      weightKg: Number(record.weightKg),
      weightBasis: nutrition.PROVENANCE.MEASURED,
      bmi: bmiRes.ok ? bmiRes.value : null,
      bmiBasis: bmiRes.ok ? bmiRes.basis : null,
      bodyFatPercent: record.bodyFatPercent === undefined || record.bodyFatPercent === null || record.bodyFatPercent === ''
        ? null
        : Number(record.bodyFatPercent),
      note: record.note || '',
      createdAt: record.createdAt || new Date().toISOString()
    }

    const list = getBodyRecords()
    const idx = list.findIndex(r => r.date === entry.date)
    if (idx >= 0) {
      entry.id = list[idx].id
      entry.createdAt = list[idx].createdAt
      list[idx] = entry
    } else {
      list.push(entry)
    }
    adapter.set(KEYS.bodyRecords, sortByDateAsc(list))

    // 同步当前体重到资料；不改写任何历史记录
    if (profile) adapter.set(KEYS.profile, Object.assign({}, profile, { weightKg: entry.weightKg, updatedAt: new Date().toISOString() }))

    return { ok: true, record: entry, bmi: entry.bmi, warnings: [] }
  }

  /* ---------- 训练日志（按月分片） ---------- */

  function listWorkoutMonths () {
    return keysWithPrefix(WORKOUT_PREFIX).map(k => k.slice(WORKOUT_PREFIX.length)).sort()
  }

  function getWorkoutLogs (range) {
    const r = range || {}
    const months = listWorkoutMonths()
    let all = []
    months.forEach(m => {
      const chunk = read(WORKOUT_PREFIX + m, [])
      if (Array.isArray(chunk)) all = all.concat(chunk)
    })
    if (r.from) all = all.filter(l => l.date >= r.from)
    if (r.to) all = all.filter(l => l.date <= r.to)
    return sortByDateAsc(all)
  }

  function addWorkoutLog (log) {
    const check = nutrition.validateWorkoutLog(log)
    if (!check.ok) return { ok: false, errors: check.errors, warnings: [] }

    const entry = {
      id: log.id || newId('workout'),
      date: log.date,
      typeKey: log.typeKey || 'custom',
      typeName: log.typeName,
      minutes: Number(log.minutes),
      minutesBasis: nutrition.PROVENANCE.MEASURED,
      metValue: log.metValue === undefined || log.metValue === null || log.metValue === '' ? null : Number(log.metValue),
      kcal: log.kcal === undefined || log.kcal === null || log.kcal === '' ? null : Number(log.kcal),
      kcalBasis: log.kcal === undefined || log.kcal === null || log.kcal === '' ? null : nutrition.PROVENANCE.ESTIMATED,
      note: log.note || '',
      createdAt: log.createdAt || new Date().toISOString()
    }

    const key = WORKOUT_PREFIX + monthOf(entry.date)
    const chunk = read(key, [])
    const list = Array.isArray(chunk) ? chunk : []
    list.push(entry)
    adapter.set(key, list)

    return { ok: true, record: entry, warnings: [] }
  }

  function removeWorkoutLog (id) {
    const months = listWorkoutMonths()
    for (const m of months) {
      const key = WORKOUT_PREFIX + m
      const chunk = read(key, [])
      if (!Array.isArray(chunk)) continue
      const idx = chunk.findIndex(l => l.id === id)
      if (idx >= 0) {
        chunk.splice(idx, 1)
        if (chunk.length) adapter.set(key, chunk)
        else adapter.remove(key)
        return { ok: true }
      }
    }
    return { ok: false, errors: ['未找到该训练记录'] }
  }

  /* ---------- 饮食记录（按月分片，与训练日志同理） ---------- */

  function listFoodLogMonths () {
    return keysWithPrefix(FOOD_LOG_PREFIX).map(k => k.slice(FOOD_LOG_PREFIX.length)).sort()
  }

  function getFoodLogs (range) {
    const r = range || {}
    let all = []
    listFoodLogMonths().forEach(m => {
      const chunk = read(FOOD_LOG_PREFIX + m, [])
      if (Array.isArray(chunk)) all = all.concat(chunk)
    })
    if (r.from) all = all.filter(l => l.date >= r.from)
    if (r.to) all = all.filter(l => l.date <= r.to)
    return sortByDateAsc(all)
  }

  function addFoodLog (log) {
    const check = nutrition.validateFoodLog(log)
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings }

    const hasMacros = log.protein !== undefined && log.protein !== null && log.protein !== '' &&
      log.carb !== undefined && log.carb !== null && log.carb !== '' &&
      log.fat !== undefined && log.fat !== null && log.fat !== ''

    const entry = {
      id: log.id || newId('food'),
      date: log.date,
      meal: check.normalized.meal,
      foodName: String(log.foodName).trim(),
      foodId: log.foodId === undefined ? null : log.foodId,
      grams: Number(log.grams),
      gramsBasis: nutrition.PROVENANCE.MEASURED,
      kcalPer100g: log.kcalPer100g === undefined || log.kcalPer100g === null || log.kcalPer100g === ''
        ? null
        : Number(log.kcalPer100g),
      kcal: log.kcal === undefined || log.kcal === null || log.kcal === '' ? null : Number(log.kcal),
      kcalBasis: log.kcal === undefined || log.kcal === null || log.kcal === '' ? null : nutrition.PROVENANCE.DERIVED,
      protein: hasMacros ? Number(log.protein) : null,
      carb: hasMacros ? Number(log.carb) : null,
      fat: hasMacros ? Number(log.fat) : null,
      macroBasis: hasMacros ? nutrition.PROVENANCE.DERIVED : null,
      // 来源标记：cloud = 从云端迁入且营养素缺失，local = 本地新记录
      source: log.source || 'local',
      note: log.note || '',
      createdAt: log.createdAt || new Date().toISOString()
    }

    const key = FOOD_LOG_PREFIX + monthOf(entry.date)
    const chunk = read(key, [])
    const list = Array.isArray(chunk) ? chunk : []

    const idx = list.findIndex(l => l.id === entry.id)
    if (idx >= 0) list[idx] = entry
    else list.push(entry)

    adapter.set(key, list)
    return { ok: true, record: entry, warnings: check.warnings }
  }

  function removeFoodLog (id) {
    for (const m of listFoodLogMonths()) {
      const key = FOOD_LOG_PREFIX + m
      const chunk = read(key, [])
      if (!Array.isArray(chunk)) continue
      const idx = chunk.findIndex(l => l.id === id)
      if (idx >= 0) {
        chunk.splice(idx, 1)
        if (chunk.length) adapter.set(key, chunk)
        else adapter.remove(key)
        return { ok: true }
      }
    }
    return { ok: false, errors: ['未找到该饮食记录'] }
  }

  /* ---------- 自定义食物与库版本 ---------- */

  function getCustomFoods () {
    const list = read(KEYS.customFoods, [])
    return Array.isArray(list) ? list : []
  }

  function addCustomFood (input) {
    const check = foodLibrary.validateCustomFood(input)
    if (!check.ok) return { ok: false, errors: check.errors, warnings: [] }

    const list = getCustomFoods()
    const dup = list.find(f => f.name === check.food.name)
    if (dup) return { ok: true, food: dup, duplicated: true, warnings: [] }

    list.push(check.food)
    adapter.set(KEYS.customFoods, list)
    return { ok: true, food: check.food, duplicated: false, warnings: [] }
  }

  function removeCustomFood (id) {
    const list = getCustomFoods()
    const next = list.filter(f => f.id !== id)
    if (next.length === list.length) return { ok: false, errors: ['未找到该自定义食物'] }
    adapter.set(KEYS.customFoods, next)
    return { ok: true }
  }

  function getLibraryVersion () {
    return read(KEYS.libVersion, null)
  }

  function setLibraryVersion (version) {
    const entry = { foodLibrary: version, updatedAt: new Date().toISOString() }
    adapter.set(KEYS.libVersion, entry)
    return { ok: true, libVersion: entry }
  }

  /* ---------- 营养计划 ---------- */

  function getNutritionPlan () {
    return read(KEYS.nutritionPlan, null)
  }

  function saveNutritionPlan (plan) {
    if (!isPlainObject(plan)) return { ok: false, errors: ['计划格式不正确'], warnings: [] }
    const check = nutrition.validateNutritionPlan(plan)
    if (!check.ok) return { ok: false, errors: check.errors, warnings: check.warnings }

    const entry = Object.assign({}, plan, { updatedAt: new Date().toISOString() })
    adapter.set(KEYS.nutritionPlan, entry)
    return { ok: true, plan: entry, warnings: check.warnings }
  }

  /* ---------- 历史目标快照（冻结，不随设置漂移） ---------- */

  function listSnapshotDates () {
    return keysWithPrefix(SNAPSHOT_PREFIX).map(k => k.slice(SNAPSHOT_PREFIX.length)).sort()
  }

  function getTargetSnapshot (date) {
    if (!DATE_RE.test(String(date))) return null
    return read(SNAPSHOT_PREFIX + date, null)
  }

  /**
   * 写入当日目标快照。
   * 历史日期一旦写入即不可改写；只有「今天」且显式 allowOverwrite 时才允许覆盖。
   */
  function putTargetSnapshot (date, snapshot, putOptions) {
    const o = putOptions || {}
    if (!DATE_RE.test(String(date))) return { ok: false, errors: ['快照日期格式应为 YYYY-MM-DD'] }
    if (!isPlainObject(snapshot)) return { ok: false, errors: ['快照内容格式不正确'] }

    const key = SNAPSHOT_PREFIX + date
    const existing = adapter.get(key)
    const today = o.today || todayStr()
    const canOverwrite = o.allowOverwrite === true && date === today

    if (existing && !canOverwrite) {
      return {
        ok: false,
        immutable: true,
        errors: ['历史目标快照不可改写，切换目标只影响今天及以后'],
        existing
      }
    }

    const entry = Object.assign({}, snapshot, {
      date,
      ruleVersion: snapshot.ruleVersion || 'v1',
      frozenAt: existing && existing.frozenAt ? existing.frozenAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    adapter.set(key, entry)
    return { ok: true, snapshot: entry, replaced: !!existing }
  }

  /* ---------- 设置 ---------- */

  function getSettings () {
    return read(KEYS.settings, {})
  }

  function saveSettings (patch) {
    if (!isPlainObject(patch)) return { ok: false, errors: ['设置格式不正确'] }
    const merged = Object.assign({}, getSettings(), patch)
    merged.updatedAt = new Date().toISOString()
    adapter.set(KEYS.settings, merged)
    return { ok: true, settings: merged }
  }

  /* ---------- 导出 / 导入 ---------- */

  function exportData () {
    const workoutLogs = {}
    listWorkoutMonths().forEach(m => {
      workoutLogs[m] = read(WORKOUT_PREFIX + m, [])
    })
    const targetSnapshots = {}
    listSnapshotDates().forEach(d => {
      targetSnapshots[d] = read(SNAPSHOT_PREFIX + d, null)
    })
    const foodLogs = {}
    listFoodLogMonths().forEach(m => {
      foodLogs[m] = read(FOOD_LOG_PREFIX + m, [])
    })

    return {
      format: DATA_FORMAT,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion,
      profile: getProfile(),
      settings: getSettings(),
      nutritionPlan: getNutritionPlan(),
      bodyRecords: getBodyRecords(),
      workoutLogs,
      foodLogs,
      customFoods: getCustomFoods(),
      libVersion: getLibraryVersion(),
      targetSnapshots
    }
  }

  /**
   * 校验导入数据。任何一项不合法即整体拒绝，不写入任何内容。
   */
  function validateImportData (data) {
    const errors = []
    const warnings = []

    if (!isPlainObject(data)) return { ok: false, errors: ['导入内容不是有效的对象'], warnings }
    if (data.format && data.format !== DATA_FORMAT) errors.push(`导入内容格式标识为 ${data.format}，不是本小程序的备份`)
    if (typeof data.schemaVersion !== 'number') errors.push('缺少 schemaVersion')
    else if (data.schemaVersion > SCHEMA_VERSION) errors.push(`备份数据版本(${data.schemaVersion})高于当前小程序支持的版本(${SCHEMA_VERSION})`)

    if (data.profile !== null && data.profile !== undefined) {
      if (!isPlainObject(data.profile)) errors.push('profile 字段格式不正确')
      else {
        // 云端旧档案缺少性别/活动水平，迁移时允许先落库并标记待补全
        const c = nutrition.validateProfile(data.profile, { requireActivity: false, allowIncomplete: true })
        if (!c.ok) errors.push(...c.errors.map(e => `profile: ${e}`))
      }
    }

    if (data.bodyRecords !== undefined && data.bodyRecords !== null) {
      if (!Array.isArray(data.bodyRecords)) errors.push('bodyRecords 应为数组')
      else data.bodyRecords.forEach((r, i) => {
        const c = nutrition.validateBodyRecord(r || {})
        if (!c.ok) errors.push(...c.errors.map(e => `bodyRecords[${i}]: ${e}`))
      })
    }

    if (data.workoutLogs !== undefined && data.workoutLogs !== null) {
      if (!isPlainObject(data.workoutLogs)) errors.push('workoutLogs 应为按月份分组的对象')
      else Object.keys(data.workoutLogs).forEach(m => {
        if (!/^\d{4}-\d{2}$/.test(m)) { errors.push(`workoutLogs 的月份键 ${m} 格式不正确`); return }
        const chunk = data.workoutLogs[m]
        if (!Array.isArray(chunk)) { errors.push(`workoutLogs.${m} 应为数组`); return }
        chunk.forEach((l, i) => {
          const c = nutrition.validateWorkoutLog(l || {})
          if (!c.ok) errors.push(...c.errors.map(e => `workoutLogs.${m}[${i}]: ${e}`))
        })
      })
    }

    if (data.targetSnapshots !== undefined && data.targetSnapshots !== null) {
      if (!isPlainObject(data.targetSnapshots)) errors.push('targetSnapshots 应为以日期为键的对象')
      else Object.keys(data.targetSnapshots).forEach(d => {
        if (!DATE_RE.test(d)) errors.push(`targetSnapshots 的日期键 ${d} 格式不正确`)
        else if (!isPlainObject(data.targetSnapshots[d])) errors.push(`targetSnapshots.${d} 应为对象`)
      })
    }

    if (data.nutritionPlan !== null && data.nutritionPlan !== undefined && !isPlainObject(data.nutritionPlan)) {
      errors.push('nutritionPlan 字段格式不正确')
    }
    if (data.foodLogs !== undefined && data.foodLogs !== null) {
      if (!isPlainObject(data.foodLogs)) errors.push('foodLogs 应为按月份分组的对象')
      else Object.keys(data.foodLogs).forEach(m => {
        if (!/^\d{4}-\d{2}$/.test(m)) { errors.push(`foodLogs 的月份键 ${m} 格式不正确`); return }
        const chunk = data.foodLogs[m]
        if (!Array.isArray(chunk)) { errors.push(`foodLogs.${m} 应为数组`); return }
        chunk.forEach((l, i) => {
          const c = nutrition.validateFoodLog(l || {})
          if (!c.ok) errors.push(...c.errors.map(e => `foodLogs.${m}[${i}]: ${e}`))
        })
      })
    }

    if (data.customFoods !== undefined && data.customFoods !== null) {
      if (!Array.isArray(data.customFoods)) errors.push('customFoods 应为数组')
      else data.customFoods.forEach((f, i) => {
        const c = foodLibrary.validateCustomFood(f || {})
        if (!c.ok) errors.push(...c.errors.map(e => `customFoods[${i}]: ${e}`))
      })
    }

    if (data.libVersion !== null && data.libVersion !== undefined && !isPlainObject(data.libVersion)) {
      errors.push('libVersion 字段格式不正确')
    }
    if (data.settings !== null && data.settings !== undefined && !isPlainObject(data.settings)) {
      errors.push('settings 字段格式不正确')
    }

    return { ok: errors.length === 0, errors, warnings }
  }

  function importData (data, importOptions) {
    const o = importOptions || {}
    const mode = o.mode === 'replace' ? 'replace' : 'merge'

    const check = validateImportData(data)
    if (!check.ok) {
      return { ok: false, mode, errors: check.errors, warnings: check.warnings, written: false, backupKey: null }
    }

    const backup = createPreImportBackup()
    if (!backup.ok) {
      return { ok: false, mode, errors: ['导入前备份失败，已中止导入：' + backup.errors.join('；')], warnings: [], written: false, backupKey: null }
    }

    const summary = { profile: 0, bodyRecords: 0, workoutLogs: 0, foodLogs: 0, customFoods: 0, targetSnapshots: 0, settings: 0, nutritionPlan: 0 }

    if (mode === 'replace') {
      if (isPlainObject(data.profile)) { adapter.set(KEYS.profile, data.profile); summary.profile = 1 }
      adapter.set(KEYS.bodyRecords, sortByDateAsc(Array.isArray(data.bodyRecords) ? data.bodyRecords : []))
      summary.bodyRecords = Array.isArray(data.bodyRecords) ? data.bodyRecords.length : 0

      listWorkoutMonths().forEach(m => adapter.remove(WORKOUT_PREFIX + m))
      Object.keys(data.workoutLogs || {}).forEach(m => {
        adapter.set(WORKOUT_PREFIX + m, data.workoutLogs[m])
        summary.workoutLogs += data.workoutLogs[m].length
      })

      listFoodLogMonths().forEach(m => adapter.remove(FOOD_LOG_PREFIX + m))
      Object.keys(data.foodLogs || {}).forEach(m => {
        adapter.set(FOOD_LOG_PREFIX + m, data.foodLogs[m])
        summary.foodLogs += data.foodLogs[m].length
      })
      adapter.set(KEYS.customFoods, Array.isArray(data.customFoods) ? data.customFoods : [])
      summary.customFoods = Array.isArray(data.customFoods) ? data.customFoods.length : 0

      listSnapshotDates().forEach(d => adapter.remove(SNAPSHOT_PREFIX + d))
      Object.keys(data.targetSnapshots || {}).forEach(d => {
        adapter.set(SNAPSHOT_PREFIX + d, data.targetSnapshots[d])
        summary.targetSnapshots += 1
      })

      if (isPlainObject(data.settings)) { adapter.set(KEYS.settings, data.settings); summary.settings = 1 }
      if (isPlainObject(data.nutritionPlan)) { adapter.set(KEYS.nutritionPlan, data.nutritionPlan); summary.nutritionPlan = 1 }
    } else {
      // merge：本地已有的一律保留，只补缺失，确保不破坏现有数据
      if (!getProfile() && isPlainObject(data.profile)) { adapter.set(KEYS.profile, data.profile); summary.profile = 1 }

      const localBody = getBodyRecords()
      const localDates = new Set(localBody.map(r => r.date))
      const incomingBody = (Array.isArray(data.bodyRecords) ? data.bodyRecords : []).filter(r => r && !localDates.has(r.date))
      if (incomingBody.length) {
        adapter.set(KEYS.bodyRecords, sortByDateAsc(localBody.concat(incomingBody)))
        summary.bodyRecords = incomingBody.length
      }

      const localIds = new Set(getWorkoutLogs().map(l => l.id))
      Object.keys(data.workoutLogs || {}).forEach(m => {
        const key = WORKOUT_PREFIX + m
        const chunk = read(key, [])
        const list = Array.isArray(chunk) ? chunk : []
        const add = data.workoutLogs[m].filter(l => l && !localIds.has(l.id))
        if (add.length) {
          adapter.set(key, list.concat(add))
          summary.workoutLogs += add.length
          add.forEach(l => localIds.add(l.id))
        }
      })

      const localFoodIds = new Set(getFoodLogs().map(l => l.id))
      Object.keys(data.foodLogs || {}).forEach(m => {
        const key = FOOD_LOG_PREFIX + m
        const chunk = read(key, [])
        const list = Array.isArray(chunk) ? chunk : []
        const add = data.foodLogs[m].filter(l => l && !localFoodIds.has(l.id))
        if (add.length) {
          adapter.set(key, list.concat(add))
          summary.foodLogs += add.length
          add.forEach(l => localFoodIds.add(l.id))
        }
      })

      if (Array.isArray(data.customFoods) && data.customFoods.length) {
        const existing = getCustomFoods()
        const names = new Set(existing.map(f => f.name))
        const add = data.customFoods.filter(f => f && !names.has(f.name))
        if (add.length) {
          adapter.set(KEYS.customFoods, existing.concat(add))
          summary.customFoods = add.length
        }
      }

      Object.keys(data.targetSnapshots || {}).forEach(d => {
        if (!adapter.get(SNAPSHOT_PREFIX + d)) {
          adapter.set(SNAPSHOT_PREFIX + d, data.targetSnapshots[d])
          summary.targetSnapshots += 1
        }
      })

      if (!Object.keys(getSettings()).length && isPlainObject(data.settings)) { adapter.set(KEYS.settings, data.settings); summary.settings = 1 }
      if (!getNutritionPlan() && isPlainObject(data.nutritionPlan)) { adapter.set(KEYS.nutritionPlan, data.nutritionPlan); summary.nutritionPlan = 1 }
    }

    return { ok: true, mode, errors: [], warnings: check.warnings, written: true, summary, backupKey: backup.key }
  }

  /* ---------- 导入前备份 ---------- */

  function getBackupIndex () {
    const idx = read(KEYS.backupIndex, [])
    return Array.isArray(idx) ? idx : []
  }

  function createPreImportBackup () {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const key = PRE_IMPORT_PREFIX + ts
      adapter.set(key, exportData())

      const index = getBackupIndex()
      index.push({ key, createdAt: new Date().toISOString() })
      while (index.length > MAX_PRE_IMPORT_BACKUPS) {
        const dropped = index.shift()
        adapter.remove(dropped.key)
      }
      adapter.set(KEYS.backupIndex, index)
      return { ok: true, key, createdAt: new Date().toISOString() }
    } catch (e) {
      return { ok: false, errors: [e && e.message ? e.message : '未知错误'] }
    }
  }

  function listPreImportBackups () {
    return getBackupIndex()
  }

  function restorePreImportBackup (key) {
    const data = adapter.get(key)
    if (!isPlainObject(data)) return { ok: false, errors: ['该备份不存在或已损坏'] }
    const check = validateImportData(data)
    if (!check.ok) return { ok: false, errors: check.errors }

    // 恢复同样走 replace，并在恢复前再留一份备份
    const pre = createPreImportBackup()
    if (!pre.ok) return { ok: false, errors: ['恢复前备份失败，已中止'] }

    const res = importData(data, { mode: 'replace' })
    return Object.assign({}, res, { restoredFrom: key, backupKey: pre.key })
  }

  /* ---------- 容量 ---------- */

  function estimateUsage () {
    const info = adapter.info ? adapter.info() : { keys: adapter.keys(), currentSize: null, limitSize: null }
    const allKeys = info.keys || []
    const own = allKeys.filter(k => k.indexOf(NS) === 0)
    let bytes = 0
    own.forEach(k => {
      try {
        const v = adapter.get(k)
        bytes += JSON.stringify(v === null ? '' : v).length
      } catch (e) {}
    })
    return {
      adapter: adapter.name,
      keyCount: own.length,
      approxBytes: bytes,
      currentSizeKB: info.currentSize,
      limitSizeKB: info.limitSize,
      usedPercent: info.limitSize ? Math.round((info.currentSize / info.limitSize) * 1000) / 10 : null
    }
  }

  function clearAll (clearOptions) {
    const o = clearOptions || {}
    if (o.confirm !== true) return { ok: false, errors: ['清空数据需要显式确认(confirm: true)'] }
    const removed = []
    adapter.keys().filter(k => k.indexOf(NS) === 0).forEach(k => {
      adapter.remove(k)
      removed.push(k)
    })
    return { ok: true, removed }
  }

  return {
    adapterName: adapter.name,
    schemaVersion: SCHEMA_VERSION,
    keys: KEYS,
    init,
    getSchema,
    getProfile,
    saveProfile,
    getBodyRecords,
    getLatestBodyRecord,
    addBodyRecord,
    listWorkoutMonths,
    getWorkoutLogs,
    addWorkoutLog,
    removeWorkoutLog,
    listFoodLogMonths,
    getFoodLogs,
    addFoodLog,
    removeFoodLog,
    getCustomFoods,
    addCustomFood,
    removeCustomFood,
    getLibraryVersion,
    setLibraryVersion,
    getNutritionPlan,
    saveNutritionPlan,
    listSnapshotDates,
    getTargetSnapshot,
    putTargetSnapshot,
    getSettings,
    saveSettings,
    exportData,
    validateImportData,
    importData,
    createPreImportBackup,
    listPreImportBackups,
    restorePreImportBackup,
    estimateUsage,
    clearAll
  }
}

module.exports = {
  NS,
  SCHEMA_VERSION,
  DATA_FORMAT,
  KEYS,
  MAX_PRE_IMPORT_BACKUPS,
  createMemoryAdapter,
  createWxAdapter,
  createStore
}
