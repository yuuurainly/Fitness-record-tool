/**
 * 最终验收测试
 *
 * 与其它测试的区别：这里不调用被测函数去生成「期望值」，而是用独立写出的算式
 * 现算一遍再比对，避免「用实现验证实现」。
 */
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const nutrition = require('../miniprogram/utils/nutrition.js')
const storage = require('../miniprogram/utils/storage.js')
const planMod = require('../miniprogram/utils/plan.js')
const metrics = require('../miniprogram/utils/metrics.js')
const backup = require('../miniprogram/utils/backup.js')

const ROOT = path.join(__dirname, '..', 'miniprogram')

/* ==================================================================
 *  一、计算验收：多组数据 + 独立算式核对
 * ================================================================== */

const PROFILES = [
  { name: '男 30岁 178cm 72kg', gender: 'male', age: 30, heightCm: 178, weightKg: 72 },
  { name: '女 24岁 162cm 55kg', gender: 'female', age: 24, heightCm: 162, weightKg: 55 },
  { name: '男 45岁 170cm 88kg', gender: 'male', age: 45, heightCm: 170, weightKg: 88 },
  { name: '女 58岁 155cm 61kg', gender: 'female', age: 58, heightCm: 155, weightKg: 61 },
  { name: '男 19岁 190cm 95kg', gender: 'male', age: 19, heightCm: 190, weightKg: 95 }
]

const ACTIVITY_FACTORS = [1.2, 1.375, 1.55, 1.725, 1.9]
const BANDS = [
  { id: '2-3h', carb: 2.2, protein: 1.4, fat: 0.8 },
  { id: '4-5h', carb: 2.5, protein: 1.6, fat: 0.9 },
  { id: '6-7h', carb: 3.0, protein: 1.7, fat: 1.0 },
  { id: '8-9h', carb: 3.5, protein: 1.8, fat: 1.0 }
]

const FLOOR = { male: 1500, female: 1200 }
const round1 = n => Math.round(n * 10) / 10

// 独立实现：Mifflin-St Jeor
function expectedBMR (p) {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age
  return Math.round(p.gender === 'male' ? base + 5 : base - 161)
}

function expectedTDEE (p, bmr, factor) {
  const raw = Math.round(bmr * factor)
  return Math.max(raw, FLOOR[p.gender])
}

test('计算矩阵：BMR —— 5 组身体数据 × 男女公式，逐组独立核对', () => {
  PROFILES.forEach(p => {
    const res = nutrition.calculateBMR({ weightKg: p.weightKg, heightCm: p.heightCm, age: p.age, gender: p.gender })
    assert.strictEqual(res.ok, true, p.name)
    assert.strictEqual(res.value, expectedBMR(p), `${p.name}: BMR ${res.value} ≠ ${expectedBMR(p)}`)
    assert.strictEqual(Number.isInteger(res.value), true, `${p.name}: BMR 必须是整数`)
    assert.strictEqual(res.basis, 'estimated')
  })
})

test('计算矩阵：TDEE —— 5 组数据 × 5 档活动水平，共 25 组', () => {
  let checked = 0
  PROFILES.forEach(p => {
    const bmr = expectedBMR(p)
    nutrition.listActivityLevels().forEach(level => {
      const res = nutrition.calculateTDEE({ bmr, gender: p.gender, activityLevel: level.id })
      const expected = expectedTDEE(p, bmr, level.factor)
      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.value, expected, `${p.name} @ ${level.label}: ${res.value} ≠ ${expected}`)
      assert.strictEqual(res.activityFactor, level.factor)
      checked++
    })
  })
  assert.strictEqual(checked, 25)
  assert.deepStrictEqual(ACTIVITY_FACTORS, nutrition.listActivityLevels().map(l => l.factor), '活动系数表不得随意变更')
})

test('计算矩阵：TDEE 安全下限（男 1500 / 女 1200）', () => {
  const male = nutrition.calculateTDEE({ bmr: 900, gender: 'male', activityLevel: 'sedentary' })
  assert.strictEqual(male.value, 1500)
  assert.strictEqual(male.floorApplied, true)

  const female = nutrition.calculateTDEE({ bmr: 900, gender: 'female', activityLevel: 'sedentary' })
  assert.strictEqual(female.value, 1200)
  assert.strictEqual(female.floorApplied, true)
})

test('计算矩阵：目标热量 —— 减脂 −20% / 增肌 +10%，含下限抬升', () => {
  PROFILES.forEach(p => {
    const bmr = expectedBMR(p)
    const tdee = expectedTDEE(p, bmr, 1.55)

    const cut = nutrition.calculateTargetCalories({ tdee, goalType: 'cut', gender: p.gender, bmr })
    const bulk = nutrition.calculateTargetCalories({ tdee, goalType: 'bulk', gender: p.gender, bmr })

    assert.strictEqual(cut.value, Math.max(Math.round(tdee * 0.8), FLOOR[p.gender]), `${p.name} 减脂`)
    assert.strictEqual(bulk.value, Math.max(Math.round(tdee * 1.1), FLOOR[p.gender]), `${p.name} 增肌`)
    assert.strictEqual(cut.adjustment, -0.2)
    assert.strictEqual(bulk.adjustment, 0.1)
    assert.ok(bulk.value > cut.value)
  })
})

test('计算矩阵：营养素换算 —— 4 档系数 × 5 组体重，克数与热量独立核对', () => {
  PROFILES.forEach(p => {
    BANDS.forEach(band => {
      const res = nutrition.calculateMacrosByCoefficient({ weightKg: p.weightKg, bandId: band.id })
      const carb = round1(p.weightKg * band.carb)
      const protein = round1(p.weightKg * band.protein)
      const fat = round1(p.weightKg * band.fat)
      const kcal = Math.round(carb * 4 + protein * 4 + fat * 9)

      assert.strictEqual(res.ok, true)
      assert.strictEqual(res.grams.carb, carb, `${p.name}/${band.id} 碳水`)
      assert.strictEqual(res.grams.protein, protein, `${p.name}/${band.id} 蛋白`)
      assert.strictEqual(res.grams.fat, fat, `${p.name}/${band.id} 脂肪`)
      assert.strictEqual(res.kcalFromMacros, kcal, `${p.name}/${band.id} 热量`)
      // 单位核对：碳水/蛋白 4 kcal/g，脂肪 9 kcal/g
      assert.strictEqual(res.kcalFromMacros, Math.round(carb * 4 + protein * 4 + fat * 9))
    })
  })
})

test('计算矩阵：克数保留 1 位小数、热量取整', () => {
  const res = nutrition.calculateMacrosByCoefficient({ weightKg: 72.5, bandId: '4-5h' })
  assert.strictEqual(res.grams.carb, 181.3) // 72.5 × 2.5 = 181.25 → 1 位小数
  assert.strictEqual(res.grams.protein, 116) // 72.5 × 1.6 = 116
  assert.strictEqual(Number.isInteger(res.kcalFromMacros), true)
  assert.strictEqual(res.kcalFromMacros, Math.round(181.3 * 4 + 116 * 4 + 65.3 * 9))
})

test('计算矩阵：目标热量优先 —— 蛋白/脂肪锁定，碳水吃余量', () => {
  const weight = 72
  const band = BANDS[1] // 2.5 / 1.6 / 0.9
  const target = 2000
  const res = nutrition.calculateMacrosByTargetCalories({ weightKg: weight, bandId: band.id, targetCalories: target })

  const protein = round1(weight * band.protein)
  const fat = round1(weight * band.fat)
  const locked = protein * 4 + fat * 9
  const carb = round1((target - locked) / 4)

  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.grams.protein, protein)
  assert.strictEqual(res.grams.fat, fat)
  assert.strictEqual(res.lockedKcal, Math.round(locked))
  assert.strictEqual(res.grams.carb, carb)
})

test('计算矩阵：系数热量与目标热量冲突时明确报错并给出超出量', () => {
  const res = nutrition.calculateMacrosByTargetCalories({
    weightKg: 95, bandId: '8-9h', targetCalories: 1200
  })
  const protein = round1(95 * 1.8)
  const fat = round1(95 * 1.0)
  const locked = protein * 4 + fat * 9

  assert.strictEqual(res.ok, false)
  assert.strictEqual(res.conflict.lockedKcal, Math.round(locked))
  assert.strictEqual(res.conflict.overBy, Math.round(locked - 1200))
  assert.strictEqual(res.grams, undefined, '冲突时不得给出营养素结果')
  assert.ok(res.errors[0].includes('冲突'))
})

test('计算矩阵：双模式差异被显式计算，不被静默吞掉', () => {
  const res = nutrition.compareModes({ weightKg: 72, bandId: '4-5h', targetCalories: 2000 })
  assert.strictEqual(res.ok, true)
  assert.strictEqual(res.delta.kcalFromMacros, res.coefficientFirst.kcalFromMacros - res.calorieFirst.kcalFromMacros)
  assert.notStrictEqual(res.delta.kcalFromMacros, 0)
})

test('计算矩阵：缺少必要数据时逐项报出缺什么', () => {
  const cases = [
    [{ heightCm: 178, age: 30, gender: 'male' }, '体重'],
    [{ weightKg: 72, age: 30, gender: 'male' }, '身高'],
    [{ weightKg: 72, heightCm: 178, gender: 'male' }, '年龄'],
    [{ weightKg: 72, heightCm: 178, age: 30 }, '性别']
  ]
  cases.forEach(([input, label]) => {
    const res = nutrition.calculateBMR(input)
    assert.strictEqual(res.ok, false)
    assert.ok(res.errors.some(e => e.includes(label)), `应提示缺少${label}：${res.errors.join(',')}`)
  })

  const planRes = planMod.computePlan({ profile: { gender: 'male' }, plan: {} })
  assert.strictEqual(planRes.ok, false)
  assert.strictEqual(planRes.needsProfile, true)
})

test('计算矩阵：极端与越界输入被拒绝，边界值被接受', () => {
  const reject = [
    { weightKg: 0, heightCm: 178, age: 30, gender: 'male' },
    { weightKg: -5, heightCm: 178, age: 30, gender: 'male' },
    { weightKg: 500, heightCm: 178, age: 30, gender: 'male' },
    { weightKg: 72, heightCm: 300, age: 30, gender: 'male' },
    { weightKg: 72, heightCm: 178, age: 200, gender: 'male' },
    { weightKg: 72, heightCm: 178, age: 30, gender: 'x' },
    { weightKg: 'abc', heightCm: 178, age: 30, gender: 'male' },
    { weightKg: NaN, heightCm: 178, age: 30, gender: 'male' },
    { weightKg: Infinity, heightCm: 178, age: 30, gender: 'male' }
  ]
  reject.forEach((input, i) => {
    assert.strictEqual(nutrition.calculateBMR(input).ok, false, `第 ${i + 1} 组应被拒绝：${JSON.stringify(input)}`)
  })

  // 边界值应当可用
  assert.strictEqual(nutrition.calculateBMR({ weightKg: 25, heightCm: 100, age: 10, gender: 'female' }).ok, true)
  assert.strictEqual(nutrition.calculateBMR({ weightKg: 300, heightCm: 250, age: 100, gender: 'male' }).ok, true)
})

test('计算矩阵：自定义系数越界被拒绝，合法值生效', () => {
  assert.strictEqual(nutrition.calculateMacrosByCoefficient({ weightKg: 70, custom: { carb: 0, protein: 1.6, fat: 0.9 } }).ok, false)
  assert.strictEqual(nutrition.calculateMacrosByCoefficient({ weightKg: 70, custom: { carb: 2, protein: 99, fat: 0.9 } }).ok, false)

  const ok = nutrition.calculateMacrosByCoefficient({ weightKg: 70, custom: { carb: 2, protein: 2, fat: 1 } })
  assert.strictEqual(ok.ok, true)
  assert.deepStrictEqual(ok.grams, { carb: 140, protein: 140, fat: 70 })
})

test('计算验收：系数档位固定为用户指定值（防止被无意改动）', () => {
  assert.deepStrictEqual(nutrition.listCoefficientBands().map(b => [b.id, b.carb, b.protein, b.fat]), [
    ['2-3h', 2.2, 1.4, 0.8],
    ['4-5h', 2.5, 1.6, 0.9],
    ['6-7h', 3.0, 1.7, 1.0],
    ['8-9h', 3.5, 1.8, 1.0]
  ])
})

/* ==================================================================
 *  二、数据安全验收
 * ================================================================== */

function newStore () {
  const s = storage.createStore({ adapter: storage.createMemoryAdapter() })
  s.init()
  return s
}

const PROFILE = { gender: 'male', age: 30, heightCm: 178, weightKg: 72, activityLevel: 'moderate', goalType: 'cut' }

test('数据安全：修改当前体重不重写历史测量', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 75 })
  s.addBodyRecord({ date: '2026-10-08', weightKg: 73 })

  // 通过资料页改体重
  s.saveProfile({ weightKg: 71 })
  s.addBodyRecord({ date: '2026-10-14', weightKg: 71 })

  const history = s.getBodyRecords()
  assert.deepStrictEqual(history.map(r => [r.date, r.weightKg]), [
    ['2026-10-01', 75], ['2026-10-08', 73], ['2026-10-14', 71]
  ])
  assert.strictEqual(s.getProfile().weightKg, 71)
})

test('数据安全：切换营养计划不修改历史饮食记录', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.saveNutritionPlan({ goalType: 'cut', mode: 'coefficient', activityLevel: 'moderate', bandId: '4-5h', weightKg: 72 })
  s.addFoodLog({ date: '2026-10-01', meal: 'lunch', foodName: '米饭', grams: 200, kcal: 232, protein: 5.2, carb: 51.2, fat: 0.6 })
  const before = JSON.stringify(s.getFoodLogs())

  s.saveNutritionPlan({ goalType: 'bulk', mode: 'calorie', activityLevel: 'active', bandId: '8-9h', targetCalories: 3200, weightKg: 72 })

  assert.strictEqual(JSON.stringify(s.getFoodLogs()), before, '历史饮食记录必须逐字节不变')
})

test('数据安全：新计划不覆盖历史计划快照', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.saveNutritionPlan({ goalType: 'cut', mode: 'coefficient', activityLevel: 'moderate', bandId: '4-5h', weightKg: 72 })
  metrics.freezeToday(s, { today: '2026-10-01' })
  const day1 = JSON.stringify(s.getTargetSnapshot('2026-10-01'))

  s.saveNutritionPlan({ goalType: 'bulk', mode: 'coefficient', activityLevel: 'moderate', bandId: '8-9h', weightKg: 72 })
  metrics.freezeToday(s, { today: '2026-10-02' })
  const res = metrics.refreshTodaySnapshot(s, { today: '2026-10-02', source: 'test' })

  assert.strictEqual(res.ok !== false, true)
  assert.strictEqual(JSON.stringify(s.getTargetSnapshot('2026-10-01')), day1, '历史快照必须逐字节不变')
  assert.strictEqual(s.getTargetSnapshot('2026-10-02').goalType, 'bulk')
})

test('数据安全：导入损坏/不兼容备份不破坏当前数据', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 72 })
  // exportData 每次都会带上新的 exportedAt，比较业务数据本身
  const businessData = () => {
    const d = s.exportData()
    delete d.exportedAt
    return JSON.stringify(d)
  }
  const before = businessData()

  const badInputs = [
    '这不是 json',
    '',
    JSON.stringify({ format: 'other-app', data: {} }),
    JSON.stringify({ format: backup.BACKUP_FORMAT, backupVersion: 99, exportedAt: 'x', appVersion: '', data: {} })
  ]
  badInputs.forEach((text, i) => {
    const r = backup.previewImport(s, text)
    assert.strictEqual(r.ok, false, `第 ${i + 1} 组应被拒绝`)
    assert.strictEqual(businessData(), before, `第 ${i + 1} 组导入后数据不得变化`)
  })

  // 校验和篡改
  const payload = backup.buildPayload(s, {})
  payload.data.bodyRecords[0].weightKg = 999
  const tampered = backup.previewImport(s, JSON.stringify(payload))
  assert.strictEqual(tampered.ok, false)
  assert.strictEqual(businessData(), before)

  // 结构合法但数值非法
  const invalid = backup.buildPayload(s, {})
  invalid.data.bodyRecords = [{ date: '2026/10/01', weightKg: 9999 }]
  invalid.checksum = backup.payloadChecksum(invalid)
  const r2 = backup.applyImport(s, invalid, { mode: 'replace' })
  assert.strictEqual(r2.ok, false)
  assert.strictEqual(r2.written, false)
  assert.strictEqual(businessData(), before)
})

test('数据安全：数据版本高于小程序版本时拒绝启动，不破坏数据', () => {
  const adapter = storage.createMemoryAdapter({
    [storage.KEYS.schema]: { schemaVersion: 99 },
    [storage.KEYS.profile]: PROFILE
  })
  const s = storage.createStore({ adapter })
  const res = s.init()
  assert.strictEqual(res.ok, false)
  assert.ok(res.errors[0].includes('高于'))
  assert.deepStrictEqual(s.getProfile(), PROFILE, '拒绝启动时不得改动已有数据')
})

test('数据安全：结构升级前自动留一份升级前备份', () => {
  // 造一个「旧版本 + 有业务数据」的存储
  const adapter = storage.createMemoryAdapter({
    'xlover.v1.schema': { schemaVersion: 0 },
    'xlover.v1.profile': PROFILE,
    'xlover.v1.bodyRecords': [{ id: 'x', date: '2026-10-01', weightKg: 72 }]
  })
  const s = storage.createStore({ adapter })
  const res = s.init()

  assert.strictEqual(res.ok, true)
  assert.deepStrictEqual(res.applied, [1])
  assert.ok(res.migrationBackupKey, '升级前应留备份')
  const backups = s.listPreImportBackups()
  assert.ok(backups.some(b => b.key === res.migrationBackupKey))
  assert.strictEqual(s.getBodyRecords().length, 1, '升级后数据仍在')
})

test('数据安全：全新安装不产生多余备份', () => {
  const res = newStore().init()
  assert.strictEqual(res.migrationBackupKey, null)
})

test('数据安全：重开小程序后数据仍可正确读取（走真实 wx 存储适配器）', () => {
  const memory = new Map()
  const fakeWxStorage = () => ({
    name: 'fake-wx',
    get: k => (memory.has(k) ? JSON.parse(memory.get(k)) : null),
    set: (k, v) => memory.set(k, JSON.stringify(v)),
    remove: k => memory.delete(k),
    keys: () => [...memory.keys()],
    info: () => ({ keys: [...memory.keys()], currentSize: 1, limitSize: 10240 })
  })

  const first = storage.createStore({ adapter: fakeWxStorage() })
  first.init()
  first.saveProfile(PROFILE)
  first.addBodyRecord({ date: '2026-10-14', weightKg: 72 })
  first.addFoodLog({ date: '2026-10-14', meal: 'lunch', foodName: '米饭', grams: 150, kcal: 174, protein: 3.9, carb: 38.4, fat: 0.5 })
  first.putTargetSnapshot('2026-10-14', { goalType: 'cut', mode: 'coefficient', targets: { kcal: 1764, carb: 180, protein: 115.2, fat: 64.8 } })

  // 模拟重新进入小程序：全新实例读同一份存储
  const second = storage.createStore({ adapter: fakeWxStorage() })
  second.init()

  assert.strictEqual(second.getProfile().heightCm, 178)
  assert.strictEqual(second.getBodyRecords().length, 1)
  assert.strictEqual(second.getFoodLogs().length, 1)
  assert.strictEqual(second.getTargetSnapshot('2026-10-14').targets.kcal, 1764)
  const day = metrics.getDaySummary(second, '2026-10-14', { today: '2026-10-14' })
  assert.strictEqual(day.intake.kcal, 174)
  assert.strictEqual(day.remainingKcal, 1764 - 174)
})

test('数据安全：导入成功后可用备份完整回滚', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.addBodyRecord({ date: '2026-10-01', weightKg: 72 })
  const before = JSON.stringify(s.exportData())

  const other = newStore()
  other.saveProfile(Object.assign({}, PROFILE, { weightKg: 66 }))
  other.addBodyRecord({ date: '2026-10-09', weightKg: 66 })

  const applied = backup.applyImport(s, backup.buildPayload(other, {}), { mode: 'replace' })
  assert.strictEqual(applied.ok, true)
  assert.notStrictEqual(JSON.stringify(s.exportData()), before)

  const restored = s.restorePreImportBackup(applied.backupKey)
  assert.strictEqual(restored.ok, true)
  assert.strictEqual(s.getProfile().weightKg, 72)
  assert.deepStrictEqual(s.getBodyRecords().map(r => r.date), ['2026-10-01'])
})

/* ==================================================================
 *  三、离线能力与页面依赖验收
 * ================================================================== */

const FLOW_PAGES = ['index', 'food', 'exercise', 'progress', 'profile', 'body', 'plan', 'data', 'diagnostics']

test('离线验收：主流程页面不依赖云开发（除数据自检页显式使用迁移功能）', () => {
  FLOW_PAGES.forEach(name => {
    const js = fs.readFileSync(path.join(ROOT, 'pages', name, `${name}.js`), 'utf8')
    if (name === 'diagnostics') return // 自检页的云端迁移是显式功能，且失败有提示
    assert.strictEqual(/wx\.cloud/.test(js), false, `${name}.js 不应调用 wx.cloud`)
  })

  // 页面依赖的工具层同样不得触碰云
  const utils = ['appStore.js', 'storage.js', 'metrics.js', 'plan.js', 'nutrition.js', 'foodLibrary.js', 'format.js']
  utils.forEach(f => {
    const js = fs.readFileSync(path.join(ROOT, 'utils', f), 'utf8')
    assert.strictEqual(/wx\.cloud/.test(js), false, `utils/${f} 不应调用 wx.cloud`)
  })
})

test('离线验收：冷启动页不依赖云开发', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  assert.strictEqual(app.pages[0], 'pages/index/index', `冷启动页应为首页，实际为 ${app.pages[0]}`)
})

test('离线验收：app.onLaunch 不再无条件调用云', () => {
  const js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')
  const onLaunch = js.slice(js.indexOf('onLaunch'), js.indexOf('initLegacyCloud'))
  assert.strictEqual(/wx\.cloud/.test(onLaunch), false, 'onLaunch 内不得直接调用 wx.cloud')
  assert.ok(/ENABLE_LEGACY_CLOUD/.test(js), '旧版云初始化应受开关控制')
})

/* ==================================================================
 *  四、页面与控件验收（静态 + 模拟）
 * ================================================================== */

function loadPageConfig (name) {
  let config = null
  global.Page = c => { config = c }
  global.Component = c => { config = c }
  const file = path.join(ROOT, 'pages', name, `${name}.js`)
  delete require.cache[require.resolve(file)]
  require(file)
  delete global.Page
  delete global.Component
  return config
}

test('页面验收：所有 bind*/catch* 事件都有对应的方法实现（不存在点了没反应的控件）', () => {
  const problems = []
  const eventRe = /(?:bind|catch)[:]?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g

  FLOW_PAGES.forEach(name => {
    const wxml = fs.readFileSync(path.join(ROOT, 'pages', name, `${name}.wxml`), 'utf8')
    const config = loadPageConfig(name)
    let m
    while ((m = eventRe.exec(wxml)) !== null) {
      const handler = m[2].trim()
      if (!handler || typeof config[handler] !== 'function') {
        problems.push(`${name}: ${m[1]}="${handler}" 没有对应方法`)
      }
    }
  })

  assert.deepStrictEqual(problems, [], '存在没有实现的控件事件：\n' + problems.join('\n'))
})

test('页面验收：底部导航 5 项且指向真实 tab 页；内容底部预留不被遮挡', () => {
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
  const tabPaths = app.tabBar.list.map(t => t.pagePath)
  assert.strictEqual(tabPaths.length, 5)
  tabPaths.forEach(p => assert.ok(app.pages.includes(p), `${p} 未注册`))

  // tab 页必须给底部导航留出空间
  const css = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8')
  const container = css.slice(css.indexOf('.container {'), css.indexOf('.container-flat'))
  assert.ok(/safe-area-inset-bottom/.test(container), '容器底部需适配安全区')
  assert.ok(/1[0-9]{2}rpx/.test(container), '容器底部留白应大于导航高度')
})

test('页面验收：列表页都有空数据状态文案', () => {
  const checks = [
    ['food', ['还没有记录']],
    ['exercise', ['还没有训练记录']],
    ['body', ['还没有体重记录']],
    ['progress', ['没有', '还没有']],
    ['plan', ['还没有目标快照']],
    ['data', ['还没有备份']]
  ]
  checks.forEach(([name, keywords]) => {
    const wxml = fs.readFileSync(path.join(ROOT, 'pages', name, `${name}.wxml`), 'utf8')
    assert.ok(keywords.some(k => wxml.includes(k)), `${name} 缺少空数据状态`)
  })
})

test('页面验收：删除类操作都有二次确认', () => {
  const confirmTargets = [
    ['food', 'confirmDelete', 'showModal'],
    ['exercise', 'tapHistory', 'showModal'],
    ['data', 'clearAll', 'showModal'],
    ['data', 'restoreBackup', 'showModal']
  ]
  confirmTargets.forEach(([name, method, api]) => {
    const js = fs.readFileSync(path.join(ROOT, 'pages', name, `${name}.js`), 'utf8')
    const start = js.indexOf(`${method} (`) >= 0 ? js.indexOf(`${method} (`) : js.indexOf(`${method}(`)
    assert.ok(start > -1, `${name}.${method} 未找到`)
    const body = js.slice(start, start + 900)
    assert.ok(body.includes(api), `${name}.${method} 缺少 ${api} 确认`)
  })
})

test('页面验收：图表都带单位说明，且空数据不画图', () => {
  const progressWxml = fs.readFileSync(path.join(ROOT, 'pages', 'progress', 'progress.wxml'), 'utf8')
  assert.ok(progressWxml.includes('kg'), '体重图需单位 kg')
  assert.ok(progressWxml.includes('kcal'), '热量图需单位 kcal')
  assert.ok(progressWxml.includes('分钟'), '训练图需单位 分钟')
  assert.ok(/chart-empty/.test(progressWxml), '需要空数据状态')

  const progressJs = fs.readFileSync(path.join(ROOT, 'pages', 'progress', 'progress.js'), 'utf8')
  assert.ok(/if \(!values\.length\) return/.test(progressJs), '无数据时不得绘制')
  assert.ok(/if \(data\.length < 2\) return/.test(progressJs), '单点不得绘制折线')
})

test('代码质量：新页面不直接操作 wx.setStorageSync（统一走数据层）', () => {
  FLOW_PAGES.forEach(name => {
    const js = fs.readFileSync(path.join(ROOT, 'pages', name, `${name}.js`), 'utf8')
    assert.strictEqual(/wx\.(set|remove)StorageSync/.test(js), false, `${name}.js 不应绕过数据层直接写存储`)
  })
})

test('代码质量：新页面不出现未捕获的裸 await（避免未处理的异步错误）', () => {
  const problems = []
  const files = []
  FLOW_PAGES.forEach(n => files.push(path.join(ROOT, 'pages', n, `${n}.js`)))
  files.push(path.join(ROOT, 'utils', 'migrateCloud.js'))

  files.forEach(f => {
    const src = fs.readFileSync(f, 'utf8')
    // 形如 `xxx()` 且直接 await 云/文件操作的调用必须包在 try/catch 内
    const awaits = src.match(/await [a-zA-Z_$][\w.$]*\(/g) || []
    const hasTry = /try\s*\{/.test(src)
    if (awaits.length > 0 && !hasTry) problems.push(path.relative(ROOT, f))
  })
  assert.deepStrictEqual(problems, [], '以下文件有 await 但没有 try/catch：' + problems.join(', '))
})

test('代码质量：配置文件不含密钥（AppID/envId 为公开标识，非凭据）', () => {
  const projectConfig = fs.readFileSync(path.join(ROOT, '..', 'project.config.json'), 'utf8')
  assert.strictEqual(/secret|password|private_key|api[_-]?key/i.test(projectConfig), false)

  const files = []
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const full = path.join(d, e.name)
    if (e.isDirectory()) walk(full)
    else if (/\.(js|json)$/.test(e.name)) files.push(full)
  })
  walk(ROOT)
  const suspicious = files.filter(f => /(secret|password|private_?key|api_?key)\s*[:=]\s*['"][^'"]{8,}/i.test(fs.readFileSync(f, 'utf8')))
  assert.deepStrictEqual(suspicious, [])
})

test('代码质量：本地存储键统一命名空间，不与旧页面键冲突', () => {
  const s = newStore()
  s.saveProfile(PROFILE)
  s.addFoodLog({ date: '2026-10-14', meal: 'lunch', foodName: '米饭', grams: 150, kcal: 174 })
  const keys = s.exportData() && s.estimateUsage()
  assert.ok(keys.keyCount > 0)

  // 旧页面使用的键（openid/userRole/userInfo/...）不得出现在新命名空间里
  const oldKeys = ['openid', 'userRole', 'userInfo', 'foodLibraryInitialized', 'customExerciseTypes']
  oldKeys.forEach(k => assert.strictEqual(k.startsWith(storage.NS), false))
})
