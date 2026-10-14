/**
 * 营养计划模型
 *
 * 负责把「身体资料 + 计划设置」编译成一份可展示、可冻结的完整结果：
 *   BMR → TDEE → 目标热量 → 系数 → 两种模式的营养素目标
 *
 * 纯函数，不读写存储。落库由 storage.putTargetSnapshot / saveNutritionPlan 负责。
 */

const nutrition = require('./nutrition.js')

const DEFAULT_PLAN = {
  goalType: 'cut',
  mode: 'coefficient',
  activityLevel: 'moderate',
  bandId: '4-5h',
  customCoefficients: null,
  goalAdjustment: null,
  targetCalories: null
}

const GOAL_LABELS = { cut: '减脂', bulk: '增肌' }
const MODE_LABELS = { coefficient: '系数优先', calorie: '目标热量优先' }

function normalizePlan (plan, profile) {
  const raw = plan || {}
  const p = Object.assign({}, DEFAULT_PLAN, raw)
  const prof = profile || {}

  // 活动水平：用户/档案没给时按默认档估算，但必须标记出来，不能悄悄兜底
  const explicitLevel = raw.activityLevel || prof.activityLevel || null
  // computePlan 会对已经归一化过的计划再归一化一次，这里要让上一次的判断结果存活下来
  const assumed = raw.activityLevelAssumed === true ? true : !explicitLevel

  return {
    goalType: p.goalType === 'bulk' ? 'bulk' : 'cut',
    mode: p.mode === 'calorie' ? 'calorie' : 'coefficient',
    activityLevel: explicitLevel || DEFAULT_PLAN.activityLevel,
    activityLevelAssumed: assumed,
    activityFactor: p.activityFactor === undefined ? null : p.activityFactor,
    bandId: p.bandId || DEFAULT_PLAN.bandId,
    customCoefficients: p.customCoefficients || null,
    goalAdjustment: (p.goalAdjustment === undefined || p.goalAdjustment === null) ? null : Number(p.goalAdjustment),
    targetCalories: (p.targetCalories === undefined || p.targetCalories === null || p.targetCalories === '')
      ? null
      : Number(p.targetCalories)
  }
}

function metric (value, basis, method) {
  return { value, basis, method }
}

/**
 * 编译计划。
 * @returns {object} { ok, needsProfile, errors, warnings, plan, inputs, bmr, tdee, target, ... }
 */
function computePlan (input) {
  const src = input || {}
  const profile = src.profile || {}
  const plan = normalizePlan(src.plan, profile)
  const errors = []
  const warnings = []

  const missing = []
  if (!profile.gender) missing.push('性别')
  if (!profile.heightCm) missing.push('身高')
  if (!profile.weightKg) missing.push('体重')
  if (!profile.age) missing.push('年龄')

  if (missing.length) {
    return {
      ok: false,
      needsProfile: true,
      errors: [`请先补全身体资料：${missing.join('、')}`],
      warnings,
      plan
    }
  }

  const bmrRes = nutrition.calculateBMR({
    weightKg: profile.weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
    gender: profile.gender
  })
  if (!bmrRes.ok) return { ok: false, needsProfile: false, errors: bmrRes.errors, warnings, plan }

  const tdeeRes = nutrition.calculateTDEE({
    bmr: bmrRes.value,
    gender: profile.gender,
    activityLevel: plan.activityLevel,
    activityFactor: plan.activityFactor
  })
  if (!tdeeRes.ok) {
    return { ok: false, needsProfile: true, errors: tdeeRes.errors, warnings, plan }
  }

  const targetInput = { tdee: tdeeRes.value, goalType: plan.goalType, gender: profile.gender, bmr: bmrRes.value }
  if (plan.goalAdjustment !== null) targetInput.goalAdjustment = plan.goalAdjustment
  const targetRes = nutrition.calculateTargetCalories(targetInput)
  if (!targetRes.ok) return { ok: false, needsProfile: false, errors: targetRes.errors, warnings, plan }

  const coefInput = { bandId: plan.bandId, custom: plan.customCoefficients }
  const coefRes = nutrition.resolveCoefficients(coefInput)
  if (!coefRes.ok) return { ok: false, needsProfile: false, errors: coefRes.errors, warnings, plan }

  const macroInput = { weightKg: profile.weightKg, bandId: plan.bandId, custom: plan.customCoefficients }
  const coefficientFirst = nutrition.calculateMacrosByCoefficient(macroInput)

  // 目标热量优先模式：用户没填目标热量时，用「目标热量」这一步的结果兜底
  const calorieTarget = plan.targetCalories !== null ? plan.targetCalories : targetRes.value
  const calorieFirst = nutrition.calculateMacrosByTargetCalories(
    Object.assign({}, macroInput, { targetCalories: calorieTarget })
  )

  const active = plan.mode === 'coefficient' ? coefficientFirst : calorieFirst
  const alternate = plan.mode === 'coefficient' ? calorieFirst : coefficientFirst

  if (plan.mode === 'calorie' && !calorieFirst.ok) {
    warnings.push(calorieFirst.errors[0] || '目标热量优先模式无法求解')
  }
  if (plan.activityLevelAssumed) {
    warnings.push('尚未设置活动水平，暂按「中度活动」估算，请到身体资料确认后再使用')
  }
  warnings.push(...(targetRes.warnings || []))
  warnings.push(...(tdeeRes.warnings || []))
  if (coefficientFirst.ok) warnings.push(...(coefficientFirst.warnings || []))

  const deltaKcal = (coefficientFirst.ok && calorieFirst.ok)
    ? Math.round(coefficientFirst.kcalFromMacros - calorieFirst.kcalFromMacros)
    : null

  const result = {
    ok: !!active && active.ok === true,
    needsProfile: false,
    errors: [],
    warnings,
    plan,

    inputs: {
      gender: profile.gender,
      age: Number(profile.age),
      heightCm: Number(profile.heightCm),
      weightKg: Number(profile.weightKg),
      activityLevel: plan.activityLevel,
      activityFactor: tdeeRes.activityFactor,
      goalType: plan.goalType,
      mode: plan.mode,
      goalAdjustment: targetRes.adjustment
    },

    bmr: metric(bmrRes.value, bmrRes.basis, bmrRes.method),
    tdee: metric(tdeeRes.value, tdeeRes.basis, tdeeRes.method),
    target: {
      value: targetRes.value,
      basis: targetRes.basis,
      method: targetRes.method,
      adjustment: targetRes.adjustment,
      raw: targetRes.raw,
      floorApplied: targetRes.floorApplied
    },

    bandId: plan.bandId,
    bandLabel: coefRes.bandLabel,
    coefficients: coefRes.coefficients,
    coefficientBasis: coefRes.basis,

    coefficientFirst,
    calorieFirst,
    active,
    alternate,
    deltaKcal,

    labels: {
      goal: GOAL_LABELS[plan.goalType],
      mode: MODE_LABELS[plan.mode]
    }
  }

  if (!result.ok && plan.mode === 'calorie' && !calorieFirst.ok) {
    result.conflict = calorieFirst.conflict
  }

  return result
}

/**
 * 把计划结果编译成「当日目标快照」，用于冻结历史。
 */
function buildSnapshot (planResult, options) {
  const o = options || {}
  if (!planResult || !planResult.ok) return null

  const a = planResult.active
  const alt = planResult.alternate

  return {
    ruleVersion: 'v1',
    source: o.source || 'plan',

    mode: planResult.plan.mode,
    goalType: planResult.plan.goalType,
    bandId: planResult.bandId,
    bandLabel: planResult.bandLabel,
    coefficients: planResult.coefficients,
    coefficientBasis: planResult.coefficientBasis,
    goalAdjustment: planResult.target.adjustment,

    inputs: planResult.inputs,

    bmr: planResult.bmr,
    tdee: planResult.tdee,
    targetCalories: planResult.target,

    // 当日实际执行的目标（按 mode 选定）
    targets: {
      kcal: a.kcalFromMacros,
      carb: a.grams.carb,
      protein: a.grams.protein,
      fat: a.grams.fat,
      basis: 'derived'
    },
    // 另一种模式的结果，用于对比展示
    alternate: {
      mode: planResult.plan.mode === 'coefficient' ? 'calorie' : 'coefficient',
      kcal: alt && alt.ok ? alt.kcalFromMacros : null,
      carb: alt && alt.ok ? alt.grams.carb : null,
      protein: alt && alt.ok ? alt.grams.protein : null,
      fat: alt && alt.ok ? alt.grams.fat : null
    },
    deltaKcal: planResult.deltaKcal,

    computedAt: new Date().toISOString()
  }
}

/**
 * 切换目标时的差异预览，供二次确认使用。
 */
function previewGoalChange (input) {
  const src = input || {}
  const current = computePlan({ profile: src.profile, plan: src.plan })
  const next = computePlan({
    profile: src.profile,
    plan: Object.assign({}, src.plan, { goalType: src.goalType })
  })

  if (!current.ok || !next.ok) {
    return { ok: false, errors: [].concat(current.errors || [], next.errors || []) }
  }

  const rows = [
    { label: '目标', from: current.labels.goal, to: next.labels.goal, plain: true },
    { label: '每日热量', from: current.target.value, to: next.target.value, unit: 'kcal' },
    { label: '碳水', from: current.active.grams.carb, to: next.active.grams.carb, unit: 'g' },
    { label: '蛋白质', from: current.active.grams.protein, to: next.active.grams.protein, unit: 'g' },
    { label: '脂肪', from: current.active.grams.fat, to: next.active.grams.fat, unit: 'g' }
  ]

  return {
    ok: true,
    current,
    next,
    rows,
    changes: rows.filter(r => String(r.from) !== String(r.to))
  }
}

module.exports = {
  DEFAULT_PLAN,
  GOAL_LABELS,
  MODE_LABELS,
  normalizePlan,
  computePlan,
  buildSnapshot,
  previewGoalChange
}
