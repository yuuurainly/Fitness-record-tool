/**
 * 真机自检
 *
 * 目的：把「只有真机能验」的部分做成可一键运行的检查，产出可复制的报告。
 * 覆盖：
 *  - 本地存储：配额信息、写入/读取/删除往返、可选配额压测
 *  - 内置食物库：条数与换算
 *  - 备份链路：导出到文件 → 读回 → 校验和比对
 *  - 剪贴板往返（best-effort，部分平台会弹授权）
 *
 * 说明：文件分享与「选择文件导入」必须由用户手势触发，自检里标为 manual，
 * 由页面上单独的按钮驱动，不放进自动流程。
 */

const storage = require('./storage.js')
const backup = require('./backup.js')
const foodLibrary = require('./foodLibrary.js')

const PROBE_KEY = `${storage.NS}.__selfcheck`

function makeBlob (kb) {
  const chunk = 'x'.repeat(1024)
  let out = ''
  for (let i = 0; i < kb; i++) out += chunk
  return out
}

function hasWx () {
  return typeof wx !== 'undefined'
}

/**
 * 读取设备/窗口信息。
 * 优先使用新接口，避免 getSystemInfoSync 的弃用告警；老基础库回退。
 */
function getDeviceInfo () {
  const out = {}
  const pick = (fn, keys) => {
    if (typeof fn !== 'function') return
    try {
      const v = fn()
      keys.forEach(k => { if (v && v[k] !== undefined) out[k] = v[k] })
    } catch (e) {}
  }
  pick(wx.getDeviceInfo, ['platform', 'system', 'benchmarkLevel'])
  pick(wx.getAppBaseInfo, ['version', 'SDKVersion'])
  pick(wx.getWindowInfo, ['pixelRatio', 'windowWidth', 'windowHeight'])
  if (!Object.keys(out).length) {
    // 兜底：老基础库只有这个接口
    try { Object.assign(out, wx.getSystemInfoSync()) } catch (e) {}
  }
  return out
}

function pass (name, detail, data) {
  return { name, status: 'pass', detail, data: data || null }
}

function fail (name, detail, data) {
  return { name, status: 'fail', detail, data: data || null }
}

function skip (name, detail) {
  return { name, status: 'skip', detail, data: null }
}

/* ============================ 单项检查 ============================ */

function checkEnvironment () {
  if (!hasWx()) return skip('运行环境', '当前不在小程序环境中（Node 下跳过）')
  try {
    const info = getDeviceInfo()
    return pass('运行环境', `${info.platform} / 微信 ${info.version} / 基础库 ${info.SDKVersion}`, {
      platform: info.platform,
      system: info.system,
      version: info.version,
      SDKVersion: info.SDKVersion,
      benchmarkLevel: info.benchmarkLevel,
      pixelRatio: info.pixelRatio,
      windowWidth: info.windowWidth,
      windowHeight: info.windowHeight
    })
  } catch (e) {
    return fail('运行环境', e.message)
  }
}

function checkStorageInfo () {
  if (!hasWx()) return skip('存储配额', '当前不在小程序环境中')
  try {
    const info = wx.getStorageInfoSync()
    const usedPercent = info.limitSize ? Math.round((info.currentSize / info.limitSize) * 1000) / 10 : null
    return pass('存储配额', `已用 ${info.currentSize}KB / 上限 ${info.limitSize}KB（${usedPercent}%），共 ${info.keys.length} 个 key`, {
      currentSizeKB: info.currentSize,
      limitSizeKB: info.limitSize,
      usedPercent,
      keyCount: info.keys.length
    })
  } catch (e) {
    return fail('存储配额', e.message)
  }
}

/**
 * 真实 wx 存储适配器的写入/读取/删除往返，验证序列化与键名不被截断。
 */
function checkStorageRoundTrip () {
  if (!hasWx()) return skip('存储往返', '当前不在小程序环境中')
  const payload = { n: 42, s: '中文·emoji🍚', nested: { arr: [1, 2, 3] }, t: new Date().toISOString() }
  try {
    wx.setStorageSync(PROBE_KEY, payload)
    const readBack = wx.getStorageSync(PROBE_KEY)
    wx.removeStorageSync(PROBE_KEY)
    const stillThere = wx.getStorageSync(PROBE_KEY)

    if (JSON.stringify(readBack) !== JSON.stringify(payload)) {
      return fail('存储往返', '读回内容与写入不一致', { written: payload, read: readBack })
    }
    if (stillThere !== '' && stillThere !== null && stillThere !== undefined) {
      return fail('存储往返', '删除后仍能读到内容')
    }
    return pass('存储往返', '写入 / 读取 / 删除均正常，中文与 emoji 无损坏')
  } catch (e) {
    try { if (hasWx()) wx.removeStorageSync(PROBE_KEY) } catch (e2) {}
    return fail('存储往返', e.message || String(e))
  }
}

/**
 * 安全探针：写入指定大小的一块数据并读回校验，随后删除。
 */
function checkWriteProbe (sizeKB) {
  if (!hasWx()) return skip('写入探针', '当前不在小程序环境中')
  const kb = Number(sizeKB) || 512
  const blob = makeBlob(kb)
  try {
    wx.setStorageSync(PROBE_KEY, blob)
    const readBack = wx.getStorageSync(PROBE_KEY)
    const okLen = typeof readBack === 'string' && readBack.length === blob.length
    wx.removeStorageSync(PROBE_KEY)
    return okLen
      ? pass('写入探针', `${kb}KB 单键写入并读回成功`)
      : fail('写入探针', `${kb}KB 写入后读回长度不符`)
  } catch (e) {
    try { if (hasWx()) wx.removeStorageSync(PROBE_KEY) } catch (e2) {}
    return fail('写入探针', `${kb}KB 写入失败：${e.message || e}`)
  }
}

/**
 * 配额压测（可选、有风险）：逐档加大直到失败，报出实际可写上限。
 * 每次失败后都会清理探针键；仍建议在数据已导出后再跑。
 */
function probeStorageLimit (options) {
  const o = options || {}
  const stepKB = Number(o.stepKB) || 512
  const maxKB = Number(o.maxKB) || 10240
  if (!hasWx()) return skip('配额压测', '当前不在小程序环境中')

  let lastOk = 0
  for (let kb = stepKB; kb <= maxKB; kb += stepKB) {
    try {
      wx.setStorageSync(PROBE_KEY, makeBlob(kb))
      lastOk = kb
      wx.removeStorageSync(PROBE_KEY)
    } catch (e) {
      try { wx.removeStorageSync(PROBE_KEY) } catch (e2) {}
      return pass('配额压测', `单键可写上限约 ${lastOk}KB，${kb}KB 时失败：${e.message || e}`, { lastOkKB: lastOk, failedAtKB: kb })
    }
  }
  try { wx.removeStorageSync(PROBE_KEY) } catch (e) {}
  return pass('配额压测', `在 ${maxKB}KB 以内均写入成功（未触顶）`, { lastOkKB: lastOk, failedAtKB: null })
}

function checkFoodLibrary () {
  try {
    const n = foodLibrary.count()
    if (n !== 136) return fail('内置食物库', `条数为 ${n}，应为 136`)
    const rice = foodLibrary.getFoodById(1)
    const scaled = foodLibrary.scaleFood(rice, 250)
    if (!scaled.ok || scaled.kcal !== 290) return fail('内置食物库', '换算结果异常', scaled)
    return pass('内置食物库', `${n} 条，版本 ${foodLibrary.libraryVersion()}，250g 白米饭 = ${scaled.kcal} kcal`)
  } catch (e) {
    return fail('内置食物库', e.message || String(e))
  }
}

/**
 * 真实 wx 存储适配器检查：只用探针键读写，不碰用户数据。
 * 同时用该适配器建一个 store 做一次只读导出，验证真实读取路径。
 */
function checkWxAdapter () {
  if (!hasWx()) return skip('存储适配器', '当前不在小程序环境中')
  try {
    const adapter = storage.createWxAdapter()
    const token = { probe: true, at: Date.now() }
    adapter.set(PROBE_KEY, token)
    const back = adapter.get(PROBE_KEY)
    adapter.remove(PROBE_KEY)
    if (JSON.stringify(back) !== JSON.stringify(token)) {
      return fail('存储适配器', '探针键读回与写入不一致')
    }

    // 只读：用真实适配器导出一次，确认读取路径可用
    const wxStore = storage.createStore({ adapter })
    const dump = wxStore.exportData()
    return pass('存储适配器', `探针键读写正常；当前本地已存 ${dump.bodyRecords.length} 条体重、${wxStore.getFoodLogs().length} 条饮食、${wxStore.getWorkoutLogs().length} 条训练记录`)
  } catch (e) {
    try { storage.createWxAdapter().remove(PROBE_KEY) } catch (e2) {}
    return fail('存储适配器', e.message || String(e))
  }
}

/**
 * 备份链路：导出到文件 → 读回 → 校验和比对。
 * 证明设备上的「写文件 / 读文件」这条路上数据没有损坏。
 */
async function checkBackupFileRoundTrip (backupService) {
  if (!backupService || !backupService.io || !hasWx()) {
    return skip('备份文件往返', '需要真机环境与文件 IO')
  }
  try {
    const exported = await backupService.exportToFile()
    const text = await backupService.io.readFile(exported.filePath)
    const parsed = backup.parsePayload(text)
    if (!parsed.ok) return fail('备份文件往返', '读回后解析失败：' + parsed.errors.join('；'))
    return pass('备份文件往返', `导出 ${exported.fileName}（${exported.bytes} 字节），读回校验通过`, {
      filePath: exported.filePath,
      bytes: exported.bytes,
      shared: exported.shared
    })
  } catch (e) {
    return fail('备份文件往返', e.message || String(e))
  }
}

async function checkClipboardRoundTrip (io) {
  if (!io || !hasWx()) return skip('剪贴板往返', '需要真机环境')
  try {
    const token = `xlover-selfcheck-${Date.now()}`
    await io.setClipboard(token)
    const back = await io.getClipboard()
    return back === token
      ? pass('剪贴板往返', '写入与读回一致')
      : fail('剪贴板往返', '读回内容与写入不一致（部分平台会拦截读取）', { wrote: token, got: back })
  } catch (e) {
    return fail('剪贴板往返', e.message || String(e))
  }
}

/* ============================ 汇总 ============================ */

/**
 * @param {object} deps { store, io, backupService }
 * @param {object} [options] { quotaProbeKB }
 */
async function runSelfCheck (deps, options) {
  const d = deps || {}
  const o = options || {}
  const results = []

  results.push(checkEnvironment())
  results.push(checkStorageInfo())
  results.push(checkStorageRoundTrip())
  if (o.quotaProbeKB) results.push(checkWriteProbe(o.quotaProbeKB))
  results.push(checkFoodLibrary())
  results.push(checkWxAdapter())
  results.push(await checkBackupFileRoundTrip(d.backupService))
  results.push(await checkClipboardRoundTrip(d.io))

  const failed = results.filter(r => r.status === 'fail').length
  const passed = results.filter(r => r.status === 'pass').length
  const skipped = results.filter(r => r.status === 'skip').length

  return {
    ok: failed === 0,
    ranAt: new Date().toISOString(),
    results,
    summary: { passed, failed, skipped, total: results.length }
  }
}

function formatReport (report) {
  const lines = [
    `Xlover 真机自检报告 ${report.ranAt}`,
    `结果：${report.summary.passed} 通过 / ${report.summary.failed} 失败 / ${report.summary.skipped} 跳过`,
    ''
  ]
  report.results.forEach(r => {
    const mark = r.status === 'pass' ? '[PASS]' : r.status === 'fail' ? '[FAIL]' : '[SKIP]'
    lines.push(`${mark} ${r.name}: ${r.detail}`)
  })
  return lines.join('\n')
}

module.exports = {
  PROBE_KEY,
  makeBlob,
  getDeviceInfo,
  runSelfCheck,
  formatReport,
  checkEnvironment,
  checkStorageInfo,
  checkStorageRoundTrip,
  checkWriteProbe,
  probeStorageLimit,
  checkFoodLibrary,
  checkWxAdapter,
  checkBackupFileRoundTrip,
  checkClipboardRoundTrip
}
