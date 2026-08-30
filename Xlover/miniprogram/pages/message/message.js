Page({
  data: {
    messages: [],
    inputContent: '',
    userRole: '',
    pointRequests: [],
    pendingCount: 0
  },

  onShow() {
    const userRole = wx.getStorageSync('userRole') || 'main'
    this.setData({ userRole })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.loadMessages()
    this.loadPointRequests()
  },

  async loadMessages() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getMessages' }
      })
      if (res.result) {
        this.setData({ messages: res.result.messages || [] })
      }
    } catch (err) {
      console.error('加载留言失败', err)
    }
  },

  async loadPointRequests() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getPointRequests' }
      })
      if (res.result) {
        this.setData({
          pointRequests: res.result.requests || [],
          pendingCount: res.result.pendingCount || 0
        })
      }
    } catch (err) {
      console.error('加载积分申请失败', err)
    }
  },

  inputContent(e) {
    this.setData({ inputContent: e.detail.value })
  },

  sendMessage() {
    const { inputContent } = this.data
    if (!inputContent.trim()) return

    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'sendMessage',
        content: inputContent.trim()
      }
    }).then(() => {
      this.setData({ inputContent: '' })
      this.loadMessages()
    })
  },

  // 伴侣：批准积分申请
  approveRequest(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认通过',
      content: '确定通过该积分申请？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'approvePointRequest', requestId: id }
          }).then(() => {
            wx.showToast({ title: '已通过', icon: 'success' })
            this.loadPointRequests()
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' })
          })
        }
      }
    })
  },

  // 伴侣：拒绝积分申请
  rejectRequest(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认拒绝',
      content: '确定拒绝该积分申请？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'rejectPointRequest', requestId: id }
          }).then(() => {
            wx.showToast({ title: '已拒绝', icon: 'success' })
            this.loadPointRequests()
          }).catch(() => {
            wx.showToast({ title: '操作失败', icon: 'none' })
          })
        }
      }
    })
  }
})
