Page({
  data: {
    rewardName: '',
    rewardPoints: '',
    rewards: []
  },

  onShow() {
    this.loadRewards()
  },

  async loadRewards() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getRewards' }
      })
      if (res.result) {
        this.setData({ rewards: res.result.rewards || [] })
      }
    } catch (err) {
      console.error('加载奖励失败', err)
    }
  },

  inputName(e) {
    this.setData({ rewardName: e.detail.value })
  },

  inputPoints(e) {
    this.setData({ rewardPoints: e.detail.value })
  },

  addReward() {
    const { rewardName, rewardPoints } = this.data
    if (!rewardName || !rewardPoints) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    wx.showLoading({ title: '添加中...' })
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'addReward',
        name: rewardName,
        points: parseInt(rewardPoints)
      }
    }).then(() => {
      wx.hideLoading()
      this.setData({ rewardName: '', rewardPoints: '' })
      this.loadRewards()
      wx.showToast({ title: '添加成功', icon: 'success' })
    }).catch(() => {
      wx.hideLoading()
      wx.showToast({ title: '添加失败', icon: 'none' })
    })
  },

  deleteReward(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定删除这个奖励吗？',
      success: (res) => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'deleteReward', id }
          }).then(() => {
            this.loadRewards()
          })
        }
      }
    })
  }
})
