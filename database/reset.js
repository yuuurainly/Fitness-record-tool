/**
 * 一键重置脚本（使用 better-sqlite3，兼容 Node 20）
 *   1) 清空所有业务表内容 + 重置自增
 *   2) 重新填充食物库 + 运动库种子数据
 *   3) 插入 8 条初始奖品数据
 *
 * 用法：node database/reset.js
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'xlover.db');
const db = new Database(dbPath);

db.pragma('foreign_keys = OFF');
db.exec('BEGIN');

/* ================================ 1. 清空业务表 ================================ */
const tables = [
  'users','user_profiles','check_ins','body_records',
  'food_logs','food_library','exercise_library','exercise_logs',
  'werun_steps','tasks','points','point_requests',
  'rewards','reward_claims','messages','praises',
  'record_likes','record_comments','daily_likes',
  'reminders','reminder_logs','achievements'
];
tables.forEach(t => {
  try {
    const r = db.prepare(`DELETE FROM ${t} WHERE 1`).run();
    console.log(`  ✅ ${t}: 删除 ${r.changes} 行`);
  } catch (e) {
    console.log(`  ⚠️  ${t}: ${e.message}`);
  }
});
const placeholders = tables.map(() => '?').join(',');
db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...tables);
console.log('  ✅ 已重置 sqlite_sequence');

/* ================================ 2. 种子：食物库 ================================ */
const foods = [
  {name:'白米饭',calories_per_100g:116,protein:2.6,carbs:25.6,fat:0.3,category:'staple'},
  {name:'糙米饭',calories_per_100g:111,protein:2.6,carbs:23.0,fat:1.0,category:'staple'},
  {name:'白粥',calories_per_100g:46,protein:1.1,carbs:9.9,fat:0.1,category:'staple'},
  {name:'馒头',calories_per_100g:223,protein:7.0,carbs:47.0,fat:1.1,category:'staple'},
  {name:'花卷',calories_per_100g:217,protein:6.4,carbs:45.1,fat:1.0,category:'staple'},
  {name:'包子（猪肉）',calories_per_100g:227,protein:9.7,carbs:32.5,fat:6.8,category:'staple'},
  {name:'饺子（猪肉白菜）',calories_per_100g:253,protein:10.0,carbs:30.0,fat:10.0,category:'staple'},
  {name:'面条（煮）',calories_per_100g:109,protein:3.7,carbs:22.2,fat:0.4,category:'staple'},
  {name:'方便面（干）',calories_per_100g:473,protein:9.5,carbs:61.6,fat:21.1,category:'staple'},
  {name:'面包（全麦）',calories_per_100g:246,protein:13.0,carbs:41.0,fat:4.2,category:'staple'},
  {name:'面包（白）',calories_per_100g:312,protein:8.3,carbs:58.6,fat:5.1,category:'staple'},
  {name:'燕麦片',calories_per_100g:367,protein:15.0,carbs:61.0,fat:6.7,category:'staple'},
  {name:'玉米（鲜）',calories_per_100g:112,protein:4.0,carbs:22.8,fat:1.2,category:'staple'},
  {name:'红薯',calories_per_100g:99,protein:1.1,carbs:23.1,fat:0.2,category:'staple'},
  {name:'紫薯',calories_per_100g:133,protein:1.2,carbs:31.0,fat:0.2,category:'staple'},
  {name:'山药',calories_per_100g:57,protein:1.9,carbs:12.4,fat:0.2,category:'staple'},
  {name:'土豆',calories_per_100g:81,protein:2.6,carbs:17.2,fat:0.2,category:'staple'},
  {name:'莲藕',calories_per_100g:73,protein:1.9,carbs:16.4,fat:0.2,category:'staple'},
  {name:'年糕',calories_per_100g:154,protein:3.3,carbs:34.7,fat:0.6,category:'staple'},
  {name:'烧麦',calories_per_100g:230,protein:8.0,carbs:35.0,fat:6.0,category:'staple'},
  {name:'鸡胸肉',calories_per_100g:133,protein:19.4,carbs:2.5,fat:5.0,category:'meat'},
  {name:'鸡腿肉（去皮）',calories_per_100g:150,protein:21.0,carbs:0,fat:7.0,category:'meat'},
  {name:'鸡翅',calories_per_100g:194,protein:17.4,carbs:0,fat:13.6,category:'meat'},
  {name:'猪肉（瘦）',calories_per_100g:143,protein:20.3,carbs:1.5,fat:6.2,category:'meat'},
  {name:'猪肉（肥瘦）',calories_per_100g:395,protein:13.6,carbs:2.4,fat:37.0,category:'meat'},
  {name:'排骨',calories_per_100g:264,protein:18.3,carbs:0,fat:20.4,category:'meat'},
  {name:'牛肉（瘦）',calories_per_100g:106,protein:20.2,carbs:1.2,fat:2.3,category:'meat'},
  {name:'牛排',calories_per_100g:250,protein:26.0,carbs:0,fat:15.0,category:'meat'},
  {name:'羊肉（瘦）',calories_per_100g:118,protein:20.5,carbs:0,fat:3.9,category:'meat'},
  {name:'鸭肉',calories_per_100g:240,protein:15.5,carbs:0.2,fat:19.7,category:'meat'},
  {name:'鹅肉',calories_per_100g:251,protein:17.9,carbs:0,fat:19.9,category:'meat'},
  {name:'火腿肠',calories_per_100g:212,protein:14.0,carbs:15.6,fat:10.4,category:'meat'},
  {name:'培根',calories_per_100g:181,protein:22.3,carbs:2.0,fat:9.0,category:'meat'},
  {name:'腊肠',calories_per_100g:584,protein:22.0,carbs:5.5,fat:48.0,category:'meat'},
  {name:'午餐肉',calories_per_100g:554,protein:11.7,carbs:9.0,fat:46.8,category:'meat'},
  {name:'草鱼',calories_per_100g:113,protein:16.6,carbs:0,fat:5.2,category:'meat'},
  {name:'鲈鱼',calories_per_100g:105,protein:18.6,carbs:0,fat:3.4,category:'meat'},
  {name:'三文鱼',calories_per_100g:139,protein:17.2,carbs:0,fat:7.8,category:'meat'},
  {name:'带鱼',calories_per_100g:127,protein:17.7,carbs:3.1,fat:4.9,category:'meat'},
  {name:'鲫鱼',calories_per_100g:108,protein:17.1,carbs:3.8,fat:2.7,category:'meat'},
  {name:'虾',calories_per_100g:93,protein:18.6,carbs:1.5,fat:0.8,category:'meat'},
  {name:'虾仁',calories_per_100g:48,protein:10.4,carbs:0,fat:0.7,category:'meat'},
  {name:'螃蟹',calories_per_100g:103,protein:17.5,carbs:2.3,fat:2.6,category:'meat'},
  {name:'鱿鱼',calories_per_100g:84,protein:17.0,carbs:0,fat:1.4,category:'meat'},
  {name:'鸡蛋（全）',calories_per_100g:143,protein:12.8,carbs:1.5,fat:9.0,category:'dairy'},
  {name:'鸡蛋（蛋白）',calories_per_100g:60,protein:11.0,carbs:1.0,fat:0.1,category:'dairy'},
  {name:'鸡蛋（蛋黄）',calories_per_100g:322,protein:15.2,carbs:3.4,fat:26.5,category:'dairy'},
  {name:'咸鸭蛋',calories_per_100g:190,protein:12.7,carbs:6.3,fat:12.7,category:'dairy'},
  {name:'鹌鹑蛋',calories_per_100g:160,protein:12.8,carbs:2.1,fat:11.1,category:'dairy'},
  {name:'牛奶（全脂）',calories_per_100g:54,protein:3.0,carbs:3.4,fat:3.2,category:'dairy'},
  {name:'牛奶（脱脂）',calories_per_100g:31,protein:3.0,carbs:4.5,fat:0.2,category:'dairy'},
  {name:'酸奶（原味）',calories_per_100g:72,protein:2.5,carbs:9.3,fat:2.7,category:'dairy'},
  {name:'奶酪',calories_per_100g:328,protein:25.7,carbs:3.5,fat:23.5,category:'dairy'},
  {name:'豆浆',calories_per_100g:31,protein:3.0,carbs:1.2,fat:1.6,category:'dairy'},
  {name:'豆腐（北）',calories_per_100g:98,protein:12.2,carbs:1.5,fat:4.8,category:'dairy'},
  {name:'豆腐（南）',calories_per_100g:56,protein:6.2,carbs:1.8,fat:2.5,category:'dairy'},
  {name:'豆干',calories_per_100g:140,protein:16.2,carbs:5.4,fat:6.9,category:'dairy'},
  {name:'腐竹',calories_per_100g:457,protein:44.6,carbs:22.3,fat:21.7,category:'dairy'},
  {name:'白菜',calories_per_100g:17,protein:1.5,carbs:3.2,fat:0.1,category:'vegetable'},
  {name:'生菜',calories_per_100g:13,protein:1.3,carbs:2.0,fat:0.3,category:'vegetable'},
  {name:'菠菜',calories_per_100g:24,protein:2.6,carbs:3.6,fat:0.3,category:'vegetable'},
  {name:'芹菜',calories_per_100g:12,protein:0.8,carbs:2.5,fat:0.1,category:'vegetable'},
  {name:'西兰花',calories_per_100g:36,protein:4.1,carbs:4.3,fat:0.6,category:'vegetable'},
  {name:'花菜',calories_per_100g:26,protein:2.1,carbs:4.6,fat:0.2,category:'vegetable'},
  {name:'黄瓜',calories_per_100g:16,protein:0.8,carbs:2.9,fat:0.2,category:'vegetable'},
  {name:'西红柿',calories_per_100g:20,protein:0.9,carbs:4.0,fat:0.2,category:'vegetable'},
  {name:'胡萝卜',calories_per_100g:32,protein:1.0,carbs:7.7,fat:0.2,category:'vegetable'},
  {name:'白萝卜',calories_per_100g:21,protein:0.9,carbs:4.0,fat:0.1,category:'vegetable'},
  {name:'青椒',calories_per_100g:22,protein:1.0,carbs:5.4,fat:0.2,category:'vegetable'},
  {name:'茄子',calories_per_100g:23,protein:1.1,carbs:4.9,fat:0.2,category:'vegetable'},
  {name:'豆角',calories_per_100g:30,protein:2.5,carbs:5.3,fat:0.4,category:'vegetable'},
  {name:'苦瓜',calories_per_100g:19,protein:1.0,carbs:3.5,fat:0.1,category:'vegetable'},
  {name:'冬瓜',calories_per_100g:12,protein:0.4,carbs:2.6,fat:0.2,category:'vegetable'},
  {name:'南瓜',calories_per_100g:23,protein:0.7,carbs:5.3,fat:0.1,category:'vegetable'},
  {name:'丝瓜',calories_per_100g:20,protein:1.0,carbs:3.6,fat:0.2,category:'vegetable'},
  {name:'洋葱',calories_per_100g:40,protein:1.1,carbs:8.1,fat:0.2,category:'vegetable'},
  {name:'韭菜',calories_per_100g:29,protein:2.4,carbs:4.0,fat:0.4,category:'vegetable'},
  {name:'蒜薹',calories_per_100g:61,protein:2.0,carbs:12.9,fat:0.4,category:'vegetable'},
  {name:'香菇',calories_per_100g:19,protein:2.2,carbs:3.3,fat:0.3,category:'vegetable'},
  {name:'金针菇',calories_per_100g:26,protein:2.4,carbs:4.7,fat:0.4,category:'vegetable'},
  {name:'木耳（水发）',calories_per_100g:25,protein:1.5,carbs:3.4,fat:0.3,category:'vegetable'},
  {name:'海带',calories_per_100g:17,protein:1.2,carbs:2.1,fat:0.1,category:'vegetable'},
  {name:'紫菜',calories_per_100g:207,protein:26.7,carbs:22.5,fat:1.1,category:'vegetable'},
  {name:'苹果',calories_per_100g:54,protein:0.2,carbs:13.5,fat:0.2,category:'fruit'},
  {name:'香蕉',calories_per_100g:93,protein:1.4,carbs:22.0,fat:0.2,category:'fruit'},
  {name:'橙子',calories_per_100g:48,protein:0.8,carbs:11.1,fat:0.2,category:'fruit'},
  {name:'梨',calories_per_100g:44,protein:0.4,carbs:11.0,fat:0.2,category:'fruit'},
  {name:'葡萄',calories_per_100g:44,protein:0.5,carbs:10.3,fat:0.2,category:'fruit'},
  {name:'西瓜',calories_per_100g:25,protein:0.6,carbs:5.5,fat:0.1,category:'fruit'},
  {name:'草莓',calories_per_100g:32,protein:1.0,carbs:6.0,fat:0.2,category:'fruit'},
  {name:'蓝莓',calories_per_100g:57,protein:0.7,carbs:14.0,fat:0.3,category:'fruit'},
  {name:'桃子',calories_per_100g:42,protein:0.9,carbs:9.6,fat:0.2,category:'fruit'},
  {name:'李子',calories_per_100g:36,protein:0.7,carbs:7.8,fat:0.2,category:'fruit'},
  {name:'猕猴桃',calories_per_100g:61,protein:0.8,carbs:14.5,fat:0.6,category:'fruit'},
  {name:'芒果',calories_per_100g:32,protein:0.6,carbs:7.0,fat:0.2,category:'fruit'},
  {name:'菠萝',calories_per_100g:44,protein:0.5,carbs:9.5,fat:0.1,category:'fruit'},
  {name:'火龙果',calories_per_100g:55,protein:1.1,carbs:11.8,fat:0.2,category:'fruit'},
  {name:'柚子',calories_per_100g:41,protein:0.8,carbs:9.1,fat:0.2,category:'fruit'},
  {name:'柠檬',calories_per_100g:35,protein:1.1,carbs:6.2,fat:1.2,category:'fruit'},
  {name:'樱桃',calories_per_100g:46,protein:1.1,carbs:9.9,fat:0.2,category:'fruit'},
  {name:'牛油果',calories_per_100g:161,protein:2.0,carbs:7.4,fat:15.3,category:'fruit'},
  {name:'榴莲',calories_per_100g:147,protein:2.6,carbs:28.3,fat:3.3,category:'fruit'},
  {name:'椰子',calories_per_100g:241,protein:4.0,carbs:26.6,fat:12.1,category:'fruit'},
  {name:'薯片',calories_per_100g:558,protein:6.3,carbs:52.0,fat:35.0,category:'snack'},
  {name:'饼干',calories_per_100g:433,protein:9.0,carbs:70.0,fat:12.7,category:'snack'},
  {name:'巧克力',calories_per_100g:589,protein:4.3,carbs:53.4,fat:40.1,category:'snack'},
  {name:'蛋糕',calories_per_100g:347,protein:8.6,carbs:58.3,fat:5.1,category:'snack'},
  {name:'冰淇淋',calories_per_100g:207,protein:3.5,carbs:17.3,fat:13.0,category:'snack'},
  {name:'月饼',calories_per_100g:421,protein:6.0,carbs:56.0,fat:18.0,category:'snack'},
  {name:'辣条',calories_per_100g:353,protein:9.9,carbs:48.0,fat:14.4,category:'snack'},
  {name:'瓜子（葵花）',calories_per_100g:606,protein:23.9,carbs:16.7,fat:49.9,category:'snack'},
  {name:'花生',calories_per_100g:567,protein:25.0,carbs:16.0,fat:44.3,category:'snack'},
  {name:'核桃',calories_per_100g:627,protein:14.9,carbs:9.6,fat:58.8,category:'snack'},
  {name:'杏仁',calories_per_100g:578,protein:22.5,carbs:19.9,fat:50.6,category:'snack'},
  {name:'腰果',calories_per_100g:552,protein:17.3,carbs:24.0,fat:36.7,category:'snack'},
  {name:'葡萄干',calories_per_100g:299,protein:2.5,carbs:77.0,fat:0.4,category:'snack'},
  {name:'红枣',calories_per_100g:264,protein:3.2,carbs:61.6,fat:0.5,category:'snack'},
  {name:'爆米花',calories_per_100g:406,protein:9.4,carbs:68.0,fat:10.0,category:'snack'},
  {name:'泡面饼',calories_per_100g:473,protein:9.5,carbs:61.6,fat:21.1,category:'snack'},
  {name:'白开水',calories_per_100g:0,protein:0,carbs:0,fat:0,category:'drink'},
  {name:'矿泉水',calories_per_100g:0,protein:0,carbs:0,fat:0,category:'drink'},
  {name:'可乐',calories_per_100g:43,protein:0,carbs:10.6,fat:0,category:'drink'},
  {name:'可乐（零糖）',calories_per_100g:0,protein:0,carbs:0,fat:0,category:'drink'},
  {name:'橙汁',calories_per_100g:48,protein:0.7,carbs:10.1,fat:0.2,category:'drink'},
  {name:'苹果汁',calories_per_100g:46,protein:0.1,carbs:11.3,fat:0.1,category:'drink'},
  {name:'奶茶',calories_per_100g:65,protein:1.0,carbs:10.0,fat:2.5,category:'drink'},
  {name:'咖啡（黑）',calories_per_100g:2,protein:0.3,carbs:0,fat:0,category:'drink'},
  {name:'咖啡（拿铁）',calories_per_100g:42,protein:2.4,carbs:3.5,fat:2.0,category:'drink'},
  {name:'绿茶',calories_per_100g:1,protein:0.2,carbs:0,fat:0,category:'drink'},
  {name:'红茶',calories_per_100g:1,protein:0.1,carbs:0.2,fat:0,category:'drink'},
  {name:'蜂蜜水',calories_per_100g:130,protein:0.4,carbs:32.1,fat:0,category:'drink'},
  {name:'啤酒',calories_per_100g:32,protein:0.4,carbs:3.6,fat:0,category:'drink'},
  {name:'红酒',calories_per_100g:85,protein:0.1,carbs:2.6,fat:0,category:'drink'},
  {name:'白酒（52度）',calories_per_100g:302,protein:0,carbs:0,fat:0,category:'drink'},
  {name:'功能饮料（红牛）',calories_per_100g:60,protein:0,carbs:15.0,fat:0,category:'drink'},
  {name:'柠檬水',calories_per_100g:10,protein:0.2,carbs:2.5,fat:0,category:'drink'}
];
const foodStmt = db.prepare(`INSERT INTO food_library (name,calories_per_100g,protein,carbs,fat,category,is_custom,user_id) VALUES (@name,@calories_per_100g,@protein,@carbs,@fat,@category,0,NULL)`);
const insertFoods = db.transaction(arr => { arr.forEach(f => foodStmt.run(f)); });
insertFoods(foods);
console.log(`\n  ✅ 食物库：${foods.length} 条`);

/* ================================ 3. 种子：运动库 ================================ */
const exercises = [
  {type_key:'walking_slow',name:'散步（慢走）',icon:'🚶',met_value:3.0,category:'cardio'},
  {type_key:'walking_fast',name:'快走（5km/h）',icon:'🚶‍♂️',met_value:4.5,category:'cardio'},
  {type_key:'running_slow',name:'跑步（慢跑 8km/h）',icon:'🏃',met_value:8.3,category:'cardio'},
  {type_key:'running_fast',name:'跑步（快跑 10km/h）',icon:'🏃‍♂️',met_value:10.0,category:'cardio'},
  {type_key:'jogging',name:'晨跑',icon:'🏃‍♀️',met_value:8.8,category:'cardio'},
  {type_key:'cycling_slow',name:'骑自行车（慢）',icon:'🚴',met_value:4.0,category:'cardio'},
  {type_key:'cycling_fast',name:'骑行（16km/h）',icon:'🚴‍♂️',met_value:8.0,category:'cardio'},
  {type_key:'swim_freestyle',name:'自由泳',icon:'🏊',met_value:10.0,category:'cardio'},
  {type_key:'swim_breast',name:'蛙泳',icon:'🏊‍♀️',met_value:8.5,category:'cardio'},
  {type_key:'swim_leisure',name:'休闲游泳',icon:'🏝️',met_value:5.0,category:'cardio'},
  {type_key:'rope_skip',name:'跳绳',icon:'🪢',met_value:12.0,category:'cardio'},
  {type_key:'hiit',name:'HIIT 高强度间歇',icon:'🔥',met_value:12.0,category:'cardio'},
  {type_key:'aerobic_dance',name:'有氧操/健身操',icon:'💃',met_value:8.0,category:'cardio'},
  {type_key:'hiking',name:'徒步登山',icon:'🥾',met_value:7.5,category:'cardio'},
  {type_key:'badminton',name:'羽毛球',icon:'🏸',met_value:6.0,category:'cardio'},
  {type_key:'table_tennis',name:'乒乓球',icon:'🏓',met_value:5.0,category:'cardio'},
  {type_key:'tennis',name:'网球',icon:'🎾',met_value:7.0,category:'cardio'},
  {type_key:'basketball',name:'篮球',icon:'🏀',met_value:8.0,category:'cardio'},
  {type_key:'football',name:'足球',icon:'⚽',met_value:9.0,category:'cardio'},
  {type_key:'volleyball',name:'排球',icon:'🏐',met_value:5.0,category:'cardio'},
  {type_key:'squash',name:'壁球',icon:'🎾',met_value:9.0,category:'cardio'},
  {type_key:'yoga',name:'瑜伽',icon:'🧘',met_value:2.5,category:'flexibility'},
  {type_key:'stretching',name:'拉伸',icon:'🤸',met_value:2.0,category:'flexibility'},
  {type_key:'pilates',name:'普拉提',icon:'🧘‍♀️',met_value:3.5,category:'flexibility'},
  {type_key:'taichi',name:'太极拳',icon:'☯️',met_value:3.5,category:'flexibility'},
  {type_key:'gym_strength',name:'力量训练（健身房）',icon:'🏋️',met_value:6.0,category:'strength'},
  {type_key:'pushup',name:'俯卧撑',icon:'💪',met_value:5.0,category:'strength'},
  {type_key:'squat',name:'深蹲训练',icon:'🦵',met_value:6.0,category:'strength'},
  {type_key:'plank',name:'平板支撑',icon:'🧱',met_value:4.0,category:'strength'},
  {type_key:'weightlifting',name:'举重',icon:'🏋️‍♂️',met_value:8.0,category:'strength'},
  {type_key:'climb_stairs',name:'爬楼梯',icon:'🪜',met_value:8.0,category:'cardio'},
  {type_key:'dance',name:'跳舞',icon:'💃',met_value:6.0,category:'cardio'},
  {type_key:'skating',name:'轮滑/滑冰',icon:'⛸️',met_value:6.5,category:'cardio'},
  {type_key:'ski',name:'滑雪',icon:'🎿',met_value:8.0,category:'cardio'},
  {type_key:'housework',name:'家务（打扫）',icon:'🧹',met_value:3.5,category:'housework'},
  {type_key:'mopping',name:'拖地',icon:'🪣',met_value:3.0,category:'housework'},
  {type_key:'cooking',name:'做饭',icon:'👩‍🍳',met_value:2.5,category:'housework'},
  {type_key:'shopping',name:'逛街购物',icon:'🛍️',met_value:3.0,category:'housework'},
  {type_key:'childcare',name:'照顾小孩',icon:'👶',met_value:4.0,category:'housework'},
  {type_key:'standing',name:'站立工作/学习',icon:'🧍',met_value:2.0,category:'housework'},
  {type_key:'sleep',name:'睡觉（不算消耗）',icon:'😴',met_value:0.9,category:'other'},
  {type_key:'sitting',name:'久坐办公',icon:'💻',met_value:1.3,category:'other'},
  {type_key:'meditation',name:'冥想',icon:'🧘‍♂️',met_value:1.2,category:'other'}
];
const exStmt = db.prepare(`INSERT INTO exercise_library (type_key,name,icon,met_value,category) VALUES (@type_key,@name,@icon,@met_value,@category)`);
const insertEx = db.transaction(arr => { arr.forEach(e => exStmt.run(e)); });
insertEx(exercises);
console.log(`  ✅ 运动库：${exercises.length} 条`);

/* ================================ 4. 初始 8 条奖品数据 ================================ */
const rewards = [
  {creator_id:1,name:'奶茶一杯',description:'兑现一杯你喜欢的奶茶，全糖/半糖随便选~',points_cost:500,icon:'🧋'},
  {creator_id:1,name:'电影票',description:'周末一起去看一部电影，影片任选',points_cost:1500,icon:'🎬'},
  {creator_id:1,name:'按摩券30分钟',description:'肩颈放松30分钟，辛苦啦~',points_cost:1200,icon:'💆'},
  {creator_id:1,name:'小蛋糕奖励',description:'任意甜品店挑一个喜欢的小蛋糕',points_cost:600,icon:'🍰'},
  {creator_id:1,name:'睡懒觉半天',description:'周末早上不用叫我起床，想睡到几点都可以',points_cost:300,icon:'😴'},
  {creator_id:1,name:'餐厅晚餐',description:'选一家喜欢的餐厅，一起去吃晚餐',points_cost:2000,icon:'🍽️'},
  {creator_id:1,name:'鲜花一束',description:'换一束鲜花装点家里，心情会变很好',points_cost:800,icon:'💐'},
  {creator_id:1,name:'演唱会门票',description:'去看一场我们都喜欢的演唱会',points_cost:5000,icon:'🎤'}
];
const rwStmt = db.prepare(`INSERT INTO rewards (creator_id,name,description,points_cost,icon,is_active) VALUES (@creator_id,@name,@description,@points_cost,@icon,1)`);
const insertRw = db.transaction(arr => { arr.forEach(r => rwStmt.run(r)); });
insertRw(rewards);
console.log(`  ✅ 初始奖品：${rewards.length} 条`);

db.exec('COMMIT');
db.pragma('foreign_keys = ON');

console.log('\n🎉 数据库重置完成！所有用户数据已清理，种子数据 + 奖品数据已重新导入。');
try { db.close(); } catch (e) {}
