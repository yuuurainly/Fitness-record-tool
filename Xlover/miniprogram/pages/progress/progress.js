const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    userRole: '',
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    calendarDays: [],
    badges: [],
    weightHistory: [],
    caloriesTrend: [],
    exerciseStats: [],
    expandBadges: false,
    expandCalendar: true,
    expandCalories: true,
    expandExercise: true,
    taskStats: {
      totalTasks: 0,
      completedTasks: 0,
      activeTasks: 0,
      pendingTasks: 0,
      completionRate: 0,
      totalPoints: 0
    },
    // 积分调整弹窗
    showPointsModal: false,
    pointsDelta: '',
    pointsReason: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      const role = wx.getStorageSync('userRole') || 'main'
      this.getTabBar().setData({ selected: role === 'partner' ? 2 : 2 })
    }
    this.setData({ userRole: wx.getStorageSync('userRole') })
    this.loadProgressData()
    this.generateCalendar()
    this.loadTaskStats()
  },

  async loadTaskStats() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getTaskStats' }
      })
      if (res.result) {
        this.setData({ taskStats: res.result })
      }
    } catch (e) {
      console.error('加载任务统计失败', e)
    }
  },

  async loadProgressData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getProgress' }
      })

      if (res.result) {
        this.setData({
          badges: res.result.badges || [],
          weightHistory: res.result.weightHistory || [],
          caloriesTrend: res.result.caloriesTrend || [],
          exerciseStats: res.result.exerciseStats || []
        })

        if (this.data.weightHistory.length > 1) {
          wx.nextTick(() => this.drawWeightChart())
        }
      }
    } catch (err) {
      console.error('加载进度数据失败', err)
    }
  },

  generateCalendar() {
    const { currentYear, currentMonth } = this.data
    const firstDay = new Date(currentYear, currentMonth - 1, 1)
    const lastDay = new Date(currentYear, currentMonth, 0)
    const daysInMonth = lastDay.getDate()
    const startWeekday = firstDay.getDay()

    const days = []
    for (let i = 0; i < startWeekday; i++) {
      days.push({ empty: true, key: 'e' + i })
    }

    const today = util.getToday()
    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`
      days.push({
        day: i,
        date,
        today: date === today,
        checked: false,
        key: date
      })
    }

    this.setData({ calendarDays: days })
    this.loadCheckinDays()
  },

  async loadCheckinDays() {
    try {
      const { currentYear, currentMonth } = this.data
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: {
          type: 'getCheckinDays',
          year: currentYear,
          month: currentMonth
        }
      })

      if (res.result && res.result.days) {
        const checkedDays = res.result.days
        const calendarDays = this.data.calendarDays.map(day => {
          if (day.date && checkedDays.includes(day.date)) {
            return { ...day, checked: true }
          }
          return day
        })
        this.setData({ calendarDays })
      }
    } catch (err) {
      console.error('加载打卡日期失败', err)
    }
  },

  toggleSection(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ [key]: !this.data[key] })
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth--
    if (currentMonth < 1) {
      currentMonth = 12
      currentYear--
    }
    this.setData({ currentYear, currentMonth }, () => {
      this.generateCalendar()
    })
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data
    currentMonth++
    if (currentMonth > 12) {
      currentMonth = 1
      currentYear++
    }
    this.setData({ currentYear, currentMonth }, () => {
      this.generateCalendar()
    })
  },

  drawWeightChart() {
    const query = wx.createSelectorQuery().in(this)
    query.select('#progressWeightChart').fields({ node: true, size: true }).exec((res) => {
      if (!res || !res[0] || !res[0].node) return

      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const sysInfo = wx.getSystemInfoSync()
      const dpr = sysInfo.pixelRatio
      const cssWidth = res[0].width
      const cssHeight = res[0].height

      if (!cssWidth || !cssHeight) return

      canvas.width = cssWidth * dpr
      canvas.height = cssHeight * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, cssWidth, cssHeight)

      const data = this.data.weightHistory.slice(0, 7).reverse()
      if (data.length < 2) return

      const padding = 32
      const chartW = cssWidth - padding * 2
      const chartH = cssHeight - padding * 2

      const weights = data.map(d => parseFloat(d.weight))
      const minW = Math.min(...weights)
      const maxW = Math.max(...weights)
      const paddingY = (maxW - minW) * 0.2 || 1
      const minWeight = minW - paddingY
      const maxWeight = maxW + paddingY
      const range = maxWeight - minWeight || 1

      // 绘制填充区域
      ctx.beginPath()
      ctx.moveTo(padding, padding + chartH)
      data.forEach((item, index) => {
        const x = padding + (index / (data.length - 1)) * chartW
        const y = padding + (1 - (parseFloat(item.weight) - minWeight) / range) * chartH
        if (index === 0) ctx.lineTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.lineTo(padding + chartW, padding + chartH)
      ctx.closePath()
      const gradient = ctx.createLinearGradient(0, padding, 0, padding + chartH)
      gradient.addColorStop(0, 'rgba(91, 155, 213, 0.2)')
      gradient.addColorStop(1, 'rgba(91, 155, 213, 0.02)')
      ctx.fillStyle = gradient
      ctx.fill()

      // 绘制折线
      ctx.beginPath()
      ctx.strokeStyle = '#5B9BD5'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      data.forEach((item, index) => {
        const x = padding + (index / (data.length - 1)) * chartW
        const y = padding + (1 - (parseFloat(item.weight) - minWeight) / range) * chartH
        if (index === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()

      // 绘制点和标签
      const fontSize = Math.max(10, cssWidth / 35)
      data.forEach((item, index) => {
        const x = padding + (index / (data.length - 1)) * chartW
        const y = padding + (1 - (parseFloat(item.weight) - minWeight) / range) * chartH

        // 点
        ctx.beginPath()
        ctx.fillStyle = '#fff'
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = '#5B9BD5'
        ctx.arc(x, y, 3.5, 0, Math.PI * 2)
        ctx.fill()

        // 体重值
        ctx.fillStyle = '#5B9BD5'
        ctx.font = `bold ${fontSize}px sans-serif`
        ctx.textAlign = 'center'
        ctx.fillText(parseFloat(item.weight).toFixed(1), x, y - 10)

        // 日期
        ctx.fillStyle = '#999'
        ctx.font = `${fontSize}px sans-serif`
        ctx.fillText(item.date.slice(5), x, cssHeight - 8)
      })
    })
  },

  // ===== 伴侣调整积分 =====
  editMainPoints() {
    this.setData({
      showPointsModal: true,
      pointsDelta: '',
      pointsReason: ''
    })
  },

  closePointsModal() {
    this.setData({ showPointsModal: false })
  },

  inputPointsDelta(e) {
    this.setData({ pointsDelta: e.detail.value })
  },

  inputPointsReason(e) {
    this.setData({ pointsReason: e.detail.value })
  },

  async savePointsAdjust() {
    const { pointsDelta, pointsReason } = this.data
    const delta = parseInt(pointsDelta)
    if (isNaN(delta) || delta === 0) {
      wx.showToast({ title: '请输入有效的积分值', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'updateData',
        data: {
          type: 'updateMainPoints',
          points: delta,
          reason: pointsReason || '伴侣手动调整'
        }
      })
      if (res.result?.success) {
        wx.hideLoading()
        wx.showToast({ title: '已调整', icon: 'success' })
        this.setData({ showPointsModal: false })
        this.loadTaskStats()
      } else {
        wx.hideLoading()
        wx.showToast({ title: res.result?.error || '调整失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络异常', icon: 'none' })
    }
  }
})
