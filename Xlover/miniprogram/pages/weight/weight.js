const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    latestWeight: '',
    latestBMI: '',
    bmiStatus: '',
    bmiStatusText: '',
    inputWeight: '',
    inputBodyFat: '',
    weightHistory: []
  },

  onShow() {
    this.loadWeightData()
  },

  async loadWeightData() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getUserData',
        data: { type: 'getWeightHistory' }
      })

      if (res.result) {
        const history = res.result.history || []
        const latest = history[0] || {}
        
        this.setData({
          latestWeight: latest.weight || '',
          latestBMI: latest.bmi || '',
          weightHistory: history.map((item, index) => {
            let change
            if (index < history.length - 1) {
              const diff = item.weight - history[index + 1].weight
              change = Math.abs(diff) < 0.05 ? '0.0' : diff.toFixed(1)
            }
            return { ...item, change }
          }),
          bmiStatus: this.getBMIStatus(latest.bmi),
          bmiStatusText: this.getBMIStatusText(latest.bmi)
        })

        if (history.length > 1) {
          this.drawChart(history)
        }
      }
    } catch (err) {
      console.error('加载体重数据失败', err)
    }
  },

  getBMIStatus(bmi) {
    if (!bmi) return ''
    const val = parseFloat(bmi)
    if (val < 18.5) return 'underweight'
    if (val < 24) return 'normal'
    if (val < 28) return 'overweight'
    return 'obese'
  },

  getBMIStatusText(bmi) {
    if (!bmi) return ''
    const val = parseFloat(bmi)
    if (val < 18.5) return '偏瘦'
    if (val < 24) return '正常'
    if (val < 28) return '偏胖'
    return '肥胖'
  },

  inputWeight(e) {
    this.setData({ inputWeight: e.detail.value })
  },

  inputBodyFat(e) {
    this.setData({ inputBodyFat: e.detail.value })
  },

  saveWeight() {
    const { inputWeight, inputBodyFat } = this.data
    if (!inputWeight) {
      wx.showToast({ title: '请输入体重', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...' })
    
    wx.cloud.callFunction({
      name: 'updateData',
      data: {
        type: 'addWeight',
        weight: parseFloat(inputWeight),
        bodyFat: inputBodyFat ? parseFloat(inputBodyFat) : null,
        date: util.getToday()
      }
    }).then(() => {
      wx.hideLoading()
      this.setData({ inputWeight: '', inputBodyFat: '' })
      this.loadWeightData()
      wx.showToast({ title: '记录成功', icon: 'success' })
    }).catch(err => {
      wx.hideLoading()
      wx.showToast({ title: '记录失败', icon: 'none' })
    })
  },

  drawChart(history) {
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this)
      query.select('#weightChart').fields({ node: true, size: true }).exec((res) => {
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

        const data = history.slice(0, 7).reverse()
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

        // 填充区域
        ctx.beginPath()
        ctx.moveTo(padding, padding + chartH)
        data.forEach((item, index) => {
          const x = padding + (index / (data.length - 1)) * chartW
          const y = padding + (1 - (parseFloat(item.weight) - minWeight) / range) * chartH
          ctx.lineTo(x, y)
        })
        ctx.lineTo(padding + chartW, padding + chartH)
        ctx.closePath()
        const gradient = ctx.createLinearGradient(0, padding, 0, padding + chartH)
        gradient.addColorStop(0, 'rgba(91, 155, 213, 0.2)')
        gradient.addColorStop(1, 'rgba(91, 155, 213, 0.02)')
        ctx.fillStyle = gradient
        ctx.fill()

        // 折线
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

        // 点和标签
        const fontSize = Math.max(10, cssWidth / 35)
        data.forEach((item, index) => {
          const x = padding + (index / (data.length - 1)) * chartW
          const y = padding + (1 - (parseFloat(item.weight) - minWeight) / range) * chartH

          ctx.beginPath()
          ctx.fillStyle = '#fff'
          ctx.arc(x, y, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.beginPath()
          ctx.fillStyle = '#5B9BD5'
          ctx.arc(x, y, 3.5, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = '#5B9BD5'
          ctx.font = `bold ${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(parseFloat(item.weight).toFixed(1), x, y - 10)

          ctx.fillStyle = '#999'
          ctx.font = `${fontSize}px sans-serif`
          ctx.fillText(item.date.slice(5), x, cssHeight - 8)
        })
      })
    })
  }
})
