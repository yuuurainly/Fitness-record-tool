/**
 * 营养计算引擎
 *
 * 纯函数模块：不依赖 wx / 云开发 / 网络，可直接用 `node --test` 测试。
 * 只负责「算」，读写与持久化见 utils/storage.js。
 *
 * 所有对外计算函数统一返回：
 *   { ok, value, basis, method, errors, warnings }
 *
 * basis 表示数据来源，用于明确区分实测值与估算值：
 *   measured   用户实测（体重、训练时长）
 *   user-input 用户设定（活动水平、系数、目标热量）
 *   estimated  公式估算（BMR / TDEE / 运动消耗）
 *   derived    由其它值推导（营养素克数、系数热量）
 *
 * 重要：系数档位是用户指定的个人偏好规则，不是普适医学标准。
 */

const PROVENANCE = {
  MEASURED: 'measured',
  USER_INPUT: 'user-input',
  ESTIMATED: 'estimated',
  DERIVED: 'derived'
}

const KCAL_PER_GRAM = { carb: 4, protein: 4, fat: 9 }

const GOAL_TYPES = { CUT: 'cut', BULK: 'bulk' }

// 减脂 / 增肌的热量调整比例（相对 TDEE），调用时可覆盖
const DEFAULT_GOAL_ADJUSTMENT = { cut: -0.2, bulk: 0.1 }

// 男女安全下限，与 Xlover-Server/src/utils/helpers.js 的约定保持一致
const SAFE_MIN_CALORIES = { male: 1500, female: 1200 }

const ACTIVITY_LEVELS = [
  { id: 'sedentary', label: '久坐（几乎不运动）', factor: 1.2 },
  { id: 'light', label: '轻度活动（每周 1-3 天）', factor: 1.375 },
  { id: 'moderate', label: '中度活动（每周 3-5 天）', factor: 1.55 },
  { id: 'active', label: '高度活动（每周 6-7 天）', factor: 1.725 },
  { id: 'veryActive', label: '极高活动（体力工作或每日训练）', factor: 1.9 }
]

// 用户指定的三大营养素系数档位，单位 g/kg 体重
const COEFFICIENT_BANDS = [
  { id: '2-3h', label: '每周训练 2-3 小时', minHours: 2, maxHours: 3, carb: 2.2, protein: 1.4, fat: 0.8 },
  { id: '4-5h', label: '每周训练 4-5 小时', minHours: 4, maxHours: 5, carb: 2.5, protein: 1.6, fat: 0.9 },
  { id: '6-7h', label: '每周训练 6-7 小时', minHours: 6, maxHours: 7, carb: 3.0, protein: 1.7, fat: 1.0 },
  { id: '8-9h', label: '每周训练 8-9 小时', minHours: 8, maxHours: 9, carb: 3.5, protein: 1.8, fat: 1.0 }
]

// 档位之间存在空档（3-4 / 5-6 / 7-8 小时），这里取相邻档位中点归入左边档位
const BAND_UPPER_BOUNDS = [3.5, 5.5, 7.5]

// 4 周 = 28 天
const WEEKS_PER_WINDOW = 4
const WINDOW_DAYS = WEEKS_PER_WINDOW * 7
// 数据不足的判据：训练天数或时间跨度不够时不再自动推荐
const MIN_ACTIVE_DAYS = 4
const MIN_SPAN_DAYS = 14
// 碳水低于该克数时给出提醒（不阻断保存）
const CARB_LOW_WARN_GRAMS = 50

const LIMITS = {
  heightCm: [100, 250],
  weightKg: [25, 300],
  age: [10, 100],
  bodyFatPercent: [3, 60],
  activityFactor: [1.0, 2.5],
  carbPerKg: [0.5, 10],
  proteinPerKg: [0.5, 10],
  fatPerKg: [0.2, 5],
  targetCalories: [800, 6000],
  grams: [1, 5000],
  workoutMinutes: [1, 600],
  kcalPer100g: [0, 900],
  macroPer100g: [0, 100],
  kcal: [0, 5000]
}

const GENDERS = ['male', 'female']

// 餐次统一用英文键存储；历史数据里存过中文标签，读取时用 normalizeMeal 归一
const MEAL_LABELS = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐'
}
const MEAL_KEYS = Object.keys(MEAL_LABELS)

const CN_MEAL_TO_KEY = { '早餐': 'breakfast', '午餐': 'lunch', '晚餐': 'dinner', '加餐': 'snack' }

function normalizeMeal (value) {
  if (!value) return null
  const v = String(value).trim()
  if (MEAL_KEYS.indexOf(v) !== -1) return v
  return CN_MEAL_TO_KEY[v] || null
}

function mealLabel (key) {
  return MEAL_LABELS[key] || ''
}

/* ============================ 基础工具 ============================ */

function isNum (v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function round (v, digits) {
  const f = Math.pow(10, digits || 0)
  return Math.round(v * f) / f
}

function todayStr (date) {
  const d = date ? new Date(date) : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysBetween (fromDate, toDate) {
  const a = new Date(`${fromDate}T00:00:00`)
  const b = new Date(`${toDate}T00:00:00`)
  return Math.round((b - a) / 86400000)
}

function emptyResult (basis, method, errors) {
  return { ok: false, value: null, basis, method, errors: errors || [], warnings: [] }
}

function checkRange (value, range, label, errors) {
  if (value === null || value === undefined || value === '') {
    errors.push(`${label}不能为空`)
    return false
  }
  const n = Number(value)
  if (!Number.isFinite(n)) {
    errors.push(`${label}必须是数字`)
    return false
  }
  if (n < range[0] || n > range[1]) {
    errors.push(`${label}应在 ${range[0]}~${range[1]} 之间`)
    return false
  }
  return true
}

function normalizeGender (gender) {
  return gender === 'male' ? 'male' : 'female'
}

/* ============================ 系数档位 ============================ */

function listCoefficientBands () {
  return COEFFICIENT_BANDS.map(b => ({ ...b }))
}

function listActivityLevels () {
  return ACTIVITY_LEVELS.map(l => ({ ...l }))
}

function getCoefficientBand (bandId) {
  const band = COEFFICIENT_BANDS.find(b => b.id === bandId)
  return band ? { ...band } : null
}

function getActivityLevel (activityLevel) {
  const level = ACTIVITY_LEVELS.find(l => l.id === activityLevel)
  return level ? { ...level } : null
}

/**
 * 解析活动系数：优先使用用户显式填写的数值，其次按档位查表。
 */
function resolveActivityFactor (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  if (src.activityFactor !== null && src.activityFactor !== undefined && src.activityFactor !== '') {
    const n = Number(src.activityFactor)
    if (!Number.isFinite(n)) {
      errors.push('活动系数必须是数字')
      return { ok: false, factor: null, basis: PROVENANCE.USER_INPUT, errors, warnings }
    }
    if (n < LIMITS.activityFactor[0] || n > LIMITS.activityFactor[1]) {
      errors.push(`活动系数应在 ${LIMITS.activityFactor[0]}~${LIMITS.activityFactor[1]} 之间`)
      return { ok: false, factor: null, basis: PROVENANCE.USER_INPUT, errors, warnings }
    }
    return { ok: true, factor: n, basis: PROVENANCE.USER_INPUT, method: 'user factor', errors, warnings }
  }

  const level = getActivityLevel(src.activityLevel)
  if (!level) {
    errors.push('尚未选择活动水平，请先补全后再计算 TDEE')
    return { ok: false, factor: null, basis: PROVENANCE.USER_INPUT, errors, warnings }
  }
  return { ok: true, factor: level.factor, basis: PROVENANCE.USER_INPUT, method: `activity level: ${level.id}`, errors, warnings }
}

/**
 * 按周训练小时数把连续时长归入某个档位（空档取中点归属左档）。
 */
function bandIdForWeeklyHours (weeklyHours) {
  for (let i = 0; i < COEFFICIENT_BANDS.length; i++) {
    if (weeklyHours < BAND_UPPER_BOUNDS[i]) return COEFFICIENT_BANDS[i].id
  }
  return COEFFICIENT_BANDS[COEFFICIENT_BANDS.length - 1].id
}

/* ============================ 1. BMR / TDEE / 目标热量 ============================ */

/**
 * 基础代谢率 BMR —— Mifflin-St Jeor 公式（估算值）
 *   男：10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 + 5
 *   女：10 × 体重kg + 6.25 × 身高cm − 5 × 年龄 − 161
 */
function calculateBMR (input) {
  const src = input || {}
  const errors = []

  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  checkRange(src.heightCm, LIMITS.heightCm, '身高(cm)', errors)
  checkRange(src.age, LIMITS.age, '年龄', errors)
  if (GENDERS.indexOf(src.gender) === -1) errors.push('性别需要选择男或女')
  if (errors.length) return emptyResult(PROVENANCE.ESTIMATED, 'mifflin-st-jeor', errors)

  const base = 10 * Number(src.weightKg) + 6.25 * Number(src.heightCm) - 5 * Number(src.age)
  const value = Math.round(normalizeGender(src.gender) === 'male' ? base + 5 : base - 161)

  if (!Number.isFinite(value) || value <= 0) {
    return emptyResult(PROVENANCE.ESTIMATED, 'mifflin-st-jeor', ['BMR 计算结果异常（非正数）'])
  }

  return {
    ok: true,
    value,
    basis: PROVENANCE.ESTIMATED,
    method: 'mifflin-st-jeor',
    inputs: { weightKg: Number(src.weightKg), heightCm: Number(src.heightCm), age: Number(src.age), gender: normalizeGender(src.gender) },
    errors: [],
    warnings: []
  }
}

/**
 * 每日总能量消耗 TDEE = BMR × 活动系数
 * 未选择活动水平时不兜底默认值，直接返回未就绪，交由 UI 引导补全。
 */
function calculateTDEE (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  let bmr = src.bmr
  if (!isNum(bmr)) {
    const bmrRes = calculateBMR(src)
    if (!bmrRes.ok) return emptyResult(PROVENANCE.ESTIMATED, 'bmr × activity factor', bmrRes.errors)
    bmr = bmrRes.value
  }

  const factorRes = resolveActivityFactor(src)
  if (!factorRes.ok) return emptyResult(PROVENANCE.ESTIMATED, 'bmr × activity factor', factorRes.errors)

  const gender = normalizeGender(src.gender)
  const floor = SAFE_MIN_CALORIES[gender]
  const raw = bmr * factorRes.factor
  let value = Math.round(raw)
  let floorApplied = false

  if (value < floor) {
    value = floor
    floorApplied = true
    warnings.push(`按公式算得 ${Math.round(raw)} kcal，低于${gender === 'male' ? '男' : '女'}性安全下限，已按 ${floor} kcal 计`)
  }

  return {
    ok: true,
    value,
    basis: PROVENANCE.ESTIMATED,
    method: 'bmr × activity factor',
    bmr,
    activityFactor: factorRes.factor,
    activityFactorBasis: factorRes.basis,
    floorApplied,
    errors: [],
    warnings
  }
}

/**
 * 目标热量：减脂 = TDEE × (1 + cut 调整)，增肌 = TDEE × (1 + bulk 调整)
 * 默认减脂 −20%、增肌 +10%，可传入 goalAdjustment 覆盖。
 */
function calculateTargetCalories (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  if (!isNum(src.tdee) || src.tdee <= 0) {
    return emptyResult(PROVENANCE.DERIVED, 'tdee × goal adjustment', ['缺少有效的 TDEE'])
  }
  if (src.goalType !== GOAL_TYPES.CUT && src.goalType !== GOAL_TYPES.BULK) {
    return emptyResult(PROVENANCE.DERIVED, 'tdee × goal adjustment', ['目标需要选择减脂或增肌'])
  }

  const adjustment = isNum(src.goalAdjustment)
    ? src.goalAdjustment
    : DEFAULT_GOAL_ADJUSTMENT[src.goalType]

  const gender = normalizeGender(src.gender)
  const floor = SAFE_MIN_CALORIES[gender]
  const raw = src.tdee * (1 + adjustment)
  let value = Math.round(raw)
  let floorApplied = false

  if (value < floor) {
    value = floor
    floorApplied = true
    warnings.push(`目标热量 ${Math.round(raw)} kcal 低于安全下限，已按 ${floor} kcal 计`)
  }
  if (src.goalType === GOAL_TYPES.CUT && isNum(src.bmr) && value < src.bmr) {
    warnings.push('减脂目标热量低于 BMR，长期执行前建议再确认')
  }

  return {
    ok: true,
    value,
    basis: PROVENANCE.DERIVED,
    method: 'tdee × goal adjustment',
    goalType: src.goalType,
    adjustment,
    raw: Math.round(raw),
    floorApplied,
    errors: [],
    warnings
  }
}

/* ============================ 2. 三大营养素系数与两种模式 ============================ */

/**
 * 解析系数：允许使用内置档位，或用自定义系数整体覆盖。
 */
function resolveCoefficients (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  if (src.custom) {
    const c = src.custom
    checkRange(c.carb, LIMITS.carbPerKg, '自定义碳水系数(g/kg)', errors)
    checkRange(c.protein, LIMITS.proteinPerKg, '自定义蛋白系数(g/kg)', errors)
    checkRange(c.fat, LIMITS.fatPerKg, '自定义脂肪系数(g/kg)', errors)
    if (errors.length) return { ok: false, bandId: 'custom', coefficients: null, basis: PROVENANCE.USER_INPUT, errors, warnings }
    return {
      ok: true,
      bandId: 'custom',
      bandLabel: '自定义系数',
      coefficients: { carb: Number(c.carb), protein: Number(c.protein), fat: Number(c.fat) },
      basis: PROVENANCE.USER_INPUT,
      errors,
      warnings
    }
  }

  const band = getCoefficientBand(src.bandId)
  if (!band) {
    errors.push('尚未选择系数档位或自定义系数')
    return { ok: false, bandId: null, coefficients: null, basis: PROVENANCE.USER_INPUT, errors, warnings }
  }
  return {
    ok: true,
    bandId: band.id,
    bandLabel: band.label,
    coefficients: { carb: band.carb, protein: band.protein, fat: band.fat },
    basis: PROVENANCE.USER_INPUT,
    errors,
    warnings
  }
}

function macroKcal (grams) {
  return grams.carb * KCAL_PER_GRAM.carb + grams.protein * KCAL_PER_GRAM.protein + grams.fat * KCAL_PER_GRAM.fat
}

/**
 * 模式一：系数优先 —— 按体重 × 系数得到克数，热量由系数反算。
 */
function calculateMacrosByCoefficient (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  if (errors.length) return emptyResult(PROVENANCE.DERIVED, 'weight × coefficient', errors)

  const coefRes = resolveCoefficients(src)
  if (!coefRes.ok) return emptyResult(PROVENANCE.DERIVED, 'weight × coefficient', coefRes.errors)

  const weight = Number(src.weightKg)
  const c = coefRes.coefficients
  const grams = {
    carb: round(weight * c.carb, 1),
    protein: round(weight * c.protein, 1),
    fat: round(weight * c.fat, 1)
  }
  const kcalFromMacros = Math.round(macroKcal(grams))

  if (grams.carb < CARB_LOW_WARN_GRAMS) warnings.push(`碳水仅 ${grams.carb} g，低于 ${CARB_LOW_WARN_GRAMS} g 提醒值`)

  return {
    ok: true,
    value: kcalFromMacros,
    basis: PROVENANCE.DERIVED,
    method: 'weight × coefficient',
    bandId: coefRes.bandId,
    bandLabel: coefRes.bandLabel,
    coefficients: c,
    coefficientBasis: coefRes.basis,
    grams,
    gramBasis: PROVENANCE.DERIVED,
    kcalFromMacros,
    errors: [],
    warnings
  }
}

/**
 * 模式二：目标热量优先 —— 蛋白与脂肪仍按系数锁定克数，碳水吃剩余热量。
 * 若蛋白+脂肪的热量已超过目标热量，返回冲突错误，不静默改写系数或目标。
 */
function calculateMacrosByTargetCalories (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  checkRange(src.targetCalories, LIMITS.targetCalories, '目标热量(kcal)', errors)
  if (errors.length) return emptyResult(PROVENANCE.DERIVED, 'protein/fat by coefficient + carb by residual', errors)

  const coefRes = resolveCoefficients(src)
  if (!coefRes.ok) return emptyResult(PROVENANCE.DERIVED, 'protein/fat by coefficient + carb by residual', coefRes.errors)

  const weight = Number(src.weightKg)
  const target = Number(src.targetCalories)
  const c = coefRes.coefficients

  const protein = round(weight * c.protein, 1)
  const fat = round(weight * c.fat, 1)
  const lockedKcal = protein * KCAL_PER_GRAM.protein + fat * KCAL_PER_GRAM.fat
  const residual = target - lockedKcal

  if (residual < 0) {
    return {
      ok: false,
      value: null,
      basis: PROVENANCE.DERIVED,
      method: 'protein/fat by coefficient + carb by residual',
      conflict: {
        type: 'coefficient-exceeds-target',
        targetCalories: target,
        lockedKcal: Math.round(lockedKcal),
        overBy: Math.round(-residual),
        protein,
        fat
      },
      errors: [`系数热量冲突：蛋白 ${protein}g + 脂肪 ${fat}g 已占 ${Math.round(lockedKcal)} kcal，超出目标 ${Math.round(-residual)} kcal。请调高目标热量或下调系数，系统不会自动覆盖你的设置。`],
      warnings: []
    }
  }

  const carb = round(residual / KCAL_PER_GRAM.carb, 1)
  const grams = { carb, protein, fat }
  const kcalFromMacros = Math.round(macroKcal(grams))

  if (carb < CARB_LOW_WARN_GRAMS) warnings.push(`碳水仅 ${carb} g，低于 ${CARB_LOW_WARN_GRAMS} g 提醒值`)

  return {
    ok: true,
    value: kcalFromMacros,
    basis: PROVENANCE.DERIVED,
    method: 'protein/fat by coefficient + carb by residual',
    bandId: coefRes.bandId,
    bandLabel: coefRes.bandLabel,
    coefficients: c,
    coefficientBasis: coefRes.basis,
    grams,
    gramBasis: PROVENANCE.DERIVED,
    lockedKcal: Math.round(lockedKcal),
    kcalFromMacros,
    driftKcal: Math.round(kcalFromMacros - target),
    errors: [],
    warnings
  }
}

/**
 * 两种模式并列计算，显式给出差异，绝不静默覆盖。
 */
function compareModes (input) {
  const src = input || {}
  const coefficientFirst = calculateMacrosByCoefficient(src)
  const calorieFirst = calculateMacrosByTargetCalories(src)

  const result = {
    ok: coefficientFirst.ok && calorieFirst.ok,
    mode: 'compare',
    coefficientFirst,
    calorieFirst,
    errors: [],
    warnings: []
  }

  if (coefficientFirst.ok && calorieFirst.ok) {
    result.delta = {
      kcalFromMacros: Math.round(coefficientFirst.kcalFromMacros - calorieFirst.kcalFromMacros),
      carb: round(coefficientFirst.grams.carb - calorieFirst.grams.carb, 1),
      protein: round(coefficientFirst.grams.protein - calorieFirst.grams.protein, 1),
      fat: round(coefficientFirst.grams.fat - calorieFirst.grams.fat, 1)
    }
  } else {
    result.errors = [].concat(coefficientFirst.errors || [], calorieFirst.errors || [])
  }
  result.warnings = [].concat(coefficientFirst.warnings || [], calorieFirst.warnings || [])
  return result
}

/* ============================ 3. 训练时长与档位推荐 ============================ */

/**
 * 训练消耗（MET 估算）。
 * 注意：这里算出的消耗只用于展示，不从目标热量里扣减 ——
 * TDEE 的活动系数已经包含日常与训练的基线，两者相加会重复计算。
 */
function estimateTrainingCalories (input) {
  const src = input || {}
  const errors = []

  checkRange(src.workoutMinutes, LIMITS.workoutMinutes, '训练时长(分钟)', errors)
  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  if (!isNum(src.metValue) || src.metValue <= 0 || src.metValue > 25) errors.push('MET 值应在 0~25 之间')
  if (errors.length) return emptyResult(PROVENANCE.ESTIMATED, 'met × weight × hours', errors)

  const value = Math.round(Number(src.metValue) * Number(src.weightKg) * (Number(src.workoutMinutes) / 60))

  return {
    ok: true,
    value,
    basis: PROVENANCE.ESTIMATED,
    method: 'met × weight × hours',
    weightKg: Number(src.weightKg),
    weightBasis: PROVENANCE.MEASURED,
    workoutMinutes: Number(src.workoutMinutes),
    durationBasis: PROVENANCE.MEASURED,
    appliedToTarget: false,
    errors: [],
    warnings: []
  }
}

/**
 * 最近 4 周（28 天）平均每周训练时长 → 系数档位推荐。
 * 数据不足（训练天数 < 4 天或时间跨度 < 14 天）时不做推荐，交回手动设置。
 */
function recommendCoefficientBand (input) {
  const src = input || {}
  const errors = []
  const warnings = []
  const referenceDate = src.referenceDate || todayStr()
  const logs = Array.isArray(src.logs) ? src.logs : []

  const windowStart = (() => {
    const d = new Date(`${referenceDate}T00:00:00`)
    d.setDate(d.getDate() - (WINDOW_DAYS - 1))
    return todayStr(d)
  })()

  const inWindow = logs.filter(l => l && typeof l.date === 'string' && l.date >= windowStart && l.date <= referenceDate)

  let totalMinutes = 0
  const dateSet = new Set()
  inWindow.forEach(l => {
    const minutes = Number(l.minutes)
    if (Number.isFinite(minutes) && minutes > 0) {
      totalMinutes += minutes
      dateSet.add(l.date)
    }
  })

  const activeDays = dateSet.size
  const spanDays = activeDays ? (daysBetween([...dateSet].sort()[0], referenceDate) + 1) : 0
  const avgWeeklyHours = round(totalMinutes / 60 / WEEKS_PER_WINDOW, 2)

  const base = {
    windowStart,
    referenceDate,
    windowDays: WINDOW_DAYS,
    totalMinutes: Math.round(totalMinutes),
    activeDays,
    spanDays,
    avgWeeklyHours,
    durationBasis: PROVENANCE.MEASURED
  }

  if (activeDays < MIN_ACTIVE_DAYS || spanDays < MIN_SPAN_DAYS) {
    return {
      ok: true,
      value: null,
      bandId: null,
      bandLabel: null,
      requiresManual: true,
      basis: PROVENANCE.MEASURED,
      method: '4-week moving average',
      ...base,
      reason: `最近 4 周有效训练 ${activeDays} 天、跨度 ${spanDays} 天，数据不足（需 ≥ ${MIN_ACTIVE_DAYS} 天且跨度 ≥ ${MIN_SPAN_DAYS} 天），请手动选择系数档位。`,
      errors: [],
      warnings
    }
  }

  if (avgWeeklyHours < COEFFICIENT_BANDS[0].minHours) {
    warnings.push(`周均训练 ${avgWeeklyHours} 小时低于最低档（2 小时），已按最低档推荐`)
  }
  const topBand = COEFFICIENT_BANDS[COEFFICIENT_BANDS.length - 1]
  if (avgWeeklyHours > topBand.maxHours) {
    warnings.push(`周均训练 ${avgWeeklyHours} 小时高于最高档（9 小时），已按最高档推荐，可考虑自定义系数`)
  }

  const bandId = bandIdForWeeklyHours(avgWeeklyHours)
  const band = getCoefficientBand(bandId)

  return {
    ok: true,
    value: bandId,
    bandId,
    bandLabel: band.label,
    requiresManual: false,
    basis: PROVENANCE.MEASURED,
    method: '4-week moving average',
    ...base,
    coefficients: { carb: band.carb, protein: band.protein, fat: band.fat },
    errors,
    warnings
  }
}

/* ============================ 4. 校验与每日结算 ============================ */

function calculateBMI (input) {
  const src = input || {}
  const errors = []
  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  checkRange(src.heightCm, LIMITS.heightCm, '身高(cm)', errors)
  if (errors.length) return emptyResult(PROVENANCE.DERIVED, 'weight / height^2', errors)

  const h = Number(src.heightCm) / 100
  return {
    ok: true,
    value: round(Number(src.weightKg) / (h * h), 1),
    basis: PROVENANCE.DERIVED,
    method: 'weight / height^2',
    weightBasis: PROVENANCE.MEASURED,
    heightBasis: PROVENANCE.USER_INPUT,
    errors: [],
    warnings: []
  }
}

/**
 * 身体资料校验。
 * 默认不强制要求活动水平（引导流程允许先存基础资料），
 * 需要算 TDEE 时再调用 calculateTDEE 强制要求。
 */
function validateProfile (input, options) {
  const opts = options || {}
  const src = input || {}
  const errors = []
  const warnings = []

  const fields = {
    heightCm: [LIMITS.heightCm, '身高(cm)'],
    weightKg: [LIMITS.weightKg, '体重(kg)'],
    age: [LIMITS.age, '年龄']
  }
  Object.keys(fields).forEach(k => checkRange(src[k], fields[k][0], fields[k][1], errors))
  if (GENDERS.indexOf(src.gender) === -1) {
    // 云端旧档案没有性别字段；迁移时允许先落库，但必须提醒补全
    if (opts.allowIncomplete) warnings.push('性别缺失，需要补全后才能计算 BMR')
    else errors.push('性别需要选择男或女')
  }
  if (src.goalType !== undefined && src.goalType !== GOAL_TYPES.CUT && src.goalType !== GOAL_TYPES.BULK) {
    errors.push('目标需要选择减脂或增肌')
  }
  if (src.bodyFatPercent !== undefined && src.bodyFatPercent !== null && src.bodyFatPercent !== '') {
    checkRange(src.bodyFatPercent, LIMITS.bodyFatPercent, '体脂率(%)', errors)
  }
  if (src.targetWeightKg !== undefined && src.targetWeightKg !== null && src.targetWeightKg !== '') {
    checkRange(src.targetWeightKg, LIMITS.weightKg, '目标体重(kg)', errors)
  }

  const factorRes = resolveActivityFactor(src)
  if (!factorRes.ok) {
    if (opts.requireActivity) errors.push(...factorRes.errors)
    else warnings.push('尚未选择活动水平，TDEE 与目标热量暂不可计算')
  }

  if (isNum(src.weightKg) && isNum(src.targetWeightKg) && src.goalType) {
    const gain = Number(src.targetWeightKg) - Number(src.weightKg)
    if (src.goalType === GOAL_TYPES.CUT && gain >= 0) warnings.push('减脂目标的体重不低于当前体重，请确认')
    if (src.goalType === GOAL_TYPES.BULK && gain <= 0) warnings.push('增肌目标的体重不高于当前体重，请确认')
  }

  return { ok: errors.length === 0, errors, warnings }
}

function validateBodyRecord (input) {
  const src = input || {}
  const errors = []
  if (!src.date || !/^\d{4}-\d{2}-\d{2}$/.test(src.date)) errors.push('日期格式应为 YYYY-MM-DD')
  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)
  if (src.bodyFatPercent !== undefined && src.bodyFatPercent !== null && src.bodyFatPercent !== '') {
    checkRange(src.bodyFatPercent, LIMITS.bodyFatPercent, '体脂率(%)', errors)
  }
  return { ok: errors.length === 0, errors, warnings: [] }
}

function validateWorkoutLog (input) {
  const src = input || {}
  const errors = []
  if (!src.date || !/^\d{4}-\d{2}-\d{2}$/.test(src.date)) errors.push('日期格式应为 YYYY-MM-DD')
  if (!src.typeName) errors.push('运动名称不能为空')
  checkRange(src.minutes, LIMITS.workoutMinutes, '训练时长(分钟)', errors)
  if (src.metValue !== undefined && src.metValue !== null && src.metValue !== '') {
    if (!isNum(Number(src.metValue)) || Number(src.metValue) <= 0 || Number(src.metValue) > 25) {
      errors.push('MET 值应在 0~25 之间')
    }
  }
  return { ok: errors.length === 0, errors, warnings: [] }
}

/**
 * 饮食记录校验。
 * 营养素允许为 null —— 历史数据（云端 food_logs）只有热量，迁移后需要如实标记缺失，
 * 不能用 0 顶替，否则会污染营养趋势。
 */
function validateFoodLog (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  if (!src.date || !/^\d{4}-\d{2}-\d{2}$/.test(src.date)) errors.push('日期格式应为 YYYY-MM-DD')
  if (!src.foodName || !String(src.foodName).trim()) errors.push('食物名称不能为空')
  checkRange(src.grams, LIMITS.grams, '食物重量(g)', errors)

  const meal = normalizeMeal(src.meal)
  if (!meal) errors.push('餐次需要是早餐/午餐/晚餐/加餐之一')

  if (src.kcal !== undefined && src.kcal !== null && src.kcal !== '') {
    checkRange(src.kcal, LIMITS.kcal, '热量(kcal)', errors)
  }
  if (src.kcalPer100g !== undefined && src.kcalPer100g !== null && src.kcalPer100g !== '') {
    checkRange(src.kcalPer100g, LIMITS.kcalPer100g, '每100g热量(kcal)', errors)
  }

  const macroFields = [['protein', '蛋白质(g)'], ['carb', '碳水(g)'], ['fat', '脂肪(g)']]
  macroFields.forEach(([key, label]) => {
    const v = src[key]
    if (v === undefined || v === null || v === '') {
      warnings.push(`${label}缺失，将按未知处理`)
      return
    }
    if (!isNum(Number(v)) || Number(v) < 0 || Number(v) > 2000) errors.push(`${label}数值不合理`)
  })

  return { ok: errors.length === 0, errors, warnings, normalized: { meal } }
}

function validateNutritionPlan (input) {
  const src = input || {}
  const errors = []
  const warnings = []

  if (src.mode !== 'coefficient' && src.mode !== 'calorie') errors.push('计算模式需要选择「系数优先」或「目标热量优先」')
  if (src.goalType !== GOAL_TYPES.CUT && src.goalType !== GOAL_TYPES.BULK) errors.push('目标需要选择减脂或增肌')
  checkRange(src.weightKg, LIMITS.weightKg, '体重(kg)', errors)

  const coefRes = resolveCoefficients(src)
  if (!coefRes.ok) errors.push(...coefRes.errors)

  if (src.targetCalories !== undefined && src.targetCalories !== null && src.targetCalories !== '') {
    checkRange(src.targetCalories, LIMITS.targetCalories, '目标热量(kcal)', errors)
  }
  if (src.mode === 'calorie' && (src.targetCalories === undefined || src.targetCalories === null || src.targetCalories === '')) {
    errors.push('目标热量优先模式必须提供目标热量')
  }

  return { ok: errors.length === 0, errors, warnings }
}

/**
 * 每日结算：摄入 vs 目标。
 * 训练消耗只作为参考展示，明确不从目标热量中扣除，避免与活动系数重复计算。
 */
function summarizeDay (input) {
  const src = input || {}
  const target = isNum(src.targetCalories) ? src.targetCalories : null
  const intake = isNum(src.intakeCalories) ? src.intakeCalories : 0
  const burned = isNum(src.trainingBurnedKcal) ? src.trainingBurnedKcal : 0
  const warnings = []

  if (target === null) warnings.push('当日缺少目标热量，无法计算完成度')

  return {
    ok: target !== null,
    date: src.date || null,
    targetCalories: target,
    intakeCalories: intake,
    intakeBasis: PROVENANCE.MEASURED,
    remainingCalories: target === null ? null : Math.round(target - intake),
    completionPercent: target ? round((intake / target) * 100, 1) : null,
    trainingBurnedKcal: burned,
    trainingBurnedBasis: PROVENANCE.ESTIMATED,
    trainingAppliedToTarget: false,
    netIntakeCalories: Math.round(intake),
    note: '训练消耗仅为估算参考，已计入 TDEE 活动系数，不再从目标热量中扣减',
    errors: [],
    warnings
  }
}

module.exports = {
  PROVENANCE,
  KCAL_PER_GRAM,
  GOAL_TYPES,
  DEFAULT_GOAL_ADJUSTMENT,
  SAFE_MIN_CALORIES,
  ACTIVITY_LEVELS,
  COEFFICIENT_BANDS,
  BAND_UPPER_BOUNDS,
  MEAL_KEYS,
  MEAL_LABELS,
  LIMITS,
  WINDOW_DAYS,
  listCoefficientBands,
  listActivityLevels,
  getCoefficientBand,
  getActivityLevel,
  resolveActivityFactor,
  bandIdForWeeklyHours,
  normalizeMeal,
  mealLabel,
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateBMI,
  resolveCoefficients,
  calculateMacrosByCoefficient,
  calculateMacrosByTargetCalories,
  compareModes,
  estimateTrainingCalories,
  recommendCoefficientBand,
  validateProfile,
  validateBodyRecord,
  validateWorkoutLog,
  validateFoodLog,
  validateNutritionPlan,
  summarizeDay
}
