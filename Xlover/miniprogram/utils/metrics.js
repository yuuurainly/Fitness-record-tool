/**
 * 读模型：把本地存储里的原始记录聚合成页面直接可渲染的结构。
 *
 * 全部是纯函数（store 作为参数传入），可在 Node 里用内存适配器测试。
 * 原则：
 *  - 历史日期只用当日快照做目标对比；没有快照就如实显示「无当日目标」，不拿今天的设置倒推
 *  - 营养素缺失的记录不计入 0，而是回报覆盖率，页面据此标注「数据缺失」
 */

const nutrition = require('./nutrition.js')
const planMod = require('./plan.js')
const fmt = require('./format.js')

const MACRO_META = [
  { key: 'carb', label: '碳水', unit: 'g', color: 'var(--macro-carb)' },
  { key: 'protein', label: '蛋白质', unit: 'g', color: 'var(--macro-protein)' },
  { key: 'fat', label: '脂肪', unit: 'g', color: 'var(--macro-fat)' }
]

/* ============================ 汇总 ============================ */

function sumIntake (logs) {
  const acc = {
    kcal: 0, protein: 0, carb: 0, fat: 0,
    entries: 0, missingMacroEntries: 0, macroEntries: 0
  }
  logs.forEach(l => {
    acc.entries += 1
    acc.kcal += Number(l.kcal || 0)
    const complete = l.protein !== null && l.protein !== undefined &&
      l.carb !== null && l.carb !== undefined &&
      l.fat !== null && l.fat !== undefined
    if (complete) {
      acc.macroEntries += 1
      acc.protein += Number(l.protein)
      acc.carb += Number(l.carb)
      acc.fat += Number(l.fat)
    } else {
      acc.missingMacroEntries += 1
    }
  })
  acc.kcal = Math.round(acc.kcal)
  acc.protein = fmt.round1(acc.protein)
  acc.carb = fmt.round1(acc.carb)
  acc.fat = fmt.round1(acc.fat)
  acc.macroCoverage = acc.entries === 0 ? 1 : (acc.entries - acc.missingMacroEntries) / acc.entries
  acc.macrosComplete = acc.missingMacroEntries === 0
  return acc
}

function sumTraining (logs) {
  const acc = { minutes: 0, kcal: 0, entries: logs.length }
  logs.forEach(l => {
    acc.minutes += Number(l.minutes || 0)
    acc.kcal += Number(l.kcal || 0)
  })
  acc.minutes = Math.round(acc.minutes)
  acc.kcal = Math.round(acc.kcal)
  return acc
}

/**
 * 解析某一天的目标。
 * 只有「当天」才允许用当前计划推算；历史日期一律只认快照。
 */
function resolveTargets (store, date, options) {
  const o = options || {}
  const todayStr = o.today || fmt.today()

  const snapshot = store.getTargetSnapshot(date)
  if (snapshot && snapshot.targets) {
    return { source: 'snapshot', targets: snapshot.targets, snapshot, planResult: null }
  }

  if (date !== todayStr) {
    return { source: 'none', targets: null, snapshot: null, planResult: null, reason: '该日期没有目标快照' }
  }

  const built = computeCurrentPlan(store)
  if (!built.ok) {
    return { source: 'none', targets: null, snapshot: null, planResult: built, reason: built.errors[0] || '计划尚未就绪' }
  }

  return {
    source: 'computed',
    targets: {
      kcal: built.result.active.kcalFromMacros,
      carb: built.result.active.grams.carb,
      protein: built.result.active.grams.protein,
      fat: built.result.active.grams.fat,
      basis: 'derived'
    },
    snapshot: null,
    planResult: built.result
  }
}

function computeCurrentPlan (store) {
  const profile = store.getProfile()
  const saved = store.getNutritionPlan()
  const plan = planMod.normalizePlan(saved, profile)
  const result = planMod.computePlan({ profile, plan })
  return Object.assign({ result }, result)
}

/**
 * 用户主动改计划后，覆盖「今天」的快照（历史日期仍然不动）。
 */
function refreshTodaySnapshot (store, options) {
  const o = options || {}
  const date = o.today || fmt.today()
  const built = computeCurrentPlan(store)
  if (!built.ok) return { ok: false, frozen: false, errors: built.errors, date }

  const snapshot = planMod.buildSnapshot(built.result, { source: o.source || 'plan-change' })
  const res = store.putTargetSnapshot(date, snapshot, { allowOverwrite: true, today: date })
  return Object.assign({ frozen: res.ok, date, snapshot }, res)
}

/**
 * 把今天的目标冻结成快照。已存在则不动（历史不可改写）。
 */
function freezeToday (store, options) {
  const o = options || {}
  const date = o.today || fmt.today()
  if (store.getTargetSnapshot(date)) {
    return { ok: true, frozen: false, reason: 'exists', date }
  }

  const built = computeCurrentPlan(store)
  if (!built.ok) return { ok: false, frozen: false, reason: 'plan-not-ready', errors: built.errors, date }

  const snapshot = planMod.buildSnapshot(built.result, { source: o.source || 'auto' })
  const res = store.putTargetSnapshot(date, snapshot, { allowOverwrite: false })
  return Object.assign({ frozen: res.ok, date, snapshot }, res)
}

/* ============================ 单日 ============================ */

function getDaySummary (store, date, options) {
  const o = options || {}
  const day = date || fmt.today()
  const targetInfo = resolveTargets(store, day, o)
  const logs = store.getFoodLogs({ from: day, to: day })
  const workouts = store.getWorkoutLogs({ from: day, to: day })
  const intake = sumIntake(logs)
  const training = sumTraining(workouts)

  const records = store.getBodyRecords().filter(r => r.date <= day)
  const latest = records.length ? records[records.length - 1] : null
  const prev = records.length > 1 ? records[records.length - 2] : null

  const targets = targetInfo.targets
  const macroRows = MACRO_META.map(m => ({
    key: m.key,
    label: m.label,
    unit: m.unit,
    color: m.color,
    // 没有任何一条记录带营养素时，显示「无数据」而不是 0
    value: intake.macroEntries === 0 ? null : intake[m.key],
    target: targets ? targets[m.key] : null
  }))

  return {
    date: day,
    targetSource: targetInfo.source,
    targetReason: targetInfo.reason || '',
    targets,
    intake,
    remainingKcal: targets ? Math.round(targets.kcal - intake.kcal) : null,
    macroRows,
    training,
    weight: latest
      ? {
        date: latest.date,
        value: latest.weightKg,
        bmi: latest.bmi,
        delta: prev ? fmt.round1(latest.weightKg - prev.weightKg) : null,
        basis: latest.weightBasis
      }
      : null,
    hasAnyLog: logs.length > 0 || workouts.length > 0,
    planReady: targetInfo.source !== 'none'
  }
}

/* ============================ 序列 ============================ */

function rangeOf (days, todayStr) {
  const to = todayStr
  const from = fmt.addDays(to, -(days - 1))
  return { from, to, dates: fmt.lastNDates(to, days) }
}

function getWeightSeries (store, options) {
  const o = options || {}
  const days = o.days || 30
  const { from, to, dates } = rangeOf(days, o.today || fmt.today())

  const points = store.getBodyRecords()
    .filter(r => r.date >= from && r.date <= to)
    .map(r => ({ date: r.date, label: fmt.monthDay(r.date), weightKg: r.weightKg, bmi: r.bmi }))

  const first = points.length ? points[0].weightKg : null
  const last = points.length ? points[points.length - 1].weightKg : null

  return {
    days,
    from,
    to,
    dates,
    points,
    hasEnough: points.length >= 2,
    hasData: points.length > 0,
    first,
    last,
    delta: points.length >= 2 ? fmt.round1(last - first) : null
  }
}

function getIntakeSeries (store, options) {
  const o = options || {}
  const days = o.days || 14
  const todayStr = o.today || fmt.today()
  const { from, to, dates } = rangeOf(days, todayStr)
  const logs = store.getFoodLogs({ from, to })

  const bucket = {}
  logs.forEach(l => {
    if (!bucket[l.date]) bucket[l.date] = []
    bucket[l.date].push(l)
  })

  const points = dates.map(d => {
    const dayLogs = bucket[d] || []
    const intake = sumIntake(dayLogs)
    const targetInfo = resolveTargets(store, d, { today: todayStr })
    const target = targetInfo.targets ? targetInfo.targets.kcal : null
    return {
      date: d,
      label: fmt.monthDay(d),
      kcal: intake.entries ? intake.kcal : null,
      target,
      targetSource: targetInfo.source,
      ratio: target ? fmt.round1((intake.kcal / target) * 100) : null
    }
  })

  return { days, from, to, points, hasData: points.some(p => p.kcal !== null) }
}

function getMacroSeries (store, options) {
  const o = options || {}
  const days = o.days || 7
  const todayStr = o.today || fmt.today()
  const { from, to, dates } = rangeOf(days, todayStr)
  const logs = store.getFoodLogs({ from, to })

  const bucket = {}
  logs.forEach(l => {
    if (!bucket[l.date]) bucket[l.date] = []
    bucket[l.date].push(l)
  })

  const points = dates.map(d => {
    const intake = sumIntake(bucket[d] || [])
    const targetInfo = resolveTargets(store, d, { today: todayStr })
    const t = targetInfo.targets
    const hasData = intake.entries > 0 && intake.macrosComplete
    return {
      date: d,
      label: fmt.monthDay(d),
      hasData,
      coverage: intake.macroCoverage,
      carb: hasData ? intake.carb : null,
      protein: hasData ? intake.protein : null,
      fat: hasData ? intake.fat : null,
      target: t ? { carb: t.carb, protein: t.protein, fat: t.fat } : null,
      percent: t && hasData ? {
        carb: fmt.round1((intake.carb / t.carb) * 100),
        protein: fmt.round1((intake.protein / t.protein) * 100),
        fat: fmt.round1((intake.fat / t.fat) * 100)
      } : null
    }
  })

  return { days, from, to, points, hasData: points.some(p => p.hasData) }
}

function getTrainingSeries (store, options) {
  const o = options || {}
  const days = o.days || 14
  const { from, to, dates } = rangeOf(days, o.today || fmt.today())
  const logs = store.getWorkoutLogs({ from, to })

  const bucket = {}
  logs.forEach(l => {
    if (!bucket[l.date]) bucket[l.date] = []
    bucket[l.date].push(l)
  })

  const points = dates.map(d => {
    const t = sumTraining(bucket[d] || [])
    return { date: d, label: fmt.monthDay(d), minutes: bucket[d] ? t.minutes : 0, entries: t.entries }
  })

  const totalMinutes = points.reduce((n, p) => n + p.minutes, 0)
  const activeDays = points.filter(p => p.minutes > 0).length
  const peakMinutes = points.reduce((n, p) => Math.max(n, p.minutes), 0)

  return {
    days,
    from,
    to,
    points,
    totalMinutes,
    activeDays,
    peakMinutes,
    avgWeeklyMinutes: Math.round(totalMinutes / days * 7),
    hasData: activeDays > 0
  }
}

/**
 * 历史目标与实际结果对照。只列出「有快照」的日期。
 */
function getGoalHistory (store, options) {
  const o = options || {}
  const limit = o.limit || 30
  const dates = store.listSnapshotDates()
  if (!dates.length) {
    return { rows: [], recordedDays: 0, snapshotDays: 0, hasData: false }
  }

  // 一次读出整段区间再按天分桶，避免每个快照日期都全量扫一遍饮食记录
  const bucket = {}
  store.getFoodLogs({ from: dates[0], to: dates[dates.length - 1] }).forEach(l => {
    if (!bucket[l.date]) bucket[l.date] = []
    bucket[l.date].push(l)
  })

  const weights = {}
  store.getBodyRecords().forEach(r => { weights[r.date] = r.weightKg })

  const rows = dates.map(d => {
    const snap = store.getTargetSnapshot(d)
    if (!snap || !snap.targets) return null
    const intake = sumIntake(bucket[d] || [])
    return {
      date: d,
      label: fmt.monthDay(d),
      targetKcal: snap.targets.kcal,
      actualKcal: intake.entries ? intake.kcal : null,
      diffKcal: intake.entries ? Math.round(intake.kcal - snap.targets.kcal) : null,
      goalType: snap.goalType,
      mode: snap.mode,
      weightKg: weights[d] === undefined ? null : weights[d]
    }
  }).filter(Boolean)

  const withActual = rows.filter(r => r.actualKcal !== null)
  rows.sort((a, b) => (a.date < b.date ? 1 : -1))

  return {
    rows: rows.slice(0, limit),
    recordedDays: withActual.length,
    snapshotDays: rows.length,
    hasData: withActual.length > 0
  }
}

/**
 * 最近 4 周训练时长 → 系数档位推荐（直接复用引擎）。
 */
function getTrainingRecommendation (store, options) {
  const o = options || {}
  const todayStr = o.today || fmt.today()
  const from = fmt.addDays(todayStr, -(nutrition.WINDOW_DAYS - 1))
  const logs = store.getWorkoutLogs({ from, to: todayStr })
  return nutrition.recommendCoefficientBand({ logs, referenceDate: todayStr })
}

module.exports = {
  MACRO_META,
  sumIntake,
  sumTraining,
  resolveTargets,
  computeCurrentPlan,
  freezeToday,
  refreshTodaySnapshot,
  getDaySummary,
  getWeightSeries,
  getIntakeSeries,
  getMacroSeries,
  getTrainingSeries,
  getGoalHistory,
  getTrainingRecommendation
}
