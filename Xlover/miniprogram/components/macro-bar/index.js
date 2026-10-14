Component({
  properties: {
    label: { type: String, value: '' },
    value: { type: null, value: null },
    target: { type: null, value: null },
    unit: { type: String, value: 'g' },
    color: { type: String, value: 'var(--macro-carb)' }
  },

  data: {
    percent: 0,
    over: false,
    unknown: false,
    valueText: '--',
    targetText: '--',
    footText: ''
  },

  observers: {
    'value, target, unit': function (value, target, unit) {
      const u = unit || 'g'
      const hasValue = value !== null && value !== undefined && value !== ''
      const hasTarget = target !== null && target !== undefined && Number(target) > 0
      const v = hasValue ? Number(value) : 0
      const t = hasTarget ? Number(target) : 0

      let footText = ''
      if (!hasTarget) footText = '未设定目标'
      else if (!hasValue) footText = '数据未记录'
      else {
        const diff = Math.round((t - v) * 10) / 10
        footText = diff >= 0 ? `还差 ${diff}${u}` : `已超 ${Math.abs(diff)}${u}`
      }

      this.setData({
        percent: t > 0 ? Math.min(Math.round((v / t) * 100), 100) : 0,
        over: hasValue && hasTarget && v > t,
        unknown: !hasValue || !hasTarget,
        valueText: hasValue ? String(Math.round(v * 10) / 10) : '--',
        targetText: hasTarget ? String(Math.round(t * 10) / 10) : '--',
        footText
      })
    }
  }
})
