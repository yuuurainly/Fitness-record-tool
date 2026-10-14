const test = require('node:test')
const assert = require('node:assert')

const storage = require('../miniprogram/utils/storage.js')

function newStore () {
  return storage.createStore({ adapter: storage.createMemoryAdapter(), appVersion: 'test' })
}

const validProfile = { heightCm: 175, weightKg: 70, age: 30, gender: 'male', goalType: 'cut' }

/* ============================ 版本管理 ============================ */

test('init：空存储初始化为 schemaVersion 1 并记录迁移', () => {
  const s = newStore()
  const r = s.init()
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.schemaVersion, storage.SCHEMA_VERSION)
  assert.deepStrictEqual(r.applied, [1])
  assert.strictEqual(s.getSchema().schemaVersion, 1)
})

test('init：重复调用不重复迁移', () => {
  const s = newStore()
  s.init()
  const again = s.init()
  assert.deepStrictEqual(again.applied, [])
})

test('init：本地数据版本高于小程序版本时拒绝启动', () => {
  const adapter = storage.createMemoryAdapter({
    [storage.KEYS.schema]: { schemaVersion: 99 }
  })
  const s = storage.createStore({ adapter })
  const r = s.init()
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors[0].includes('高于'))
})

/* ============================ 身体资料 ============================ */

test('资料：非法值被拒绝且不落盘', () => {
  const s = newStore()
  s.init()
  const r = s.saveProfile({ heightCm: 300, weightKg: 70, age: 30, gender: 'male' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(s.getProfile(), null)
})

test('资料：非法更新不覆盖已有资料', () => {
  const s = newStore()
  s.init()
  assert.strictEqual(s.saveProfile(validProfile).ok, true)
  const bad = s.saveProfile({ heightCm: 300 })
  assert.strictEqual(bad.ok, false)
  assert.strictEqual(s.getProfile().heightCm, 175)
})

test('资料：字段被规范化为数值', () => {
  const s = newStore()
  s.init()
  s.saveProfile({ heightCm: '175', weightKg: '70', age: '30', gender: 'male' })
  const p = s.getProfile()
  assert.strictEqual(p.heightCm, 175)
  assert.strictEqual(p.weightKg, 70)
  assert.strictEqual(p.age, 30)
})

test('资料：未选活动水平时可保存，只返回提醒', () => {
  const s = newStore()
  s.init()
  const r = s.saveProfile(validProfile)
  assert.strictEqual(r.ok, true)
  assert.ok(r.warnings.some(w => w.includes('活动水平')))
})

/* ============================ 体重历史 ============================ */

test('体重：按日期去重，同日重复记录覆盖并重算 BMI', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)

  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  s.addBodyRecord({ date: '2026-10-01', weightKg: 69.5 })

  const list = s.getBodyRecords()
  assert.strictEqual(list.length, 1)
  assert.strictEqual(list[0].weightKg, 69.5)
  assert.strictEqual(list[0].bmi, 22.7) // 69.5 / 1.75^2
  assert.strictEqual(list[0].weightBasis, 'measured')
  assert.strictEqual(list[0].bmiBasis, 'derived')
})

test('体重：新增记录同步当前体重，但不动历史', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  s.addBodyRecord({ date: '2026-10-05', weightKg: 68 })

  assert.strictEqual(s.getProfile().weightKg, 68)
  assert.strictEqual(s.getLatestBodyRecord().weightKg, 68)
  assert.deepStrictEqual(s.getBodyRecords().map(r => r.weightKg), [70, 68])
})

test('体重：异常值被拒绝且不影响已有记录', () => {
  const s = newStore()
  s.init()
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  const r = s.addBodyRecord({ date: '2026-10-02', weightKg: 500 })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(s.getBodyRecords().length, 1)
})

test('体重：缺身高时 BMI 留空而不是猜一个', () => {
  const s = newStore()
  s.init()
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  assert.strictEqual(s.getBodyRecords()[0].bmi, null)
})

/* ============================ 训练日志 ============================ */

test('训练：按月分片写入', () => {
  const s = newStore()
  s.init()
  s.addWorkoutLog({ date: '2026-09-30', typeName: '跑步', minutes: 30, metValue: 9.8, kcal: 343 })
  s.addWorkoutLog({ date: '2026-10-01', typeName: '力量训练', minutes: 45, metValue: 6 })
  assert.deepStrictEqual(s.listWorkoutMonths(), ['2026-09', '2026-10'])
  assert.strictEqual(s.getWorkoutLogs().length, 2)
})

test('训练：按日期区间过滤，并标记实测/估算来源', () => {
  const s = newStore()
  s.init()
  s.addWorkoutLog({ date: '2026-09-30', typeName: '跑步', minutes: 30 })
  s.addWorkoutLog({ date: '2026-10-01', typeName: '力量训练', minutes: 45, kcal: 300 })
  const oct = s.getWorkoutLogs({ from: '2026-10-01', to: '2026-10-31' })
  assert.strictEqual(oct.length, 1)
  assert.strictEqual(oct[0].minutesBasis, 'measured')
  assert.strictEqual(oct[0].kcalBasis, 'estimated')
})

test('训练：异常记录被拒绝', () => {
  const s = newStore()
  s.init()
  const r = s.addWorkoutLog({ date: '2026-10-01', typeName: '', minutes: 45 })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(s.getWorkoutLogs().length, 0)
})

test('训练：可删除单条记录', () => {
  const s = newStore()
  s.init()
  const added = s.addWorkoutLog({ date: '2026-10-01', typeName: '跑步', minutes: 30 })
  assert.strictEqual(s.removeWorkoutLog(added.record.id).ok, true)
  assert.strictEqual(s.getWorkoutLogs().length, 0)
  assert.strictEqual(s.removeWorkoutLog('不存在').ok, false)
})

/* ============================ 营养计划与历史快照 ============================ */

test('计划：非法计划被拒绝', () => {
  const s = newStore()
  s.init()
  const r = s.saveNutritionPlan({ mode: 'calorie', goalType: 'cut', weightKg: 70, bandId: '4-5h' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(s.getNutritionPlan(), null)
})

test('计划：合法计划保存成功', () => {
  const s = newStore()
  s.init()
  const r = s.saveNutritionPlan({ mode: 'coefficient', goalType: 'cut', weightKg: 70, bandId: '4-5h' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(s.getNutritionPlan().bandId, '4-5h')
})

test('快照：首次写入成功', () => {
  const s = newStore()
  s.init()
  const r = s.putTargetSnapshot('2026-10-01', { mode: 'coefficient', bmr: 1649, tdee: 2556, targetCalories: 2045 })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.replaced, false)
  assert.strictEqual(s.getTargetSnapshot('2026-10-01').targetCalories, 2045)
})

test('快照：切换目标不改写历史（历史日期不可覆盖）', () => {
  const s = newStore()
  s.init()
  s.putTargetSnapshot('2026-10-01', { mode: 'coefficient', goalType: 'cut', targetCalories: 2045 })

  const r = s.putTargetSnapshot(
    '2026-10-01',
    { mode: 'coefficient', goalType: 'bulk', targetCalories: 2812 },
    { allowOverwrite: true, today: '2026-10-12' }
  )
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.immutable, true)
  assert.strictEqual(s.getTargetSnapshot('2026-10-01').targetCalories, 2045)
  assert.strictEqual(s.getTargetSnapshot('2026-10-01').goalType, 'cut')
})

test('快照：允许覆盖「今天」的快照', () => {
  const s = newStore()
  s.init()
  s.putTargetSnapshot('2026-10-12', { targetCalories: 2045 })
  const r = s.putTargetSnapshot('2026-10-12', { targetCalories: 2300 }, { allowOverwrite: true, today: '2026-10-12' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.replaced, true)
  assert.strictEqual(s.getTargetSnapshot('2026-10-12').targetCalories, 2300)
})

test('快照：非法日期被拒绝', () => {
  const s = newStore()
  s.init()
  assert.strictEqual(s.putTargetSnapshot('2026/10/12', {}).ok, false)
  assert.strictEqual(s.getTargetSnapshot('bad'), null)
})

/* ============================ 导入导出 ============================ */

test('导出：包含全部数据域与格式标识', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })
  s.addWorkoutLog({ date: '2026-10-02', typeName: '跑步', minutes: 30 })
  s.putTargetSnapshot('2026-10-01', { targetCalories: 2045 })

  const dump = s.exportData()
  assert.strictEqual(dump.format, storage.DATA_FORMAT)
  assert.strictEqual(dump.schemaVersion, storage.SCHEMA_VERSION)
  assert.strictEqual(dump.bodyRecords.length, 1)
  assert.strictEqual(dump.workoutLogs['2026-10'].length, 1)
  assert.strictEqual(Object.keys(dump.targetSnapshots).length, 1)
})

test('导入：校验失败时不写入任何内容', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

  const r = s.importData({
    format: storage.DATA_FORMAT,
    schemaVersion: 1,
    profile: { heightCm: 175, weightKg: 70, age: 30, gender: 'male' },
    bodyRecords: [{ date: '2026/10/03', weightKg: 500 }]
  }, { mode: 'replace' })

  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.written, false)
  assert.strictEqual(r.backupKey, null)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.weightKg), [70])
  assert.strictEqual(s.listPreImportBackups().length, 0)
})

test('导入：merge 模式保留本地已有记录，只补缺失', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

  const r = s.importData({
    format: storage.DATA_FORMAT,
    schemaVersion: 1,
    bodyRecords: [
      { date: '2026-10-01', weightKg: 60 },
      { date: '2026-10-03', weightKg: 68 }
    ],
    workoutLogs: { '2026-10': [{ id: 'w1', date: '2026-10-02', typeName: '跑步', minutes: 30 }] }
  }, { mode: 'merge' })

  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.summary.bodyRecords, 1)
  const byDate = {}
  s.getBodyRecords().forEach(x => { byDate[x.date] = x.weightKg })
  assert.strictEqual(byDate['2026-10-01'], 70) // 本地优先
  assert.strictEqual(byDate['2026-10-03'], 68)
  assert.strictEqual(s.getWorkoutLogs().length, 1)
})

test('导入：replace 模式整体替换', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

  const r = s.importData({
    format: storage.DATA_FORMAT,
    schemaVersion: 1,
    profile: { heightCm: 180, weightKg: 80, age: 31, gender: 'male', goalType: 'bulk' },
    bodyRecords: [{ date: '2026-10-03', weightKg: 68 }]
  }, { mode: 'replace' })

  assert.strictEqual(r.ok, true)
  assert.strictEqual(s.getProfile().weightKg, 80)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.weightKg), [68])
})

test('导入：成功前自动留一份导入前备份', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

  const r = s.importData({
    format: storage.DATA_FORMAT,
    schemaVersion: 1,
    bodyRecords: [{ date: '2026-10-09', weightKg: 65 }]
  }, { mode: 'replace' })

  assert.strictEqual(r.ok, true)
  assert.ok(r.backupKey)
  const backups = s.listPreImportBackups()
  assert.strictEqual(backups.length, 1)

  // 备份里存的是「导入前」的状态
  const restored = s.restorePreImportBackup(r.backupKey)
  assert.strictEqual(restored.ok, true)
  assert.deepStrictEqual(s.getBodyRecords().map(x => x.weightKg), [70])
})

test('备份：最多保留 3 份导入前备份', () => {
  const s = newStore()
  s.init()
  for (let i = 0; i < 5; i++) s.createPreImportBackup()
  assert.strictEqual(s.listPreImportBackups().length, storage.MAX_PRE_IMPORT_BACKUPS)
})

test('备份：恢复不存在的备份时失败且不改数据', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  const r = s.restorePreImportBackup('xlover.v1.backup.preImport.不存在')
  assert.strictEqual(r.ok, false)
  assert.strictEqual(s.getProfile().heightCm, 175)
})

test('设置：合并保存', () => {
  const s = newStore()
  s.init()
  s.saveSettings({ coefficientMode: 'coefficient' })
  s.saveSettings({ goalType: 'cut' })
  assert.deepStrictEqual(
    { mode: s.getSettings().coefficientMode, goal: s.getSettings().goalType },
    { mode: 'coefficient', goal: 'cut' }
  )
})

/* ============================ 容量与清空 ============================ */

test('容量：统计本命名空间下的 key 数量与估算体积', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  const usage = s.estimateUsage()
  assert.strictEqual(usage.adapter, 'memory')
  assert.ok(usage.keyCount >= 2)
  assert.ok(usage.approxBytes > 0)
})

test('清空：必须显式确认', () => {
  const s = newStore()
  s.init()
  s.saveProfile(validProfile)
  assert.strictEqual(s.clearAll().ok, false)
  assert.strictEqual(s.getProfile().heightCm, 175)
  assert.strictEqual(s.clearAll({ confirm: true }).ok, true)
  assert.strictEqual(s.getProfile(), null)
})
