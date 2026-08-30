Page({
  data: {
    userRole: '',
    tasks: [],
    showCreateForm: false,
    // 创建任务表单
    newTask: {
      title: '',
      description: '',
      type: 'once', // once | cycle | habit
      points: 10,
      // 单次任务无额外参数
      // 周期任务
      cycleMode: 'daily', // daily | period
      cycleDays: 1,
      periodStart: '',
      periodEnd: '',
      cycleCount: 1,
      // 习惯养成
      habitDays: 7
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const role = wx.getStorageSync('userRole') || 'main'
      if (role === 'partner') {
        this.getTabBar().setData({ selected: 1 })
      }
    }
    this.setData({ userRole: wx.getStorageSync('userRole') || 'main' })
    this.loadTasks()
  },

  async loadTasks() {
    const { userRole } = this.data
    if (userRole !== 'partner') {
      // 主角加载自己的任务
      try {
        const res = await wx.cloud.callFunction({
          name: 'getUserData',
          data: { type: 'getMyTasks' }
        })
        if (res.result) {
          this.setData({ tasks: res.result.tasks || [] })
        }
      } catch (e) {
        console.error('加载任务失败', e)
      }
    } else {
      // 伴侣加载自己发布的任务
      try {
        const res = await wx.cloud.callFunction({
          name: 'getUserData',
          data: { type: 'getCreatedTasks' }
        })
        if (res.result) {
          this.setData({ tasks: res.result.tasks || [] })
        }
      } catch (e) {
        console.error('加载任务失败', e)
      }
    }
  },

  // ===== 伴侣：发布任务 =====
  toggleCreateForm() {
    this.setData({ showCreateForm: !this.data.showCreateForm })
  },

  inputTitle(e) {
    this.setData({ 'newTask.title': e.detail.value })
  },

  inputDesc(e) {
    this.setData({ 'newTask.description': e.detail.value })
  },

  selectType(e) {
    this.setData({ 'newTask.type': e.currentTarget.dataset.type })
  },

  inputPoints(e) {
    this.setData({ 'newTask.points': parseInt(e.detail.value) || 0 })
  },

  selectCycleMode(e) {
    this.setData({ 'newTask.cycleMode': e.currentTarget.dataset.mode })
  },

  inputCycleDays(e) {
    this.setData({ 'newTask.cycleDays': parseInt(e.detail.value) || 1 })
  },

  inputCycleCount(e) {
    this.setData({ 'newTask.cycleCount': parseInt(e.detail.value) || 1 })
  },

  bindPeriodStart(e) {
    this.setData({ 'newTask.periodStart': e.detail.value })
  },

  bindPeriodEnd(e) {
    this.setData({ 'newTask.periodEnd': e.detail.value })
  },

  inputHabitDays(e) {
    this.setData({ 'newTask.habitDays': parseInt(e.detail.value) || 7 })
  },

  async createTask() {
    const { newTask, userRole } = this.data
    if (!newTask.title.trim()) {
      wx.showToast({ title: '请输入任务名称', icon: 'none' })
      return
    }
    if (newTask.points < 1) {
      wx.showToast({ title: '积分至少为1', icon: 'none' })
      return
    }

    wx.showLoading({ title: '发布中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateData',
        data: { type: 'createTask', task: { ...newTask, title: newTask.title.trim(), description: newTask.description.trim() } }
      })
      wx.hideLoading()
      if (res.result && res.result.success) {
        this.setData({
          showCreateForm: false,
          newTask: { title: '', description: '', type: 'once', points: 10, cycleMode: 'daily', cycleDays: 1, periodStart: '', periodEnd: '', cycleCount: 1, habitDays: 7 }
        })
        wx.showToast({ title: '已发布', icon: 'success' })
        this.loadTasks()
      } else {
        wx.showToast({ title: res.result?.error || '发布失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '发布失败', icon: 'none' })
    }
  },

  // ===== 伴侣：删除任务 =====
  deleteTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      success: async (res) => {
        if (res.confirm) {
          await wx.cloud.callFunction({ name: 'updateData', data: { type: 'deleteTask', taskId: id } })
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadTasks()
        }
      }
    })
  },

  // ===== 主角：接受任务 =====
  async acceptTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showLoading({ title: '处理中...' })
    try {
      await wx.cloud.callFunction({ name: 'updateData', data: { type: 'acceptTask', taskId: id } })
      wx.hideLoading()
      wx.showToast({ title: '已接受', icon: 'success' })
      this.loadTasks()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  // ===== 主角：拒绝任务 =====
  async rejectTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '拒绝任务',
      content: '确定拒绝此任务吗？',
      success: async (res) => {
        if (res.confirm) {
          await wx.cloud.callFunction({ name: 'updateData', data: { type: 'rejectTask', taskId: id } })
          wx.showToast({ title: '已拒绝', icon: 'none' })
          this.loadTasks()
        }
      }
    })
  },

  // ===== 主角：完成打卡 =====
  async completeTask(e) {
    const id = e.currentTarget.dataset.id
    wx.showLoading({ title: '打卡中...' })
    try {
      const res = await wx.cloud.callFunction({ name: 'updateData', data: { type: 'completeTask', taskId: id } })
      wx.hideLoading()
      if (res.result && res.result.success) {
        wx.showToast({ title: '打卡成功 +' + (res.result.points || 0) + '分', icon: 'success' })
      } else {
        wx.showToast({ title: res.result?.error || '打卡失败', icon: 'none' })
      }
      this.loadTasks()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '打卡失败', icon: 'none' })
    }
  }
})