/**
 * 备份 / 导入 / 恢复
 *
 * 分成两层：
 *  - 纯逻辑（buildPayload / parsePayload / summarize / applyImport）：无 wx 依赖，可单测
 *  - 设备 IO（createWxIo）：文件与剪贴板，小程序运行时才用到
 *
 * 安全约定：
 *  - 导入前先整体校验，校验不通过不写任何数据
 *  - 校验通过后先落一份「导入前备份」，再执行写入
 *  - 默认 merge 模式，本地已有数据一律保留
 */

const storage = require('./storage.js')

const BACKUP_FORMAT = 'xlover.backup'
const BACKUP_VERSION = 1

/* ============================ 校验和 ============================ */

// FNV-1a 32 位，仅用于发现传输/粘贴过程中的内容损坏，不做安全用途
function checksum (text) {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

function signedBody (payload) {
  return {
    format: payload.format,
    backupVersion: payload.backupVersion,
    exportedAt: payload.exportedAt,
    appVersion: payload.appVersion,
    data: payload.data
  }
}

function payloadChecksum (payload) {
  return checksum(JSON.stringify(signedBody(payload)))
}

/* ============================ 构包 / 解析 ============================ */

function buildPayload (store, meta) {
  const m = meta || {}
  const payload = {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: m.appVersion || '',
    data: store.exportData()
  }
  payload.checksum = payloadChecksum(payload)
  return payload
}

function parsePayload (text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, errors: ['备份内容为空'] }
  }

  let payload
  try {
    payload = JSON.parse(text)
  } catch (e) {
    return { ok: false, errors: ['备份内容不是合法 JSON，可能已损坏或被截断'] }
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, errors: ['备份内容不是对象'] }
  }
  if (payload.format !== BACKUP_FORMAT) {
    return { ok: false, errors: [`不是 Xlover 备份文件（format=${payload.format || '空'}）`] }
  }
  if (typeof payload.backupVersion !== 'number' || payload.backupVersion > BACKUP_VERSION) {
    return { ok: false, errors: [`备份版本(${payload.backupVersion})高于当前小程序支持的版本(${BACKUP_VERSION})`] }
  }
  if (payload.checksum && payload.checksum !== payloadChecksum(payload)) {
    return { ok: false, errors: ['备份校验和不匹配，内容可能已损坏'] }
  }

  return { ok: true, payload, errors: [], warnings: [] }
}

/**
 * 预览：只统计、不写入，供「导入确认」弹窗展示。
 */
function summarize (payload, store) {
  const data = payload.data || {}
  const bodyRecords = Array.isArray(data.bodyRecords) ? data.bodyRecords : []
  const months = Object.keys(data.workoutLogs || {})
  const workoutCount = months.reduce((n, m) => n + (Array.isArray(data.workoutLogs[m]) ? data.workoutLogs[m].length : 0), 0)
  const foodMonths = Object.keys(data.foodLogs || {})
  const foodCount = foodMonths.reduce((n, m) => n + (Array.isArray(data.foodLogs[m]) ? data.foodLogs[m].length : 0), 0)
  const snapshotDates = Object.keys(data.targetSnapshots || {})

  const summary = {
    exportedAt: payload.exportedAt,
    payload: {
      hasProfile: !!data.profile,
      bodyRecords: bodyRecords.length,
      workoutLogs: workoutCount,
      workoutMonths: months.length,
      foodLogs: foodCount,
      foodMonths: foodMonths.length,
      customFoods: Array.isArray(data.customFoods) ? data.customFoods.length : 0,
      targetSnapshots: snapshotDates.length,
      hasNutritionPlan: !!data.nutritionPlan,
      hasSettings: !!(data.settings && Object.keys(data.settings).length),
      dateRange: bodyRecords.length
        ? { from: bodyRecords.map(r => r.date).sort()[0], to: bodyRecords.map(r => r.date).sort().slice(-1)[0] }
        : null
    }
  }

  if (store && typeof store.exportData === 'function') {
    const local = store.exportData()
    const localWorkout = Object.keys(local.workoutLogs || {}).reduce((n, m) => n + local.workoutLogs[m].length, 0)
    const localFood = Object.keys(local.foodLogs || {}).reduce((n, m) => n + local.foodLogs[m].length, 0)
    summary.local = {
      hasProfile: !!local.profile,
      bodyRecords: (local.bodyRecords || []).length,
      workoutLogs: localWorkout,
      foodLogs: localFood,
      targetSnapshots: Object.keys(local.targetSnapshots || {}).length
    }
  }

  return summary
}

/**
 * 解析 + 校验 + 预览，全程不写入。
 */
function previewImport (store, text) {
  const parsed = parsePayload(text)
  if (!parsed.ok) return { ok: false, errors: parsed.errors, warnings: [] }

  const check = store.validateImportData(parsed.payload.data)
  if (!check.ok) {
    return { ok: false, errors: check.errors, warnings: check.warnings, summary: summarize(parsed.payload, store) }
  }

  return {
    ok: true,
    payload: parsed.payload,
    summary: summarize(parsed.payload, store),
    errors: [],
    warnings: check.warnings
  }
}

/**
 * 执行导入：校验失败不落盘；成功时先留导入前备份。
 */
function applyImport (store, payload, options) {
  const o = options || {}
  return store.importData(payload.data, { mode: o.mode || 'merge' })
}

/* ============================ 文件 IO（小程序运行时） ============================ */

function requireWx () {
  if (typeof wx === 'undefined') {
    throw new Error('当前环境不支持文件备份（需在微信小程序中运行）')
  }
  return wx
}

function timestampName (prefix) {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`
}

function createWxIo () {
  return {
    name: 'wx',

    writeFile (fileName, text) {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        const filePath = `${w.env.USER_DATA_PATH}/${fileName}`
        w.getFileSystemManager().writeFile({
          filePath,
          data: text,
          encoding: 'utf8',
          success: () => resolve(filePath),
          fail: err => reject(new Error(err.errMsg || '写入文件失败'))
        })
      })
    },

    shareFile (filePath, fileName) {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        w.shareFileMessage({
          filePath,
          fileName,
          success: resolve,
          fail: err => reject(new Error(err.errMsg || '分享文件失败'))
        })
      })
    },

    chooseFile () {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        w.chooseMessageFile({
          count: 1,
          type: 'file',
          extension: ['json'],
          success: res => {
            const f = res.tempFiles && res.tempFiles[0]
            if (!f || !f.path) reject(new Error('未选择文件'))
            else resolve(f.path)
          },
          fail: err => reject(new Error(err.errMsg || '选择文件失败'))
        })
      })
    },

    readFile (filePath) {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        w.getFileSystemManager().readFile({
          filePath,
          encoding: 'utf8',
          success: res => resolve(res.data),
          fail: err => reject(new Error(err.errMsg || '读取文件失败'))
        })
      })
    },

    setClipboard (text) {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        w.setClipboardData({
          data: text,
          success: resolve,
          fail: err => reject(new Error(err.errMsg || '写入剪贴板失败'))
        })
      })
    },

    getClipboard () {
      return new Promise((resolve, reject) => {
        const w = requireWx()
        w.getClipboardData({
          success: res => resolve(res.data || ''),
          fail: err => reject(new Error(err.errMsg || '读取剪贴板失败'))
        })
      })
    }
  }
}

/* ============================ 服务封装 ============================ */

function createBackupService (options) {
  const opts = options || {}
  const store = opts.store
  const io = opts.io || createWxIo()
  const appVersion = opts.appVersion || ''

  if (!store) throw new Error('createBackupService 需要传入 store')

  return {
    store,
    io,

    buildPayload () {
      return buildPayload(store, { appVersion })
    },

    async exportToFile () {
      const payload = buildPayload(store, { appVersion })
      const text = JSON.stringify(payload, null, 2)
      const fileName = timestampName('xlover-backup')
      const filePath = await io.writeFile(fileName, text)
      let shared = false
      if (io.shareFile) {
        try {
          await io.shareFile(filePath, fileName)
          shared = true
        } catch (e) {
          shared = false
        }
      }
      return { ok: true, filePath, fileName, bytes: text.length, shared, summary: summarize(payload, store) }
    },

    async exportToClipboard () {
      const payload = buildPayload(store, { appVersion })
      const text = JSON.stringify(payload)
      await io.setClipboard(text)
      return { ok: true, bytes: text.length, summary: summarize(payload, store) }
    },

    /**
     * 从文件导入。先预览校验，`confirm` 回调返回 false 时不写入。
     */
    async importFromFile (options2) {
      const o = options2 || {}
      const filePath = await io.chooseFile()
      const text = await io.readFile(filePath)
      return this.importFromText(text, o)
    },

    async importFromText (text, options2) {
      const o = options2 || {}
      const preview = previewImport(store, text)
      if (!preview.ok) return preview
      if (typeof o.confirm === 'function') {
        // 支持返回 Promise 的确认回调（例如等一个 modal 的结果）
        const confirmed = await o.confirm(preview.summary)
        if (!confirmed) {
          return { ok: false, cancelled: true, errors: [], warnings: preview.warnings, summary: preview.summary }
        }
      }
      const applied = applyImport(store, preview.payload, { mode: o.mode || 'merge' })
      return Object.assign({}, applied, { summary: preview.summary, warnings: preview.warnings })
    },

    async importFromClipboard (options2) {
      const text = await io.getClipboard()
      return this.importFromText(text, options2)
    },

    restoreBackup (key) {
      return store.restorePreImportBackup(key)
    },

    listBackups () {
      return store.listPreImportBackups()
    }
  }
}

module.exports = {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  checksum,
  payloadChecksum,
  buildPayload,
  parsePayload,
  summarize,
  previewImport,
  applyImport,
  createWxIo,
  createBackupService,
  createMemoryStore: () => storage.createStore({ adapter: storage.createMemoryAdapter() })
}
