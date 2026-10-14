const appStore = require('../../utils/appStore.js')
const metrics = require('../../utils/metrics.js')
const fmt = require('../../utils/format.js')

const RANGE_OPTIONS = [
  { value: '7', label: '近 7 天' },
  { value: '30', label: '近 30 天' }
]

const CHART_PAD = 34

/** 读取设备像素比：优先新接口，避免 getSystemInfoSync 弃用告警 */
function getPixelRatio () {
  try {
    if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo().pixelRatio || 2
  } catch (e) {}
  try {
    if (typeof wx.getSystemInfoSync === 'function') return wx.getSystemInfoSync().pixelRatio || 2
  } catch (e) {}
  return 2
}

Page({
  data: {
    rangeOptions: RANGE_OPTIONS,
    range: '7',
    days: 7,

    weight: null,
    intake: null,
    macro: null,
    training: null,
    goals: null,

    macroToday: [],
    macroDateLabel: '',

    hasAnyData: false
  },

  onLoad () {
    this.setData({ days: Number(this.data.range) })
  },

  onShow () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.refresh()
  },

  onRange (e) {
    const range = e.detail.value
    this.setData({ range, days: Number(range) })
    this.refresh()
  },

  refresh () {
    const store = appStore.getStore()
    const today = fmt.today()
    const days = this.data.days

    const weight = metrics.getWeightSeries(store, { days: days === 7 ? 30 : days, today })
    const intake = metrics.getIntakeSeries(store, { days, today })
    const macro = metrics.getMacroSeries(store, { days: Math.min(days, 7), today })
    const training = metrics.getTrainingSeries(store, { days, today })
    const goals = metrics.getGoalHistory(store, { limit: 10 })
    const day = metrics.getDaySummary(store, today, { today })

    this.setData({
      weight,
      intake,
      macro,
      training,
      goals,
      macroToday: day.macroRows,
      macroDateLabel: fmt.humanDate(today),
      hasAnyData: weight.hasData || intake.hasData || training.hasData || goals.hasData
    }, () => {
      if (weight.hasEnough) wx.nextTick(() => this.drawWeightChart())
      if (intake.hasData) wx.nextTick(() => this.drawIntakeChart())
    })
  },

  /* ---------------- 图表 ---------------- */

  prepareCanvas (selector, callback) {
    const query = wx.createSelectorQuery().in(this)
    query.select(selector).fields({ node: true, size: true }).exec(res => {
      if (!res || !res[0] || !res[0].node) return
      const canvas = res[0].node
      const ctx = canvas.getContext('2d')
      const dpr = getPixelRatio()
      const w = res[0].width
      const h = res[0].height
      if (!w || !h) return
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
      ctx.clearRect(0, 0, w, h)
      callback(ctx, w, h)
    })
  },

  drawWeightChart () {
    const points = this.data.weight.points.map(p => ({ label: p.label, value: p.weightKg }))
    this.prepareCanvas('#weightChart', (ctx, w, h) => {
      const data = points.filter(p => p.value !== null)
      if (data.length < 2) return

      const pad = CHART_PAD
      const chartW = w - pad * 2
      const chartH = h - pad * 2
      const values = data.map(d => Number(d.value))
      const min = Math.min.apply(null, values)
      const max = Math.max.apply(null, values)
      const span = (max - min) || 1
      const lo = min - span * 0.2
      const hi = max + span * 0.2
      const range = (hi - lo) || 1
      const xAt = i => pad + (i / (data.length - 1)) * chartW
      const yAt = v => pad + (1 - (Number(v) - lo) / range) * chartH

      ctx.beginPath()
      ctx.moveTo(xAt(0), pad + chartH)
      data.forEach((d, i) => ctx.lineTo(xAt(i), yAt(d.value)))
      ctx.lineTo(xAt(data.length - 1), pad + chartH)
      ctx.closePath()
      const grad = ctx.createLinearGradient(0, pad, 0, pad + chartH)
      grad.addColorStop(0, 'rgba(91, 155, 213, 0.18)')
      grad.addColorStop(1, 'rgba(91, 155, 213, 0.02)')
      ctx.fillStyle = grad
      ctx.fill()

      ctx.beginPath()
      ctx.strokeStyle = '#5B9BD5'
      ctx.lineWidth = 2.5
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      data.forEach((d, i) => {
        if (i === 0) ctx.moveTo(xAt(i), yAt(d.value))
        else ctx.lineTo(xAt(i), yAt(d.value))
      })
      ctx.stroke()

      const fontSize = Math.max(10, w / 30)
      const step = Math.ceil(data.length / 6)
      data.forEach((d, i) => {
        ctx.beginPath()
        ctx.fillStyle = '#fff'
        ctx.arc(xAt(i), yAt(d.value), 4, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath()
        ctx.fillStyle = '#5B9BD5'
        ctx.arc(xAt(i), yAt(d.value), 2.6, 0, Math.PI * 2)
        ctx.fill()

        if (i % step === 0 || i === data.length - 1) {
          ctx.fillStyle = '#5B9BD5'
          ctx.font = `600 ${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(Number(d.value).toFixed(1), xAt(i), yAt(d.value) - 10)
          ctx.fillStyle = '#999999'
          ctx.font = `${fontSize}px sans-serif`
          ctx.fillText(d.label, xAt(i), h - 8)
        }
      })
    })
  },

  drawIntakeChart () {
    const pts = this.data.intake.points
    const points = pts.map(p => ({ label: p.label, value: p.kcal }))

    this.prepareCanvas('#intakeChart', (ctx, w, h) => {
      const values = points.filter(p => p.value !== null).map(p => Number(p.value))
      if (!values.length) return

      const pad = CHART_PAD
      const chartW = w - pad * 2
      const chartH = h - pad * 2
      const targetValues = pts.map(p => p.target).filter(t => t !== null)
      const top = Math.max(Math.max.apply(null, values), Math.max.apply(null, targetValues.concat([0]))) * 1.12 || 1
      const yAt = v => pad + (1 - v / top) * chartH
      const slot = chartW / points.length
      const barW = Math.min(slot * 0.55, 22)

      // 每日目标可能不同（历史快照冻结），所以逐日画刻度，不合并成一条线
      const cxAt = i => pad + slot * i + slot / 2
      pts.forEach((p, i) => {
        if (p.target === null) return
        const y = yAt(p.target)
        ctx.beginPath()
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = '#C8CFD8'
        ctx.lineWidth = 1
        ctx.moveTo(cxAt(i) - barW * 0.75, y)
        ctx.lineTo(cxAt(i) + barW * 0.75, y)
        ctx.stroke()
        ctx.setLineDash([])
      })

      // 只标注最近一个有目标的日期，避免误读成「所有天共用同一个目标」
      for (let i = pts.length - 1; i >= 0; i--) {
        if (pts[i].target === null) continue
        const y = yAt(pts[i].target)
        ctx.fillStyle = '#999999'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(`目标 ${pts[i].target}`, cxAt(i), y - 5)
        break
      }

      const fontSize = Math.max(10, w / 30)
      const step = Math.ceil(points.length / 6)
      points.forEach((p, i) => {
        const cx = pad + slot * i + slot / 2
        if (p.value !== null) {
          const y = yAt(Number(p.value))
          // 用当天自己的目标判断是否超标
          const dayTarget = pts[i].target
          const over = dayTarget !== null && Number(p.value) > dayTarget
          ctx.fillStyle = over ? '#E85D5D' : '#5B9BD5'
          ctx.fillRect(cx - barW / 2, y, barW, Math.max(pad + chartH - y, 2))
        }
        if (i % step === 0 || i === points.length - 1) {
          ctx.fillStyle = '#999999'
          ctx.font = `${fontSize}px sans-serif`
          ctx.textAlign = 'center'
          ctx.fillText(p.label, cx, h - 8)
        }
      })
    })
  },

  goFood () {
    wx.switchTab({ url: '/pages/food/food' })
  },

  goTraining () {
    wx.switchTab({ url: '/pages/exercise/exercise' })
  },

  goBody () {
    wx.navigateTo({ url: '/pages/body/body' })
  }
})
