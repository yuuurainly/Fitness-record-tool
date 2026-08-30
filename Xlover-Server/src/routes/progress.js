/**
 * 进度模块路由 - 体重趋势 / 成就 / 统计
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday, calculateExerciseCalories } = require('../utils/helpers');

const router = express.Router();

/* ---------- 与 records/dashboard 保持一致的 MET 查表 & 有效体重 & 单条消耗计算 ---------- */
const MET_FALLBACK_MAP = {
  '步行': 3.5, '走路': 3.5, '散步': 2.8, '快走': 5.0, '行走': 3.5,
  '跑步': 9.8, '慢跑': 7.0,
  '骑行': 7.5, '自行车': 7.5, '单车': 8.0,
  '游泳': 8.0, '自由泳': 9.8, '蛙泳': 6.8,
  '瑜伽': 2.5, '普拉提': 3.0, '拉伸': 2.3,
  '力量训练': 6.0, '举重': 6.0, '健身房': 6.5, '无氧': 6.0,
  '跳绳': 11.8, 'hiit': 8.0, 'HIIT': 8.0,
  '羽毛球': 5.5, '网球': 7.3, '乒乓球': 4.0, '篮球': 6.5, '足球': 7.0
};
function getMetValue(exerciseType, provided) {
  if (provided && provided > 0) return provided;
  if (!exerciseType) return 5.0;
  const key = String(exerciseType).trim();
  for (const [k, v] of Object.entries(MET_FALLBACK_MAP)) {
    if (k === key || key.includes(k)) return v;
  }
  return 5.0;
}
function getUserEffectiveWeight(userId) {
  const today = getToday();
  const todayRow = db.prepare('SELECT weight FROM body_records WHERE user_id = ? AND record_date = ? ORDER BY id DESC LIMIT 1').get(userId, today);
  if (todayRow && todayRow.weight) return todayRow.weight;
  const avgRow = db.prepare("SELECT COALESCE(AVG(weight), 0) AS avg FROM body_records WHERE user_id = ? AND record_date >= date(?, '-14 days')").get(userId, today);
  if (avgRow && avgRow.avg > 0) return Math.round(avgRow.avg * 10) / 10;
  const p = db.prepare('SELECT current_weight FROM user_profiles WHERE user_id = ?').get(userId);
  if (p && p.current_weight) return p.current_weight;
  return 60;
}
/** 根据记录行重新计算单条消耗，避免存量数据 calories_burned=0 导致统计错误 */
function calcBurnedForRow(row, effectiveWeight) {
  const met = getMetValue(row.exercise_type || row.type_name, row.met_value);
  return calculateExerciseCalories(met, row.duration || 0, effectiveWeight);
}

// 1. 体重趋势
router.get('/weight', authRequired, (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const records = db.prepare(
    `SELECT weight,
       COALESCE(bmi, 0) as bmi,
       COALESCE(body_fat, 0) as body_fat,
       record_date,
       COALESCE(note, '') as note
     FROM body_records WHERE user_id = ? ORDER BY record_date DESC LIMIT ?`
  ).all(req.user.id, days).reverse();

  const profile = db.prepare(
    'SELECT current_weight, target_weight, height, start_weight FROM user_profiles WHERE user_id = ?'
  ).get(req.user.id);

  return success(res, {
    records,
    currentWeight: profile?.current_weight || 0,
    targetWeight: profile?.target_weight || 0,
    startWeight: profile?.start_weight || 0,
    height: profile?.height || 0
  });
});

// 2. 成就列表
router.get('/achievements', authRequired, (req, res) => {
  const unlocked = db.prepare(
    'SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC'
  ).all(req.user.id);

  const unlockedTypes = new Set(unlocked.map(a => a.achievement_type));
  const stats = calculateUserStats(req.user.id);

  const potential = [
    {
      achievement_type: 'first_checkin',
      title: '初次打卡',
      description: '完成第一次打卡',
      icon: '✅',
      unlocked: stats.totalCheckins > 0
    },
    {
      achievement_type: 'streak_7',
      title: '坚持一周',
      description: '连续打卡 7 天',
      icon: '🔥',
      unlocked: stats.maxStreak >= 7
    },
    {
      achievement_type: 'weight_loss_2kg',
      title: '减重达人',
      description: '累计减重 2kg',
      icon: '⚖️',
      unlocked: stats.totalWeightLost >= 2
    },
    {
      achievement_type: 'exercise_10h',
      title: '运动健将',
      description: '累计运动 10 小时',
      icon: '🏃',
      unlocked: stats.totalExerciseMinutes >= 600
    },
    {
      achievement_type: 'tasks_25',
      title: '任务达人',
      description: '完成 25 个任务',
      icon: '📋',
      unlocked: stats.completedTasks >= 25
    }
  ];

  const all = [];

  // 已解锁的成就
  unlocked.forEach(a => {
    all.push({ ...a, unlocked: true });
    unlockedTypes.add(a.achievement_type);
  });

  // 未在 achievements 表中的潜在成就（无论是否达到条件都返回）
  potential.forEach(p => {
    if (!unlockedTypes.has(p.achievement_type)) {
      all.push({ id: 0, user_id: req.user.id, ...p });
    }
  });

  return success(res, { achievements: all, stats });
});

// 3. 数据统计
router.get('/stats', authRequired, (req, res) => {
  const stats = calculateUserStats(req.user.id);
  return success(res, { data: stats });
});

/**
 * 计算用户统计数据
 * @param {number} userId
 */
function calculateUserStats(userId) {
  // ---------- 总打卡天数 & 最长连续天数 ----------
  const dateRows = db.prepare(`
    SELECT DISTINCT date
    FROM check_ins
    WHERE user_id = ?
    ORDER BY date ASC
  `).all(userId);

  const totalCheckins = dateRows.length;
  const dates = dateRows.map(r => r.date).filter(Boolean);

  let maxStreak = 0;
  if (dates.length > 0) {
    let cur = 1;
    maxStreak = 1;
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1] + 'T00:00:00');
      const curr = new Date(dates[i] + 'T00:00:00');
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        cur++;
        if (cur > maxStreak) maxStreak = cur;
      } else if (diffDays === 0) {
        // 同一天，忽略
      } else {
        cur = 1;
      }
    }
  }

  // ---------- 有效体重（按MET公式计算消耗用）----------
  const effWeight = getUserEffectiveWeight(userId);

  // ---------- 累计运动时长 / 消耗 ----------
  // 修复：不再直接信任 calories_burned（存量数据常为 0），按 MET + 时长 + 体重重新计算
  const allExercises = db.prepare(`
    SELECT exercise_type, type_name, duration, met_value, calories_burned
    FROM exercise_logs
    WHERE user_id = ?
  `).all(userId);
  let totalMin = 0, totalBurned = 0;
  for (const row of allExercises) {
    totalMin += row.duration || 0;
    totalBurned += (row.calories_burned && row.calories_burned > 0)
      ? row.calories_burned
      : calcBurnedForRow(row, effWeight);
  }

  // ---------- 累计减重 ----------
  const firstWeight = db.prepare(
    'SELECT weight FROM body_records WHERE user_id = ? ORDER BY record_date ASC, id ASC LIMIT 1'
  ).get(userId);
  const latestWeight = db.prepare(
    'SELECT weight FROM body_records WHERE user_id = ? ORDER BY record_date DESC, id DESC LIMIT 1'
  ).get(userId);
  let totalWeightLost = 0;
  if (firstWeight && latestWeight && firstWeight.weight && latestWeight.weight) {
    totalWeightLost = Math.max(0, Math.round((firstWeight.weight - latestWeight.weight) * 10) / 10);
  }

  // ---------- 完成任务数 ----------
  const completedTasks = db.prepare(`
    SELECT COUNT(*) AS count
    FROM tasks
    WHERE assignee_id = ? AND status = 'completed'
  `).get(userId).count;

  // ---------- 最新积分余额 ----------
  const pointsRecord = db.prepare(
    'SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1'
  ).get(userId);
  const totalPoints = pointsRecord?.balance || 0;

  // ---------- 最近 7 天摄入 / 消耗 ----------
  const today = new Date();
  const weekDates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    // 用本地时间取年月日，避免 toISOString 的 UTC 偏移导致日期差一天
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    weekDates.push(`${y}-${m}-${dd}`);
  }
  const weekStartStr = weekDates[0];

  const weekFoods = db.prepare(`
    SELECT COALESCE(SUM(calories), 0) AS total
    FROM food_logs
    WHERE user_id = ? AND record_date >= ?
  `).get(userId, weekStartStr);

  const weekExercises = db.prepare(`
    SELECT exercise_type, type_name, duration, met_value, calories_burned
    FROM exercise_logs
    WHERE user_id = ? AND record_date >= ?
  `).all(userId, weekStartStr);
  let weekMin = 0, weekBurned = 0;
  for (const row of weekExercises) {
    weekMin += row.duration || 0;
    weekBurned += (row.calories_burned && row.calories_burned > 0)
      ? row.calories_burned
      : calcBurnedForRow(row, effWeight);
  }

  return {
    totalCheckins,
    maxStreak,
    totalExerciseMinutes: totalMin,
    totalExerciseCalories: Math.round(totalBurned),
    totalWeightLost,
    completedTasks,
    totalPoints,
    week: {
      caloriesConsumed: Math.round(weekFoods.total || 0),
      caloriesBurned: Math.round(weekBurned),
      exerciseMinutes: weekMin
    }
  };
}

module.exports = router;

