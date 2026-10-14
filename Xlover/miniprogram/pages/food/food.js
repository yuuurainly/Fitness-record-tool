const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const foodLibrary = require('../../utils/foodLibrary.js')
const nutrition = require('../../utils/nutrition.js')

const MEALS = nutrition.MEAL_KEYS.map(k => ({ key: k, label: nutrition.mealLabel(k) }))
const GRAM_PRESETS = [50, 100, 150, 200]

Page({
  data: {
    date: '',
    dateLabel: '',

    targets: null,
    intake: null,
    remainingKcal: null,
    overBudget: false,
    targetSource: 'none',
    macroRows: [],

    meals: [],
    mealOptions: MEALS,
    gramPresets: GRAM_PRESETS,

    sheet: {
      open: false,
      mode: 'add',
      logId: '',
      foodId: null,
      foodName: '',
      per100: null,
      grams: '',
      meal: 'breakfast',
      preview: null,
      proportional: false,
      sourceLog: null
    },

    keyword: '',
    category: '',
    categories: [],
    results: [],
    showResults: false
  },

  onLoad () {
    const today = fmt.today()
    this.setData({
      date: today,
      dateLabel: `${fmt.humanDate(today)} · ${fmt.weekday(today)}`,
      categories: [''].concat(foodLibrary.categories())
    })
  },

  onShow () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
    this.refresh()
  },

  refresh () {
    const store = appStore.getStore()
    const date = this.data.date
    const day = metrics.getDaySummary(store, date, { today: date })
    const logs = store.getFoodLogs({ from: date, to: date })

    const meals = MEALS.map(m => {
      const items = logs
        .filter(l => l.meal === m.key)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        .map(l => ({
          id: l.id,
          name: l.foodName,
          grams: l.grams,
          kcal: l.kcal,
          protein: l.protein,
          carb: l.carb,
          fat: l.fat,
          macroMissing: l.protein === null,
          time: (l.createdAt || '').slice(11, 16),
          source: l.source
        }))
      return {
        key: m.key,
        label: m.label,
        items,
        kcal: items.reduce((n, i) => n + (i.kcal || 0), 0)
      }
    })

    this.setData({
      targets: day.targets,
      intake: day.intake,
      remainingKcal: day.remainingKcal,
      overBudget: day.remainingKcal !== null && day.remainingKcal < 0,
      targetSource: day.targetSource,
      macroRows: day.macroRows,
      meals
    })
  },

  /* ---------------- 添加 / 编辑面板 ---------------- */

  openAdd (e) {
    const meal = e.currentTarget.dataset.meal || 'breakfast'
    this.setData({
      sheet: {
        open: true,
        mode: 'add',
        logId: '',
        foodId: null,
        foodName: '',
        per100: null,
        grams: '',
        meal,
        preview: null,
        proportional: false,
        sourceLog: null
      },
      keyword: '',
      category: '',
      results: [],
      showResults: true
    })
    this.runSearch('', '')
  },

  closeSheet () {
    this.setData({ 'sheet.open': false, showResults: false })
  },

  noop () {},

  onKeyword (e) {
    const keyword = e.detail.value
    this.setData({ keyword })
    this.runSearch(keyword, this.data.category)
  },

  onCategory (e) {
    const category = e.currentTarget.dataset.category || ''
    this.setData({ category })
    this.runSearch(this.data.keyword, category)
  },

  runSearch (keyword, category) {
    const store = appStore.getStore()
    const res = foodLibrary.search({
      keyword,
      category: category || undefined,
      customFoods: store.getCustomFoods(),
      limit: 40
    })
    this.setData({ results: res.foods })
  },

  selectFood (e) {
    const food = e.currentTarget.dataset.food
    this.setData({
      'sheet.foodId': food.id,
      'sheet.foodName': food.name,
      'sheet.per100': {
        kcal: food.kcalPer100g,
        protein: food.protein,
        carb: food.carb,
        fat: food.fat,
        category: food.category,
        icon: food.icon
      },
      'sheet.sourceLog': null,
      'sheet.proportional': false,
      'sheet.grams': '',
      'sheet.preview': null,
      showResults: false
    })
  },

  onGrams (e) {
    const grams = e.detail.value
    this.setData({ 'sheet.grams': grams })
    this.updatePreview(grams)
  },

  onGramPreset (e) {
    const grams = String(e.currentTarget.dataset.grams)
    this.setData({ 'sheet.grams': grams })
    this.updatePreview(grams)
  },

  updatePreview (grams) {
    const sheet = this.data.sheet
    const g = parseFloat(grams)
    if (!g || g <= 0) {
      this.setData({ 'sheet.preview': null })
      return
    }

    let preview = null
    if (sheet.sourceLog) {
      const res = foodLibrary.scaleFromLog(sheet.sourceLog, g)
      if (res.ok) {
        preview = res
        this.setData({ 'sheet.proportional': res.method === 'proportional' })
      }
    } else {
      // 优先用内置库的原始数据；自定义食物回退到选择时快照下来的每 100g 值
      let source = null
      if (sheet.foodId !== null && sheet.foodId !== undefined) {
        source = foodLibrary.getFoodById(sheet.foodId)
      }
      if (!source && sheet.per100) {
        source = {
          id: sheet.foodId,
          name: sheet.foodName,
          kcalPer100g: sheet.per100.kcal,
          protein: sheet.per100.protein,
          carb: sheet.per100.carb,
          fat: sheet.per100.fat
        }
      }
      if (!source) {
        this.setData({ 'sheet.preview': null })
        return
      }
      const res = foodLibrary.scaleFood(source, g)
      if (res.ok) preview = res
    }

    this.setData({ 'sheet.preview': preview })
  },

  backToSearch () {
    this.setData({ showResults: true })
    this.runSearch(this.data.keyword, this.data.category)
  },

  onSheetMeal (e) {
    this.setData({ 'sheet.meal': e.detail.value })
  },

  confirmSheet () {
    const sheet = this.data.sheet
    const grams = parseFloat(sheet.grams)
    if (!sheet.foodName) {
      wx.showToast({ title: '请先选择食物', icon: 'none' })
      return
    }
    if (!grams || grams <= 0) {
      wx.showToast({ title: '请输入食物重量', icon: 'none' })
      return
    }

    const preview = sheet.preview
    const store = appStore.getStore()

    let payload
    if (preview) {
      payload = {
        date: this.data.date,
        meal: sheet.meal,
        foodName: preview.foodName || sheet.foodName,
        foodId: sheet.foodId,
        grams,
        kcalPer100g: preview.kcalPer100g,
        kcal: preview.kcal,
        protein: preview.protein,
        carb: preview.carb,
        fat: preview.fat,
        source: 'local'
      }
    } else {
      // 无每 100g 参考值时只记重量，热量留空由用户后续补
      payload = {
        date: this.data.date,
        meal: sheet.meal,
        foodName: sheet.foodName,
        foodId: sheet.foodId,
        grams,
        kcal: null,
        protein: null,
        carb: null,
        fat: null,
        source: 'local'
      }
    }
    if (sheet.mode === 'edit' && sheet.logId) payload.id = sheet.logId

    const res = store.addFoodLog(payload)
    if (!res.ok) {
      wx.showModal({ title: '保存失败', content: res.errors.join('；'), showCancel: false })
      return
    }

    // 内置库之外的食物顺手存入自定义食物，下次可直接搜到
    if (sheet.mode === 'add' && preview && preview.kcalPer100g) {
      const isBuiltin = foodLibrary.getFoodById(sheet.foodId)
      if (!isBuiltin) {
        store.addCustomFood({
          name: sheet.foodName,
          kcalPer100g: preview.kcalPer100g,
          protein: sheet.per100 ? sheet.per100.protein : null,
          carb: sheet.per100 ? sheet.per100.carb : null,
          fat: sheet.per100 ? sheet.per100.fat : null
        })
      }
    }

    this.setData({ 'sheet.open': false })
    this.refresh()
    wx.showToast({ title: '已记录', icon: 'success' })
  },

  /* ---------------- 记录操作 ---------------- */

  tapItem (e) {
    const id = e.currentTarget.dataset.id
    const store = appStore.getStore()
    const logs = store.getFoodLogs({ from: this.data.date, to: this.data.date })
    const log = logs.find(l => l.id === id)
    if (!log) return

    wx.showActionSheet({
      itemList: ['编辑重量 / 餐次', '删除这条记录'],
      success: res => {
        if (res.tapIndex === 0) this.openEdit(log)
        if (res.tapIndex === 1) this.confirmDelete(log)
      },
      fail: () => {}
    })
  },

  openEdit (log) {
    this.setData({
      sheet: {
        open: true,
        mode: 'edit',
        logId: log.id,
        foodId: log.foodId,
        foodName: log.foodName,
        per100: log.kcalPer100g === null ? null : {
          kcal: log.kcalPer100g,
          protein: null,
          carb: null,
          fat: null,
          icon: '🍽️'
        },
        grams: String(log.grams),
        meal: log.meal,
        preview: null,
        proportional: log.kcalPer100g === null,
        sourceLog: log
      },
      showResults: false
    })
    this.updatePreview(String(log.grams))
  },

  confirmDelete (log) {
    wx.showModal({
      title: '删除记录',
      content: `确定删除「${log.foodName} ${log.grams}g」吗？`,
      confirmText: '删除',
      confirmColor: '#E85D5D',
      success: res => {
        if (!res.confirm) return
        const r = appStore.getStore().removeFoodLog(log.id)
        if (!r.ok) {
          wx.showToast({ title: '删除失败', icon: 'none' })
          return
        }
        this.refresh()
        wx.showToast({ title: '已删除', icon: 'success' })
      }
    })
  }
})
