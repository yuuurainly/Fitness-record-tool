/**
 * 食物库查询（纯逻辑）
 *
 * 数据来自 data/foodLibrary.js（136 条内置食物，每 100g 营养值）。
 * 本模块只做检索、缩放与校验，不读写本地存储；自定义食物由 storage.js 持久化后传入。
 */

const data = require('../data/foodLibrary.js')

// 自定义食物的 id 用字符串前缀，避免与内置库的数字 id 撞号
const CUSTOM_ID_PREFIX = 'custom_'

const MACRO_LIMITS = {
  kcalPer100g: [0, 900],
  macroPer100g: [0, 100]
}

function libraryVersion () {
  return data.FOOD_LIBRARY_VERSION
}

function categories () {
  return data.FOOD_CATEGORIES.slice()
}

function allFoods () {
  return data.FOOD_LIBRARY
}

function count () {
  return data.FOOD_LIBRARY.length
}

function getFoodById (id) {
  return data.FOOD_LIBRARY.find(f => f.id === id) || null
}

/**
 * 按 4/4/9 反算每 100g 热量。
 */
function macroKcalPer100g (food) {
  if (!food || food.protein === null || food.carb === null || food.fat === null) return null
  return Math.round((food.protein * 4 + food.carb * 4 + food.fat * 9) * 10) / 10
}

/**
 * 来源热量与 4/4/9 反算值的偏差百分比。
 * 蔬菜类因膳食纤维实际产能低于 4 kcal/g，天然会出现较大偏差；这里只提示，不改数据。
 */
function macroMismatchPercent (food) {
  const computed = macroKcalPer100g(food)
  if (computed === null || !food.kcalPer100g) return null
  return Math.round(Math.abs(computed - food.kcalPer100g) / food.kcalPer100g * 1000) / 10
}

/**
 * 按克数缩放一条食物记录。
 * 热量取自来源数据，营养素按各自每 100g 值缩放，两者互不覆盖。
 */
function scaleFood (food, grams) {
  const warnings = []
  if (!food) return { ok: false, errors: ['未找到该食物'], warnings }
  const g = Number(grams)
  if (!Number.isFinite(g) || g <= 0 || g > 5000) {
    return { ok: false, errors: ['食物重量应在 1~5000 g 之间'], warnings }
  }

  const factor = g / 100
  const hasMacros = food.protein !== null && food.carb !== null && food.fat !== null

  const result = {
    ok: true,
    foodId: food.id,
    foodName: food.name,
    grams: g,
    gramsBasis: 'measured',
    kcalPer100g: food.kcalPer100g,
    kcal: Math.round((food.kcalPer100g || 0) * factor),
    kcalBasis: 'derived',
    protein: hasMacros ? Math.round(food.protein * factor * 10) / 10 : null,
    carb: hasMacros ? Math.round(food.carb * factor * 10) / 10 : null,
    fat: hasMacros ? Math.round(food.fat * factor * 10) / 10 : null,
    macroBasis: hasMacros ? 'derived' : null,
    macroKcal: hasMacros ? Math.round((food.protein * 4 + food.carb * 4 + food.fat * 9) * factor) : null,
    errors: [],
    warnings
  }

  if (!hasMacros) warnings.push('该食物缺少营养素数据，本次记录只计入热量')

  const mismatch = macroMismatchPercent(food)
  if (mismatch !== null && mismatch > 15) {
    result.macroMismatchPercent = mismatch
    warnings.push(`来源热量与 4/4/9 反算值相差 ${mismatch}%（常见于含膳食纤维的食物），已按来源热量计`)
  }

  return result
}

/**
 * 检索：内置库 + 自定义食物合并搜索。
 */
function scaleFromLog (log, grams) {
  const g = Number(grams)
  const warnings = []
  if (!log) return { ok: false, errors: ['记录不存在'], warnings }
  if (!Number.isFinite(g) || g <= 0 || g > 5000) {
    return { ok: false, errors: ['食物重量应在 1~5000 g 之间'], warnings }
  }

  const baseGrams = Number(log.grams) || 0
  const factor = baseGrams > 0 ? g / baseGrams : 0
  const hasPer100 = log.kcalPer100g !== null && log.kcalPer100g !== undefined
  const hasMacros = log.protein !== null && log.protein !== undefined &&
    log.carb !== null && log.carb !== undefined &&
    log.fat !== null && log.fat !== undefined

  if (!hasPer100 && baseGrams <= 0) {
    return { ok: false, errors: ['该记录缺少可换算的热量数据'], warnings }
  }

  return {
    ok: true,
    foodId: log.foodId === undefined ? null : log.foodId,
    foodName: log.foodName,
    grams: g,
    gramsBasis: 'measured',
    kcalPer100g: hasPer100 ? log.kcalPer100g : null,
    kcal: hasPer100
      ? Math.round(Number(log.kcalPer100g) * g / 100)
      : Math.round(Number(log.kcal || 0) * factor),
    kcalBasis: 'derived',
    protein: hasMacros ? Math.round(Number(log.protein) * factor * 10) / 10 : null,
    carb: hasMacros ? Math.round(Number(log.carb) * factor * 10) / 10 : null,
    fat: hasMacros ? Math.round(Number(log.fat) * factor * 10) / 10 : null,
    macroBasis: hasMacros ? 'derived' : null,
    // 无每 100g 数据时按原记录等比例换算，结果标注出来避免误解
    method: hasPer100 ? 'per-100g' : 'proportional',
    errors: [],
    warnings
  }
}

/**
 * 检索：内置库 + 自定义食物合并搜索。
 */
function search (input) {
  const src = input || {}
  const keyword = (src.keyword || '').trim().toLowerCase()
  const limit = Number(src.limit) > 0 ? Number(src.limit) : 50

  const pool = data.FOOD_LIBRARY.concat(Array.isArray(src.customFoods) ? src.customFoods : [])
  const matched = pool.filter(f => {
    if (!f || !f.name) return false
    if (src.category && f.category !== src.category) return false
    if (keyword && f.name.toLowerCase().indexOf(keyword) === -1) return false
    return true
  })

  return { ok: true, total: matched.length, foods: matched.slice(0, limit) }
}

function validateCustomFood (input) {
  const src = input || {}
  const errors = []

  if (!src.name || !String(src.name).trim()) errors.push('食物名称不能为空')
  if (String(src.name || '').trim().length > 20) errors.push('食物名称不超过 20 个字')

  const numeric = [
    ['kcalPer100g', MACRO_LIMITS.kcalPer100g, '每 100g 热量(kcal)'],
    ['protein', MACRO_LIMITS.macroPer100g, '蛋白质(g/100g)'],
    ['carb', MACRO_LIMITS.macroPer100g, '碳水(g/100g)'],
    ['fat', MACRO_LIMITS.macroPer100g, '脂肪(g/100g)']
  ]
  numeric.forEach(([key, range, label]) => {
    const v = src[key]
    if (v === '' || v === null || v === undefined) {
      if (key === 'kcalPer100g') errors.push(`${label}不能为空`)
      return
    }
    const n = Number(v)
    if (!Number.isFinite(n)) errors.push(`${label}必须是数字`)
    else if (n < range[0] || n > range[1]) errors.push(`${label}应在 ${range[0]}~${range[1]} 之间`)
  })

  if (src.category && data.FOOD_CATEGORIES.indexOf(src.category) === -1) {
    errors.push('分类不在可选范围内')
  }

  if (errors.length) return { ok: false, errors, warnings: [] }

  const food = {
    id: src.id || `${CUSTOM_ID_PREFIX}${Date.now().toString(36)}`,
    name: String(src.name).trim(),
    category: src.category || '自定义',
    kcalPer100g: Number(src.kcalPer100g),
    protein: src.protein === '' || src.protein === null || src.protein === undefined ? null : Number(src.protein),
    carb: src.carb === '' || src.carb === null || src.carb === undefined ? null : Number(src.carb),
    fat: src.fat === '' || src.fat === null || src.fat === undefined ? null : Number(src.fat),
    icon: src.icon || '🍽️',
    isCustom: true,
    createdAt: src.createdAt || new Date().toISOString()
  }

  return { ok: true, food, errors: [], warnings: [] }
}

module.exports = {
  CUSTOM_ID_PREFIX,
  MACRO_LIMITS,
  libraryVersion,
  categories,
  allFoods,
  count,
  getFoodById,
  macroKcalPer100g,
  macroMismatchPercent,
  scaleFood,
  scaleFromLog,
  search,
  validateCustomFood
}
