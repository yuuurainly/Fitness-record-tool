const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    currentStep: 0,
    selectedRole: '',
    tempAvatarUrl: '',
    tempNickName: '',
    profile: {
      height: '',
      currentWeight: '',
      targetWeight: '',
      targetDate: '',
      age: ''
    },
    bindCode: '',
    today: util.getToday(),
    isProfileValid: false
  },

  onLoad() {
    const openid = wx.getStorageSync('openid')
    if (openid) {
      this.checkUserStatus()
    }
  },

  checkUserStatus() {
    wx.cloud.callFunction({
      name: 'getUserData',
      data: { type: 'getUserInfo' }
    }).then(res => {
      if (res.result && res.result.data) {
        const user = res.result.data
        // 主角：需要 profile 才算完成引导
        // 伴侣：有 role 且已绑定 partnerId 就算完成引导，或者有 role 也可以直接进
        if (user.role === 'main') {
          // 主角还需要检查 profile
          wx.cloud.callFunction({
            name: 'getUserData',
            data: { type: 'checkStatus' }
          }).then(res2 => {
            if (res2.result && res2.result.hasProfile) {
              wx.switchTab({ url: '/pages/index/index' })
            }
          })
        } else if (user.role === 'partner') {
          // 伴侣有 role 就直接进首页
          wx.switchTab({ url: '/pages/index/index' })
        }
      }
    })
  },

  handleLogin() {
    wx.showLoading({ title: '登录中...' })
    
    app.login().then(result => {
      wx.hideLoading()
      if (result.isNewUser) {
        this.setData({ currentStep: 1 })
      } else if (result.userInfo.role === 'main' && result.hasProfile) {
        wx.switchTab({ url: '/pages/index/index' })
      } else if (result.userInfo.role === 'partner') {
        // 伴侣有 role 直接进
        wx.switchTab({ url: '/pages/index/index' })
      } else {
        this.setData({ 
          currentStep: 1,
          selectedRole: result.userInfo.role 
        })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '登录失败', icon: 'none' })
      console.error(err)
    })
  },

  selectRole(e) {
    this.setData({ selectedRole: e.currentTarget.dataset.role })
  },

  confirmRole() {
    const { selectedRole } = this.data
    if (!selectedRole) return

    wx.showLoading({ title: '保存中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'setRole',
        role: selectedRole
      }
    }).then(() => {
      wx.hideLoading()
      app.globalData.userRole = selectedRole
      wx.setStorageSync('userRole', selectedRole)
      this.setData({ currentStep: 2 })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '设置失败', icon: 'none' })
    })
  },

  // ===== 头像昵称收集 =====
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl })
  },

  onInputNickName(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  onNickNameBlur(e) {
    // type="nickname" 在失焦时可能返回微信昵称，确保捕获
    if (e.detail.value) {
      this.setData({ tempNickName: e.detail.value })
    }
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

      // 更新全局和本地缓存
      const userInfo = wx.getStorageSync('userInfo') || {}
      userInfo.nickName = tempNickName.trim()
      if (avatarUrl) userInfo.avatarUrl = avatarUrl
      wx.setStorageSync('userInfo', userInfo)
      app.globalData.userInfo = { ...app.globalData.userInfo, nickName: tempNickName.trim(), avatarUrl: avatarUrl || '' }
      this.setData({ currentStep: 3 })
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  inputHeight(e) {
    this.setData({ 'profile.height': e.detail.value })
    this.checkProfileValid()
  },

  inputWeight(e) {
    this.setData({ 'profile.currentWeight': e.detail.value })
    this.checkProfileValid()
  },

  inputTargetWeight(e) {
    this.setData({ 'profile.targetWeight': e.detail.value })
    this.checkProfileValid()
  },

  bindDateChange(e) {
    this.setData({ 'profile.targetDate': e.detail.value })
    this.checkProfileValid()
  },

  inputAge(e) {
    this.setData({ 'profile.age': e.detail.value })
    this.checkProfileValid()
  },

  checkProfileValid() {
    const { profile } = this.data
    const valid = !!(profile.height && profile.currentWeight && profile.targetWeight && profile.targetDate)
    this.setData({ isProfileValid: valid })
  },

  inputBindCode(e) {
    this.setData({ bindCode: e.detail.value })
  },

  saveProfile() {
    const { profile } = this.data
    if (!profile.height || !profile.currentWeight || !profile.targetWeight || !profile.targetDate) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'createProfile',
        profile: {
          ...profile,
          bmi: util.calculateBMI(profile.currentWeight, profile.height)
        }
      }
    }).then(() => {
      wx.hideLoading()
      wx.switchTab({ url: '/pages/index/index' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '保存失败', icon: 'none' })
    })
  },

  bindPartner() {
    const { bindCode } = this.data
    if (!bindCode || bindCode.length !== 6) {
      wx.showToast({ title: '请输入6位绑定码', icon: 'none' })
      return
    }

    wx.showLoading({ title: '绑定中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'bindPartner',
        bindCode
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.success) {
        wx.showToast({ title: '绑定成功', icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1500)
      } else {
        wx.showToast({ title: res.result.message || '绑定失败', icon: 'none' })
      }
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '绑定失败', icon: 'none' })
    })
  }
})
