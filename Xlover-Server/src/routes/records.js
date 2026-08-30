/**
 * 记录模块路由 - 饮食/运动/体重 + 食物库/运动库 + 喝水/睡眠打卡(check_ins) + 步数
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday, calculateBMI, calculateExerciseCalories } = require('../utils/helpers');

const router = express.Router();

/* ============================================================
 *  0. 通用：根据体重和MET计算消耗
 * ============================================================ */
/**
 * MET 消耗计算用"有效体重"：
 * 1. 今日记录体重 → 2. 近14天平均 → 3. user_profiles.current_weight → 60kg
 */
function getUserEffectiveWeight(userId) {
  const today = getToday();
  const todayRow = db.prepare('SELECT weight FROM body_records WHERE user_id = ? AND record_date = ? ORDER BY id DESC LIMIT 1').get(userId, today);
  if (todayRow && todayRow.weight) return todayRow.weight;

  const avgRow = db.prepare(
    "SELECT COALESCE(AVG(weight), 0) AS avg FROM body_records WHERE user_id = ? AND record_date >= date(?, '-14 days')"
  ).get(userId, today);
  if (avgRow && avgRow.avg > 0) return Math.round(avgRow.avg * 10) / 10;

  const p = db.prepare('SELECT current_weight FROM user_profiles WHERE user_id = ?').get(userId);
  if (p && p.current_weight) return p.current_weight;
  return 60;
}

const MET_FALLBACK_RECORDS = {
  '步行': 3.5, '走路': 3.5, '散步': 2.8, '快走': 5.0, '行走': 3.5,
  '跑步': 9.8, '慢跑': 7.0,
  '骑行': 7.5, '自行车': 7.5, '单车': 8.0,
  '游泳': 8.0, '自由泳': 9.8, '蛙泳': 6.8,
  '瑜伽': 2.5, '普拉提': 3.0, '拉伸': 2.3,
  '力量训练': 6.0, '举重': 6.0, '健身房': 6.5, '无氧': 6.0,
  '跳绳': 11.8, 'hiit': 8.0, 'HIIT': 8.0,
  '羽毛球': 5.5, '网球': 7.3, '乒乓球': 4.0, '篮球': 6.5, '足球': 7.0,
  '少女杀手是': 6.0
};
function getMetValueRecords(exerciseType, provided) {
  if (provided && provided > 0) return provided;
  if (!exerciseType) return 5.0;
  const key = String(exerciseType).trim();
  for (const [k, v] of Object.entries(MET_FALLBACK_RECORDS)) {
    if (k === key || key.includes(k)) return v;
  }
  return 5.0;
}


/* ============================================================
 *  1. 饮食记录 - 修复：写入calories_per_100g字段
 * ============================================================ */
router.get('/food', authRequired, (req, res) => {
  const date = req.query.date || getToday();
  const foods = db.prepare(
    `SELECT fl.*,
      (SELECT COUNT(*) FROM record_likes rl WHERE rl.record_id = 'food_' || fl.id) as likes,
      (SELECT COUNT(*) FROM record_comments rc WHERE rc.record_type='food' AND rc.record_id=fl.id) as comments
     FROM food_logs fl WHERE user_id = ? AND record_date = ? ORDER BY created_at DESC`
  ).all(req.user.id, date);

  const totalCalories = foods.reduce((s, f) => s + (f.calories || 0), 0);
  const totalProtein = foods.reduce((s, f) => s + (f.protein || 0), 0);
  const totalCarbs = foods.reduce((s, f) => s + (f.carbs || 0), 0);
  const totalFat = foods.reduce((s, f) => s + (f.fat || 0), 0);

  return success(res, {
    date,
    foods,
    summary: {
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein * 10) / 10,
      totalCarbs: Math.round(totalCarbs * 10) / 10,
      totalFat: Math.round(totalFat * 10) / 10
    }
  });
});

router.post('/food', authRequired, (req, res) => {
  const {
    food_name, calories_per_100g, calories, protein, carbs, fat,
    serving_size = 100, meal_type = 'lunch', record_date, food_id
  } = req.body;

  if (!food_name) return error(res, '食物名称不能为空');

  // 若选中了食物库中的 food_id，则自动拉取单位热量和营养
  let cals100 = calories_per_100g;
  let p = protein, c = carbs, fa = fat, realCals = calories;
  if (food_id) {
    const lib = db.prepare('SELECT * FROM food_library WHERE id = ?').get(food_id);
    if (lib) {
      cals100 = cals100 ?? lib.calories_per_100g;
      p = p ?? lib.protein;
      c = c ?? lib.carbs;
      fa = fa ?? lib.fat;
    }
  }
  // 如果没传总热量，按份量计算
  if (!realCals && cals100 != null) {
    const factor = (serving_size || 100) / 100;
    realCals = Math.round(cals100 * factor);
    p = (p || 0) * factor;
    c = (c || 0) * factor;
    fa = (fa || 0) * factor;
  }

  const result = db.prepare(`
    INSERT INTO food_logs
      (user_id, food_name, calories_per_100g, calories, protein, carbs, fat, serving_size, meal_type, record_date)
    VALUES (?,?,?,?,?,?,?,?,?,?)
  `).run(
    req.user.id, food_name, cals100 || 0, realCals || 0,
    Math.round((p || 0) * 10) / 10,
    Math.round((c || 0) * 10) / 10,
    Math.round((fa || 0) * 10) / 10,
    serving_size || 100, meal_type, record_date || getToday()
  );

  const food = db.prepare('SELECT * FROM food_logs WHERE id = ?').get(result.lastInsertRowid);
  return success(res, food, '饮食记录添加成功');
});

router.put('/food/:id', authRequired, (req, res) => {
  const id = req.params.id;
  const e = db.prepare('SELECT * FROM food_logs WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!e) return error(res, '记录不存在', 404);

  const { food_name, calories_per_100g, calories, protein, carbs, fat, serving_size, meal_type } = req.body;
  db.prepare(`
    UPDATE food_logs SET
      food_name = COALESCE(?, food_name),
      calories_per_100g = COALESCE(?, calories_per_100g),
      calories = COALESCE(?, calories),
      protein = COALESCE(?, protein),
      carbs = COALESCE(?, carbs),
      fat = COALESCE(?, fat),
      serving_size = COALESCE(?, serving_size),
      meal_type = COALESCE(?, meal_type)
    WHERE id = ?
  `).run(food_name, calories_per_100g, calories, protein, carbs, fat, serving_size, meal_type, id);

  return success(res, db.prepare('SELECT * FROM food_logs WHERE id = ?').get(id), '饮食记录更新成功');
});

router.delete('/food/:id', authRequired, (req, res) => {
  const r = db.prepare('DELETE FROM food_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (r.changes === 0) return error(res, '记录不存在', 404);
  return success(res, null, '饮食记录删除成功');
});

/* ============================================================
 *  2. 运动记录 - 修复：写入type_name/icon字段
 * ============================================================ */
router.get('/exercise', authRequired, (req, res) => {
  const date = req.query.date || getToday();
  const rows = db.prepare(
    `SELECT el.id, el.user_id, el.exercise_type,
       COALESCE(el.type_name, el.exercise_type) as type_name,
       COALESCE(el.icon, '🏃') as icon,
       COALESCE(el.duration, 0) as duration,
       COALESCE(el.calories_burned, 0) as calories_burned,
       COALESCE(el.met_value, 0) as met_value,
       el.record_date,
       COALESCE(el.note, '') as note,
       el.exercise_library_id,
       el.created_at,
      (SELECT COUNT(*) FROM record_likes rl WHERE rl.record_id = 'exercise_' || el.id) as likes,
      (SELECT COUNT(*) FROM record_comments rc WHERE rc.record_type='exercise' AND rc.record_id=el.id) as comments
     FROM exercise_logs el WHERE user_id = ? AND record_date = ? ORDER BY el.created_at DESC`
  ).all(req.user.id, date);

  // 修复：存量数据 calories_burned 常为 0，按 MET × 有效体重 × 时长(h) 现算
  const effWeight = getUserEffectiveWeight(req.user.id);
  const exercises = rows.map(e => {
    let burned = (e.calories_burned && e.calories_burned > 0) ? e.calories_burned : null;
    if (burned == null) {
      const met = getMetValueRecords(e.exercise_type || e.type_name, e.met_value);
      const dur = e.duration || 0;
      burned = Math.round(met * effWeight * (dur / 60));
    }
    return { ...e, calories_burned: burned };
  });

  const totalCalories = exercises.reduce((s, e) => s + (e.calories_burned || 0), 0);
  const totalDuration = exercises.reduce((s, e) => s + (e.duration || 0), 0);

  return success(res, {
    date, exercises,
    summary: { totalCalories: Math.round(totalCalories), totalDuration }
  });
});

router.post('/exercise', authRequired, (req, res) => {
  const { exercise_type, duration, calories_burned, met_value, note, record_date, exercise_library_id } = req.body;
  if (!exercise_type || !duration) return error(res, '运动类型和时长不能为空');

  // 若传了运动库ID，自动补名称/icon/MET
  let typeName = exercise_type, icon = '🏃', met = met_value;
  if (exercise_library_id) {
    const lib = db.prepare('SELECT * FROM exercise_library WHERE id = ?').get(exercise_library_id);
    if (lib) {
      typeName = lib.name; icon = lib.icon; met = met || lib.met_value;
    }
  } else {
    const lib = db.prepare('SELECT * FROM exercise_library WHERE type_key = ? LIMIT 1').get(exercise_type);
    if (lib) { typeName = lib.name; icon = lib.icon; met = met || lib.met_value; }
  }

  let burned = calories_burned;
  if (!burned && met) {
    burned = calculateExerciseCalories(getMetValueRecords(exercise_type, met), duration, getUserEffectiveWeight(req.user.id));
  }

  const result = db.prepare(`
    INSERT INTO exercise_logs
      (user_id, exercise_type, type_name, icon, duration, calories_burned, met_value, record_date, note)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(req.user.id, exercise_type, typeName, icon, duration, burned || 0, met || 0,
        record_date || getToday(), note || '');

  const exercise = db.prepare(
    `SELECT id, user_id, exercise_type,
       COALESCE(type_name, exercise_type) as type_name,
       COALESCE(icon, '🏃') as icon,
       COALESCE(duration, 0) as duration,
       COALESCE(calories_burned, 0) as calories_burned,
       COALESCE(met_value, 0) as met_value,
       record_date,
       COALESCE(note, '') as note,
       exercise_library_id,
       created_at
     FROM exercise_logs WHERE id = ?`
  ).get(result.lastInsertRowid);
  return success(res, exercise, '运动记录添加成功');
});

router.put('/exercise/:id', authRequired, (req, res) => {
  const id = req.params.id;
  const e = db.prepare('SELECT * FROM exercise_logs WHERE id = ? AND user_id = ?').get(id, req.user.id);
  if (!e) return error(res, '记录不存在', 404);
  const { exercise_type, type_name, icon, duration, calories_burned, met_value, note } = req.body;
  db.prepare(`
    UPDATE exercise_logs SET
      exercise_type = COALESCE(?, exercise_type),
      type_name = COALESCE(?, type_name),
      icon = COALESCE(?, icon),
      duration = COALESCE(?, duration),
      calories_burned = COALESCE(?, calories_burned),
      met_value = COALESCE(?, met_value),
      note = COALESCE(?, note)
    WHERE id = ?
  `).run(exercise_type, type_name, icon, duration, calories_burned, met_value, note, id);
  return success(res, db.prepare(
    `SELECT id, user_id, exercise_type,
       COALESCE(type_name, exercise_type) as type_name,
       COALESCE(icon, '🏃') as icon,
       COALESCE(duration, 0) as duration,
       COALESCE(calories_burned, 0) as calories_burned,
       COALESCE(met_value, 0) as met_value,
       record_date,
       COALESCE(note, '') as note,
       exercise_library_id,
       created_at
     FROM exercise_logs WHERE id = ?`
  ).get(id), '运动记录更新成功');
});

router.delete('/exercise/:id', authRequired, (req, res) => {
  const r = db.prepare('DELETE FROM exercise_logs WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (r.changes === 0) return error(res, '记录不存在', 404);
  return success(res, null, '运动记录删除成功');
});

/* ============================================================
 *  3. 体重记录
 * ============================================================ */
router.get('/weight', authRequired, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const records = db.prepare(
    `SELECT id, user_id, weight,
       COALESCE(bmi, 0) as bmi,
       COALESCE(body_fat, 0) as body_fat,
       record_date,
       COALESCE(note, '') as note,
       created_at
     FROM body_records WHERE user_id = ? ORDER BY record_date DESC LIMIT ?`
  ).all(req.user.id, days).reverse();
  return success(res, { records });
});

router.post('/weight', authRequired, (req, res) => {
  const { weight, note, record_date } = req.body;
  if (!weight) return error(res, '体重不能为空');

  const profile = db.prepare('SELECT height FROM user_profiles WHERE user_id = ?').get(req.user.id);
  const bmi = calculateBMI(weight, profile?.height || 170);
  const date = record_date || getToday();

  const existing = db.prepare('SELECT id FROM body_records WHERE user_id = ? AND record_date = ?').get(req.user.id, date);
  if (existing) {
    db.prepare('UPDATE body_records SET weight=?, bmi=?, note=? WHERE id=?')
      .run(weight, bmi, note || '', existing.id);
    const up = db.prepare(
      `SELECT id, user_id, weight,
         COALESCE(bmi, 0) as bmi,
         COALESCE(body_fat, 0) as body_fat,
         record_date,
         COALESCE(note, '') as note,
         created_at
       FROM body_records WHERE id = ?`
    ).get(existing.id);
    db.prepare('UPDATE user_profiles SET current_weight=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
      .run(weight, req.user.id);
    return success(res, up, '体重记录更新成功');
  }

  const result = db.prepare(`
    INSERT INTO body_records (user_id, weight, bmi, body_fat, record_date, note)
    VALUES (?, ?, ?, NULL, ?, ?)
  `).run(req.user.id, weight, bmi, date, note || '');

  const record = db.prepare(
    `SELECT id, user_id, weight,
       COALESCE(bmi, 0) as bmi,
       COALESCE(body_fat, 0) as body_fat,
       record_date,
       COALESCE(note, '') as note,
       created_at
     FROM body_records WHERE id = ?`
  ).get(result.lastInsertRowid);
  db.prepare('UPDATE user_profiles SET current_weight=?, updated_at=CURRENT_TIMESTAMP WHERE user_id=?')
    .run(weight, req.user.id);

  return success(res, record, '体重记录添加成功');
});

router.delete('/weight/:id', authRequired, (req, res) => {
  const r = db.prepare('DELETE FROM body_records WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (r.changes === 0) return error(res, '记录不存在', 404);
  return success(res, null, '体重记录删除成功');
});

/* ============================================================
 *  4. 喝水 / 睡眠打卡 (check_ins)
 * ============================================================ */
router.get('/checkins', authRequired, (req, res) => {
  const date = req.query.date || getToday();
  const rows = db.prepare(
    'SELECT * FROM check_ins WHERE user_id = ? AND date = ? ORDER BY type'
  ).all(req.user.id, date);

  const summary = { water: 0, exercise: 0, sleep: 0, diet: 0 };
  rows.forEach(r => {
    if (r.type === 'water') summary.water = r.count || 0;
    else summary[r.type] = (summary[r.type] || 0) + 1;
  });
  return success(res, { date, list: rows, summary });
});

router.post('/checkins', authRequired, (req, res) => {
  const { type = 'water', count } = req.body;
  if (!['water', 'exercise', 'sleep', 'diet'].includes(type))
    return error(res, 'type 必须是 water/exercise/sleep/diet');
  const today = getToday();

  if (type === 'water') {
    // 喝水：追加杯数，上限 = 用户自定义 water_goal（默认 8），修复用户改 12 后仍最多加 8 的 bug
    const profile = db.prepare('SELECT water_goal FROM user_profiles WHERE user_id=?').get(req.user.id);
    const goal = (profile?.water_goal && profile.water_goal > 0) ? profile.water_goal : 8;
    const existing = db.prepare(
      'SELECT * FROM check_ins WHERE user_id=? AND date=? AND type=?'
    ).get(req.user.id, today, type);
    const newCount = Math.min(goal, (existing?.count || 0) + 1);
    if (existing) {
      db.prepare('UPDATE check_ins SET count=? WHERE id=?').run(newCount, existing.id);
    } else {
      db.prepare('INSERT INTO check_ins (user_id,type,count,date) VALUES (?,?,?,?)')
        .run(req.user.id, type, newCount, today);
    }
    return success(res, { type, count: newCount }, `喝水打卡成功，今日 ${newCount} 杯`);
  }

  // 其他类型：直接插入一条打卡
  db.prepare('INSERT INTO check_ins (user_id,type,count,date) VALUES (?,?,?,?)')
    .run(req.user.id, type, count || 1, today);
  return success(res, { type, count: count || 1 }, '打卡成功');
});

// 重置今日喝水
router.post('/checkins/reset', authRequired, (req, res) => {
  const { type = 'water' } = req.body;
  const today = getToday();
  db.prepare('DELETE FROM check_ins WHERE user_id=? AND date=? AND type=?')
    .run(req.user.id, today, type);
  return success(res, null, '已重置');
});

/* ============================================================
 *  5. 步数 (werun_steps)
 * ============================================================ */
router.get('/steps', authRequired, (req, res) => {
  const date = req.query.date || getToday();
  const r = db.prepare('SELECT * FROM werun_steps WHERE user_id=? AND date=?')
    .get(req.user.id, date);
  return success(res, r || { user_id: req.user.id, steps: 0, date });
});

router.post('/steps', authRequired, (req, res) => {
  const { steps = 0, record_date } = req.body;
  const date = record_date || getToday();
  db.prepare(`
    INSERT INTO werun_steps (user_id, steps, date) VALUES (?,?,?)
    ON CONFLICT(user_id, date) DO UPDATE SET steps=excluded.steps
  `).run(req.user.id, steps, date);
  return success(res, { steps, date }, '步数已同步');
});

/* ============================================================
 *  6. 食物库 - 列表/搜索/添加自定义
 * ============================================================ */
router.get('/food-library', authRequired, (req, res) => {
  const { keyword, category, page = 1, pageSize = 50 } = req.query;
  let sql = 'SELECT * FROM food_library WHERE (is_custom = 0 OR user_id = ?)';
  const params = [req.user.id];
  if (keyword) { sql += ' AND name LIKE ?'; params.push(`%${keyword}%`); }
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY is_custom ASC, name COLLATE NOCASE LIMIT ? OFFSET ?';
  params.push(+pageSize, (+page - 1) * +pageSize);
  const list = db.prepare(sql).all(...params);

  const total = db.prepare(
    'SELECT COUNT(*) c FROM food_library WHERE (is_custom=0 OR user_id=?)' +
    (keyword ? ' AND name LIKE ?' : '') +
    (category && category !== 'all' ? ' AND category=?' : '')
  ).get(req.user.id,
       ...(keyword ? [`%${keyword}%`] : []),
       ...(category && category !== 'all' ? [category] : [])).c;

  return success(res, {
    list, pagination: { total, page: +page, pageSize: +pageSize }
  });
});

// 分类列表
router.get('/food-library/categories', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT category, COUNT(*) count FROM food_library
    WHERE is_custom = 0 GROUP BY category ORDER BY count DESC
  `).all();
  return success(res, {
    categories: [
      { key: 'staple',    name: '主食' },
      { key: 'meat',      name: '肉蛋海鲜' },
      { key: 'dairy',     name: '乳制品/豆制品' },
      { key: 'vegetable', name: '蔬菜' },
      { key: 'fruit',     name: '水果' },
      { key: 'snack',     name: '零食小吃' },
      { key: 'drink',     name: '饮品' },
      { key: 'other',     name: '其他' }
    ], counts: rows
  });
});

router.post('/food-library', authRequired, (req, res) => {
  const { name, calories_per_100g, protein = 0, carbs = 0, fat = 0, category = 'other' } = req.body;
  if (!name) return error(res, '食物名称不能为空');
  if (!calories_per_100g && calories_per_100g !== 0)
    return error(res, '每100g热量不能为空');

  const result = db.prepare(`
    INSERT INTO food_library (name, calories_per_100g, protein, carbs, fat, category, is_custom, user_id)
    VALUES (?,?,?,?,?,?,1,?)
  `).run(name, calories_per_100g, protein, carbs, fat, category, req.user.id);

  return success(res, { id: result.lastInsertRowid, name, calories_per_100g }, '自定义食物已添加');
});

/* ============================================================
 *  7. 运动库 - 列表/搜索
 * ============================================================ */
router.get('/exercise-library', authRequired, (req, res) => {
  const { keyword, category } = req.query;
  let sql = 'SELECT * FROM exercise_library WHERE 1=1';
  const params = [];
  if (keyword) { sql += ' AND name LIKE ?'; params.push(`%${keyword}%`); }
  if (category && category !== 'all') { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY category, met_value DESC';
  const list = db.prepare(sql).all(...params);
  return success(res, { list });
});

module.exports = router;


