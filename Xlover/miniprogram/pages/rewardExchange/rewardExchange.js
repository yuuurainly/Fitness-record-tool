Page({
  data: {
    totalPoints: 0,
    rewards: [],
    claims: []
  },

  onShow() {
    this.loadData()
  },

  async loadData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getProfile' }
      })

      if (res.result) {
        this.setData({
          totalPoints: res.result.totalPoints || 0,
          rewards: res.result.rewards || []
        })
      }

      const claimRes = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getClaims' }
      })

      if (claimRes.result) {
        this.setData({ claims: claimRes.result.claims || [] })
      }
    } catch (err) {
      console.error('加载数据失败', err)
    }
  },

  exchangeReward(e) {
    const id = e.currentTarget.dataset.id
    const reward = this.data.rewards.find(r => r._id === id)
    
    if (!reward || reward.exchanged || !reward.canExchange) return

    wx.showModal({
      title: '确认兑换',
      content: `确定使用 ${reward.points} 积分兑换「${reward.name}」吗？`,
      success: (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '兑换中...' })
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'exchangeReward', rewardId: id }
          }).then(() => {
            wx.hideLoading()
            wx.showToast({ title: '兑换成功', icon: 'success' })
            this.loadData()
          }).catch(() => {
            wx.hideLoading()
            wx.showToast({ title: '兑换失败', icon: 'none' })
          })
        }
      }
    })
  }
})
