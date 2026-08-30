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
