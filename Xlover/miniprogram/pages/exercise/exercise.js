const app = getApp()
const util = require('../../utils/util.js')

const DEFAULT_TYPES = [
  { type: 'running', name: '跑步', icon: '🏃', met: 9.8 },
  { type: 'walking', name: '步行', icon: '🚶', met: 3.8 },
  { type: 'cycling', name: '骑行', icon: '🚴', met: 7.5 },
  { type: 'swimming', name: '游泳', icon: '🏊', met: 8.0 },
  { type: 'yoga', name: '瑜伽', icon: '🧘', met: 2.5 },
  { type: 'fitness', name: '健身', icon: '💪', met: 6.0 },
  { type: 'rope', name: '跳绳', icon: '↕️', met: 10.0 },
  { type: 'hiking', name: '登山', icon: '🥾', met: 6.5 }
]

Page({
  data: {
    todayDuration: 0,
    todayCalories: 0,
    werunStep: 0,
    werunCalories: 0,
    totalCalories: 0,
    exerciseTypes: [],
    selectedType: '',
    duration: '',
    estimatedCalories: 0,
    todayExercises: [],
    userWeight: 50,
    showAddType: false,
    customTypeName: '',
    customTypeMet: '',
    expandTypes: false,
    showPointModal: false,
    pointExerciseId: '',
    pointExerciseName: '',
    pointValue: ''
  },

  onShow() {
    this.loadCustomTypes()
    this.loadExercises()
    this.loadUserWeight()
    this.autoSyncWeRun()
  },

  loadCustomTypes() {
    const custom = wx.getStorageSync('customExerciseTypes') || []
    const merged = [...DEFAULT_TYPES, ...custom]
    this.setData({ exerciseTypes: merged })
  },

  async loadExercises() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getExercises' }
      })

      if (res.result) {
        const exercises = res.result.exercises || []
        const duration = exercises.reduce((sum, item) => sum + (item.duration || 0), 0)
        const calories = exercises.reduce((sum, item) => sum + (item.calories || 0), 0)
        const werunStep = wx.getStorageSync('todayWeRunSteps') || 0
        const werunCalories = Math.round(werunStep * 0.04)
        this.setData({
          todayDuration: duration,
          todayCalories: calories,
          werunStep,
          werunCalories,
          totalCalories: calories + werunCalories,
          todayExercises: exercises
        })
      }
    } catch (err) {
      console.error('加载运动记录失败', err)
    }
  },

  async loadUserWeight() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getLatestWeight' }
      })
      if (res.result && res.result.weight) {
        this.setData({ userWeight: res.result.weight })
      }
    } catch (err) {
      console.error('加载体重失败', err)
    }
  },

  autoSyncWeRun() {
    const today = util.getToday()
    const lastSync = wx.getStorageSync('lastWeRunSyncDate')
    if (lastSync === today) {
      const steps = wx.getStorageSync('todayWeRunSteps') || 0
      this.setData({ werunStep: steps, werunCalories: Math.round(steps * 0.04) })
      this.updateTotalCalories()
      return
    }

    wx.getWeRunData({
      success: (res) => {
        wx.cloud.callFunction({
          name: 'updateData',
          data: {
            type: 'syncWeRun',
            encryptedData: res.encryptedData,
            iv: res.iv
          }
        }).then(res2 => {
          const steps = res2.result?.steps || 0
          wx.setStorageSync('todayWeRunSteps', steps)
          wx.setStorageSync('lastWeRunSyncDate', today)
          this.setData({
            werunStep: steps,
            werunCalories: Math.round(steps * 0.04)
          })
          this.updateTotalCalories()
        }).catch(() => {
          console.log('步数同步失败')
        })
      },
      fail: () => {
        console.log('未授权微信运动')
      }
    })
  },

  updateTotalCalories() {
    this.setData({
      totalCalories: this.data.todayCalories + this.data.werunCalories
    })
  },

  selectType(e) {
    const type = e.currentTarget.dataset.type
    this.setData({ selectedType: type })
    this.calculateCalories()
  },

  inputDuration(e) {
    const duration = e.detail.value
    this.setData({ duration })
    this.calculateCalories()
  },

  calculateCalories() {
    const { selectedType, duration, userWeight, exerciseTypes } = this.data
    if (selectedType && duration) {
      const typeInfo = exerciseTypes.find(t => t.type === selectedType)
      const met = typeInfo?.met || 4.0
      const calories = Math.round(met * userWeight * (parseFloat(duration) / 60))
      this.setData({ estimatedCalories: calories })
    }
  },

  addExercise() {
    const { selectedType, duration, estimatedCalories, exerciseTypes } = this.data
    if (!selectedType || !duration) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    const typeInfo = exerciseTypes.find(t => t.type === selectedType)

    wx.showLoading({ title: '添加中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'addExercise',
        exerciseType: selectedType,
        typeName: typeInfo.name,
        icon: typeInfo.icon,
        duration: parseFloat(duration),
        calories: estimatedCalories
      }
    }).then(() => {
      wx.hideLoading()
      this.setData({
        selectedType: '',
        duration: '',
        estimatedCalories: 0
      })
      this.loadExercises()
      wx.showToast({ title: '添加成功', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  toggleTypes() {
    this.setData({ expandTypes: !this.data.expandTypes })
  },

  showAddTypeModal() {
    this.setData({ showAddType: true, customTypeName: '', customTypeMet: '' })
  },

  closeAddTypeModal() {
    this.setData({ showAddType: false })
  },

  inputCustomTypeName(e) {
    this.setData({ customTypeName: e.detail.value })
  },

  inputCustomTypeMet(e) {
    this.setData({ customTypeMet: e.detail.value })
  },

  saveCustomType() {
    const { customTypeName, customTypeMet } = this.data
    if (!customTypeName || !customTypeMet) {
      wx.showToast({ title: '请填写完整', icon: 'none' })
      return
    }
    const met = parseFloat(customTypeMet)
    if (isNaN(met) || met <= 0) {
      wx.showToast({ title: 'MET值无效', icon: 'none' })
      return
    }
    const custom = wx.getStorageSync('customExerciseTypes') || []
    const newType = {
      type: 'custom_' + Date.now(),
      name: customTypeName,
      icon: '⭐',
      met
    }
    custom.push(newType)
    wx.setStorageSync('customExerciseTypes', custom)
    this.loadCustomTypes()
    this.setData({ showAddType: false })
    wx.showToast({ title: '添加成功', icon: 'success' })
  },

  deleteCustomType(e) {
    const type = e.currentTarget.dataset.type
    if (!type.startsWith('custom_')) {
      wx.showToast({ title: '默认类型不可删除', icon: 'none' })
      return
    }
    let custom = wx.getStorageSync('customExerciseTypes') || []
    custom = custom.filter(t => t.type !== type)
    wx.setStorageSync('customExerciseTypes', custom)
    this.loadCustomTypes()
    if (this.data.selectedType === type) {
      this.setData({ selectedType: '', estimatedCalories: 0 })
    }
  },

  deleteExercise(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定删除这条记录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'deleteExercise', id }
          }).then(() => {
            this.loadExercises()
          })
        }
      }
    })
  },

  // 打开积分申请弹窗
  openPointModal(e) {
    const id = e.currentTarget.dataset.id
    const name = e.currentTarget.dataset.name
    this.setData({
      showPointModal: true,
      pointExerciseId: id,
      pointExerciseName: name,
      pointValue: ''
    })
  },

  closePointModal() {
    this.setData({ showPointModal: false })
  },

  inputPointValue(e) {
    this.setData({ pointValue: e.detail.value })
  },

  submitPointRequest() {
    const { pointExerciseId, pointExerciseName, pointValue } = this.data
    const points = parseInt(pointValue)
    if (!points || points <= 0) {
      wx.showToast({ title: '请输入有效积分值', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中...' })
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'requestExercisePoints',
        exerciseId: pointExerciseId,
        exerciseName: pointExerciseName,
        points: points
      }
    }).then(() => {
      wx.hideLoading()
      this.setData({ showPointModal: false })
      wx.showToast({ title: '申请已提交', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: err.result?.error || '申请失败', icon: 'none' })
    })
  }
})
