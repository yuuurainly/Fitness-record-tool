const test = require('node:test')
const assert = require('node:assert')

const storage = require('../miniprogram/utils/storage.js')
const backup = require('../miniprogram/utils/backup.js')

const validProfile = { heightCm: 175, weightKg: 70, age: 30, gender: 'male', goalType: 'cut' }

function seedStore () {
  const s = storage.createStore({ adapter: storage.createMemoryAdapter(), appVersion: 'test' })
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  s.addWorkoutLog({ date: '2026-10-02', typeName: '跑步', minutes: 30, metValue: 9.8, kcal: 343 })
  s.putTargetSnapshot('2026-10-01', { mode: 'coefficient', goalType: 'cut', targetCalories: 2045 })
  s.saveSettings({ coefficientMode: 'coefficient' })
  return s
}

// 内存文件 IO，替代小程序的 wx 文件 API
function createMemoryIo () {
  const files = new Map()
  let clipboard = ''
  return {
    name: 'memory',
    files,
    writeFile (name, text) {
      files.set(name, text)
      return Promise.resolve(`mem://${name}`)
    },
    readFile (filePath) {
      return Promise.resolve(files.get(String(filePath).replace('mem://', '')))
    },
    shareFile () { return Promise.resolve() },
    setClipboard (t) { clipboard = t; return Promise.resolve() },
    getClipboard () { return Promise.resolve(clipboard) }
  }
}

/* ============================ 构包与校验和 ============================ */

test('备份包：包含格式标识、版本与校验和', () => {
  const s = seedStore()
  const payload = backup.buildPayload(s, { appVersion: 'test' })
  assert.strictEqual(payload.format, backup.BACKUP_FORMAT)
  assert.strictEqual(payload.backupVersion, backup.BACKUP_VERSION)
  assert.strictEqual(payload.checksum, backup.payloadChecksum(payload))
  assert.strictEqual(payload.data.bodyRecords.length, 1)
})

test('解析：合法备份可还原', () => {
  const s = seedStore()
  const text = JSON.stringify(backup.buildPayload(s, { appVersion: 'test' }))
  const r = backup.parsePayload(text)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.payload.data.profile.heightCm, 175)
})

test('解析：内容被篡改时校验和不匹配', () => {
  const s = seedStore()
  const payload = backup.buildPayload(s, { appVersion: 'test' })
  payload.data.profile.weightKg = 100 // 篡改但不更新校验和
  const r = backup.parsePayload(JSON.stringify(payload))
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors[0].includes('校验和'))
})

test('解析：非 JSON 内容被拒绝', () => {
  const r = backup.parsePayload('这不是 json')
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors[0].includes('JSON'))
})

test('解析：空内容被拒绝', () => {
  assert.strictEqual(backup.parsePayload('   ').ok, false)
})

test('解析：其它来源的 JSON 被拒绝', () => {
  const r = backup.parsePayload(JSON.stringify({ format: 'other-app', data: {} }))
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors[0].includes('Xlover'))
})

test('解析：备份版本高于当前支持版本时拒绝', () => {
  const payload = { format: backup.BACKUP_FORMAT, backupVersion: 99, exportedAt: 'x', appVersion: '', data: {} }
  const r = backup.parsePayload(JSON.stringify(payload))
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors[0].includes('版本'))
})

/* ============================ 预览与导入 ============================ */

test('预览：统计备份中的记录数与日期范围', () => {
  const s = seedStore()
  const text = JSON.stringify(backup.buildPayload(s, {}))
  const r = backup.previewImport(s, text)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.summary.payload.bodyRecords, 1)
  assert.strictEqual(r.summary.payload.workoutLogs, 1)
  assert.strictEqual(r.summary.payload.targetSnapshots, 1)
  assert.deepStrictEqual(r.summary.payload.dateRange, { from: '2026-10-01', to: '2026-10-01' })
  assert.strictEqual(r.summary.local.bodyRecords, 1)
})

test('预览：记录非法时拒绝，且目标仓库内容不变', () => {
  const s = seedStore()
  const payload = backup.buildPayload(s, {})
  payload.data.bodyRecords = [{ date: '2026-10-05', weightKg: 999 }]
  payload.checksum = backup.payloadChecksum(payload)

  const r = backup.previewImport(s, JSON.stringify(payload))
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors.some(e => e.includes('bodyRecords')))
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.weightKg), [70])
})

test('导入：校验失败时不写入，也不产生备份', () => {
  const s = seedStore()
  const payload = backup.buildPayload(s, {})
  payload.data.workoutLogs = { '2026-10': [{ id: 'x', date: '2026-10-02', typeName: '', minutes: 30 }] }
  payload.checksum = backup.payloadChecksum(payload)

  const r = backup.applyImport(s, payload, { mode: 'replace' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.written, false)
  assert.strictEqual(s.listPreImportBackups().length, 0)
  assert.strictEqual(s.getWorkoutLogs().length, 1)
})

test('导入：合法备份按 merge 写入并留备份', () => {
  const s = seedStore()
  const other = storage.createStore({ adapter: storage.createMemoryAdapter(), appVersion: 'test' })
  other.init()
  other.saveProfile({ heightCm: 180, weightKg: 80, age: 31, gender: 'male', goalType: 'bulk' })
  other.addBodyRecord({ date: '2026-10-07', weightKg: 66 })

  const payload = backup.buildPayload(other, {})
  const r = backup.applyImport(s, payload, { mode: 'merge' })

  assert.strictEqual(r.ok, true)
  assert.ok(r.backupKey)
  assert.strictEqual(s.getProfile().heightCm, 175) // 本地已有资料保留
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01', '2026-10-07'])
  assert.strictEqual(s.listPreImportBackups().length, 1)
})

/* ============================ 服务层（内存 IO） ============================ */

test('服务：导出到文件返回文件名与体积', async () => {
  const s = seedStore()
  const io = createMemoryIo()
  const svc = backup.createBackupService({ store: s, io, appVersion: 'test' })

  const r = await svc.exportToFile()
  assert.strictEqual(r.ok, true)
  assert.ok(r.fileName.endsWith('.json'))
  assert.ok(r.bytes > 0)
  assert.strictEqual(r.summary.payload.bodyRecords, 1)
  assert.ok(io.files.has(r.fileName))
})

test('服务：confirm 返回 false 时导入被取消，数据不变', async () => {
  const s = seedStore()
  const other = storage.createStore({ adapter: storage.createMemoryAdapter() })
  other.init()
  other.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
  const text = JSON.stringify(backup.buildPayload(other, {}))

  const svc = backup.createBackupService({ store: s, io: createMemoryIo() })
  const r = await svc.importFromText(text, { confirm: () => false, mode: 'replace' })

  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.cancelled, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01'])
  assert.strictEqual(s.listPreImportBackups().length, 0)
})

test('服务：confirm 返回 true 时导入生效', async () => {
  const s = seedStore()
  const other = storage.createStore({ adapter: storage.createMemoryAdapter() })
  other.init()
  other.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
  const text = JSON.stringify(backup.buildPayload(other, {}))

  const svc = backup.createBackupService({ store: s, io: createMemoryIo() })
  const r = await svc.importFromText(text, { confirm: () => true, mode: 'merge' })

  assert.strictEqual(r.ok, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01', '2026-10-07'])
})

test('服务：confirm 可以是返回 Promise 的异步回调（等待用户确认弹窗）', async () => {
  const s = seedStore()
  const other = storage.createStore({ adapter: storage.createMemoryAdapter() })
  other.init()
  other.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
  const text = JSON.stringify(backup.buildPayload(other, {}))

  const svc = backup.createBackupService({ store: s, io: createMemoryIo() })

  const cancelled = await svc.importFromText(text, { confirm: () => Promise.resolve(false), mode: 'merge' })
  assert.strictEqual(cancelled.cancelled, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01'])

  const applied = await svc.importFromText(text, { confirm: () => Promise.resolve(true), mode: 'merge' })
  assert.strictEqual(applied.ok, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01', '2026-10-07'])
})

test('预览统计：包含饮食记录与自定义食物条数', () => {
  const s = seedStore()
  s.addFoodLog({ date: '2026-10-02', meal: 'lunch', foodName: '白米饭', grams: 150, kcal: 174 })
  s.addCustomFood({ name: '自制沙拉', kcalPer100g: 85 })

  const payload = backup.buildPayload(s, {})
  const summary = backup.summarize(payload, s)

  assert.strictEqual(summary.payload.foodLogs, 1)
  assert.strictEqual(summary.payload.customFoods, 1)
  assert.strictEqual(summary.local.foodLogs, 1)
})

test('服务：剪贴板导出后可再导入', async () => {
  const io = createMemoryIo()
  const s = seedStore()
  const svc = backup.createBackupService({ store: s, io })

  await svc.exportToClipboard()
  assert.ok(io.getClipboard instanceof Function)
  const text = await io.getClipboard()
  assert.strictEqual(backup.parsePayload(text).ok, true)
})

test('服务：可列出并恢复导入前备份', async () => {
  const s = seedStore()
  const other = storage.createStore({ adapter: storage.createMemoryAdapter() })
  other.init()
  other.addBodyRecord({ date: '2026-10-07', weightKg: 66 })
  const text = JSON.stringify(backup.buildPayload(other, {}))

  const svc = backup.createBackupService({ store: s, io: createMemoryIo() })
  await svc.importFromText(text, { confirm: () => true, mode: 'replace' })

  const backups = svc.listBackups()
  assert.ok(backups.length >= 1)
  const restored = svc.restoreBackup(backups[0].key)
  assert.strictEqual(restored.ok, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.date), ['2026-10-01'])
})
