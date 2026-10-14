const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const planMod = require('../../utils/plan.js')

Page({
  data: {
    loading: true,
    ready: false,
    planReady: false,
    planMessage: '',

    dateLabel: '',
    weekdayLabel: '',
    greeting: '',

    targets: null,
    intake: null,
    remainingKcal: null,
    overBudget: false,
    caloriePercent: 0,
    targetSource: 'none',

    macroRows: [],
    training: { minutes: 0, kcal: 0, entries: 0 },
    weight: null,

    goalLabel: '',
    modeLabel: ''
  },

  onLoad () {
    const today = fmt.today()
    this.setData({
      dateLabel: fmt.humanDate(today),
      weekdayLabel: fmt.weekday(today),
      greeting: this.buildGreeting()
    })
  },

  onShow () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.refresh()
  },

  onPullDownRefresh () {
    this.refresh()
    wx.stopPullDownRefresh()
  },

  buildGreeting () {
    const h = new Date().getHours()
    if (h < 6) return '凌晨好'
    if (h < 11) return '早上好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    return '晚上好'
  },

  refresh () {
    const store = appStore.getStore()
    const today = fmt.today()
    const profile = store.getProfile()

    if (!profile) {
      this.setData({ loading: false, ready: false, planReady: false })
      return
    }

    // 今天还没有目标快照时冻结一份，保证后续历史可追溯
    const frozen = metrics.freezeToday(store, { today, source: 'auto' })
    const built = metrics.computeCurrentPlan(store)
    const day = metrics.getDaySummary(store, today, { today })

    const planReady = !!(built.ok && day.targets)
    const planMessage = planReady
      ? ''
      : (built.errors && built.errors.length ? built.errors[0] : '计划尚未就绪，请先补全资料与营养计划')

    this.setData({
      loading: false,
      ready: true,
      planReady,
      planMessage,
      targets: day.targets,
      intake: day.intake,
      remainingKcal: day.remainingKcal,
      overBudget: day.remainingKcal !== null && day.remainingKcal < 0,
      caloriePercent: day.targets && day.targets.kcal
        ? fmt.clamp(Math.round((day.intake.kcal / day.targets.kcal) * 100), 0, 100)
        : 0,
      targetSource: day.targetSource,
      macroRows: day.macroRows,
      training: day.training,
      weight: day.weight,
      goalLabel: built.ok ? built.labels.goal : '',
      modeLabel: built.ok ? built.labels.mode : '',
      frozen: frozen.frozen
    })
  },

  goFood () {
    wx.switchTab({ url: '/pages/food/food' })
  },

  goTraining () {
    wx.switchTab({ url: '/pages/exercise/exercise' })
  },

  goWeight () {
    wx.navigateTo({ url: '/pages/body/body?focus=weight' })
  },

  goBody () {
    wx.navigateTo({ url: '/pages/body/body' })
  },

  goPlan () {
    wx.navigateTo({ url: '/pages/plan/plan' })
  },

  goProgress () {
    wx.switchTab({ url: '/pages/progress/progress' })
  }
})
