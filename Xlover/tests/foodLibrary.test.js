const test = require('node:test')
const assert = require('node:assert')

const lib = require('../miniprogram/utils/foodLibrary.js')
const data = require('../miniprogram/data/foodLibrary.js')

/* ============================ 数据完整性 ============================ */

test('内置食物库：136 条，6 个分类', () => {
  assert.strictEqual(lib.count(), 136)
  assert.strictEqual(data.FOOD_LIBRARY.length, 136)
  assert.deepStrictEqual(lib.categories(), ['主食', '肉蛋奶', '蔬菜', '水果', '零食', '饮品'])
  assert.strictEqual(lib.libraryVersion(), '1.0.0')
})

test('内置食物库：每条都有名称、分类、热量与三大营养素', () => {
  lib.allFoods().forEach(f => {
    assert.ok(f.name, `id=${f.id} 缺名称`)
    assert.ok(f.category, `${f.name} 缺分类`)
    assert.ok(Number.isFinite(f.kcalPer100g), `${f.name} 热量非数字`)
    ;['protein', 'carb', 'fat'].forEach(k => {
      assert.ok(Number.isFinite(f[k]), `${f.name} 的 ${k} 不是数字`)
      assert.ok(f[k] >= 0, `${f.name} 的 ${k} 为负`)
    })
    assert.strictEqual(lib.macroKcalPer100g(f) !== null, true, `${f.name} 无法反算热量`)
  })
})

test('内置食物库：id 唯一且连续', () => {
  const ids = lib.allFoods().map(f => f.id)
  assert.strictEqual(new Set(ids).size, ids.length)
  assert.deepStrictEqual(ids, ids.slice().sort((a, b) => a - b))
  assert.strictEqual(ids[0], 1)
  assert.strictEqual(ids[ids.length - 1], 136)
})

test('内置食物库：数值与云端种子一致（抽查）', () => {
  const rice = lib.getFoodById(1)
  assert.strictEqual(rice.name, '白米饭')
  assert.strictEqual(rice.kcalPer100g, 116)
  assert.strictEqual(rice.protein, 2.6)
  assert.strictEqual(rice.carb, 25.6)
  assert.strictEqual(rice.fat, 0.3)

  const milkTea = lib.allFoods()[135]
  assert.strictEqual(milkTea.name, '珍珠奶茶')
  assert.strictEqual(milkTea.kcalPer100g, 218)
})

/* ============================ 缩放 ============================ */

test('缩放：100g 白米饭等于来源每 100g 数值', () => {
  const r = lib.scaleFood(lib.getFoodById(1), 100)
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.kcal, 116)
  assert.strictEqual(r.protein, 2.6)
  assert.strictEqual(r.carb, 25.6)
  assert.strictEqual(r.fat, 0.3)
  assert.strictEqual(r.kcalBasis, 'derived')
  assert.strictEqual(r.gramsBasis, 'measured')
})

test('缩放：250g 白米饭按比例换算', () => {
  const r = lib.scaleFood(lib.getFoodById(1), 250)
  assert.strictEqual(r.kcal, 290)
  assert.strictEqual(r.protein, 6.5)
  assert.strictEqual(r.carb, 64)
  assert.strictEqual(r.fat, 0.8)
})

test('缩放：非法克数被拒绝', () => {
  const food = lib.getFoodById(1)
  assert.strictEqual(lib.scaleFood(food, 0).ok, false)
  assert.strictEqual(lib.scaleFood(food, -5).ok, false)
  assert.strictEqual(lib.scaleFood(food, 99999).ok, false)
  assert.strictEqual(lib.scaleFood(null, 100).ok, false)
})

test('缩放：营养素与热量互不覆盖，偏差过大时给出提醒', () => {
  const soy = lib.allFoods().find(f => f.name === '豆浆')
  const r = lib.scaleFood(soy, 100)
  assert.strictEqual(r.kcal, soy.kcalPer100g)
  assert.ok(r.macroMismatchPercent > 15)
  assert.ok(r.warnings.some(w => w.includes('相差')))
})

test('缩放：缺少营养素的食物只计热量并提醒', () => {
  const r = lib.scaleFood({ id: 999, name: '自制食物', category: '自定义', kcalPer100g: 100, protein: null, carb: null, fat: null }, 150)
  assert.strictEqual(r.kcal, 150)
  assert.strictEqual(r.protein, null)
  assert.ok(r.warnings.some(w => w.includes('缺少营养素')))
})

/* ============================ 检索 ============================ */

test('检索：按关键字匹配名称', () => {
  const r = lib.search({ keyword: '米' })
  assert.ok(r.total > 0)
  assert.ok(r.foods.every(f => f.name.includes('米')))
})

test('检索：按分类过滤', () => {
  const r = lib.search({ category: '水果' })
  assert.strictEqual(r.total, 24)
  assert.ok(r.foods.every(f => f.category === '水果'))
})

test('检索：合并自定义食物一起搜索', () => {
  const custom = [{ id: 'custom_1', name: '米酒', category: '自定义', kcalPer100g: 91, protein: 1.6, carb: 8, fat: 0 }]
  const r = lib.search({ keyword: '米', customFoods: custom })
  assert.ok(r.foods.some(f => f.name === '米酒'))
})

test('检索：limit 生效', () => {
  const r = lib.search({ limit: 5 })
  assert.strictEqual(r.foods.length, 5)
  assert.ok(r.total > 5)
})

/* ============================ 自定义食物 ============================ */

test('自定义食物：合法输入被规范化', () => {
  const r = lib.validateCustomFood({ name: '  自制沙拉  ', kcalPer100g: '85', protein: '3.2', carb: '6', fat: '5.1', category: '蔬菜' })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.food.name, '自制沙拉')
  assert.strictEqual(r.food.kcalPer100g, 85)
  assert.strictEqual(r.food.protein, 3.2)
  assert.strictEqual(r.food.isCustom, true)
  assert.ok(String(r.food.id).startsWith('custom_'))
})

test('自定义食物：名称、热量缺失或超范围时被拒绝', () => {
  assert.strictEqual(lib.validateCustomFood({ kcalPer100g: 100 }).ok, false)
  assert.strictEqual(lib.validateCustomFood({ name: 'x' }).ok, false)
  assert.strictEqual(lib.validateCustomFood({ name: 'x', kcalPer100g: 5000 }).ok, false)
  assert.strictEqual(lib.validateCustomFood({ name: 'x', kcalPer100g: 100, protein: 500 }).ok, false)
})

test('自定义食物：营养素可留空（按未知处理）', () => {
  const r = lib.validateCustomFood({ name: '只知热量', kcalPer100g: 120 })
  assert.strictEqual(r.ok, true)
  assert.strictEqual(r.food.protein, null)
})
