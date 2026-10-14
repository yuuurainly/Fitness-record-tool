const test = require('node:test')
const assert = require('node:assert')

const storage = require('../miniprogram/utils/storage.js')
const migration = require('../miniprogram/utils/migrateCloud.js')

function newStore () {
  const s = storage.createStore({ adapter: storage.createMemoryAdapter() })
  s.init()
  return s
}

// 依据审计报告里云端写入方的实际字段构造的样本
function cloudFixture () {
  return {
    collections: {
      user_profiles: [{
        _openid: 'o1', height: 165, currentWeight: 60, startWeight: 62,
        targetWeight: 55, targetDate: '2026-12-31', age: 28, bmi: 22.0
      }],
      body_records: [
        { _id: 'b1', date: '2026-10-01', weight: 60, bmi: 22.0, bodyFat: null },
        { _id: 'b2', date: '2026-10-05', weight: 59.2, bmi: 21.7, bodyFat: 24 }
      ],
      // 运动记录：云端的 duration 是分钟，calories 是当时按 MET 估的
      exercise_logs: [
        { _id: 'e1', date: '2026-10-02', exerciseType: 'running', typeName: '跑步', icon: '🏃', duration: 30, calories: 200 },
        { _id: 'e2', date: '2026-10-06', exerciseType: 'fitness', typeName: '健身', icon: '💪', duration: 45, calories: 260 }
      ],
      // 饮食记录：meal 存的是中文（审计发现的实际写入方式），且没有营养素
      food_logs: [
        { _id: 'f1', date: '2026-10-02', name: '白米饭', calories: 116, amount: 150, totalCalories: 174, meal: '午餐' },
        { _id: 'f2', date: '2026-10-02', name: '鸡胸肉', calories: 133, amount: 200, totalCalories: 266, meal: '午餐' },
        { _id: 'f3', date: '2026-10-03', name: '苹果', calories: 52, amount: 180, totalCalories: 94, meal: 'snack' }
      ]
    }
  }
}

/* ============================ 字段映射 ============================ */

test('映射：档案字段正确转换，且不臆造性别/活动水平/目标', () => {
  const r = migration.mapCloudData(cloudFixture())
  assert.strictEqual(r.ok, true)
  const p = r.data.profile
  assert.strictEqual(p.heightCm, 165)
  assert.strictEqual(p.weightKg, 60)
  assert.strictEqual(p.age, 28)
  assert.strictEqual(p.startWeightKg, 62)
  assert.strictEqual(p.targetWeightKg, 55)
  assert.strictEqual(p.gender, undefined)
  assert.strictEqual(p.activityLevel, undefined)
  assert.strictEqual(p.goalType, undefined)
  assert.strictEqual(p.needsCompletion, true)
})

test('映射：缺失字段以 issue 形式报出，不静默', () => {
  const r = migration.mapCloudData(cloudFixture())
  const codes = r.issues.map(i => i.code)
  assert.ok(codes.includes('profile.gender.missing'))
  assert.ok(codes.includes('profile.activityLevel.missing'))
  assert.ok(codes.includes('profile.goalType.missing'))
})

test('映射：体重记录按本地格式转换并重算 BMI', () => {
  const r = migration.mapCloudData(cloudFixture())
  assert.strictEqual(r.data.bodyRecords.length, 2)
  const first = r.data.bodyRecords[0]
  assert.strictEqual(first.date, '2026-10-01')
  assert.strictEqual(first.weightKg, 60)
  assert.strictEqual(first.bmi, 22.0) // 60 / 1.65^2
  assert.strictEqual(first.bmiBasis, 'derived')
  assert.strictEqual(first.weightBasis, 'measured')
  assert.strictEqual(first.id, 'cloud_b1')
})

test('映射：BMI 不一致时提示以重算值为准', () => {
  const fixture = cloudFixture()
  fixture.collections.user_profiles[0].bmi = 30
  const r = migration.mapCloudData(fixture)
  assert.ok(r.issues.some(i => i.code === 'profile.bmi.stale'))
})

test('映射：运动记录保留当时的估算消耗，不按今天体重重算', () => {
  const r = migration.mapCloudData(cloudFixture())
  const logs = Object.values(r.data.workoutLogs).flat()
  assert.strictEqual(logs.length, 2)
  const run = logs.find(l => l.typeName === '跑步')
  assert.strictEqual(run.minutes, 30)
  assert.strictEqual(run.kcal, 200)
  assert.strictEqual(run.kcalBasis, 'estimated')
  assert.strictEqual(run.minutesBasis, 'measured')
  assert.strictEqual(run.id, 'cloud_e1')
})

test('映射：饮食记录的中文餐次被归一为英文键（修复写入端不一致）', () => {
  const r = migration.mapCloudData(cloudFixture())
  const logs = Object.values(r.data.foodLogs).flat()
  assert.strictEqual(logs.find(l => l.id === 'cloud_f1').meal, 'lunch')
  assert.strictEqual(logs.find(l => l.id === 'cloud_f3').meal, 'snack')
})

test('映射：云端饮食记录没有营养素，如实留空而不是填 0', () => {
  const r = migration.mapCloudData(cloudFixture())
  const logs = Object.values(r.data.foodLogs).flat()
  const rice = logs.find(l => l.foodName === '白米饭')
  assert.strictEqual(rice.protein, null)
  assert.strictEqual(rice.carb, null)
  assert.strictEqual(rice.fat, null)
  assert.strictEqual(rice.macroBasis, null)
  assert.strictEqual(rice.kcal, 174)
  assert.strictEqual(rice.source, 'cloud')
  assert.strictEqual(r.stats.foodLogsMissingMacros, 3)
  assert.ok(r.issues.some(i => i.code === 'foodLogs.macro.missing'))
})

test('映射：按月份分组', () => {
  const r = migration.mapCloudData(cloudFixture())
  assert.deepStrictEqual(Object.keys(r.data.foodLogs), ['2026-10'])
  assert.deepStrictEqual(Object.keys(r.data.workoutLogs), ['2026-10'])
})

test('映射：日期非法的记录被跳过并计入问题', () => {
  const fixture = cloudFixture()
  fixture.collections.body_records.push({ _id: 'bad', date: '不是日期', weight: 60 })
  const r = migration.mapCloudData(fixture)
  assert.strictEqual(r.data.bodyRecords.length, 2)
  assert.ok(r.issues.some(i => i.code === 'bodyRecords.skipped'))
})

test('映射：无云端档案时不影响其余数据', () => {
  const fixture = cloudFixture()
  fixture.collections.user_profiles = []
  const r = migration.mapCloudData(fixture)
  assert.strictEqual(r.data.profile, null)
  assert.strictEqual(r.data.bodyRecords.length, 2)
  assert.strictEqual(r.data.bodyRecords[0].bmi, null) // 无身高则不算 BMI，不猜
})

test('映射：云端「无法归属」诊断会转成问题提示', () => {
  const fixture = cloudFixture()
  fixture.diagnostics = { food_logs: { matchedForOpenid: 3, collectionTotal: 5, unattributable: 2 } }
  const r = migration.mapCloudData(fixture)
  const issue = r.issues.find(i => i.code === 'cloud.unattributable')
  assert.ok(issue)
  assert.ok(issue.message.includes('2'))
})

test('toDateStr：兼容 YYYY-MM-DD、Date 与 ISO 字符串', () => {
  assert.strictEqual(migration.toDateStr('2026-10-02'), '2026-10-02')
  assert.strictEqual(migration.toDateStr(new Date(2026, 9, 2, 12, 0, 0)), '2026-10-02')
  assert.strictEqual(migration.toDateStr('not a date'), null)
  assert.strictEqual(migration.toDateStr(null), null)
})

/* ============================ 预览与执行 ============================ */

test('预览：给出统计与问题，但不写入本地', () => {
  const s = newStore()
  const r = migration.previewMigration(s, cloudFixture())
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.stats.bodyRecords, 2)
  assert.strictEqual(r.stats.workoutLogs, 2)
  assert.strictEqual(r.stats.foodLogs, 3)
  assert.strictEqual(s.getBodyRecords().length, 0)
  assert.strictEqual(s.getFoodLogs().length, 0)
  assert.strictEqual(s.listPreImportBackups().length, 0)
})

test('执行：数据落库，并自动留一份导入前备份', () => {
  const s = newStore()
  const r = migration.runMigration(s, cloudFixture())

  assert.strictEqual(r.ok, true)
  assert.ok(r.backupKey)
  assert.strictEqual(s.getBodyRecords().length, 2)
  assert.strictEqual(s.getWorkoutLogs().length, 2)
  assert.strictEqual(s.getFoodLogs().length, 3)
  assert.strictEqual(s.getProfile().heightCm, 165)
  assert.strictEqual(s.listPreImportBackups().length, 1)
})

test('执行：幂等，重复迁移不会产生重复记录', () => {
  const s = newStore()
  migration.runMigration(s, cloudFixture())
  const second = migration.runMigration(s, cloudFixture())

  assert.strictEqual(second.ok, true)
  assert.strictEqual(s.getBodyRecords().length, 2)
  assert.strictEqual(s.getWorkoutLogs().length, 2)
  assert.strictEqual(s.getFoodLogs().length, 3)
  assert.strictEqual(second.summary.bodyRecords, 0)
  assert.strictEqual(second.summary.foodLogs, 0)
})

test('执行：不覆盖迁移前已有的本地记录', () => {
  const s = newStore()
  s.saveProfile({ heightCm: 170, weightKg: 70, age: 30, gender: 'male', goalType: 'cut' })
  s.addBodyRecord({ date: '2026-10-01', weightKg: 70 })

  migration.runMigration(s, cloudFixture())

  assert.strictEqual(s.getProfile().heightCm, 170) // 本地资料保留
  const oct1 = s.getBodyRecords().find(r => r.date === '2026-10-01')
  assert.strictEqual(oct1.weightKg, 70)
  assert.strictEqual(s.getBodyRecords().length, 2) // 仅补入 10-05
})

test('执行：迁移后的数据可被本地引擎继续消费', () => {
  const s = newStore()
  migration.runMigration(s, cloudFixture())

  const logs = Object.values(s.getFoodLogs ? { x: s.getFoodLogs() } : {}).flat()
  assert.strictEqual(logs.length, 3)
  const rec = migration.runMigration(s, cloudFixture())
  assert.strictEqual(rec.ok, true)
})

test('执行：档案关键字段缺失时报错且不写入', () => {
  const s = newStore()
  const fixture = cloudFixture()
  fixture.collections.user_profiles[0].height = null
  const r = migration.runMigration(s, fixture)
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.written, false)
  assert.strictEqual(s.getProfile(), null)
})

/* ============================ 分页读取 ============================ */

test('分页：按 hasMore 循环拉取全部分页', async () => {
  const pages = []
  const callFunction = async ({ data }) => {
    pages.push(data.skip)
    const total = 230
    const from = data.skip
    const rows = []
    for (let i = from; i < Math.min(from + data.limit, total); i++) rows.push({ _id: `r${i}` })
    return { result: { collection: data.collection, count: rows.length, hasMore: rows.length === data.limit, data: rows } }
  }

  const reader = migration.createCloudReader({ callFunction, pageSize: 100 })
  const r = await reader.fetchCollection('food_logs')

  assert.strictEqual(r.rows.length, 230)
  assert.deepStrictEqual(pages, [0, 100, 200])
})

test('分页：first page 请求诊断信息', async () => {
  let sawDiagnostics = null
  const callFunction = async ({ data }) => {
    if (data.skip === 0) sawDiagnostics = data.diagnostics
    return { result: { count: 0, hasMore: false, data: [], diagnostics: { matchedForOpenid: 0, collectionTotal: 3, unattributable: 3 } } }
  }
  const reader = migration.createCloudReader({ callFunction })
  const r = await reader.fetchCollection('body_records', { diagnostics: true })
  assert.strictEqual(sawDiagnostics, true)
  assert.strictEqual(r.diagnostics.unattributable, 3)
})

test('分页：云函数未部署时给出可读错误', async () => {
  const reader = migration.createCloudReader({ callFunction: async () => ({ result: null }) })
  await assert.rejects(() => reader.fetchCollection('food_logs'), /exportUserData/)
})

test('分页：云函数返回 error 时抛出', async () => {
  const reader = migration.createCloudReader({ callFunction: async () => ({ result: { error: '不支持的集合' } }) })
  await assert.rejects(() => reader.fetchCollection('nope'), /不支持的集合/)
})

test('分页：fetchAll 覆盖全部四个集合', async () => {
  const seen = []
  const callFunction = async ({ data }) => {
    seen.push(data.collection)
    return { result: { count: 0, hasMore: false, data: [] } }
  }
  const reader = migration.createCloudReader({ callFunction })
  const all = await reader.fetchAll()
  assert.deepStrictEqual(Object.keys(all.collections).sort(), ['body_records', 'exercise_logs', 'food_logs', 'user_profiles'])
  assert.strictEqual(new Set(seen).size, 4)
})
