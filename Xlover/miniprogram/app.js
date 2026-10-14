/**
 * 本地优先版本的启动入口。
 *
 * 说明：旧版的情侣 / 云开发功能（任务、消息、提醒、奖励、云端食物库）
 * 已不在主导航中，当前版本所有数据都存在本机，不需要云开发。
 * 为避免每次冷启动都发起注定失败的云调用（控制台报错 + 无谓请求），
 * 这里把旧版云初始化收拢到开关后面；代码本身保留，需要时打开即可。
 */
const ENABLE_LEGACY_CLOUD = false

App({
  globalData: {
    userInfo: null,
    userRole: null,
    partnerInfo: null,
    openid: null,
    envId: 'cloud1-d8gud2iy7f1660667'
  },

  onLaunch() {
    if (ENABLE_LEGACY_CLOUD) {
      this.initLegacyCloud()
    }
  },

  /** 旧版云开发初始化（默认不执行） */
  initLegacyCloud() {
    if (!wx.cloud) {
      console.info('[legacy] 当前基础库不支持云能力，已跳过旧版云初始化')
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
      }
    }).catch(err => {
      console.info('[legacy] 云端食物库初始化未完成，本地食物库不受影响')
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
      console.info('[legacy] 获取用户信息失败')
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
