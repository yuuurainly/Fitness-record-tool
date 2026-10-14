const test = require('node:test')
const assert = require('node:assert')

const storage = require('../miniprogram/utils/storage.js')
const backup = require('../miniprogram/utils/backup.js')
const selfCheck = require('../miniprogram/utils/selfCheck.js')

/**
 * 伪造 wx 运行环境。
 * 关键点：模拟真实的单键上限与总容量上限，越界时像真机一样抛错，
 * 这样适配器的失败分支也能被测到。
 */
function installFakeWx (options) {
  const o = options || {}
  const limits = { totalKB: o.totalKB || 10240, perKeyKB: o.perKeyKB || 1024 }
  const store = new Map()
  const files = new Map()
  let clipboard = ''
  let shareShouldFail = !!o.shareShouldFail

  function sizeKB (v) {
    return JSON.stringify(v === undefined ? '' : v).length / 1024
  }

  function currentSizeKB () {
    let total = 0
    store.forEach(v => { total += sizeKB(v) })
    return Math.round(total * 10) / 10
  }

  const wx = {
    env: { USER_DATA_PATH: 'wxfile://usr' },

    getStorageSync (key) {
      return store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : ''
    },
    setStorageSync (key, value) {
      const kb = sizeKB(value)
      if (kb > limits.perKeyKB) throw new Error('setStorageSync:fail data exceed max size')
      const others = currentSizeKB() - (store.has(key) ? sizeKB(store.get(key)) : 0)
      if (others + kb > limits.totalKB) throw new Error('setStorageSync:fail exceed storage max size')
      store.set(key, JSON.parse(JSON.stringify(value)))
    },
    removeStorageSync (key) { store.delete(key) },
    getStorageInfoSync () {
      return { keys: [...store.keys()], currentSize: currentSizeKB(), limitSize: limits.totalKB }
    },
    getSystemInfoSync () {
      return {
        platform: 'devtools', system: 'Windows 10', version: '8.0.30', SDKVersion: '3.16.2',
        pixelRatio: 2, windowWidth: 375, windowHeight: 667, benchmarkLevel: 1
      }
    },

    getFileSystemManager () {
      return {
        writeFile ({ filePath, data, encoding, success, fail }) {
          try {
            if (!String(filePath).startsWith('wxfile://usr')) throw new Error('writeFile:fail no permission')
            files.set(String(filePath), String(data))
            success && success({ errMsg: 'writeFile:ok' })
          } catch (e) { fail && fail({ errMsg: e.message }) }
        },
        readFile ({ filePath, encoding, success, fail }) {
          const key = String(filePath)
          if (!files.has(key)) { fail && fail({ errMsg: 'readFile:fail no such file' }); return }
          success && success({ data: files.get(key) })
        }
      }
    },

    chooseMessageFile ({ success }) {
      success({ tempFiles: [{ path: 'wxfile://tmp/chosen.json', name: 'chosen.json' }] })
    },
    shareFileMessage ({ success, fail }) {
      if (shareShouldFail) fail && fail({ errMsg: 'shareFileMessage:fail cancel' })
      else success && success({ errMsg: 'shareFileMessage:ok' })
    },
    setClipboardData ({ data, success }) { clipboard = data; success && success({}) },
    getClipboardData ({ success }) { success({ data: clipboard }) }
  }

  global.wx = wx
  return {
    wx,
    store,
    files,
    setClipboard: v => { clipboard = v },
    setShareFailure: v => { shareShouldFail = v },
    cleanup: () => { delete global.wx }
  }
}

/* ============================ wx 存储适配器 ============================ */

test('wx 适配器：探针键读写往返正常', () => {
  const env = installFakeWx()
  try {
    const adapter = storage.createWxAdapter()
    adapter.set('probe', { a: 1, 中文: '🍚' })
    assert.deepStrictEqual(adapter.get('probe'), { a: 1, 中文: '🍚' })
    adapter.remove('probe')
    assert.strictEqual(adapter.get('probe'), null)
  } finally {
    env.cleanup()
  }
})

test('wx 适配器：keys/info 反映真实占用', () => {
  const env = installFakeWx()
  try {
    const adapter = storage.createWxAdapter()
    adapter.set(`${storage.NS}.probe`, selfCheck.makeBlob(4))
    const info = adapter.info()
    assert.deepStrictEqual(info.keys, [`${storage.NS}.probe`])
    assert.ok(info.currentSize > 0)
    assert.strictEqual(info.limitSize, 10240)
  } finally {
    env.cleanup()
  }
})

test('wx 适配器：单键超过上限时抛出（模拟真机 1MB 限制）', () => {
  const env = installFakeWx({ perKeyKB: 64 })
  try {
    const adapter = storage.createWxAdapter()
    assert.throws(() => adapter.set('big', selfCheck.makeBlob(128)), /exceed max size/)
    // 越界后不应留下半截数据
    assert.strictEqual(adapter.get('big'), null)
  } finally {
    env.cleanup()
  }
})

test('wx 适配器：真实 store 读写链路可用', () => {
  const env = installFakeWx()
  try {
    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    store.saveProfile({ heightCm: 175, weightKg: 70, age: 30, gender: 'male', goalType: 'cut' })
    store.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
    store.addFoodLog({ date: '2026-10-02', meal: '午餐', foodName: '白米饭', grams: 150, kcal: 174, protein: 3.9, carb: 38.4, fat: 0.5 })

    // 换一个 store 实例重新读，模拟「重开小程序」
    const reopened = storage.createStore({ adapter: storage.createWxAdapter() })
    assert.strictEqual(reopened.getProfile().heightCm, 175)
    assert.strictEqual(reopened.getBodyRecords().length, 1)
    assert.strictEqual(reopened.getFoodLogs().length, 1)
    assert.strictEqual(reopened.getFoodLogs()[0].meal, 'lunch')
  } finally {
    env.cleanup()
  }
})

/* ============================ 文件导入导出（真机路径） ============================ */

test('wx 文件链路：导出 → 读回 → 校验和通过', async () => {
  const env = installFakeWx()
  try {
    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    store.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

    const svc = backup.createBackupService({ store, io: backup.createWxIo() })
    const exported = await svc.exportToFile()

    assert.strictEqual(exported.ok, true)
    assert.strictEqual(exported.shared, true)
    assert.ok(exported.filePath.startsWith('wxfile://usr/'))
    assert.ok(env.files.has(exported.filePath))

    const text = env.files.get(exported.filePath)
    assert.strictEqual(backup.parsePayload(text).ok, true)
  } finally {
    env.cleanup()
  }
})

test('wx 文件链路：分享被取消不算失败', async () => {
  const env = installFakeWx({ shareShouldFail: true })
  try {
    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    const svc = backup.createBackupService({ store, io: backup.createWxIo() })
    const exported = await svc.exportToFile()
    assert.strictEqual(exported.ok, true)
    assert.strictEqual(exported.shared, false)
  } finally {
    env.cleanup()
  }
})

test('wx 文件链路：选择文件导入并生效', async () => {
  const env = installFakeWx()
  try {
    // 先造一份「别处导出」的备份文件，放到伪造文件系统里
    const source = storage.createStore({ adapter: storage.createMemoryAdapter() })
    source.init()
    source.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
    const text = JSON.stringify(backup.buildPayload(source, { appVersion: 'test' }))
    env.files.set('wxfile://tmp/chosen.json', text)

    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    const svc = backup.createBackupService({ store, io: backup.createWxIo() })

    const r = await svc.importFromFile({ confirm: () => true, mode: 'merge' })
    assert.strictEqual(r.ok, true)
    assert.strictEqual(store.getBodyRecords().length, 1)
    assert.strictEqual(store.getBodyRecords()[0].weightKg, 66)
    assert.ok(r.backupKey, '导入前应留下备份')
  } finally {
    env.cleanup()
  }
})

test('wx 文件链路：导入前取消则不写入', async () => {
  const env = installFakeWx()
  try {
    const source = storage.createStore({ adapter: storage.createMemoryAdapter() })
    source.init()
    source.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
    env.files.set('wxfile://tmp/chosen.json', JSON.stringify(backup.buildPayload(source, {})))

    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    const svc = backup.createBackupService({ store, io: backup.createWxIo() })

    const r = await svc.importFromFile({ confirm: () => false })
    assert.strictEqual(r.cancelled, true)
    assert.strictEqual(store.getBodyRecords().length, 0)
  } finally {
    env.cleanup()
  }
})

test('wx 文件链路：读取不存在的文件时报可读错误', async () => {
  const env = installFakeWx()
  try {
    const io = backup.createWxIo()
    await assert.rejects(() => io.readFile('wxfile://usr/missing.json'), /no such file/)
  } finally {
    env.cleanup()
  }
})

/* ============================ 自检汇总 ============================ */

test('自检：伪造真机环境下全部通过并产出可读报告', async () => {
  const env = installFakeWx()
  try {
    const store = storage.createStore({ adapter: storage.createWxAdapter() })
    store.init()
    const svc = backup.createBackupService({ store, io: backup.createWxIo() })

    const report = await selfCheck.runSelfCheck({ store, io: svc.io, backupService: svc }, { quotaProbeKB: 128 })
    assert.strictEqual(report.ok, true, JSON.stringify(report.results, null, 2))
    assert.strictEqual(report.summary.failed, 0)
    assert.ok(report.summary.passed >= 6)

    const text = selfCheck.formatReport(report)
    assert.ok(text.includes('[PASS] 存储配额'))
    assert.ok(text.includes('[PASS] 备份文件往返'))
    assert.ok(text.includes('136 条'))

    // 自检不应留下探针键
    assert.strictEqual(env.store.has(selfCheck.PROBE_KEY), false)
  } finally {
    env.cleanup()
  }
})

test('自检：探针键大小超限时报告失败而不是崩溃', async () => {
  const env = installFakeWx({ perKeyKB: 64 })
  try {
    const r = selfCheck.checkWriteProbe(256)
    assert.strictEqual(r.status, 'fail')
    assert.ok(r.detail.includes('256KB'))
    assert.strictEqual(env.store.has(selfCheck.PROBE_KEY), false)
  } finally {
    env.cleanup()
  }
})

test('自检：配额压测报出实际可写上限', () => {
  const env = installFakeWx({ perKeyKB: 100 })
  try {
    const r = selfCheck.probeStorageLimit({ stepKB: 32, maxKB: 512 })
    assert.strictEqual(r.status, 'pass')
    assert.strictEqual(r.data.failedAtKB, 128)
    assert.strictEqual(r.data.lastOkKB, 96)
    assert.strictEqual(env.store.has(selfCheck.PROBE_KEY), false)
  } finally {
    env.cleanup()
  }
})

test('自检：非小程序环境下不报错，标记为跳过', async () => {
  const report = await selfCheck.runSelfCheck({})
  const envCheck = report.results.find(r => r.name === '运行环境')
  assert.strictEqual(envCheck.status, 'skip')
  assert.strictEqual(report.summary.failed, 0)
})
