const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    today: util.getToday(),
    greeting: '',
    userInfo: {},
    userRole: '',
    profile: null,
    streakDays: 0,
    todayCalories: 0,
    targetCalories: 1500,
    caloriesStatus: '',
    caloriesPercent: 0,
    todayExercise: 0,
    waterCount: 0,
    werunStep: 0,
    isCheckingIn: false,
    checkins: {
      water: false,
      exercise: false,
      sleep: false,
      diet: false
    },
    weightProgress: 0,
    lostWeight: 0,
    remainWeight: 0,
    remainDays: 0,
    partnerInfo: null,
    partnerCheckins: {},
    hasLiked: false,
    likeCount: 0,
    latestMessage: null,
    inputMessage: '',
    reminders: [],
    dataLoaded: false,
    // 伴侣：任务记录（分类）
    taskCategories: [],
    pendingPraises: [],
    // 摄入量/净热量切换
    calorieMode: 'intake', // 'intake' | 'net'
    netCalories: 0,
    // 表扬弹窗
    showPraiseModal: false,
    praiseContent: '',
    // 评论弹窗
    showCommentModal: false,
    commentContent: '',
    commentTargetId: '',
    commentTargetTitle: '',
    // 主角：收到表扬
    showPraiseEffect: false,
    praiseText: '',
    // 主角：任务
    pendingTaskCount: 0,
    activeTaskCount: 0,
    // 头像昵称弹窗
    showUserInfoModal: false,
    tempAvatarUrl: '',
    tempNickName: ''
  },

  onLoad() {
    this.setGreeting()
    this.loadData()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.loadData()
    this.loadPraises()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  setGreeting() {
    const hour = new Date().getHours()
    let greeting = '晚上好'
    if (hour < 12) greeting = '早上好'
    else if (hour < 18) greeting = '下午好'
    this.setData({ greeting })
  },

  async loadData() {
    if (this._isLoadingData) return
    this._isLoadingData = true

    const userRole = wx.getStorageSync('userRole')
    this.setData({ userRole })

    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getDashboard' }
      })

      if (res.result && res.result.error) {
        console.error('getDashboard 返回错误', res.result.error)
        this.setData({ dataLoaded: true })
        wx.showToast({ title: '数据加载失败，请重试', icon: 'none' })
        return
      }

      if (res.result) {
        const data = res.result
        this.setData({
          dataLoaded: true,
          userInfo: data.userInfo || {},
          profile: data.profile || null,
          streakDays: data.streakDays || 0,
          todayCalories: data.todayCalories || 0,
          targetCalories: data.targetCalories || 1500,
          todayExercise: data.todayExercise || 0,
          waterCount: data.waterCount || 0,
          werunStep: data.werunStep || 0,
          checkins: data.checkins || { water: false, exercise: false, sleep: false, diet: false },
          partnerInfo: data.partnerInfo || null,
          partnerCheckins: data.partnerCheckins || {},
          hasLiked: data.hasLiked || false,
          likeCount: data.likeCount || 0,
          latestMessage: data.latestMessage || null,
          reminders: data.reminders || [],
          taskCategories: (data.taskCategories || []).map(c => ({ ...c, expanded: true })),
          pendingPraises: data.pendingPraises || [],
          netCalories: (data.todayCalories || 0) - (data.todayExerciseCal || 0)
        })

        this.calculateProgress()

        // 主角加载任务数量
        if (this.data.userRole !== 'partner') {
          this.loadTaskCount()
        }

        // 检查是否需要完善头像昵称
        const ui = data.userInfo || {}
        if (!ui.nickName || ui.nickName === '用户' || ui.nickName === '朋友') {
          this.setData({ showUserInfoModal: true })
        }
      }
    } catch (err) {
      console.error('加载数据失败', err)
      this.setData({ dataLoaded: true })
      wx.showToast({ title: '网络异常，请下拉刷新', icon: 'none' })
    } finally {
      this._isLoadingData = false
    }
  },

  calculateProgress() {
    const { profile, todayCalories, targetCalories } = this.data
    
    if (profile) {
      const current = parseFloat(profile.currentWeight) || 0
      const target = parseFloat(profile.targetWeight) || 0
      const start = parseFloat(profile.startWeight) || current
      
      if (start > target) {
        const lost = start - current
        const total = start - target
        const progress = total > 0 ? Math.min(((lost / total) * 100), 100) : 0
        this.setData({
          weightProgress: progress.toFixed(1),
          lostWeight: lost.toFixed(1),
          remainWeight: Math.max(current - target, 0).toFixed(1),
          remainDays: util.calculateDaysDiff(util.getToday(), profile.targetDate)
        })
      }
    }

    const percent = targetCalories > 0 ? Math.min((todayCalories / targetCalories) * 100, 100) : 0
    this.setData({
      caloriesPercent: percent.toFixed(1),
      caloriesStatus: todayCalories > targetCalories ? 'over' : ''
    })
  },

  checkin(e) {
    if (this.data.isCheckingIn) return
    const type = e.currentTarget.dataset.type

    if (type === 'water') {
      const newCount = this.data.waterCount + 1
      if (newCount > 8) {
        wx.showToast({ title: '今日喝水目标已达成', icon: 'none' })
        return
      }
      this.setData({ isCheckingIn: true })
      this.updateCheckin(type, { waterCount: newCount })
        .then(() => {
          this.setData({ waterCount: newCount })
          if (newCount >= 8) {
            this.setData({ 'checkins.water': true })
          }
        })
        .catch(() => {
          wx.showToast({ title: '打卡失败', icon: 'none' })
        })
        .finally(() => {
          this.setData({ isCheckingIn: false })
        })
    } else if (type === 'exercise') {
      wx.navigateTo({ url: '/pages/exercise/exercise' })
    } else {
      const newVal = !this.data.checkins[type]
      this.setData({ [`checkins.${type}`]: newVal })
      this.updateCheckin(type, { checked: newVal })
        .then(() => {
          if (type === 'sleep' && newVal) {
            wx.showToast({ title: '打卡成功，待伴侣审核', icon: 'none', duration: 2000 })
          }
        })
        .catch(() => {
          this.setData({ [`checkins.${type}`]: !newVal })
          wx.showToast({ title: '打卡失败', icon: 'none' })
        })
    }
  },

  updateCheckin(type, extraData) {
    return wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'checkin',
        checkinType: type,
        ...extraData
      }
    })
  },

  goRecord(e) {
    wx.navigateTo({ url: '/pages/food/food' })
  },

  toggleLike() {
    const { hasLiked, likeCount } = this.data
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'toggleLike',
        liked: !hasLiked
      }
    }).then(() => {
      this.setData({
        hasLiked: !hasLiked,
        likeCount: hasLiked ? likeCount - 1 : likeCount + 1
      })
    })
  },

  inputMessage(e) {
    this.setData({ inputMessage: e.detail.value })
  },

  sendMessage() {
    const { inputMessage } = this.data
    if (!inputMessage.trim()) return
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'sendMessage',
        content: inputMessage.trim()
      }
    }).then(() => {
      this.setData({ inputMessage: '' })
      this.loadData()
    })
  },

  async loadPraises() {
    const userRole = wx.getStorageSync('userRole')
    if (userRole === 'main') {
      // 主角检查未读表扬
      try {
        const res = await wx.cloud.callFunction({
          name: 'getUserData',
          data: { type: 'getUnreadPraises' }
        })
        const praises = res.result?.praises || []
        if (praises.length > 0) {
          this.setData({
            showPraiseEffect: true,
            praiseText: praises[0].content
          })
          wx.cloud.callFunction({
            name: 'updateData',
            data: { type: 'readPraises' }
          })
          setTimeout(() => {
            this.setData({ showPraiseEffect: false })
          }, 3000)
        }
      } catch (e) {}
    }
    // 伴侣：taskRecords 和 pendingPraises 已在 loadData 中获取
  },

  openPraiseModal() {
    this.setData({ showPraiseModal: true, praiseContent: '' })
  },

  closePraiseModal() {
    this.setData({ showPraiseModal: false })
  },

  inputPraise(e) {
    this.setData({ praiseContent: e.detail.value })
  },

  sendPraise() {
    const { praiseContent } = this.data
    if (!praiseContent.trim()) {
      wx.showToast({ title: '写点什么鼓励她吧', icon: 'none' })
      return
    }
    const user = wx.getStorageSync('userInfo')
    const partnerOpenid = user?.partnerId || ''
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'sendPraise',
        content: praiseContent.trim(),
        targetOpenid: partnerOpenid
      }
    }).then(res => {
      if (res.result?.success) {
        this.setData({ showPraiseModal: false, praiseContent: '', pendingPraises: [] })
        wx.showToast({ title: '已送达 💕', icon: 'none' })
      } else {
        wx.showToast({ title: res.result?.error || '发送失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  },

  closePraiseEffect() {
    this.setData({ showPraiseEffect: false })
  },

  // ===== 主角：任务入口 =====
  async loadTaskCount() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getMyTasks' }
      })
      if (res.result) {
        this.setData({
          pendingTaskCount: res.result.pendingCount || 0,
          activeTaskCount: res.result.activeCount || 0
        })
      }
    } catch (e) {}
  },

  goTaskPage() {
    wx.switchTab({ url: '/pages/task/task' })
  },

  // ===== 分类展开/收起 =====
  toggleCategory(e) {
    const idx = e.currentTarget.dataset.idx
    this.setData({
      [`taskCategories[${idx}].expanded`]: !this.data.taskCategories[idx].expanded
    })
  },

  // ===== 摄入量/净热量切换 =====
  toggleCalorieMode() {
    const next = this.data.calorieMode === 'intake' ? 'net' : 'intake'
    this.setData({ calorieMode: next })
  },

  // ===== 头像昵称设置 =====
  onChooseAvatar(e) {
    this.setData({ tempAvatarUrl: e.detail.avatarUrl })
  },

  onInputNickName(e) {
    this.setData({ tempNickName: e.detail.value })
  },

  onNickNameBlur(e) {
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
  },

  // ===== 伴侣：任务记录点赞 =====
  likeTaskRecord(e) {
    const id = e.currentTarget.dataset.id
    const catIdx = e.currentTarget.dataset.catidx
    const recIdx = e.currentTarget.dataset.recidx

    const categories = this.data.taskCategories
    if (!categories[catIdx] || !categories[catIdx].records[recIdx]) return

    const record = categories[catIdx].records[recIdx]
    const wasLiked = record.liked
    const newLiked = !wasLiked

    // 乐观更新 UI
    this.setData({
      [`taskCategories[${catIdx}].records[${recIdx}].liked`]: newLiked,
      [`taskCategories[${catIdx}].records[${recIdx}].likeCount`]: (record.likeCount || 0) + (newLiked ? 1 : -1)
    })

    const user = wx.getStorageSync('userInfo')
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'likeRecord',
        recordId: id,
        liked: newLiked,
        targetOpenid: user?.partnerId || ''
      }
    }).then(res => {
      if (!res.result?.success) {
        // 回滚
        this.setData({
          [`taskCategories[${catIdx}].records[${recIdx}].liked`]: wasLiked,
          [`taskCategories[${catIdx}].records[${recIdx}].likeCount`]: (record.likeCount || 0) + (wasLiked ? 1 : -1)
        })
        wx.showToast({ title: '操作失败', icon: 'none' })
      }
    }).catch(() => {
      // 回滚
      this.setData({
        [`taskCategories[${catIdx}].records[${recIdx}].liked`]: wasLiked,
        [`taskCategories[${catIdx}].records[${recIdx}].likeCount`]: (record.likeCount || 0) + (wasLiked ? 1 : -1)
      })
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  },

  // ===== 伴侣：评论弹窗 =====
  openCommentModal(e) {
    const id = e.currentTarget.dataset.id
    const title = e.currentTarget.dataset.title
    this.setData({
      showCommentModal: true,
      commentContent: '',
      commentTargetId: id,
      commentTargetTitle: title
    })
  },

  closeCommentModal() {
    this.setData({ showCommentModal: false })
  },

  inputComment(e) {
    this.setData({ commentContent: e.detail.value })
  },

  sendComment() {
    const { commentContent, commentTargetId, commentTargetTitle } = this.data
    if (!commentContent.trim()) {
      wx.showToast({ title: '写点什么鼓励她吧', icon: 'none' })
      return
    }

    const user = wx.getStorageSync('userInfo')
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'commentRecord',
        recordId: commentTargetId,
        recordTitle: commentTargetTitle,
        content: commentContent.trim(),
        targetOpenid: user?.partnerId || ''
      }
    }).then(res => {
      if (res.result?.success) {
        this.setData({ showCommentModal: false, commentContent: '' })
        wx.showToast({ title: '已送达 💬', icon: 'none' })
      } else {
        wx.showToast({ title: res.result?.error || '发送失败', icon: 'none' })
      }
    }).catch(() => {
      wx.showToast({ title: '网络异常', icon: 'none' })
    })
  }
})
