/**
 * 旧版通用工具，仅由尚未迁移的老页面（guide / weight / record）使用。
 *
 * 注意：下面的热量相关函数是早期实现，其中 calculateCalories 写死了女性公式、
 * 且不含活动水平兜底，已经被 utils/nutrition.js 取代（新页面一律用 nutrition.js）。
 * 这里保留是为了不破坏老页面，新增代码请勿再引用。
 */
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()
  return `${[year, month, day].map(formatNumber).join('/')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

const formatDate = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  return `${[year, month, day].map(formatNumber).join('-')}`
}

const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

const getToday = () => {
  return formatDate(new Date())
}

const getWeekStart = () => {
  const now = new Date()
  const day = now.getDay() || 7
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1 - day)
}

const calculateBMI = (weight, height) => {
  const h = height / 100
  return (weight / (h * h)).toFixed(1)
}

/** @deprecated 请使用 utils/nutrition.js 的 calculateBMR / calculateTDEE */
const calculateCalories = (weight, height, age, gender, activityLevel) => {
  // Mifflin-St Jeor 公式
  let bmr
  if (gender === 'female') {
    bmr = 10 * weight + 6.25 * height - 5 * age - 161
  } else {
    bmr = 10 * weight + 6.25 * height - 5 * age + 5
  }
  const multiplier = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725
  }
  return Math.round(bmr * (multiplier[activityLevel] || 1.375))
}

/** @deprecated 请使用 utils/nutrition.js 的 estimateTrainingCalories */
const calculateExerciseCalories = (type, duration, weight) => {
  const metValues = {
    running: 9.8,
    walking: 3.8,
    cycling: 7.5,
    swimming: 8.0,
    yoga: 2.5,
    fitness: 6.0,
    rope: 10.0,
    hiking: 6.5
  }
  const met = metValues[type] || 4.0
  return Math.round(met * weight * (duration / 60))
}

const calculateDaysDiff = (date1, date2) => {
  const d1 = new Date(date1)
  const d2 = new Date(date2)
  return Math.ceil((d2 - d1) / (1000 * 60 * 60 * 24))
}

const debounce = (fn, delay = 300) => {
  let timer
  return function(...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

module.exports = {
  formatTime,
  formatDate,
  getToday,
  getWeekStart,
  calculateBMI,
  calculateCalories,
  calculateExerciseCalories,
  calculateDaysDiff,
  debounce
}
