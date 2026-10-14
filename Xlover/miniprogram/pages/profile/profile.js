const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')
const planMod = require('../../utils/plan.js')
const nutrition = require('../../utils/nutrition.js')
const foodLibrary = require('../../utils/foodLibrary.js')

Page({
  data: {
    hasProfile: false,
    profileLine: '',
    planLine: '',
    estimate: null,

    counts: { body: 0, food: 0, workout: 0, snapshots: 0 },
    usage: null,
    appVersion: '',
    schemaVersion: 1,
    libraryVersion: '',
    backupCount: 0
  },

  onShow () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.refresh()
  },

  refresh () {
    const store = appStore.getStore()
    const profile = store.getProfile()
    const built = metrics.computeCurrentPlan(store)

    const genderLabel = profile && profile.gender === 'male' ? '男' : (profile && profile.gender === 'female' ? '女' : '')
    const level = profile && profile.activityLevel
      ? (nutrition.getActivityLevel(profile.activityLevel) || {}).label || profile.activityLevel
      : ''

    const usage = store.estimateUsage()
    this.setData({
      hasProfile: !!profile,
      profileLine: profile
        ? [genderLabel, profile.age ? `${profile.age} 岁` : '', `${profile.heightCm} cm`, `${profile.weightKg} kg`].filter(Boolean).join(' · ')
        : '还没有填写身体资料',
      planLine: built.ok
        ? `${built.labels.goal} · ${built.labels.mode} · ${built.target.value} kcal`
        : '计划尚未就绪',
      estimate: built.ok
        ? { bmr: built.bmr.value, tdee: built.tdee.value, level }
        : null,

      counts: {
        body: store.getBodyRecords().length,
        food: store.getFoodLogs().length,
        workout: store.getWorkoutLogs().length,
        snapshots: store.listSnapshotDates().length
      },
      usage: Object.assign({}, usage, { usedKB: Math.round(usage.approxBytes / 1024 * 10) / 10 }),
      appVersion: appStore.APP_VERSION,
      schemaVersion: store.schemaVersion,
      libraryVersion: foodLibrary.libraryVersion(),
      backupCount: store.listPreImportBackups().length
    })
  },

  goBody () {
    wx.navigateTo({ url: '/pages/body/body' })
  },

  goPlan () {
    wx.navigateTo({ url: '/pages/plan/plan' })
  },

  goTraining () {
    wx.switchTab({ url: '/pages/exercise/exercise' })
  },

  goProgress () {
    wx.switchTab({ url: '/pages/progress/progress' })
  },

  goData () {
    wx.navigateTo({ url: '/pages/data/data' })
  },

  goDiagnostics () {
    wx.navigateTo({ url: '/pages/diagnostics/diagnostics' })
  },

  showAbout () {
    wx.showModal({
      title: '关于',
      content: `Xlover 个人健身工具\n版本 ${this.data.appVersion}\n数据格式 v${this.data.schemaVersion}\n食物库 ${this.data.libraryVersion}\n\n所有记录保存在本机，未启用云端同步。请定期在「数据管理」导出备份。`,
      showCancel: false
    })
  }
})
