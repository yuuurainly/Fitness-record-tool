/**
 * 云端历史数据 → 本地存储 迁移
 *
 * 分工：
 *  - createCloudReader 负责分页拉取（依赖注入的 callFunction，便于测试）
 *  - mapCloudData 是纯函数，负责字段映射与问题清单
 *  - runMigration 复用 storage.importData，因此天然获得「先校验、再备份、后写入」
 *
 * 迁移原则：
 *  - 只读云端，不改云端数据
 *  - 云端缺失的字段如实标记为缺失（例如食物记录没有营养素），绝不用 0 顶替
 *  - 幂等：记录 id 沿用云端 _id，重复迁移只会补缺，不会产生重复
 */

const nutrition = require('./nutrition.js')
const storage = require('./storage.js')

const CLOUD_COLLECTIONS = ['user_profiles', 'body_records', 'exercise_logs', 'food_logs']
const ID_PREFIX = 'cloud_'
const MAX_PAGES = 200

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/* ============================ 工具 ============================ */

function num (v) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toDateStr (value) {
  if (!value && value !== 0) return null
  if (typeof value === 'string') {
    if (DATE_RE.test(value)) return value
    const parsed = new Date(value)
    if (!isNaN(parsed.getTime())) return fmt(parsed)
    return null
  }
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : fmt(d)
}

function fmt (d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ============================ 分页读取 ============================ */

/**
 * 分页读取云端数据。
 * @param {object} options
 * @param {Function} options.callFunction 形如 wx.cloud.callFunction 的函数
 * @param {number}   [options.pageSize=100] 单页条数，云端上限 100
 */
function createCloudReader (options) {
  const opts = options || {}
  const callFunction = opts.callFunction
  const pageSize = Math.min(Math.max(Number(opts.pageSize) || 100, 1), 100)

  if (typeof callFunction !== 'function') throw new Error('createCloudReader 需要传入 callFunction')

  async function call (data) {
    const res = await callFunction({ name: 'exportUserData', data })
    const payload = res && res.result
    if (!payload) throw new Error('云函数 exportUserData 无返回，请确认已部署该云函数')
    if (payload.error) throw new Error(payload.error)
    return payload
  }

  async function fetchCollection (collection, fetchOptions) {
    const fo = fetchOptions || {}
    const all = []
    let skip = 0
    let diagnostics = null
    let page = 0

    try {
      for (; page < MAX_PAGES; page++) {
        const payload = await call({ collection, skip, limit: pageSize, diagnostics: page === 0 && fo.diagnostics === true })
        const data = payload.data || []
        all.push(...data)
        if (payload.diagnostics) diagnostics = payload.diagnostics
        if (!payload.hasMore || data.length === 0) break
        skip += data.length
      }
    } catch (e) {
      // 不吞掉错误，只补上「读到第几页、已取多少条」的上下文，方便定位
      const err = new Error(`读取云端 ${collection} 失败（第 ${page + 1} 页，已取 ${all.length} 条）：${e.message}`)
      err.collection = collection
      err.fetched = all.length
      err.cause = e
      throw err
    }

    if (page >= MAX_PAGES) {
      const err = new Error(`读取云端 ${collection} 超过 ${MAX_PAGES} 页上限，已取 ${all.length} 条，请检查云端数据是否异常`)
      err.collection = collection
      err.fetched = all.length
      throw err
    }

    return { collection, rows: all, diagnostics }
  }

  async function fetchAll (fetchOptions) {
    const fo = fetchOptions || {}
    const result = { fetchedAt: new Date().toISOString(), collections: {}, diagnostics: {} }
    for (const c of CLOUD_COLLECTIONS) {
      const r = await fetchCollection(c, fo)
      result.collections[c] = r.rows
      if (r.diagnostics) result.diagnostics[c] = r.diagnostics
    }
    return result
  }

  return { pageSize, fetchCollection, fetchAll }
}

/* ============================ 字段映射（纯函数） ============================ */

function mapProfile (raw, issues) {
  if (!raw) return null

  const profile = {
    heightCm: num(raw.height),
    weightKg: num(raw.currentWeight),
    age: num(raw.age),
    startWeightKg: num(raw.startWeight),
    targetWeightKg: num(raw.targetWeight),
    targetDate: raw.targetDate || null,
    migratedFrom: 'cloud',
    migratedAt: new Date().toISOString(),
    // 云端档案没有这些字段，标记为待补全，不猜默认值
    needsCompletion: true
  }

  if (!profile.heightCm || !profile.weightKg || !profile.age) {
    issues.push({ level: 'error', code: 'profile.incomplete', message: '云端档案缺少身高/体重/年龄，无法迁移，需在引导页重新填写' })
  }
  issues.push({ level: 'warn', code: 'profile.gender.missing', message: '云端档案没有性别字段，需要补全后才能计算 BMR' })
  issues.push({ level: 'warn', code: 'profile.activityLevel.missing', message: '云端档案没有活动水平，需要补全后才能计算 TDEE' })
  issues.push({ level: 'warn', code: 'profile.goalType.missing', message: '云端档案没有减脂/增肌目标，需要你确认' })

  if (raw.bmi !== undefined && profile.heightCm && profile.weightKg) {
    const bmi = nutrition.calculateBMI({ weightKg: profile.weightKg, heightCm: profile.heightCm })
    if (bmi.ok && Math.abs(bmi.value - num(raw.bmi)) > 0.1) {
      issues.push({ level: 'warn', code: 'profile.bmi.stale', message: `云端 BMI(${raw.bmi}) 与按当前身高体重重算的 ${bmi.value} 不一致，本地以重算值为准` })
    }
  }

  return profile
}

function mapBodyRecords (rows, heightCm, issues) {
  const out = []
  let skipped = 0
  rows.forEach(r => {
    const date = toDateStr(r && r.date)
    const weightKg = num(r && r.weight)
    if (!date || weightKg === null) { skipped++; return }

    const bmi = heightCm ? nutrition.calculateBMI({ weightKg, heightCm }) : { ok: false }
    out.push({
      id: ID_PREFIX + (r._id || `${date}_${weightKg}`),
      date,
      weightKg,
      weightBasis: nutrition.PROVENANCE.MEASURED,
      bmi: bmi.ok ? bmi.value : null,
      bmiBasis: bmi.ok ? nutrition.PROVENANCE.DERIVED : null,
      bodyFatPercent: num(r.bodyFat),
      note: r.note || '',
      source: 'cloud',
      createdAt: r.createTime ? new Date(r.createTime).toISOString() : new Date().toISOString()
    })
  })
  if (skipped) issues.push({ level: 'warn', code: 'bodyRecords.skipped', message: `${skipped} 条体重记录因日期或体重缺失被跳过` })
  return out
}

function mapWorkoutLogs (rows, issues) {
  const out = []
  let skipped = 0
  rows.forEach(r => {
    const date = toDateStr(r && r.date)
    const minutes = num(r && r.duration)
    if (!date || minutes === null || minutes <= 0) { skipped++; return }

    out.push({
      id: ID_PREFIX + (r._id || `${date}_${r.typeName || r.exerciseType}_${minutes}`),
      date,
      typeKey: r.exerciseType || 'custom',
      typeName: r.typeName || r.exerciseType || '未命名运动',
      minutes,
      minutesBasis: nutrition.PROVENANCE.MEASURED,
      metValue: null,
      kcal: num(r.calories),
      // 保留下当时按 MET 估算的结果，不按今天的体重重算
      kcalBasis: r.calories === undefined || r.calories === null ? null : nutrition.PROVENANCE.ESTIMATED,
      note: r.note || '',
      source: 'cloud',
      createdAt: r.createTime ? new Date(r.createTime).toISOString() : new Date().toISOString()
    })
  })
  if (skipped) issues.push({ level: 'warn', code: 'workoutLogs.skipped', message: `${skipped} 条运动记录因日期或时长缺失被跳过` })
  return out
}

function mapFoodLogs (rows, issues) {
  const out = []
  let skipped = 0
  let missingMacro = 0
  let unknownMeal = 0

  rows.forEach(r => {
    const date = toDateStr(r && r.date)
    const grams = num(r && r.amount)
    if (!date || grams === null || grams <= 0) { skipped++; return }

    const meal = nutrition.normalizeMeal(r.meal)
    if (!meal) unknownMeal++

    // 云端饮食记录只有热量，没有三大营养素；这里如实留空并标记来源
    const hasMacros = num(r.protein) !== null && num(r.carb) !== null && num(r.fat) !== null
    if (!hasMacros) missingMacro++

    out.push({
      id: ID_PREFIX + (r._id || `${date}_${r.name}_${grams}`),
      date,
      // 云端旧数据可能没写餐次，兜底归到「加餐」并在下面统计
      meal: meal || 'snack',
      foodName: r.name || '未命名食物',
      foodId: null,
      grams,
      gramsBasis: nutrition.PROVENANCE.MEASURED,
      kcalPer100g: num(r.calories),
      kcal: num(r.totalCalories),
      kcalBasis: r.totalCalories === undefined || r.totalCalories === null ? null : nutrition.PROVENANCE.DERIVED,
      protein: hasMacros ? num(r.protein) : null,
      carb: hasMacros ? num(r.carb) : null,
      fat: hasMacros ? num(r.fat) : null,
      macroBasis: hasMacros ? nutrition.PROVENANCE.DERIVED : null,
      source: 'cloud',
      createdAt: r.createTime ? new Date(r.createTime).toISOString() : new Date().toISOString()
    })
  })

  if (skipped) issues.push({ level: 'warn', code: 'foodLogs.skipped', message: `${skipped} 条饮食记录因日期或重量缺失被跳过` })
  if (missingMacro) issues.push({ level: 'warn', code: 'foodLogs.macro.missing', message: `${missingMacro} 条历史饮食记录没有营养素数据，营养趋势里会标记为「数据缺失」而不是 0` })
  if (unknownMeal) issues.push({ level: 'warn', code: 'foodLogs.meal.unknown', message: `${unknownMeal} 条饮食记录餐次无法识别，已归入「加餐」` })
  return out
}

/**
 * 把云端原始行映射成本地数据结构。
 * @returns {{ ok, data, issues, stats }}
 */
function mapCloudData (raw) {
  const src = raw || {}
  const collections = src.collections || src
  const issues = []

  const profile = mapProfile((collections.user_profiles || [])[0], issues)
  const heightCm = profile ? profile.heightCm : null

  const bodyRecords = mapBodyRecords(collections.body_records || [], heightCm, issues)
  const workoutLogs = mapWorkoutLogs(collections.exercise_logs || [], issues)
  const foodLogs = mapFoodLogs(collections.food_logs || [], issues)

  // 云端诊断：存在无法归属到本用户的文档
  Object.keys(src.diagnostics || {}).forEach(c => {
    const d = src.diagnostics[c]
    if (d && d.unattributable > 0) {
      issues.push({
        level: 'warn',
        code: 'cloud.unattributable',
        message: `${c} 里有 ${d.unattributable} 条文档没有 _openid，无法归属到任何账号，本次迁移不会包含它们`
      })
    }
  })

  const byMonth = list => {
    const grouped = {}
    list.forEach(item => {
      const m = item.date.slice(0, 7)
      if (!grouped[m]) grouped[m] = []
      grouped[m].push(item)
    })
    return grouped
  }

  const data = {
    format: storage.DATA_FORMAT,
    schemaVersion: storage.SCHEMA_VERSION,
    profile,
    bodyRecords,
    workoutLogs: byMonth(workoutLogs),
    foodLogs: byMonth(foodLogs)
  }

  return {
    ok: !issues.some(i => i.level === 'error'),
    data,
    issues,
    stats: {
      profile: profile ? 1 : 0,
      bodyRecords: bodyRecords.length,
      workoutLogs: workoutLogs.length,
      foodLogs: foodLogs.length,
      foodLogsMissingMacros: foodLogs.filter(l => l.protein === null).length,
      dateRange: foodLogs.length
        ? { from: foodLogs[0].date, to: foodLogs[foodLogs.length - 1].date }
        : null
    }
  }
}

/* ============================ 预览与执行 ============================ */

/**
 * 只做映射与校验，不写入任何本地数据。
 */
function previewMigration (store, raw) {
  const mapped = mapCloudData(raw)
  const check = store.validateImportData(mapped.data)
  return {
    ok: mapped.ok && check.ok,
    stats: mapped.stats,
    issues: mapped.issues,
    errors: check.errors,
    warnings: check.warnings,
    mapped
  }
}

/**
 * 执行迁移。走 storage.importData，因此：
 *  - 任何一条数据不合法则整体拒绝，不写入
 *  - 写入前自动留一份导入前备份
 *  - 默认 merge，重复执行不会产生重复记录
 */
function runMigration (store, raw, options) {
  const o = options || {}
  const mapped = mapCloudData(raw)
  if (!mapped.ok) {
    return { ok: false, written: false, errors: mapped.issues.filter(i => i.level === 'error').map(i => i.message), issues: mapped.issues, stats: mapped.stats }
  }

  const result = store.importData(mapped.data, { mode: o.mode || 'merge' })
  return Object.assign({}, result, { issues: mapped.issues, stats: mapped.stats, previewOk: result.ok })
}

module.exports = {
  CLOUD_COLLECTIONS,
  ID_PREFIX,
  createCloudReader,
  toDateStr,
  mapCloudData,
  previewMigration,
  runMigration
}
