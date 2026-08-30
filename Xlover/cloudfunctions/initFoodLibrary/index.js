const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const presetFoods = [
  { name: '米饭', calories: 116 },
  { name: '馒头', calories: 221 },
  { name: '面条', calories: 137 },
  { name: '小米粥', calories: 46 },
  { name: '鸡蛋', calories: 144 },
  { name: '牛奶', calories: 54 },
  { name: '豆浆', calories: 31 },
  { name: '面包', calories: 265 },
  { name: '包子', calories: 227 },
  { name: '油条', calories: 388 },
  { name: '煎饼', calories: 336 },
  { name: '鸡胸肉', calories: 133 },
  { name: '牛肉', calories: 125 },
  { name: '猪肉', calories: 143 },
  { name: '鱼肉', calories: 113 },
  { name: '虾', calories: 93 },
  { name: '豆腐', calories: 76 },
  { name: '西兰花', calories: 34 },
  { name: '菠菜', calories: 23 },
  { name: '生菜', calories: 15 },
  { name: '黄瓜', calories: 16 },
  { name: '西红柿', calories: 18 },
  { name: '胡萝卜', calories: 41 },
  { name: '土豆', calories: 77 },
  { name: '红薯', calories: 86 },
  { name: '玉米', calories: 112 },
  { name: '苹果', calories: 52 },
  { name: '香蕉', calories: 89 },
  { name: '橙子', calories: 47 },
  { name: '葡萄', calories: 69 },
  { name: '西瓜', calories: 30 },
  { name: '草莓', calories: 32 },
  { name: '酸奶', calories: 72 },
  { name: '坚果', calories: 607 },
  { name: '薯片', calories: 536 },
  { name: '可乐', calories: 43 },
  { name: '奶茶', calories: 65 },
  { name: '咖啡', calories: 2 },
  { name: '燕麦', calories: 377 },
  { name: '全麦面包', calories: 247 }
]

exports.main = async (event, context) => {
  try {
    const existing = await db.collection('food_library').count()
    if (existing.total > 0) {
      return { message: '食物库已存在，跳过初始化' }
    }

    const batch = []
    for (const food of presetFoods) {
      batch.push({
        name: food.name,
        calories: food.calories,
        createTime: db.serverDate()
      })
    }

    // 分批添加
    for (let i = 0; i < batch.length; i += 20) {
      const chunk = batch.slice(i, i + 20)
      for (const item of chunk) {
        await db.collection('food_library').add({ data: item })
      }
    }

    return { message: `成功初始化 ${presetFoods.length} 种食物` }
  } catch (err) {
    console.error('初始化食物库失败', err)
    return { error: err.message }
  }
}
