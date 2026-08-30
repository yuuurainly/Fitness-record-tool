const app = getApp()

Page({
  data: {
    userInfo: {},
    userRole: '',
    totalPoints: 0,
    totalCheckins: 0,
    streakDays: 0,
    bindCode: '',
    rewards: [],
    pushplusToken: '',
    partnerName: '',
    // 头像昵称弹窗
    showUserInfoModal: false,
    tempAvatarUrl: '',
    tempNickName: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const role = wx.getStorageSync('userRole') || 'main'
      this.getTabBar().setData({ selected: role === 'partner' ? 4 : 4 })
    }
    this.setData({ userRole: wx.getStorageSync('userRole') })
    this.loadProfileData()
  },

  async loadProfileData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getProfile' }
      })

      if (res.result) {
        this.setData({
          userInfo: res.result.userInfo || {},
          totalPoints: res.result.totalPoints || 0,
          totalCheckins: res.result.totalCheckins || 0,
          streakDays: res.result.streakDays || 0,
          bindCode: res.result.bindCode || '',
          rewards: res.result.rewards || [],
          pushplusToken: res.result.pushplusToken || '',
          partnerName: res.result.partnerName || ''
        })
      }
    } catch (err) {
      console.error('加载个人数据失败', err)
    }
  },

  goRewardSettings() {
    wx.navigateTo({ url: '/pages/rewardSettings/rewardSettings' })
  },

  exchangeReward(e) {
    const id = e.currentTarget.dataset.id
    const reward = this.data.rewards.find(r => r._id === id)
    
    if (!reward || reward.exchanged) return
    if (this.data.totalPoints < reward.points) {
      wx.showToast({ title: '积分不足', icon: 'none' })
      return
    }

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
            this.loadProfileData()
          }).catch(() => {
            wx.hideLoading()
            wx.showToast({ title: '兑换失败', icon: 'none' })
          })
        }
      }
    })
  },

  goRemind() {
    wx.navigateTo({ url: '/pages/remind/remind' })
  },

  editPushplusToken() {
    wx.showModal({
      title: 'PushPlus Token',
      content: `当前状态：${this.data.pushplusToken ? '已配置 ✓' : '未配置'}\n\n在 pushplus.hxtrip.com 关注公众号后，复制你的 Token 粘贴到这里。`,
      editable: true,
      placeholderText: '粘贴你的 PushPlus Token',
      confirmText: '保存',
      success: (res) => {
        if (res.confirm && res.content) {
          const token = res.content.trim()
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'savePushplusToken', token }
          }).then(() => {
            this.setData({ pushplusToken: token })
            wx.showToast({ title: '保存成功', icon: 'success' })
          }).catch(() => {
            wx.showToast({ title: '保存失败', icon: 'none' })
          })
        }
      }
    })
  },

  unbindPartner() {
    wx.showModal({
      title: '解除绑定',
      content: '解绑后将无法查看对方的动态和发送任务，确定要解除吗？',
      confirmColor: '#E85D5D',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '解绑中...' })
          try {
            await wx.cloud.callFunction({
              name: 'updateData',
              data: { type: 'unbindPartner' }
            })
            wx.hideLoading()
            wx.showToast({ title: '已解绑', icon: 'none' })
            setTimeout(() => {
              wx.removeStorageSync('userRole')
              wx.removeStorageSync('userInfo')
              wx.reLaunch({ url: '/pages/guide/guide' })
            }, 1000)
          } catch (e) {
            wx.hideLoading()
            wx.showToast({ title: '解绑失败', icon: 'none' })
          }
        }
      }
    })
  },

  showAbout() {
    wx.showModal({
      title: '关于 Xlover',
      content: 'Xlover 是一款专为情侣设计的健康管理小程序，帮助你和TA一起坚持健康生活。\n\n版本: 1.0.0',
      showCancel: false
    })
  },

  // ===== 头像昵称设置 =====
  onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    this.setData({
      tempAvatarUrl: avatarUrl,
      tempNickName: this.data.userInfo.nickName || '',
      showUserInfoModal: true
    })
  },

  onInputNickName(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  onNickNameBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNickName: e.detail.value })
    }
  },

  closeUserInfoModal() {
    this.setData({ showUserInfoModal: false, tempAvatarUrl: '', tempNickName: '' })
  },

  async saveUserInfo() {
    const { tempNickName, tempAvatarUrl } = this.data
    if (!tempNickName.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      let avatarUrl = tempAvatarUrl || ''
      // 临时文件上传到云存储
      if (avatarUrl && !avatarUrl.startsWith('cloud://')) {
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`,
          filePath: avatarUrl
        })
        avatarUrl = uploadRes.fileID
      }

      await wx.cloud.callFunction({
        name: 'updateData',
        data: {
          type: 'saveUserInfo',
          nickName: tempNickName.trim(),
          avatarUrl
        }
      })

      // 更新本地数据
      const userInfo = { ...this.data.userInfo, nickName: tempNickName.trim() }
      if (avatarUrl) userInfo.avatarUrl = avatarUrl
      this.setData({ userInfo, showUserInfoModal: false, tempAvatarUrl: '', tempNickName: '' })

      // 同步到 storage
      const stored = wx.getStorageSync('userInfo') || {}
      stored.nickName = tempNickName.trim()
      if (avatarUrl) stored.avatarUrl = avatarUrl
      wx.setStorageSync('userInfo', stored)

      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    }
  }
})
