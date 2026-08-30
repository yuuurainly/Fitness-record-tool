/**
 * 首页 Dashboard 路由
 * 修复Bug：
 * 1. 连续打卡天数：从 check_ins DISTINCT date 遍历算最长连续天数 streakDays，以及今日是否打卡
 * 2. startWeight 用 profile.start_weight（而非 current_weight），为0或null则fallback到current_weight
 * 3. 新增 pendingReviews（伴侣视角待审核point_requests）和 pendingPointRequests（主角视角自己待审核）
 *    新增 partnerReviewedToday（今天伴侣是否给daily_likes）
 *    新增 waterToday / sleepToday（今日check_ins的water杯数和sleep打卡次数）
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday, calculateBMI, calculateDailyCalories } = require('../utils/helpers');

const router = express.Router();

/**
 * Science-based "daily max net calories" (displayed as 每日最高 on Home).
 * - TDEE via Mifflin-St Jeor * activity factor (calculateDailyCalories helper)
 * - 500 kcal deficit if targetWeight < currentWeight (≈-0.5kg/week, WHO safe)
 * - Safety floor: men 1500 / women 1200 kcal to avoid metabolic slowdown
 */
/**
 * 获取用于 MET 消耗计算的有效体重。
 * 规则：
 *   1. 优先今日记录体重
 *   2. 否则近14天平均体重
 *   3. 兜底 user_profiles.current_weight / 60 kg
 */
function getUserEffectiveWeight(userId, today) {
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

const MET_FALLBACK_MAP = {
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
function getMetValue(exerciseType, provided) {
  if (provided && provided > 0) return provided;
  if (!exerciseType) return 5.0;
  const key = String(exerciseType).trim();
  for (const [k, v] of Object.entries(MET_FALLBACK_MAP)) {
    if (k === key || key.includes(k)) return v;
  }
  return 5.0;
}

// TDEE 计算：dailyMaxCalories = BMR × 用户选的 activity_factor（数值）
// 未选用户 → tdee = null，activityFactorSelected = false，前端隐藏进度条并显示"选择活动水平"
function calcDailyMaxCalories({ weight, height, age, gender, activityFactor }) {
  const { bmr, tdee, activityFactorSelected } = calculateDailyCalories(
    weight || 60, height || 170, age || 25, gender || 'female', activityFactor
  );
  // 未选活动水平：tdee / dailyMaxCalories 都为 null，不兜底填默认值（用户要隐藏进度条）
  if (!activityFactorSelected || tdee == null) {
    return { bmr, tdee: null, dailyMaxCalories: null, activityFactorSelected: false };
  }
  const minSafe = (gender === 'male') ? 1500 : 1200;
  const dailyMax = Math.max(minSafe, tdee);
  return { bmr, tdee, dailyMaxCalories: Math.round(dailyMax), activityFactorSelected: true };
}

/**
 * 计算最长连续打卡天数
 * dates: 已排序的日期字符串数组（升序 YYYY-MM-DD）
 */
function calcMaxStreak(dates) {
  if (!dates || dates.length === 0) return 0;
  let maxStreak = 1;
  let currentStreak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else if (diffDays === 0) {
      // 同一天跳过
      continue;
    } else {
      currentStreak = 1;
    }
  }
  return maxStreak;
}

/**
 * 获取首页 Dashboard 数据
 */
router.get('/', authRequired, (req, res) => {
  const userId = req.user.id;
  const today = getToday();

  // 用户档案
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);

  /* ========== Bug#1 修复：从 check_ins 取 DISTINCT date 算 streakDays 和 checkedInToday ========== */
  const distinctDates = db.prepare(
    "SELECT DISTINCT date FROM check_ins WHERE user_id = ? ORDER BY date ASC"
  ).all(userId).map(r => r.date);
  const streakDays = calcMaxStreak(distinctDates);
  const checkedInToday = distinctDates.includes(today);

  // 今日饮食
  const todayFoods = db.prepare(
    'SELECT * FROM food_logs WHERE user_id = ? AND record_date = ? ORDER BY created_at'
  ).all(userId, today);
  const consumedCalories = todayFoods.reduce((sum, f) => sum + (f.calories || 0), 0);

  // 今日运动
  const todayExercises = db.prepare(
    'SELECT * FROM exercise_logs WHERE user_id = ? AND record_date = ? ORDER BY created_at'
  ).all(userId, today);
  // 消耗 kcal 按用户要求改 MET 法：kcal = MET × 有效体重(kg) × 时长(h)
  // 有效体重：今日记录体重 → 近14天平均 → user_profiles.current_weight → 60
  const effectiveWeight = getUserEffectiveWeight(userId, today);
  const burnedCalories = todayExercises.reduce((sum, e) => {
    const met = getMetValue(e.exercise_type, e.met_value);
    const dur = e.duration || 0;
    const kcal = Math.round(met * effectiveWeight * (dur / 60));
    const burned = (e.calories_burned && e.calories_burned > 0) ? e.calories_burned : kcal;
    return sum + burned;
  }, 0);

  // 今日体重记录：仅取 body_records WHERE record_date = today
  // 当日有记录 → currentWeight = 记录值（数值）
  // 当日无记录 → currentWeight = null，前端显示"今日体重待记录"
  const todayWeightRow = db.prepare(
    `SELECT weight,
       COALESCE(bmi, 0) as bmi
     FROM body_records WHERE user_id = ? AND record_date = ? ORDER BY id DESC LIMIT 1`
  ).get(userId, today);
  const todayHasWeightRecord = !!todayWeightRow;
  const currentWeightForDisplay = todayHasWeightRecord ? todayWeightRow.weight : null;
  // fallback 用 profile.current_weight（历史最新）供 BMI 与 减重进度计算，展示层不用这个
  const lastKnownWeight = profile?.current_weight || todayWeightRow?.weight || 70;
  const targetWeight = profile?.target_weight || 65;

  // —— 起始体重 startWeight = profile.start_weight（首次引导填写的 current_weight，资料编辑可改）
  // 若仍为 0/null（老账号迁移期），fallback 到 profile.current_weight（首次建档时的体重）
  const rawStartWeight = profile?.start_weight;
  const startWeight = (rawStartWeight && rawStartWeight > 0) ? rawStartWeight : (profile?.current_weight || lastKnownWeight);

  const lostWeight = Math.max(0, Math.round((startWeight - lastKnownWeight) * 10) / 10);
  const totalToLose = Math.max(0.1, startWeight - targetWeight);
  const weightProgress = Math.min(100, Math.round((lostWeight / totalToLose) * 100));
  const bmi = calculateBMI(lastKnownWeight, profile?.height || 170);

  // —— 科学计算每日最高净摄入量（真正的"每日最高"红线）
  // TDEE = BMR × 用户选的 activity_factor（数值）；未选则返回 null 不兜底
  const _calc = calcDailyMaxCalories({
    weight: lastKnownWeight,
    height: profile?.height,
    age: profile?.age,
    gender: profile?.gender,
    activityFactor: profile?.activity_factor
  }) || { bmr: 0, tdee: null, dailyMaxCalories: null, activityFactorSelected: false };
  const bmr = (Number.isFinite(_calc.bmr) && _calc.bmr > 0) ? _calc.bmr : 0;
  const activityFactorSelected = _calc.activityFactorSelected === true;
  // 未选用户：tdee / dailyMaxCalories 均为 null（不填默认值），前端据此隐藏进度条
  const tdee = activityFactorSelected && Number.isFinite(_calc.tdee) && _calc.tdee > 0 ? _calc.tdee : null;
  const dailyMaxCalories = activityFactorSelected && Number.isFinite(_calc.dailyMaxCalories) && _calc.dailyMaxCalories > 0 ? _calc.dailyMaxCalories : null;
  const calorieGoal = dailyMaxCalories; // 对外的 goal 用"最高红线"，进度条用这个（未选=null）
  const netCalories = consumedCalories - burnedCalories;
  // 进度：未选活动水平或 goal 无效时 progress=0（前端直接隐藏进度条）
  const calorieProgress = calorieGoal != null && calorieGoal > 0
    ? Math.min(100, Math.round((netCalories / calorieGoal) * 100))
    : 0;

  // 伴侣信息
  let partner = null;
  if (req.user.partner_id) {
    partner = db.prepare(
      'SELECT id, username, nickname, avatar, role FROM users WHERE id = ?'
    ).get(req.user.partner_id);
    if (partner) {
      const partnerProfile = db.prepare('SELECT current_weight, target_weight FROM user_profiles WHERE user_id = ?').get(partner.id);
      const partnerTodayFoods = db.prepare('SELECT COALESCE(SUM(calories),0) as total FROM food_logs WHERE user_id = ? AND record_date = ?').get(partner.id, today);
      const partnerTodayExercises = db.prepare('SELECT COALESCE(SUM(calories_burned),0) as total FROM exercise_logs WHERE user_id = ? AND record_date = ?').get(partner.id, today);
      partner.currentWeight = partnerProfile?.current_weight || 0;
      partner.targetWeight = partnerProfile?.target_weight || 0;
      partner.todayConsumed = partnerTodayFoods?.total || 0;
      partner.todayBurned = partnerTodayExercises?.total || 0;
      // 伴侣今日是否打卡
      const partnerCheckin = db.prepare(
        'SELECT 1 FROM check_ins WHERE user_id = ? AND date = ? LIMIT 1'
      ).get(partner.id, today);
      partner.checkedInToday = !!partnerCheckin;
    }
  }

  // 待表扬数量（伴侣发给我的未查看表扬）
  const pendingPraises = db.prepare(
    'SELECT COUNT(*) as count FROM praises WHERE receiver_id = ? AND is_viewed = 0'
  ).get(userId).count;

  // 今日未完成任务数（status != completed 且不是 rejected），前端"任务"卡片要显示的未完成数字
  const pendingTaskCount = db.prepare(
    `SELECT COUNT(*) as count FROM tasks
     WHERE assignee_id = ?
       AND status != 'completed'
       AND status != 'rejected'
       AND (COALESCE(due_date,'') = '' OR due_date = ?)`
  ).get(userId, today).count;

  // 保持兼容老字段：pendingTasks = 原"待接受"pending 数量
  const pendingTasks = db.prepare(
    "SELECT COUNT(*) as count FROM tasks WHERE assignee_id = ? AND status = 'pending'"
  ).get(userId).count;

  /* ========== Bug#3 新增：pendingReviews / pendingPointRequests / partnerReviewedToday ========== */
  // 伴侣视角下：待审核的 point_requests 数量
  let pendingReviews = 0;
  if (req.user.role === 'partner') {
    pendingReviews = db.prepare(
      "SELECT COUNT(*) as count FROM point_requests WHERE status = 'pending'"
    ).get().count;
  }

  // 主角视角：自己的待审核申请数
  let pendingPointRequests = 0;
  if (req.user.role === 'main') {
    pendingPointRequests = db.prepare(
      "SELECT COUNT(*) as count FROM point_requests WHERE user_id = ? AND status = 'pending'"
    ).get(userId).count;
  }

  // partnerReviewedToday：今天伴侣是否给 daily_likes
  // 若是主角：看 from_user_id = partner_id, target_user_id = 我, record_date = today
  // 若是伴侣：看 from_user_id = 我, target_user_id = partner_id, record_date = today
  let partnerReviewedToday = false;
  if (req.user.partner_id) {
    const fromId = req.user.role === 'partner' ? req.user.id : req.user.partner_id;
    const toId = req.user.role === 'partner' ? req.user.partner_id : req.user.id;
    const like = db.prepare(
      'SELECT 1 FROM daily_likes WHERE from_user_id = ? AND target_user_id = ? AND record_date = ? LIMIT 1'
    ).get(fromId, toId, today);
    partnerReviewedToday = !!like;
  }

  /* ========== 新增：waterToday / sleepToday ========== */
  // 今日 water 杯数：SUM(count) of type='water'
  const waterRow = db.prepare(
    "SELECT COALESCE(SUM(count),0) as total FROM check_ins WHERE user_id = ? AND type = 'water' AND date = ?"
  ).get(userId, today);
  const waterToday = waterRow?.total || 0;

  // 今日 sleep 打卡次数：COUNT(type='sleep')
  const sleepRow = db.prepare(
    "SELECT COUNT(*) as total FROM check_ins WHERE user_id = ? AND type = 'sleep' AND date = ?"
  ).get(userId, today);
  const sleepToday = sleepRow?.total || 0;

  // 近7天体重趋势
  const weightTrend = db.prepare(
    `SELECT weight,
       COALESCE(bmi, 0) as bmi,
       record_date
     FROM body_records WHERE user_id = ? ORDER BY record_date DESC LIMIT 7`
  ).all(userId).reverse();

  return success(res, {
    user: {
      id: req.user.id,
      username: req.user.username,
      nickname: req.user.nickname,
      avatar: req.user.avatar,
      role: req.user.role,
      streakDays,
      checkedInToday
    },
    profile: {
      height: profile?.height || 170,
      // null = 今日没记录，前端显示"今日体重待记录"
      currentWeight: currentWeightForDisplay,
      targetWeight,
      startWeight,
      bmi,
      bmr: (Number.isFinite(bmr) && bmr > 0) ? bmr : 0,  // 基础代谢率 BMR
      // TDEE（维持所需总消耗）：未选活动水平=null，不填默认值（前端显示"选择活动水平"）
      dailyCalorieGoal: activityFactorSelected && Number.isFinite(tdee) && tdee > 0 ? tdee : null,
      // 每日最高摄入 = TDEE：未选活动水平=null，前端据此隐藏卡路里进度条
      dailyMaxCalories: activityFactorSelected && Number.isFinite(dailyMaxCalories) && dailyMaxCalories > 0 ? dailyMaxCalories : null,
      waterGoal: profile?.water_goal || 8,              // 用户每日喝水目标杯数
      // 活动水平：档位（sedentary/light/moderate/active/very_active）、系数（1.2~1.9）、是否已选
      activityLevel: profile?.activity_level || null,
      activityFactor: (profile?.activity_factor && Number.isFinite(profile.activity_factor)) ? profile.activity_factor : null,
      activityFactorSelected
    },
    todayCalories: {
      consumed: Math.round(consumedCalories),
      burned: Math.round(burnedCalories),
      // goal = dailyMaxCalories（红线）：未选=null
      goal: calorieGoal,
      net: Math.round(netCalories),
      progress: calorieProgress
    },
    todayFoods: todayFoods.map(f => ({
      id: f.id,
      name: f.food_name,
      calories: Math.round(f.calories),
      mealType: f.meal_type,
      time: f.created_at?.substring(11, 16) || '',
      protein: f.protein,
      carbs: f.carbs,
      fat: f.fat
    })),
    todayExercises: todayExercises.map(e => {
      // 修复：存量数据 calories_burned 常为 0，按 MET × 有效体重 × 时长(h) 兜底计算
      let burned;
      if (e.calories_burned && e.calories_burned > 0) {
        burned = Math.round(e.calories_burned);
      } else {
        const met = getMetValue(e.exercise_type, e.met_value);
        const dur = e.duration || 0;
        burned = Math.round(met * effectiveWeight * (dur / 60));
      }
      return {
        id: e.id,
        name: e.exercise_type,
        duration: e.duration,
        calories: burned,
        icon: e.icon || '🏃',
        metValue: e.met_value
      };
    }),
    weightProgress: {
      // 进度用 lastKnownWeight（历史最新），避免今天没记录就显示已减重
      current: lastKnownWeight,
      target: targetWeight,
      start: startWeight,
      lost: lostWeight,
      percentage: weightProgress,
      // 给前端独立字段：今日是否已记录体重 & 记录值（当前体重"今日体重待记录"判断用）
      todayWeightRecorded: todayHasWeightRecord,
      todayWeightValue: todayWeightRow?.weight || null
    },
    weightTrend: weightTrend.map(w => ({
      weight: w.weight,
      bmi: w.bmi,
      date: w.record_date?.substring(5) || ''
    })),
    partner,
    pendingPraises,
    pendingTasks,
    pendingTaskCount,            // 新增：今日未完成任务数
    pendingPointRequests,
    pendingReviews,
    partnerReviewedToday,
    waterToday,
    sleepToday
  });
});

module.exports = router;





