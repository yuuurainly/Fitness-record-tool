const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const nutrition = require('../../utils/nutrition.js')
const planMod = require('../../utils/plan.js')

const GOAL_OPTIONS = [
  { value: 'cut', label: '减脂' },
  { value: 'bulk', label: '增肌' }
]
const MODE_OPTIONS = [
  { value: 'coefficient', label: '系数优先' },
  { value: 'calorie', label: '目标热量优先' }
]
const ADJUST_RANGE = {
  cut: { min: -30, max: -5, def: -20, step: 1 },
  bulk: { min: 0, max: 20, def: 10, step: 1 }
}

Page({
  data: {
    goalOptions: GOAL_OPTIONS,
    modeOptions: MODE_OPTIONS,

    ready: false,
    message: '',

    draft: null,
    preview: null,
    savedPlan: null,
    dirty: false,

    adjustPercent: -20,
    adjustRange: ADJUST_RANGE.cut,

    targets: [],
    band: null,
    modeDiff: null,
    calorieInput: '',
    conflict: null,

    versions: [],
    updatedAt: ''
  },

  onShow () {
    this.load()
  },

  load () {
    const store = appStore.getStore()
    const profile = store.getProfile()

    if (!profile) {
      this.setData({ ready: false, message: '请先填写身体资料，才能计算营养目标。' })
      return
    }

    const saved = planMod.normalizePlan(store.getNutritionPlan(), profile)
    const adjustPercent = saved.goalAdjustment === null || saved.goalAdjustment === undefined
      ? ADJUST_RANGE[saved.goalType].def
      : Math.round(saved.goalAdjustment * 100)

    const draft = Object.assign({}, saved, {
      goalAdjustment: adjustPercent / 100,
      targetCalories: saved.targetCalories
    })

    this.setData({
      ready: true,
      message: '',
      savedPlan: saved,
      draft,
      adjustPercent,
      adjustRange: ADJUST_RANGE[draft.goalType],
      calorieInput: draft.targetCalories === null ? '' : String(draft.targetCalories),
      versions: this.buildVersions(store),
      updatedAt: this.buildUpdatedAt(store)
    })
    this.recompute()
  },

  buildVersions (store) {
    return store.listSnapshotDates().slice().reverse().slice(0, 12).map(d => {
      const s = store.getTargetSnapshot(d)
      if (!s || !s.targets) return null
      return {
        date: d,
        label: fmt.monthDay(d),
        kcal: s.targets.kcal,
        goal: planMod.GOAL_LABELS[s.goalType] || s.goalType,
        mode: planMod.MODE_LABELS[s.mode] || s.mode,
        protein: s.targets.protein,
        carb: s.targets.carb,
        fat: s.targets.fat,
        source: s.source || ''
      }
    }).filter(Boolean)
  },

  buildUpdatedAt (store) {
    const plan = store.getNutritionPlan()
    if (plan && plan.updatedAt) return plan.updatedAt.slice(0, 16).replace('T', ' ')
    return ''
  },

  recompute () {
    const store = appStore.getStore()
    const profile = store.getProfile()
    const draft = this.data.draft
    if (!profile || !draft) return

    const res = planMod.computePlan({ profile, plan: draft })

    if (!res.ok) {
      this.setData({
        preview: res,
        message: (res.errors && res.errors[0]) || '计划无法计算',
        dirty: this.isDirty(draft),
        // 冲突时同样要把冲突信息交给界面，否则用户看不到原因
        conflict: res.conflict || null,
        targets: [],
        modeDiff: null
      })
      return
    }

    const a = res.active
    const alt = res.alternate
    const targets = [
      { key: 'carb', label: '碳水', color: 'var(--macro-carb)', grams: a.grams.carb, kcal: Math.round(a.grams.carb * 4) },
      { key: 'protein', label: '蛋白质', color: 'var(--macro-protein)', grams: a.grams.protein, kcal: Math.round(a.grams.protein * 4) },
      { key: 'fat', label: '脂肪', color: 'var(--macro-fat)', grams: a.grams.fat, kcal: Math.round(a.grams.fat * 9) }
    ]

    const band = nutrition.getCoefficientBand(res.bandId)
    const modeDiff = (res.coefficientFirst.ok && res.calorieFirst.ok)
      ? {
        coefficientKcal: res.coefficientFirst.kcalFromMacros,
        calorieKcal: res.calorieFirst.kcalFromMacros,
        delta: res.deltaKcal,
        carbDelta: fmt.round1(res.coefficientFirst.grams.carb - res.calorieFirst.grams.carb)
      }
      : null

    this.setData({
      preview: res,
      message: '',
      dirty: this.isDirty(draft),
      targets,
      band: {
        id: res.bandId,
        label: res.bandLabel,
        coefficients: res.coefficients,
        custom: res.bandId === 'custom'
      },
      modeDiff,
      conflict: (this.data.draft.mode === 'calorie' && !res.calorieFirst.ok) ? res.calorieFirst.conflict : null
    })
  },

  isDirty (draft) {
    const saved = this.data.savedPlan
    if (!saved) return true
    // 未设置过调整比例时，用该目标的默认值参与比较，避免「一进来就是已修改」
    const savedAdjust = (saved.goalAdjustment === null || saved.goalAdjustment === undefined)
      ? ADJUST_RANGE[saved.goalType].def / 100
      : saved.goalAdjustment
    return saved.goalType !== draft.goalType ||
      saved.mode !== draft.mode ||
      savedAdjust !== draft.goalAdjustment ||
      saved.targetCalories !== draft.targetCalories ||
      saved.bandId !== draft.bandId
  },

  /* ---------------- 目标切换（先预览后确认） ---------------- */

  onGoalChange (e) {
    const goalType = e.detail.value
    const store = appStore.getStore()
    const profile = store.getProfile()
    if (!profile) return

    const nextAdjust = ADJUST_RANGE[goalType].def
    const preview = planMod.previewGoalChange({
      profile,
      plan: Object.assign({}, this.data.draft, { goalAdjustment: nextAdjust / 100 }),
      goalType
    })

    if (!preview.ok) {
      wx.showToast({ title: preview.errors[0] || '无法预览', icon: 'none' })
      return
    }

    const lines = preview.changes
      .map(r => `${r.label}：${r.plain ? r.from + ' → ' + r.to : r.from + ' → ' + r.to + ' ' + (r.unit || '')}`)
      .join('\n')

    wx.showModal({
      title: `切换到${planMod.GOAL_LABELS[goalType]}`,
      content: `${lines}\n\n确认后只影响今天及以后，历史记录与历史快照不会改变。`,
      cancelText: '再想想',
      confirmText: '确认应用',
      success: res => {
        if (!res.confirm) return
        const draft = Object.assign({}, this.data.draft, { goalType, goalAdjustment: nextAdjust / 100 })
        this.setData({ draft, adjustPercent: nextAdjust, adjustRange: ADJUST_RANGE[goalType] })
        this.recompute()
      },
      fail: () => {}
    })
  },

  /* ---------------- 其它设置 ---------------- */

  onModeChange (e) {
    const mode = e.detail.value
    const draft = Object.assign({}, this.data.draft, { mode })
    this.setData({ draft })
    this.recompute()
  },

  onAdjust (e) {
    const adjustPercent = e.detail.value
    const draft = Object.assign({}, this.data.draft, { goalAdjustment: adjustPercent / 100 })
    this.setData({ draft, adjustPercent })
    this.recompute()
  },

  onCalorieInput (e) {
    const value = e.detail.value
    this.setData({ calorieInput: value })
    const draft = Object.assign({}, this.data.draft, {
      targetCalories: value === '' ? null : Number(value)
    })
    this.setData({ draft })
    this.recompute()
  },

  useComputedTarget () {
    const preview = this.data.preview
    if (!preview || !preview.ok) return
    const value = String(preview.target.value)
    this.setData({ calorieInput: value })
    const draft = Object.assign({}, this.data.draft, { targetCalories: preview.target.value })
    this.setData({ draft })
    this.recompute()
  },

  goTraining () {
    wx.switchTab({ url: '/pages/exercise/exercise' })
  },

  /* ---------------- 保存 ---------------- */

  save () {
    const store = appStore.getStore()
    const profile = store.getProfile()
    const preview = this.data.preview
    const draft = this.data.draft

    if (!profile) {
      wx.showToast({ title: '请先填写身体资料', icon: 'none' })
      return
    }
    if (!preview || !preview.ok) {
      wx.showToast({ title: this.data.message || '计划无法保存', icon: 'none' })
      return
    }
    if (draft.mode === 'calorie' && this.data.conflict) {
      wx.showModal({ title: '系数热量冲突', content: this.data.conflict.type === 'coefficient-exceeds-target' ? '蛋白与脂肪按系数计算的热量已超过目标热量，请调高目标热量或下调系数。' : '当前设置无法求解。', showCancel: false })
      return
    }

    const res = store.saveNutritionPlan(Object.assign({}, draft, { weightKg: profile.weightKg }))
    if (!res.ok) {
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    const snap = metrics.refreshTodaySnapshot(store, { today: fmt.today(), source: 'plan-page' })
    this.load()

    wx.showModal({
      title: '计划已保存',
      content: snap.ok === false
        ? '计划已保存，但今日目标快照刷新失败：' + (snap.errors || []).join('；')
        : `今日目标已按新计划更新：${preview.target.value} kcal / 碳${preview.active.grams.carb}g 蛋${preview.active.grams.protein}g 脂${preview.active.grams.fat}g。历史快照保持不变。`,
      showCancel: false
    })
  },

  resetDraft () {
    this.load()
    wx.showToast({ title: '已恢复为已保存的计划', icon: 'none' })
  }
})
