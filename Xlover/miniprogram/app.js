App({
  globalData: {
    userInfo: null,
    userRole: null,
    partnerInfo: null,
    openid: null,
    envId: 'cloud1-d8gud2iy7f1660667'
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
      return
    }

    wx.cloud.init({
      env: this.globalData.envId,
      traceUser: true
    })

    this.checkLoginStatus()
    this.initFoodLibrary()
  },

  initFoodLibrary() {
    const initialized = wx.getStorageSync('foodLibraryInitialized')
    if (initialized) return

    wx.cloud.callFunction({
      name: 'initFoodLibrary'
    }).then(res => {
      if (res.result && !res.result.error) {
        wx.setStorageSync('foodLibraryInitialized', true)
        console.log('食物库初始化成功')
      }
    }).catch(err => {
      console.error('食物库初始化失败', err)
    })
  },

  checkLoginStatus() {
    const openid = wx.getStorageSync('openid')
    const userRole = wx.getStorageSync('userRole')
    
    if (openid && userRole) {
      this.globalData.openid = openid
      this.globalData.userRole = userRole
      this.getUserInfo()
    }
  },

  getUserInfo() {
    wx.cloud.callFunction({
      name: 'getUserData',
      data: { type: 'getUserInfo' }
    }).then(res => {
      if (res.result && res.result.data) {
        this.globalData.userInfo = res.result.data
        this.globalData.userRole = res.result.data.role
        wx.setStorageSync('userRole', res.result.data.role)
      }
    }).catch(err => {
      console.error('获取用户信息失败', err)
    })
  },

  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: (res) => {
          if (res.code) {
            wx.cloud.callFunction({
              name: 'login',
              data: { code: res.code }
            }).then(result => {
              if (result.result && result.result.openid) {
                this.globalData.openid = result.result.openid
                wx.setStorageSync('openid', result.result.openid)
                
                if (result.result.userInfo) {
                  this.globalData.userInfo = result.result.userInfo
                  this.globalData.userRole = result.result.userInfo.role
                  wx.setStorageSync('userRole', result.result.userInfo.role)
                }
                
                resolve(result.result)
              } else {
                reject(new Error('登录失败'))
              }
            }).catch(reject)
          } else {
            reject(new Error('微信登录失败'))
          }
        },
        fail: reject
      })
    })
  }
})
