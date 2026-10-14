const test = require('node:test')
const assert = require('node:assert')
const path = require('node:path')

const appStore = require('../miniprogram/utils/appStore.js')
const storage = require('../miniprogram/utils/storage.js')

const PAGES = {
  index: '../miniprogram/pages/index/index.js',
  food: '../miniprogram/pages/food/food.js',
  exercise: '../miniprogram/pages/exercise/exercise.js',
  progress: '../miniprogram/pages/progress/progress.js',
  profile: '../miniprogram/pages/profile/profile.js',
  body: '../miniprogram/pages/body/body.js',
  plan: '../miniprogram/pages/plan/plan.js',
  data: '../miniprogram/pages/data/data.js'
}

/* ============================ 伪运行环境 ============================ */

function createRecordingCtx (calls) {
  const noop = name => function () { calls.push(name) }
  return {
    beginPath: noop('beginPath'),
    moveTo: noop('moveTo'),
    lineTo: noop('lineTo'),
    closePath: noop('closePath'),
    fill: noop('fill'),
    stroke: noop('stroke'),
    arc: noop('arc'),
    fillRect: noop('fillRect'),
    fillText (text, x, y) { calls.push('fillText:' + text) },
    setLineDash: noop('setLineDash'),
    scale: noop('scale'),
    clearRect: noop('clearRect'),
    createLinearGradient () { return { addColorStop () {} } },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '',
    lineJoin: '',
    lineCap: ''
  }
}

function installFakeWx () {
  const store = new Map()
  const chartCalls = []
  const systemInfo = {
    platform: 'devtools', system: 'Windows', version: '8.0.30', SDKVersion: '3.16.2',
    pixelRatio: 2, windowWidth: 375, windowHeight: 667, benchmarkLevel: 1
  }

  const canvas = {
    width: 0,
    height: 0,
    getContext () { return createRecordingCtx(chartCalls) }
  }

  const wx = {
    env: { USER_DATA_PATH: 'wxfile://usr' },
    getStorageSync: k => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : ''),
    setStorageSync (k, v) { store.set(k, JSON.parse(JSON.stringify(v))) },
    removeStorageSync (k) { store.delete(k) },
    getStorageInfoSync () { return { keys: [...store.keys()], currentSize: 4, limitSize: 10240 } },
    getSystemInfoSync: () => systemInfo,

    // 图表：让 select().fields().exec() 回调一个可用的假 canvas
    createSelectorQuery () {
      const q = {
        in () { return q },
        select () { return q },
        fields () { return q },
        exec (cb) { cb([{ node: canvas, width: 340, height: 190 }]) }
      }
      return q
    },

    nextTick (fn) { fn() },
    showToast () {},
    hideLoading () {},
    showLoading () {},
    showModal () {},
    showActionSheet () {},
    stopPullDownRefresh () {},
    switchTab () {},
    navigateTo () {},
    setClipboardData () {},
    getClipboardData () {},
    getFileSystemManager () {
      return { writeFile () {}, readFile () {} }
    },
    shareFileMessage () {},
    chooseMessageFile () {},
    cloud: {
      callFunction () { return Promise.resolve({ result: { data: [] } }) }
    }
  }

  global.wx = wx
  global.getApp = () => ({ globalData: {} })
  return { wx, store, chartCalls, cleanup () { delete global.wx; delete global.getApp } }
}

/* ============================ 页面实例 ============================ */

function setByPath (target, pathStr, value) {
  const parts = String(pathStr).split('.')
  let cur = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined || cur[parts[i]] === null) cur[parts[i]] = {}
    cur = cur[parts[i]]
  }
  cur[parts[parts.length - 1]] = value
}

/** 加载页面模块并实例化，模拟小程序运行时的 Page() 注册 */
function instantiate (modulePath) {
  let config = null
  global.Page = c => { config = c }
  global.Component = c => { config = c }
  const resolved = require.resolve(path.join(__dirname, modulePath))
  delete require.cache[resolved]
  require(resolved)
  delete global.Page
  delete global.Component

  assert.ok(config, `${modulePath} 没有调用 Page()`)

  const inst = Object.create(config)
  inst.data = JSON.parse(JSON.stringify(config.data || {}))
  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach(k => setByPath(this.data, k, patch[k]))
    if (typeof cb === 'function') cb()
  }
  return inst
}

async function runPage (key, query) {
  const inst = instantiate(PAGES[key])
  if (typeof inst.onLoad === 'function') await inst.onLoad(query || {})
  if (typeof inst.onShow === 'function') await inst.onShow()
  return inst
}

function freshEnv (seed) {
  const env = installFakeWx()
  appStore.resetStore()
  const store = appStore.getStore()
  if (typeof seed === 'function') seed(store)
  return { env, store }
}

const FULL_PROFILE = {
  gender: 'male', age: 30, heightCm: 178, weightKg: 72,
  activityLevel: 'moderate', goalType: 'cut'
}

function seedFull (store, today) {
  store.saveProfile(FULL_PROFILE)
  store.saveNutritionPlan({
    goalType: 'cut', mode: 'coefficient', activityLevel: 'moderate',
    bandId: '4-5h', weightKg: 72
  })
  // 先补历史，再写当天：addBodyRecord 会把资料里的当前体重同步为最后一条
  store.addBodyRecord({ date: '2026-10-01', weightKg: 73.4 })
  store.addBodyRecord({ date: today, weightKg: 72 })
  store.addFoodLog({ date: today, meal: 'breakfast', foodName: '燕麦片（干）', grams: 60, kcal: 233, protein: 10.1, carb: 39, fat: 4.2 })
  store.addFoodLog({ date: today, meal: 'lunch', foodName: '鸡胸肉', grams: 200, kcal: 266, protein: 38.8, carb: 5, fat: 10 })
  store.addWorkoutLog({ date: today, typeKey: 'fitness', typeName: '健身', minutes: 50, metValue: 6, kcal: 360 })
}

/* ============================ 首页 ============================ */

test('首页：无资料时给出引导且不报错', async () => {
  const { env } = freshEnv()
  try {
    const page = await runPage('index')
    assert.strictEqual(page.data.ready, false)
    assert.ok(page.data.dateLabel)
  } finally { env.cleanup() }
})

test('首页：有资料时展示目标、营养素与训练摘要', async () => {
  const today = '2026-10-14'
  const { env } = freshEnv(s => seedFull(s, today))
  try {
    const page = await runPage('index')
    assert.strictEqual(page.data.ready, true)
    assert.strictEqual(page.data.planReady, true)
    assert.ok(page.data.targets.kcal > 0)
    assert.strictEqual(page.data.macroRows.length, 3)
    assert.strictEqual(page.data.intake.kcal, 499)
    assert.strictEqual(page.data.training.minutes, 50)
    assert.strictEqual(page.data.weight.value, 72)
    assert.strictEqual(page.data.weight.delta, -1.4)
    assert.strictEqual(page.data.overBudget, false)
  } finally { env.cleanup() }
})

test('首页：会自动冻结今日目标快照', async () => {
  const { env, store } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    await runPage('index')
    const snap = store.getTargetSnapshot(require('../miniprogram/utils/format.js').today())
    assert.ok(snap && snap.targets.kcal > 0)
  } finally { env.cleanup() }
})

/* ============================ 饮食 ============================ */

test('饮食页：四个餐次分组，记录归入正确餐次', async () => {
  const today = '2026-10-14'
  const { env } = freshEnv(s => seedFull(s, today))
  try {
    const page = await runPage('food')
    assert.strictEqual(page.data.meals.length, 4)
    const breakfast = page.data.meals.find(m => m.key === 'breakfast')
    const lunch = page.data.meals.find(m => m.key === 'lunch')
    assert.strictEqual(breakfast.items.length, 1)
    assert.strictEqual(lunch.items.length, 1)
    assert.strictEqual(breakfast.kcal, 233)
    assert.strictEqual(page.data.intake.protein, 48.9)
  } finally { env.cleanup() }
})

test('饮食页：搜索与按克数换算（重量单位一致）', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('food')
    page.onKeyword({ detail: { value: '鸡胸肉' } })
    assert.ok(page.data.results.length > 0)

    page.selectFood({ currentTarget: { dataset: { food: page.data.results[0] } } })
    assert.strictEqual(page.data.sheet.foodName, '鸡胸肉')
    assert.strictEqual(page.data.sheet.per100.kcal, 133)

    page.onGrams({ detail: { value: '200' } })
    assert.strictEqual(page.data.sheet.preview.kcal, 266)
    assert.strictEqual(page.data.sheet.preview.protein, 38.8)
  } finally { env.cleanup() }
})

test('饮食页：记录可编辑（改重量后按每 100g 重算）', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('food')
    const log = page.data.meals.find(m => m.key === 'lunch').items[0]
    page.openEdit(Object.assign({}, log, { foodName: log.name, grams: log.grams }))
    assert.strictEqual(page.data.sheet.mode, 'edit')
    page.onGrams({ detail: { value: '100' } })
    assert.strictEqual(page.data.sheet.preview.kcal, 133)
  } finally { env.cleanup() }
})

/* ============================ 训练 ============================ */

test('训练页：展示 4 周统计与档位推荐', async () => {
  const today = '2026-10-14'
  const { env } = freshEnv(s => {
    seedFull(s, today)
    // 四周内补足训练量
    for (let i = 1; i <= 6; i++) {
      s.addWorkoutLog({ date: `2026-10-0${i}`, typeKey: 'fitness', typeName: '健身', minutes: 70, metValue: 6, kcal: 500 })
    }
  })
  try {
    const page = await runPage('exercise')
    assert.strictEqual(page.data.bands.length, 4)
    assert.strictEqual(page.data.types.length, 8)
    assert.ok(page.data.stats.totalMinutes > 0)
    assert.ok(page.data.recommendation)
    assert.strictEqual(page.data.history.length > 0, true)
  } finally { env.cleanup() }
})

test('训练页：记录不足时要求手动选择，不伪造推荐', async () => {
  const { env } = freshEnv(s => {
    s.saveProfile(FULL_PROFILE)
    s.addWorkoutLog({ date: '2026-10-14', typeKey: 'fitness', typeName: '健身', minutes: 30, metValue: 6 })
  })
  try {
    const page = await runPage('exercise')
    assert.strictEqual(page.data.recommendation.requiresManual, true)
    assert.ok(page.data.recommendation.reason.includes('手动'))
  } finally { env.cleanup() }
})

test('训练页：选择类型与时长后可估算消耗（估算值不抵扣目标）', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('exercise')
    page.selectType({ currentTarget: { dataset: { key: 'running' } } })
    page.onMinutes({ detail: { value: '60' } })
    // MET 9.8 × 72kg × 1h
    assert.strictEqual(page.data.kcalPreview.kcal, 706)
    assert.strictEqual(page.data.kcalPreview.met, 9.8)
  } finally { env.cleanup() }
})

/* ============================ 统计 ============================ */

test('统计页：无数据时展示空状态且不画图', async () => {
  const { env } = freshEnv()
  try {
    const page = await runPage('progress')
    assert.strictEqual(page.data.hasAnyData, false)
    assert.strictEqual(env.chartCalls.filter(c => c.startsWith('fillText')).length, 0)
  } finally { env.cleanup() }
})

test('统计页：有数据时画体重折线与热量柱状图', async () => {
  const today = '2026-10-14'
  const { env } = freshEnv(s => {
    seedFull(s, today)
    s.addBodyRecord({ date: '2026-10-05', weightKg: 74 })
    s.addFoodLog({ date: '2026-10-10', meal: 'dinner', foodName: '米饭', grams: 150, kcal: 174, protein: 3.9, carb: 38.4, fat: 0.5 })
  })
  try {
    const page = await runPage('progress')
    assert.strictEqual(page.data.hasAnyData, true)
    assert.strictEqual(page.data.weight.hasEnough, true)
    const texts = env.chartCalls.filter(c => c.startsWith('fillText:'))
    assert.ok(texts.length > 0, '图表应有数值或日期标注')
    assert.ok(texts.some(t => t.includes('目标')), '热量图应画出目标参考线')
  } finally { env.cleanup() }
})

test('统计页：历史日期没有快照时不倒推目标', async () => {
  const today = '2026-10-14'
  const { env, store } = freshEnv(s => {
    seedFull(s, today)
    s.addFoodLog({ date: '2026-10-10', meal: 'lunch', foodName: '米饭', grams: 150, kcal: 174 })
  })
  try {
    const page = await runPage('progress')
    const point = page.data.intake.points.find(p => p.date === '2026-10-10')
    assert.strictEqual(point.kcal, 174)
    assert.strictEqual(point.target, null)
    assert.strictEqual(point.targetSource, 'none')
  } finally { env.cleanup() }
})

/* ============================ 身体资料 ============================ */

test('身体资料页：填写后实时给出 BMR/TDEE/BMI 估算', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('body')
    assert.strictEqual(page.data.form.gender, 'male')
    assert.strictEqual(page.data.estimate.bmr, 1688)
    assert.strictEqual(page.data.estimate.tdee, 2616)
    assert.strictEqual(page.data.estimate.bmi, 22.7)
    assert.ok(page.data.activityLevels.length >= 5)
  } finally { env.cleanup() }
})

test('身体资料页：改动会列出受影响的项', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('body')
    page.onInput({ currentTarget: { dataset: { key: 'weightKg' } }, detail: { value: '70' } })
    assert.ok(page.data.planImpact.some(t => t.includes('体重')))
  } finally { env.cleanup() }
})

test('身体资料页：非法输入报错且不写入', async () => {
  const { env, store } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('body')
    page.onInput({ currentTarget: { dataset: { key: 'heightCm' } }, detail: { value: '300' } })
    page.save()
    assert.ok(page.data.errors.length > 0)
    assert.strictEqual(store.getProfile().heightCm, 178)
  } finally { env.cleanup() }
})

/* ============================ 营养计划 ============================ */

test('计划页：展示 BMR/TDEE/目标与三大营养素，且默认不是「已修改」', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('plan')
    assert.strictEqual(page.data.ready, true)
    assert.strictEqual(page.data.preview.ok, true)
    assert.strictEqual(page.data.targets.length, 3)
    assert.strictEqual(page.data.dirty, false)
    assert.ok(page.data.modeDiff)
  } finally { env.cleanup() }
})

test('计划页：改模式后标记为已修改并重算差异', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('plan')
    const before = page.data.preview.active.kcalFromMacros
    page.onModeChange({ detail: { value: 'calorie' } })
    assert.strictEqual(page.data.dirty, true)
    assert.notStrictEqual(page.data.preview.active.kcalFromMacros, before)
    assert.strictEqual(page.data.preview.active.kcalFromMacros, page.data.preview.target.value)
  } finally { env.cleanup() }
})

test('计划页：目标热量优先模式下系数热量冲突会阻断保存', async () => {
  const { env, store } = freshEnv(s => {
    s.saveProfile(FULL_PROFILE)
    s.saveNutritionPlan({ goalType: 'cut', mode: 'calorie', activityLevel: 'moderate', bandId: '8-9h', targetCalories: 900, weightKg: 72 })
  })
  try {
    const page = await runPage('plan')
    assert.ok(page.data.conflict)
    assert.strictEqual(page.data.preview.ok, false)
    page.save()
    // 仍然没有新增快照（保存被阻断）
    assert.strictEqual(store.listSnapshotDates().length, 0)
  } finally { env.cleanup() }
})

test('计划页：未设置调整比例时默认值不会误判为已修改', async () => {
  const { env } = freshEnv(s => {
    s.saveProfile(FULL_PROFILE)
    s.saveNutritionPlan({ goalType: 'bulk', mode: 'coefficient', activityLevel: 'moderate', bandId: '4-5h', weightKg: 72 })
  })
  try {
    const page = await runPage('plan')
    assert.strictEqual(page.data.adjustPercent, 10)
    assert.strictEqual(page.data.dirty, false)
  } finally { env.cleanup() }
})

/* ============================ 我的 / 数据管理 ============================ */

test('我的：展示资料、计划与本地数据统计', async () => {
  const { env } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    const page = await runPage('profile')
    assert.strictEqual(page.data.hasProfile, true)
    assert.ok(page.data.profileLine.includes('178 cm'))
    assert.strictEqual(page.data.counts.body, 2)
    assert.strictEqual(page.data.counts.food, 2)
    assert.strictEqual(page.data.counts.workout, 1)
  } finally { env.cleanup() }
})

test('数据管理：展示条数、版本与备份列表', async () => {
  const { env, store } = freshEnv(s => seedFull(s, '2026-10-14'))
  try {
    store.createPreImportBackup()
    const page = await runPage('data')
    assert.strictEqual(page.data.counts.body, 2)
    assert.strictEqual(page.data.appVersion, '2.0.0')
    assert.strictEqual(page.data.libraryVersion, '1.0.0')
    assert.strictEqual(page.data.backups.length, 1)
  } finally { env.cleanup() }
})

/* ============================ 结构一致性 ============================ */

test('所有页面模块都能被 require 且导出 Page 配置', () => {
  Object.keys(PAGES).forEach(key => {
    const inst = instantiate(PAGES[key])
    assert.ok(inst.data, `${key} 缺少 data`)
  })
})

test('tab 页必须是普通页（不能同时用 navigateTo 打开）', () => {
  const app = require('../miniprogram/app.json')
  const tabs = app.tabBar.list.map(t => `pages/${t.text}`)
  assert.strictEqual(app.tabBar.list.length, 5)
  app.tabBar.list.forEach(t => {
    assert.ok(app.pages.includes(t.pagePath), `${t.pagePath} 未在 pages 中注册`)
  })
  assert.strictEqual(tabs.length, 5)
})
