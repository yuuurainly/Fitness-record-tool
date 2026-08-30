/**
 * 个人资料模块路由
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday, calculateBMI, calculateDailyCalories } = require('../utils/helpers');

const router = express.Router();

// 获取个人资料
router.get('/', authRequired, (req, res) => {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);

  if (!profile) {
    return error(res, '用户资料不存在', 404);
  }

  const bmi = calculateBMI(profile.current_weight, profile.height);

  // 获取伴侣信息
  let partner = null;
  if (req.user.partner_id) {
    partner = db.prepare('SELECT id, nickname, avatar, role FROM users WHERE id = ?').get(req.user.partner_id);
    if (partner) {
      const partnerProfile = db.prepare('SELECT current_weight, target_weight, height FROM user_profiles WHERE user_id = ?').get(partner.id);
      partner.currentWeight = partnerProfile?.current_weight || 0;
      partner.targetWeight = partnerProfile?.target_weight || 0;
    }
  }

  // 获取积分
  const pointsRecord = db.prepare('SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(req.user.id);

  return success(res, {
    user: {
      id: req.user.id,
      username: req.user.username,
      nickname: req.user.nickname,
      avatar: req.user.avatar,
      role: req.user.role,
      bindCode: req.user.bind_code
    },
    profile: {
      ...profile,
      id: profile.user_id,
      bmi
    },
    partner,
    points: pointsRecord?.balance || 0
  });
});

// 更新个人资料
router.put('/', authRequired, (req, res) => {
  const { nickname, avatar, gender, age, height, current_weight, target_weight, activity_level, start_weight, target_date, water_goal, activity_factor } = req.body;
  const toNull = v => (v === undefined ? null : v);

  // 更新用户表
  if (nickname !== undefined || avatar !== undefined) {
    db.prepare(`
      UPDATE users SET
        nickname = COALESCE(?, nickname),
        avatar = COALESCE(?, avatar)
      WHERE id = ?
    `).run(toNull(nickname), toNull(avatar), req.user.id);
  }

  // 更新档案表
  const existing = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  if (!existing) {
    return error(res, '用户资料不存在', 404);
  }

  const newHeight = height || existing.height;
  const newWeight = current_weight || existing.current_weight;
  const newAge = age || existing.age;
  const newGender = gender || existing.gender;
  const newActivityLevel = (activity_level !== undefined && activity_level !== null) ? activity_level : existing.activity_level;
  // activity_factor：只在显式传值且合法（≥1.0）时更新，否则保留旧值
  let newActivityFactor = existing.activity_factor;
  if (activity_factor !== undefined && activity_factor !== null) {
    const n = Number(activity_factor);
    if (!Number.isNaN(n) && n >= 1.0 && n <= 3.0) newActivityFactor = n;
  }
  // water_goal：只在显式传值且合法时更新，否则保留旧值
  let newWaterGoal = existing.water_goal;
  if (water_goal !== undefined && water_goal !== null) {
    const n = Number(water_goal);
    if (!Number.isNaN(n) && n >= 1 && n <= 20) newWaterGoal = Math.round(n);
  }

  // 重新计算每日热量目标（TDEE = BMR × 用户选的 activity_factor，数值）
  // 未选用户 daily_calorie_goal 存 NULL
  const _dc = calculateDailyCalories(newWeight, newHeight, newAge, newGender, newActivityFactor)
    || { bmr: 0, tdee: null, activityFactorSelected: false };
  const dailyCalorieGoal = (_dc.activityFactorSelected && Number.isFinite(_dc.tdee) && _dc.tdee > 0) ? _dc.tdee : null;

  db.prepare(`
    UPDATE user_profiles SET
      gender = COALESCE(?, gender),
      age = COALESCE(?, age),
      height = COALESCE(?, height),
      start_weight = COALESCE(?, start_weight),
      current_weight = COALESCE(?, current_weight),
      target_weight = COALESCE(?, target_weight),
      target_date = COALESCE(?, target_date),
      activity_level = ?,
      activity_factor = ?,
      water_goal = COALESCE(?, water_goal),
      daily_calorie_goal = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(
    toNull(gender), toNull(age), toNull(height), toNull(start_weight),
    toNull(current_weight), toNull(target_weight), toNull(target_date),
    newActivityLevel, newActivityFactor, newWaterGoal, dailyCalorieGoal, req.user.id
  );

  // 如果体重变了，添加一条体重记录
  if (current_weight && current_weight !== existing.current_weight) {
    const bmi = calculateBMI(current_weight, newHeight);
    const today = getToday();
    const existingWeight = db.prepare('SELECT id FROM body_records WHERE user_id = ? AND record_date = ?').get(req.user.id, today);
    if (existingWeight) {
      db.prepare('UPDATE body_records SET weight = ?, bmi = ? WHERE id = ?').run(current_weight, bmi, existingWeight.id);
    } else {
      db.prepare('INSERT INTO body_records (user_id, weight, bmi, record_date) VALUES (?, ?, ?, ?)')
        .run(req.user.id, current_weight, bmi, today);
    }
  }

  const updatedProfile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  const updatedUser = db.prepare('SELECT id, username, nickname, avatar, role, bind_code FROM users WHERE id = ?').get(req.user.id);
  const updatedBmi = calculateBMI(updatedProfile.current_weight, updatedProfile.height);

  return success(res, { user: updatedUser, profile: { ...updatedProfile, id: updatedProfile.user_id, bmi: updatedBmi } }, '资料更新成功');
});

// 获取积分记录
router.get('/points', authRequired, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const records = db.prepare(
    'SELECT * FROM points WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
  ).all(req.user.id, limit);

  const currentBalance = records.length > 0 ? records[0].balance : 0;

  return success(res, { records, currentBalance });
});

module.exports = router;

