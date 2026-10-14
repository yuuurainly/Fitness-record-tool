const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const nutrition = require('../../utils/nutrition.js')

const GENDER_OPTIONS = [
  { value: 'male', label: '男' },
  { value: 'female', label: '女' }
]

Page({
  data: {
    focusWeight: false,
    genderOptions: GENDER_OPTIONS,
    activityLevels: [],
    activityIndex: 0,

    form: {
      gender: '',
      age: '',
      heightCm: '',
      weightKg: '',
      bodyFatPercent: '',
      waistCm: '',
      targetWeightKg: '',
      targetDate: '',
      activityLevel: ''
    },

    errors: [],
    warnings: [],
    saved: false,

    // 体重录入
    weightInput: '',
    bodyFatInput: '',
    weightHistory: [],

    // 估算值展示
    estimate: null,
    planImpact: []
  },

  onLoad (query) {
    const levels = nutrition.listActivityLevels()
    this.setData({
      activityLevels: levels,
      focusWeight: query && query.focus === 'weight'
    })
    this.load()
  },

  onShow () {
    this.load()
  },

  load () {
    const store = appStore.getStore()
    const profile = store.getProfile()
    const levels = this.data.activityLevels
    let activityIndex = levels.findIndex(l => l.id === (profile && profile.activityLevel))
    if (activityIndex < 0) activityIndex = 0

    this.setData({
      form: {
        gender: profile && profile.gender ? profile.gender : '',
        age: profile && profile.age ? String(profile.age) : '',
        heightCm: profile && profile.heightCm ? String(profile.heightCm) : '',
        weightKg: profile && profile.weightKg ? String(profile.weightKg) : '',
        bodyFatPercent: profile && profile.bodyFatPercent ? String(profile.bodyFatPercent) : '',
        waistCm: profile && profile.waistCm ? String(profile.waistCm) : '',
        targetWeightKg: profile && profile.targetWeightKg ? String(profile.targetWeightKg) : '',
        targetDate: (profile && profile.targetDate) || '',
        activityLevel: (profile && profile.activityLevel) || levels[0].id
      },
      activityIndex,
      weightHistory: store.getBodyRecords().slice().reverse().slice(0, 12).map(r => ({
        date: r.date,
        label: fmt.relativeDay(r.date),
        weightKg: r.weightKg,
        bmi: r.bmi,
        bodyFatPercent: r.bodyFatPercent
      })),
      saved: !!profile
    })
    this.recompute(false)
  },

  /* ---------------- 表单 ---------------- */

  onGender (e) {
    this.setData({ 'form.gender': e.detail.value })
    this.recompute()
  },

  onInput (e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [`form.${key}`]: e.detail.value })
    this.recompute()
  },

  onActivity (e) {
    const index = Number(e.detail.value)
    this.setData({
      activityIndex: index,
      'form.activityLevel': this.data.activityLevels[index].id
    })
    this.recompute()
  },

  onTargetDate (e) {
    this.setData({ 'form.targetDate': e.detail.value })
    this.recompute()
  },

  /** 实时估算 + 影响提示（不写库） */
  recompute (validate) {
    const form = this.data.form
    const errors = []
    const warnings = []
    const impact = []

    if (validate) {
      const check = nutrition.validateProfile({
        heightCm: form.heightCm,
        weightKg: form.weightKg,
        age: form.age,
        gender: form.gender,
        activityLevel: form.activityLevel,
        bodyFatPercent: form.bodyFatPercent,
        targetWeightKg: form.targetWeightKg
      }, { requireActivity: true })
      errors.push(...check.errors)
      warnings.push(...check.warnings)
    }

    const profile = appStore.getStore().getProfile()
    let estimate = null

    if (form.gender && form.heightCm && form.weightKg && form.age && form.activityLevel) {
      const bmr = nutrition.calculateBMR({
        weightKg: form.weightKg,
        heightCm: form.heightCm,
        age: form.age,
        gender: form.gender
      })
      const tdee = bmr.ok
        ? nutrition.calculateTDEE({ bmr: bmr.value, gender: form.gender, activityLevel: form.activityLevel })
        : { ok: false }

      if (bmr.ok && tdee.ok) {
        const bmi = nutrition.calculateBMI({ weightKg: form.weightKg, heightCm: form.heightCm })
        estimate = {
          bmr: bmr.value,
          tdee: tdee.value,
          bmi: bmi.ok ? bmi.value : null,
          bmiLabel: bmi.ok ? this.bmiLabel(bmi.value) : ''
        }
      }
    }

    // 影响提示：与已保存资料对比
    if (profile) {
      const pairs = [
        ['性别', profile.gender, form.gender],
        ['年龄', profile.age, form.age],
        ['身高', profile.heightCm, form.heightCm],
        ['体重', profile.weightKg, form.weightKg],
        ['活动水平', profile.activityLevel, form.activityLevel]
      ]
      pairs.forEach(([label, before, after]) => {
        if (String(before || '') !== String(after || '')) {
          impact.push(`${label}：${profile.gender ? (before || '未填') : '未填'} → ${after || '未填'}`)
        }
      })
    }

    this.setData({ estimate, errors, warnings, planImpact: impact })
  },

  bmiLabel (bmi) {
    if (bmi < 18.5) return '偏瘦'
    if (bmi < 24) return '正常'
    if (bmi < 28) return '偏胖'
    return '肥胖'
  },

  /* ---------------- 保存 ---------------- */

  save () {
    this.recompute(true)
    if (this.data.errors.length) {
      wx.showToast({ title: '请检查填写内容', icon: 'none' })
      return
    }

    const store = appStore.getStore()
    const form = this.data.form
    const before = store.getProfile()

    const patch = {
      gender: form.gender,
      age: Number(form.age),
      heightCm: Number(form.heightCm),
      weightKg: Number(form.weightKg),
      activityLevel: form.activityLevel,
      bodyFatPercent: form.bodyFatPercent === '' ? null : Number(form.bodyFatPercent),
      waistCm: form.waistCm === '' ? null : Number(form.waistCm),
      targetWeightKg: form.targetWeightKg === '' ? null : Number(form.targetWeightKg),
      targetDate: form.targetDate || null
    }
    // 目标减脂/增肌在营养计划页设置，这里不覆盖、也不清空
    if (before && before.goalType) patch.goalType = before.goalType

    const res = store.saveProfile(patch)
    if (!res.ok) {
      this.setData({ errors: res.errors, warnings: res.warnings || [] })
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    // 体重变化同步写一条体重记录，历史体重曲线才不会断
    if (!before || Number(before.weightKg) !== Number(form.weightKg)) {
      store.addBodyRecord({
        date: fmt.today(),
        weightKg: Number(form.weightKg),
        bodyFatPercent: form.bodyFatPercent === '' ? null : Number(form.bodyFatPercent),
        source: 'local'
      })
    }

    // 资料变了，今天的目标快照按新资料重算；历史日期保持不动
    metrics.refreshTodaySnapshot(store, { today: fmt.today(), source: 'body-page' })

    const impact = this.data.planImpact
    this.load()
    wx.showModal({
      title: '已保存',
      content: impact.length
        ? `以下改动会影响今日的目标计算，历史记录不受影响：\n${impact.join('\n')}`
        : '身体资料已更新。',
      showCancel: false
    })
  },

  /* ---------------- 体重记录 ---------------- */

  onWeightInput (e) {
    this.setData({ weightInput: e.detail.value })
  },

  onBodyFatInput (e) {
    this.setData({ bodyFatInput: e.detail.value })
  },

  saveWeight () {
    const weight = parseFloat(this.data.weightInput)
    if (!weight || weight <= 0) {
      wx.showToast({ title: '请输入体重', icon: 'none' })
      return
    }

    const store = appStore.getStore()
    const res = store.addBodyRecord({
      date: fmt.today(),
      weightKg: weight,
      bodyFatPercent: this.data.bodyFatInput === '' ? null : Number(this.data.bodyFatInput),
      source: 'local'
    })

    if (!res.ok) {
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    this.setData({ weightInput: '', bodyFatInput: '' })
    this.load()
    wx.showToast({ title: '已记录', icon: 'success' })
  }
})
