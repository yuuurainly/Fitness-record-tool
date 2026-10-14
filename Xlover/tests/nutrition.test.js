const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const n = require('../miniprogram/utils/nutrition.js')

/* ============================ 结构约束 ============================ */

test('计算模块不依赖 wx（计算与存储分离）', () => {
  const src = fs.readFileSync(path.join(__dirname, '../miniprogram/utils/nutrition.js'), 'utf8')
  assert.strictEqual(/wx\./.test(src), false, 'nutrition.js 不应出现 wx API 调用')
})

/* ============================ 1. BMR / TDEE / 目标热量 ============================ */

test('BMR：男性使用 Mifflin-St Jeor 男性公式', () => {
  const r = n.calculateBMR({ weightKg: 70, heightCm: 175, age: 30, gender: 'male' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.value, 1649) // 10*70 + 6.25*175 - 5*30 + 5
  assert.strictEqual(r.basis, n.PROVENANCE.ESTIMATED)
  assert.strictEqual(r.method, 'mifflin-st-jeor')
})

test('BMR：女性使用女性公式（-161）', () => {
  const r = n.calculateBMR({ weightKg: 70, heightCm: 175, age: 30, gender: 'female' })
  assert.strictEqual(r.value, 1483)
})

test('BMR：缺失必填项时报错且不返回数值', () => {
  const r = n.calculateBMR({ weightKg: '', heightCm: 175, age: 30, gender: 'male' })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.value, null)
  assert.ok(r.errors.some(e => e.includes('体重')))
})

test('BMR：异常范围（身高 300cm）被拒绝', () => {
  const r = n.calculateBMR({ weightKg: 70, heightCm: 300, age: 30, gender: 'male' })
  assert.strictEqual(r.ok, false)
})

test('TDEE：BMR × 活动系数', () => {
  const r = n.calculateTDEE({ bmr: 1649, activityLevel: 'moderate', gender: 'male' })
  assert.strictEqual(r.value, Math.round(1649 * 1.55))
  assert.strictEqual(r.activityFactor, 1.55)
})

test('TDEE：显式活动系数优先于档位', () => {
  const r = n.calculateTDEE({ bmr: 1649, activityLevel: 'moderate', activityFactor: 1.3, gender: 'male' })
  assert.strictEqual(r.activityFactor, 1.3)
})

test('TDEE：未选择活动水平时不兜底默认值', () => {
  const r = n.calculateTDEE({ bmr: 1649, gender: 'male' })
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors.some(e => e.includes('活动水平')))
})

test('TDEE：低于安全下限时抬到下限并给出提醒', () => {
  const r = n.calculateTDEE({ bmr: 958, activityLevel: 'sedentary', gender: 'female' })
  assert.strictEqual(r.value, n.SAFE_MIN_CALORIES.female)
  assert.strictEqual(r.floorApplied, true)
  assert.strictEqual(r.warnings.length, 1)
})

test('目标热量：减脂 -20%，增肌 +10%', () => {
  const cut = n.calculateTargetCalories({ tdee: 2556, goalType: 'cut', gender: 'male' })
  const bulk = n.calculateTargetCalories({ tdee: 2556, goalType: 'bulk', gender: 'male' })
  assert.strictEqual(cut.value, Math.round(2556 * 0.8))
  assert.strictEqual(bulk.value, Math.round(2556 * 1.1))
  assert.strictEqual(cut.basis, n.PROVENANCE.DERIVED)
})

test('目标热量：低于安全下限时抬到下限并提醒', () => {
  const r = n.calculateTargetCalories({ tdee: 1200, goalType: 'cut', gender: 'female', bmr: 1180 })
  assert.strictEqual(r.value, 1200)
  assert.strictEqual(r.floorApplied, true)
  assert.ok(r.warnings.length >= 1)
})

/* ============================ 2. 系数与两种模式 ============================ */

test('系数档位与用户指定规则一致', () => {
  const expect = {
    '2-3h': [2.2, 1.4, 0.8],
    '4-5h': [2.5, 1.6, 0.9],
    '6-7h': [3.0, 1.7, 1.0],
    '8-9h': [3.5, 1.8, 1.0]
  }
  n.listCoefficientBands().forEach(b => {
    assert.deepStrictEqual([b.carb, b.protein, b.fat], expect[b.id], `档位 ${b.id} 系数不符`)
  })
})

test('模式一（系数优先）：克数 = 体重 × 系数，热量按 4/4/9 反算', () => {
  const r = n.calculateMacrosByCoefficient({ weightKg: 70, bandId: '4-5h' })
  assert.deepStrictEqual(r.grams, { carb: 175, protein: 112, fat: 63 })
  assert.strictEqual(r.kcalFromMacros, 175 * 4 + 112 * 4 + 63 * 9) // 1715
  assert.strictEqual(r.value, 1715)
})

test('模式一：自定义系数覆盖内置档位', () => {
  const r = n.calculateMacrosByCoefficient({ weightKg: 60, custom: { carb: 3, protein: 2, fat: 1 } })
  assert.deepStrictEqual(r.grams, { carb: 180, protein: 120, fat: 60 })
  assert.strictEqual(r.bandId, 'custom')
})

test('模式一：非法自定义系数被拒绝', () => {
  const r = n.calculateMacrosByCoefficient({ weightKg: 60, custom: { carb: 0, protein: 2, fat: 1 } })
  assert.strictEqual(r.ok, false)
})

test('模式二（目标热量优先）：蛋白/脂肪按系数锁定，碳水吃剩余热量', () => {
  const r = n.calculateMacrosByTargetCalories({ weightKg: 70, bandId: '4-5h', targetCalories: 2000 })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.grams.protein, 112)
  assert.strictEqual(r.grams.fat, 63)
  assert.strictEqual(r.grams.carb, 246.3) // (2000 - 112*4 - 63*9) / 4
  assert.strictEqual(r.lockedKcal, 1015)
})

test('模式二：系数热量超出目标时返回冲突，不静默修正', () => {
  const r = n.calculateMacrosByTargetCalories({
    weightKg: 70, custom: { carb: 3, protein: 1.8, fat: 1.0 }, targetCalories: 900
  })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.conflict.type, 'coefficient-exceeds-target')
  assert.strictEqual(r.conflict.lockedKcal, 1134)
  assert.strictEqual(r.conflict.overBy, 234)
  assert.strictEqual(r.grams, undefined)
})

test('双模式对比：显式给出热量与各营养素差异', () => {
  const r = n.compareModes({ weightKg: 70, bandId: '4-5h', targetCalories: 2000 })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.coefficientFirst.kcalFromMacros, 1715)
  assert.strictEqual(r.calorieFirst.kcalFromMacros, 2000)
  assert.strictEqual(r.delta.kcalFromMacros, -285)
  assert.strictEqual(r.delta.carb, -71.3)
  assert.strictEqual(r.delta.protein, 0)
  assert.strictEqual(r.delta.fat, 0)
})

/* ============================ 3. 训练与档位推荐 ============================ */

test('运动消耗：MET × 体重 × 小时，且不作用于目标热量', () => {
  const r = n.estimateTrainingCalories({ metValue: 6, weightKg: 70, workoutMinutes: 60 })
  assert.strictEqual(r.value, 420)
  assert.strictEqual(r.appliedToTarget, false)
  assert.strictEqual(r.basis, n.PROVENANCE.ESTIMATED)
  assert.strictEqual(r.durationBasis, n.PROVENANCE.MEASURED)
})

test('档位推荐：4 周窗口内 480 分钟 → 周均 2 小时 → 2-3h 档', () => {
  const r = n.recommendCoefficientBand({
    referenceDate: '2026-10-12',
    logs: [
      { date: '2026-09-20', minutes: 120 },
      { date: '2026-09-25', minutes: 120 },
      { date: '2026-10-01', minutes: 120 },
      { date: '2026-10-10', minutes: 120 }
    ]
  })
  assert.strictEqual(r.bandId, '2-3h')
  assert.strictEqual(r.avgWeeklyHours, 2)
  assert.strictEqual(r.totalMinutes, 480)
  assert.strictEqual(r.requiresManual, false)
  assert.strictEqual(r.durationBasis, n.PROVENANCE.MEASURED)
})

test('档位推荐：1000 分钟 → 周均 4.17 小时 → 4-5h 档', () => {
  const r = n.recommendCoefficientBand({
    referenceDate: '2026-10-12',
    logs: [
      { date: '2026-09-18', minutes: 200 },
      { date: '2026-09-24', minutes: 200 },
      { date: '2026-09-30', minutes: 200 },
      { date: '2026-10-06', minutes: 200 },
      { date: '2026-10-11', minutes: 200 }
    ]
  })
  assert.strictEqual(r.avgWeeklyHours, 4.17)
  assert.strictEqual(r.bandId, '4-5h')
})

test('档位推荐：窗口外的记录不参与统计', () => {
  const r = n.recommendCoefficientBand({
    referenceDate: '2026-10-12',
    logs: [
      { date: '2026-08-01', minutes: 9999 },
      { date: '2026-09-20', minutes: 120 },
      { date: '2026-09-25', minutes: 120 },
      { date: '2026-10-01', minutes: 120 },
      { date: '2026-10-10', minutes: 120 }
    ]
  })
  assert.strictEqual(r.totalMinutes, 480)
  assert.strictEqual(r.bandId, '2-3h')
})

test('档位推荐：数据不足时要求手动设置', () => {
  const r = n.recommendCoefficientBand({
    referenceDate: '2026-10-12',
    logs: [{ date: '2026-10-10', minutes: 60 }, { date: '2026-10-11', minutes: 60 }]
  })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.bandId, null)
  assert.strictEqual(r.requiresManual, true)
  assert.ok(r.reason.includes('手动'))
})

test('档位推荐：无记录时同样要求手动设置', () => {
  const r = n.recommendCoefficientBand({ referenceDate: '2026-10-12', logs: [] })
  assert.strictEqual(r.requiresManual, true)
  assert.strictEqual(r.avgWeeklyHours, 0)
})

test('档位推荐：低于最低档给出提醒', () => {
  const r = n.recommendCoefficientBand({
    referenceDate: '2026-10-12',
    logs: [
      { date: '2026-09-15', minutes: 60 },
      { date: '2026-09-22', minutes: 60 },
      { date: '2026-09-29', minutes: 60 },
      { date: '2026-10-06', minutes: 60 }
    ]
  })
  assert.strictEqual(r.avgWeeklyHours, 1)
  assert.strictEqual(r.bandId, '2-3h')
  assert.ok(r.warnings.some(w => w.includes('低于最低档')))
})

test('档位推荐：高于最高档给出提醒', () => {
  const logs = ['2026-09-16', '2026-09-19', '2026-09-22', '2026-09-25', '2026-09-28', '2026-10-01', '2026-10-04', '2026-10-07']
    .map(date => ({ date, minutes: 300 }))
  const r = n.recommendCoefficientBand({ referenceDate: '2026-10-12', logs })
  assert.strictEqual(r.avgWeeklyHours, 10)
  assert.strictEqual(r.bandId, '8-9h')
  assert.ok(r.warnings.some(w => w.includes('高于最高档')))
})

/* ============================ 4. 校验与结算 ============================ */

test('资料校验：引导阶段允许暂缺活动水平（只提示）', () => {
  const r = n.validateProfile({ heightCm: 175, weightKg: 70, age: 30, gender: 'male' })
  assert.strictEqual(r.ok, true)
  assert.ok(r.warnings.some(w => w.includes('活动水平')))
})

test('资料校验：requireActivity 时缺失活动水平即报错', () => {
  const r = n.validateProfile({ heightCm: 175, weightKg: 70, age: 30, gender: 'male' }, { requireActivity: true })
  assert.strictEqual(r.ok, false)
})

test('资料校验：目标与当前体重方向不一致时给出提醒', () => {
  const r = n.validateProfile({
    heightCm: 175, weightKg: 70, age: 30, gender: 'male',
    goalType: 'cut', targetWeightKg: 75, activityLevel: 'light'
  })
  assert.strictEqual(r.ok, true)
  assert.ok(r.warnings.some(w => w.includes('减脂')))
})

test('训练记录校验：0 分钟被拒绝', () => {
  const r = n.validateWorkoutLog({ date: '2026-10-12', typeName: '跑步', minutes: 0 })
  assert.strictEqual(r.ok, false)
})

test('BMI：由体重与身高推导', () => {
  const r = n.calculateBMI({ weightKg: 70, heightCm: 175 })
  assert.strictEqual(r.value, 22.9)
  assert.strictEqual(r.basis, n.PROVENANCE.DERIVED)
  assert.strictEqual(r.weightBasis, n.PROVENANCE.MEASURED)
})

test('每日结算：训练消耗不从目标热量中扣减（避免与活动系数重复计算）', () => {
  const r = n.summarizeDay({ date: '2026-10-12', targetCalories: 2000, intakeCalories: 1800, trainingBurnedKcal: 300 })
  assert.strictEqual(r.remainingCalories, 200)
  assert.strictEqual(r.completionPercent, 90)
  assert.strictEqual(r.trainingAppliedToTarget, false)
  assert.strictEqual(r.netIntakeCalories, 1800)
})

test('每日结算：缺少目标热量时不计算完成度', () => {
  const r = n.summarizeDay({ intakeCalories: 1200 })
  assert.strictEqual(r.ok, false)
  assert.strictEqual(r.completionPercent, null)
})

test('营养计划校验：目标热量优先模式必须提供目标热量', () => {
  const r = n.validateNutritionPlan({ mode: 'calorie', goalType: 'cut', weightKg: 70, bandId: '4-5h' })
  assert.strictEqual(r.ok, false)
  assert.ok(r.errors.some(e => e.includes('目标热量')))
})
