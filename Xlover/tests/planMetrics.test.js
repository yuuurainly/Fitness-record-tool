const test = require('node:test')
const assert = require('node:assert')

const storage = require('../miniprogram/utils/storage.js')
const planMod = require('../miniprogram/utils/plan.js')
const metrics = require('../miniprogram/utils/metrics.js')
const foodLibrary = require('../miniprogram/utils/foodLibrary.js')

function newStore () {
  const s = storage.createStore({ adapter: storage.createMemoryAdapter() })
  s.init()
  return s
}

const PROFILE = {
  gender: 'male', age: 30, heightCm: 178, weightKg: 72,
  activityLevel: 'moderate', goalType: 'cut'
}

function seeded () {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.saveNutritionPlan({ goalType: 'cut', mode: 'coefficient', activityLevel: 'moderate', bandId: '4-5h', weightKg: 72 })
  return s
}

/* ============================ 计划编译 ============================ */

test('computePlan：BMR / TDEE / 目标热量 / 营养素目标自洽', () => {
  const s = seeded()
  const res = planMod.computePlan({ profile: s.getProfile(), plan: planMod.normalizePlan(s.getNutritionPlan(), s.getProfile()) })

  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.bmr.value, 1688)
  assert.strictEqual(res.tdee.value, 2616)
  assert.strictEqual(res.target.value, Math.round(2616 * 0.8))
  assert.deepStrictEqual(res.active.grams, { carb: 180, protein: 115.2, fat: 64.8 })
  assert.strictEqual(res.active.kcalFromMacros, 1764)
  // 系数优先模式的营养素热量就是当日热量目标
  assert.strictEqual(res.bmr.basis, 'estimated')
  assert.strictEqual(res.target.basis, 'derived')
})

test('computePlan：资料不全时明确要求补全，不猜默认值', () => {
  const s = newStore()
  const res = planMod.computePlan({ profile: s.getProfile(), plan: planMod.normalizePlan({}, null) })
  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.needsProfile, true)
  assert.ok(res.errors[0].includes('性别'))
})

test('computePlan：未选活动水平时按默认档估算，但明确标记并提示', () => {
  const s = newStore()
  s.saveProfile({ gender: 'male', age: 30, heightCm: 178, weightKg: 72 })
  const plan = planMod.normalizePlan({}, s.getProfile())
  assert.strictEqual(plan.activityLevelAssumed, true)

  const res = planMod.computePlan({ profile: s.getProfile(), plan })
  assert.strictEqual(res.ok, true)
  assert.ok(res.warnings.some(w => w.includes('活动水平')))
})

test('computePlan：增肌目标把目标热量抬高', () => {
  const s = seeded()
  const cut = planMod.computePlan({ profile: s.getProfile(), plan: { goalType: 'cut' } })
  const bulk = planMod.computePlan({ profile: s.getProfile(), plan: { goalType: 'bulk' } })
  assert.ok(bulk.target.value > cut.target.value)
  assert.strictEqual(bulk.target.adjustment, 0.1)
})

test('computePlan：目标热量优先模式用用户填的目标热量求解', () => {
  const s = seeded()
  const res = planMod.computePlan({
    profile: s.getProfile(),
    plan: { goalType: 'cut', mode: 'calorie', bandId: '4-5h', activityLevel: 'moderate', targetCalories: 2000 }
  })
  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.active.kcalFromMacros, 2000)
  // 72kg：蛋白 115.2g(460.8) + 脂肪 64.8g(583.2) = 1044 → 碳水 (2000-1044)/4 = 239
  assert.strictEqual(res.active.grams.carb, 239)
  assert.strictEqual(res.deltaKcal, 1764 - 2000)
})

test('buildSnapshot：快照只记录当日执行的目标与另一种模式结果', () => {
  const s = seeded()
  const res = planMod.computePlan({ profile: s.getProfile(), plan: planMod.normalizePlan(s.getNutritionPlan(), s.getProfile()) })
  const snap = planMod.buildSnapshot(res, { source: 'test' })

  assert.strictEqual(snap.ruleVersion, 'v1')
  assert.strictEqual(snap.source, 'test')
  assert.strictEqual(snap.targets.kcal, res.active.kcalFromMacros)
  assert.strictEqual(snap.targets.protein, res.active.grams.protein)
  assert.strictEqual(snap.alternate.mode, 'calorie')
  assert.ok(snap.computedAt)
})

test('previewGoalChange：列出新旧差异供二次确认', () => {
  const s = seeded()
  const preview = planMod.previewGoalChange({
    profile: s.getProfile(),
    plan: planMod.normalizePlan(s.getNutritionPlan(), s.getProfile()),
    goalType: 'bulk'
  })
  assert.strictEqual(preview.ok, true)
  assert.ok(preview.changes.some(r => r.label === '目标'))
  assert.ok(preview.changes.some(r => r.label === '每日热量'))
  assert.strictEqual(preview.current.labels.goal, '减脂')
  assert.strictEqual(preview.next.labels.goal, '增肌')
})

test('normalizePlan：缺省值稳定，非法目标回落到减脂', () => {
  const p = planMod.normalizePlan({ goalType: 'xxx', mode: 'yyy' }, PROFILE)
  assert.strictEqual(p.goalType, 'cut')
  assert.strictEqual(p.mode, 'coefficient')
  assert.strictEqual(p.activityLevel, 'moderate')
})

/* ============================ 快照冻结语义 ============================ */

test('freezeToday：只写一次，重复调用不覆盖', () => {
  const s = seeded()
  const first = metrics.freezeToday(s, { today: '2026-10-14' })
  assert.strictEqual(first.frozen, true)

  s.saveNutritionPlan({ goalType: 'bulk', mode: 'coefficient', activityLevel: 'moderate', bandId: '4-5h', weightKg: 72 })
  const second = metrics.freezeToday(s, { today: '2026-10-14' })
  assert.strictEqual(second.frozen, false)
  assert.strictEqual(second.reason, 'exists')
  assert.strictEqual(s.getTargetSnapshot('2026-10-14').goalType, 'cut')
})

test('refreshTodaySnapshot：用户改计划后只刷新今天，历史快照保持原样', () => {
  const s = seeded()
  s.putTargetSnapshot('2026-10-01', { mode: 'coefficient', goalType: 'cut', targets: { kcal: 1800, carb: 180, protein: 115, fat: 65 } })
  metrics.freezeToday(s, { today: '2026-10-14' })

  s.saveNutritionPlan({ goalType: 'bulk', mode: 'coefficient', activityLevel: 'moderate', bandId: '8-9h', weightKg: 72 })
  const res = metrics.refreshTodaySnapshot(s, { today: '2026-10-14', source: 'plan-page' })

  assert.strictEqual(res.frozen, true)
  assert.strictEqual(s.getTargetSnapshot('2026-10-14').goalType, 'bulk')
  assert.strictEqual(s.getTargetSnapshot('2026-10-14').bandId, '8-9h')
  // 历史不动
  assert.strictEqual(s.getTargetSnapshot('2026-10-01').targets.kcal, 1800)
  assert.strictEqual(s.getTargetSnapshot('2026-10-01').goalType, 'cut')
})

test('resolveTargets：快照 > 当天推算 > 无目标', () => {
  const s = seeded()
  // 无快照的今天 → 推算
  assert.strictEqual(metrics.resolveTargets(s, '2026-10-14', { today: '2026-10-14' }).source, 'computed')
  // 无快照的过去 → 无目标
  assert.strictEqual(metrics.resolveTargets(s, '2026-10-02', { today: '2026-10-14' }).source, 'none')
  // 有快照 → 快照优先
  s.putTargetSnapshot('2026-10-02', { targets: { kcal: 1600, carb: 160, protein: 110, fat: 60 } })
  const r = metrics.resolveTargets(s, '2026-10-02', { today: '2026-10-14' })
  assert.strictEqual(r.source, 'snapshot')
  assert.strictEqual(r.targets.kcal, 1600)
})

/* ============================ 汇总口径 ============================ */

test('sumIntake：营养素缺失的记录只计热量，并给出覆盖率', () => {
  const intake = metrics.sumIntake([
    { kcal: 174, protein: null, carb: null, fat: null },
    { kcal: 266, protein: 38.8, carb: 5, fat: 10 }
  ])
  assert.strictEqual(intake.kcal, 440)
  assert.strictEqual(intake.protein, 38.8)
  assert.strictEqual(intake.entries, 2)
  assert.strictEqual(intake.macroEntries, 1)
  assert.strictEqual(intake.missingMacroEntries, 1)
  assert.strictEqual(intake.macrosComplete, false)
  assert.strictEqual(intake.macroCoverage, 0.5)
})

test('getDaySummary：全部记录都没有营养素时，营养素显示为「无数据」而不是 0', () => {
  const s = seeded()
  s.addFoodLog({ date: '2026-10-14', meal: 'lunch', foodName: '历史记录', grams: 150, kcal: 200 })
  const day = metrics.getDaySummary(s, '2026-10-14', { today: '2026-10-14' })

  assert.strictEqual(day.intake.kcal, 200)
  assert.strictEqual(day.macroRows.find(r => r.key === 'carb').value, null)
  assert.strictEqual(day.macroRows.find(r => r.key === 'protein').value, null)
})

test('getDaySummary：训练消耗不参与热量抵扣', () => {
  const s = seeded()
  s.addFoodLog({ date: '2026-10-14', meal: 'lunch', foodName: '米饭', grams: 200, kcal: 232, protein: 5.2, carb: 51.2, fat: 0.6 })
  s.addWorkoutLog({ date: '2026-10-14', typeKey: 'fitness', typeName: '健身', minutes: 60, metValue: 6, kcal: 432 })
  const day = metrics.getDaySummary(s, '2026-10-14', { today: '2026-10-14' })

  assert.strictEqual(day.intake.kcal, 232)
  assert.strictEqual(day.training.kcal, 432)
  // 剩余热量 = 目标 − 摄入，不减训练消耗
  assert.strictEqual(day.remainingKcal, day.targets.kcal - 232)
})

test('getWeightSeries：少于 2 个点时不给出趋势变化', () => {
  const s = seeded()
  s.addBodyRecord({ date: '2026-10-14', weightKg: 72 })
  const series = metrics.getWeightSeries(s, { days: 30, today: '2026-10-14' })
  assert.strictEqual(series.hasEnough, false)
  assert.strictEqual(series.delta, null)
})

test('getGoalHistory：只列出有快照的日期，且分开有/无进食记录', () => {
  const s = seeded()
  s.putTargetSnapshot('2026-10-12', { goalType: 'cut', mode: 'coefficient', targets: { kcal: 1800, carb: 180, protein: 115, fat: 65 } })
  s.putTargetSnapshot('2026-10-13', { goalType: 'cut', mode: 'coefficient', targets: { kcal: 1800, carb: 180, protein: 115, fat: 65 } })
  s.addFoodLog({ date: '2026-10-12', meal: 'lunch', foodName: '米饭', grams: 200, kcal: 1932, protein: 5.2, carb: 51.2, fat: 0.6 })

  const h = metrics.getGoalHistory(s, { limit: 10 })
  assert.strictEqual(h.snapshotDays, 2)
  assert.strictEqual(h.recordedDays, 1)

  const withFood = h.rows.find(r => r.date === '2026-10-12')
  const withoutFood = h.rows.find(r => r.date === '2026-10-13')
  assert.strictEqual(withFood.actualKcal, 1932)
  assert.strictEqual(withFood.diffKcal, 132)
  assert.strictEqual(withoutFood.actualKcal, null)
  assert.strictEqual(withoutFood.diffKcal, null)
})

test('getTrainingRecommendation：复用 4 周窗口算法', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  for (const d of ['2026-09-20', '2026-09-25', '2026-10-01', '2026-10-10']) {
    s.addWorkoutLog({ date: d, typeKey: 'fitness', typeName: '健身', minutes: 120, metValue: 6 })
  }
  const rec = metrics.getTrainingRecommendation(s, { today: '2026-10-14' })
  assert.strictEqual(rec.bandId, '2-3h')
  assert.strictEqual(rec.avgWeeklyHours, 2)
})

/* ============================ 食物换算 ============================ */

test('scaleFromLog：有每 100g 数据时按重量精确重算', () => {
  const r = foodLibrary.scaleFromLog(
    { foodName: '鸡胸肉', grams: 200, kcalPer100g: 133, kcal: 266, protein: 38.8, carb: 5, fat: 10 },
    100
  )
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.kcal, 133)
  assert.strictEqual(r.protein, 19.4)
  assert.strictEqual(r.method, 'per-100g')
})

test('scaleFromLog：无每 100g 数据时按原记录等比例换算并标注', () => {
  const r = foodLibrary.scaleFromLog(
    { foodName: '历史记录', grams: 150, kcalPer100g: null, kcal: 300, protein: 15, carb: 30, fat: 9 },
    75
  )
  assert.strictEqual(r.kcal, 150)
  assert.strictEqual(r.protein, 7.5)
  assert.strictEqual(r.method, 'proportional')
})

test('scaleFromLog：营养素缺失时保持 null，不制造 0', () => {
  const r = foodLibrary.scaleFromLog(
    { foodName: '历史记录', grams: 100, kcalPer100g: 116, kcal: 116, protein: null, carb: null, fat: null },
    200
  )
  assert.strictEqual(r.kcal, 232)
  assert.strictEqual(r.protein, null)
  assert.strictEqual(r.macroBasis, null)
})

test('scaleFromLog：非法重量被拒绝', () => {
  assert.strictEqual(foodLibrary.scaleFromLog({ grams: 100, kcalPer100g: 116 }, 0).ok, false)
  assert.strictEqual(foodLibrary.scaleFromLog(null, 100).ok, false)
})
