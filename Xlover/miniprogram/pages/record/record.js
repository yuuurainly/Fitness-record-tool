const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    userRole: '',
    todayCalories: 0,
    todayExercise: 0,
    latestWeight: '',
    todayRecords: []
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const role = wx.getStorageSync('userRole') || 'main'
      if (role !== 'partner') {
        this.getTabBar().setData({ selected: 1 })
      }
    }
    this.setData({ userRole: wx.getStorageSync('userRole') })
    this.loadTodayRecords()
  },

  async loadTodayRecords() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getTodayRecords' }
      })

      if (res.result) {
        this.setData({
          todayCalories: res.result.todayCalories || 0,
          todayExercise: res.result.todayExercise || 0,
          latestWeight: res.result.latestWeight || '',
          todayRecords: res.result.records || []
        })
      }
    } catch (err) {
      console.error('加载记录失败', err)
    }
  },

  goFood() {
    // 饮食与训练现在都是 tab 页，必须用 switchTab
    wx.switchTab({ url: '/pages/food/food' })
  },

  goExercise() {
    wx.switchTab({ url: '/pages/exercise/exercise' })
  },

  goWeight() {
    wx.navigateTo({ url: '/pages/weight/weight' })
  }
})
