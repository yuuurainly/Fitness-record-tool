const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const nutrition = require('../../utils/nutrition.js')
const planMod = require('../../utils/plan.js')

// 沿用原项目 exercise 页内置的运动类型与 MET 值
const BUILTIN_TYPES = [
  { key: 'running', name: '跑步', met: 9.8 },
  { key: 'walking', name: '步行', met: 3.8 },
  { key: 'cycling', name: '骑行', met: 7.5 },
  { key: 'swimming', name: '游泳', met: 8.0 },
  { key: 'yoga', name: '瑜伽', met: 2.5 },
  { key: 'fitness', name: '健身', met: 6.0 },
  { key: 'rope', name: '跳绳', met: 10.0 },
  { key: 'hiking', name: '登山', met: 6.5 }
]

const MINUTE_PRESETS = [20, 30, 45, 60, 90]

Page({
  data: {
    stats: { totalMinutes: 0, activeDays: 0, avgWeeklyMinutes: 0, avgWeeklyHours: 0, windowDays: 28 },
    recommendation: null,

    bands: [],
    selectedBandId: '',
    useCustom: false,
    custom: { carb: '', protein: '', fat: '' },

    types: [],
    selectedType: '',
    minutePresets: MINUTE_PRESETS,
    form: { date: '', minutes: '' },
    kcalPreview: null,

    history: [],
    planSaving: false
  },

  onLoad () {
    this.setData({
      bands: nutrition.listCoefficientBands(),
      types: BUILTIN_TYPES.slice(),
      'form.date': fmt.today()
    })
  },

  onShow () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.refresh()
  },

  refresh () {
    const store = appStore.getStore()
    const today = fmt.today()

    const series = metrics.getTrainingSeries(store, { days: nutrition.WINDOW_DAYS, today })
    const recommendation = metrics.getTrainingRecommendation(store, { today })

    const savedPlan = planMod.normalizePlan(store.getNutritionPlan(), store.getProfile())
    const settings = store.getSettings() || {}
    const customExercises = Array.isArray(settings.customExercises) ? settings.customExercises : []

    const logs = store.getWorkoutLogs()
      .slice()
      .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : (a.date < b.date ? 1 : -1)))
      .slice(0, 20)
      .map(l => ({
        id: l.id,
        date: l.date,
        label: fmt.relativeDay(l.date, today),
        typeName: l.typeName,
        minutes: l.minutes,
        kcal: l.kcal
      }))

    this.setData({
      stats: {
        totalMinutes: series.totalMinutes,
        activeDays: series.activeDays,
        avgWeeklyMinutes: series.avgWeeklyMinutes,
        avgWeeklyHours: fmt.round1(series.totalMinutes / 60 / (nutrition.WINDOW_DAYS / 7)),
        windowDays: nutrition.WINDOW_DAYS
      },
      recommendation,
      selectedBandId: savedPlan.bandId || '',
      useCustom: savedPlan.bandId === 'custom',
      custom: savedPlan.customCoefficients
        ? {
          carb: String(savedPlan.customCoefficients.carb),
          protein: String(savedPlan.customCoefficients.protein),
          fat: String(savedPlan.customCoefficients.fat)
        }
        : { carb: '', protein: '', fat: '' },
      types: BUILTIN_TYPES.concat(customExercises),
      history: logs
    })
  },

  /* ---------------- 档位设置 ---------------- */

  adoptRecommendation () {
    const rec = this.data.recommendation
    if (!rec || !rec.bandId) return
    this.savePlanPatch({ bandId: rec.bandId, customCoefficients: null }, `已采用「${rec.bandLabel}」`)
  },

  selectBand (e) {
    const bandId = e.currentTarget.dataset.band
    this.savePlanPatch({ bandId, customCoefficients: null }, '档位已更新')
  },

  toggleCustom () {
    const next = !this.data.useCustom
    this.setData({ useCustom: next })
    if (!next) {
      const fallback = this.data.selectedBandId && this.data.selectedBandId !== 'custom'
        ? this.data.selectedBandId
        : nutrition.COEFFICIENT_BANDS[0].id
      this.savePlanPatch({ bandId: fallback, customCoefficients: null }, '已切回档位系数')
    }
  },

  onCustomInput (e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`custom.${key}`]: e.detail.value })
  },

  saveCustom () {
    const c = this.data.custom
    const custom = { carb: c.carb, protein: c.protein, fat: c.fat }
    this.savePlanPatch({ bandId: 'custom', customCoefficients: custom }, '自定义系数已保存')
  },

  savePlanPatch (patch, successText) {
    const store = appStore.getStore()
    const profile = store.getProfile()
    if (!profile) {
      wx.showToast({ title: '请先填写身体资料', icon: 'none' })
      return
    }

    const merged = planMod.normalizePlan(
      Object.assign({}, store.getNutritionPlan() || {}, patch),
      profile
    )
    const res = store.saveNutritionPlan(Object.assign({}, merged, { weightKg: profile.weightKg }))
    if (!res.ok) {
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    // 主动修改计划后刷新「今天」的目标快照；历史日期不动
    metrics.refreshTodaySnapshot(store, { today: fmt.today(), source: 'training-page' })
    this.refresh()
    wx.showToast({ title: successText || '已保存', icon: 'success' })
  },

  /* ---------------- 记录训练 ---------------- */

  selectType (e) {
    this.setData({ selectedType: e.currentTarget.dataset.key })
    this.updateKcal()
  },

  onDate (e) {
    this.setData({ 'form.date': e.detail.value })
  },

  onMinutes (e) {
    this.setData({ 'form.minutes': e.detail.value })
    this.updateKcal()
  },

  onMinutePreset (e) {
    this.setData({ 'form.minutes': String(e.currentTarget.dataset.minutes) })
    this.updateKcal()
  },

  updateKcal () {
    const store = appStore.getStore()
    const profile = store.getProfile()
    const type = this.data.types.find(t => t.key === this.data.selectedType)
    const minutes = parseFloat(this.data.form.minutes)

    if (!profile || !profile.weightKg || !type || !minutes) {
      this.setData({ kcalPreview: null })
      return
    }

    const res = nutrition.estimateTrainingCalories({
      metValue: type.met,
      weightKg: profile.weightKg,
      workoutMinutes: minutes
    })
    this.setData({
      kcalPreview: res.ok ? { kcal: res.value, weightKg: profile.weightKg, met: type.met } : null
    })
  },

  saveTraining () {
    const { selectedType, form, types, kcalPreview } = this.data
    const type = types.find(t => t.key === selectedType)
    const minutes = parseFloat(form.minutes)

    if (!type) {
      wx.showToast({ title: '请选择训练类型', icon: 'none' })
      return
    }
    if (!minutes || minutes <= 0) {
      wx.showToast({ title: '请输入训练时长', icon: 'none' })
      return
    }
    if (form.date > fmt.today()) {
      wx.showToast({ title: '不能记录未来的训练', icon: 'none' })
      return
    }

    const res = appStore.getStore().addWorkoutLog({
      date: form.date,
      typeKey: type.key,
      typeName: type.name,
      minutes,
      metValue: type.met,
      kcal: kcalPreview ? kcalPreview.kcal : null,
      source: 'local'
    })

    if (!res.ok) {
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    this.setData({ selectedType: '', 'form.minutes': '', kcalPreview: null })
    this.refresh()
    wx.showToast({ title: '已记录', icon: 'success' })
  },

  tapHistory (e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.history.find(h => h.id === id)
    if (!item) return
    wx.showModal({
      title: '删除训练记录',
      content: `确定删除 ${item.label} 的「${item.typeName} ${item.minutes}分钟」吗？`,
      confirmText: '删除',
      confirmColor: '#E85D5D',
      success: res => {
        if (!res.confirm) return
        appStore.getStore().removeWorkoutLog(id)
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
