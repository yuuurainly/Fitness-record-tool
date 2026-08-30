/**
 * 工具函数
 */

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getNow() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function generateBindCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function calculateBMI(weight, height) {
  if (!weight || !height) return 0;
  const heightM = height / 100;
  return Math.round((weight / (heightM * heightM)) * 10) / 10;
}

/**
 * 基础代谢率（BMR）—— Mifflin-St Jeor 公式
 * 返回 Math.round 后的整数，任何异常情况都退回 0
 */
function calculateBMR(weight, height, age, gender) {
  const w = Number(weight) || 60;
  const h = Number(height) || 170;
  const a = Number(age) || 25;
  const g = gender === 'male' ? 'male' : 'female';
  const raw = (g === 'male')
    ? 10 * w + 6.25 * h - 5 * a + 5
    : 10 * w + 6.25 * h - 5 * a - 161;
  const bmr = Math.round(raw);
  if (!Number.isFinite(bmr) || bmr <= 0) return 0;
  return bmr;
}

/**
 * 每日总消耗 TDEE = BMR × 活动系数
 * 活动系数完全由用户手动选择（user_profiles.activity_factor 数值传入），不再使用旧的硬编码档位判断
 * @param {number} weight kg
 * @param {number} height cm
 * @param {number} age
 * @param {'male'|'female'} gender
 * @param {number|null} activityFactor 用户选的活动系数数值，如 1.55；NULL 表示用户还没选
 * @returns {{ bmr: number, tdee: number|null, activityFactorSelected: boolean }}
 *   tdee 为 NULL / activityFactorSelected=false 时表示未选活动水平，前端应引导用户选择
 */
function calculateDailyCalories(weight, height, age, gender, activityFactor) {
  const bmr = calculateBMR(weight, height, age, gender);

  const factor = Number(activityFactor);
  if (!Number.isFinite(factor) || factor < 1.0) {
    // 用户未选择活动水平：返回 TDEE = NULL，标识未选
    return { bmr, tdee: null, activityFactorSelected: false };
  }

  const rawTdee = bmr * factor;
  let tdee = Math.round(rawTdee);

  // 男女安全下限：男 ≥ 1500，女 ≥ 1200
  const g = gender === 'male' ? 'male' : 'female';
  const floor = g === 'male' ? 1500 : 1200;
  if (tdee < floor) tdee = floor;

  if (!Number.isFinite(tdee) || tdee < 0) {
    return { bmr, tdee: bmr || floor, activityFactorSelected: true };
  }
  return { bmr, tdee, activityFactorSelected: true };
}

function calculateExerciseCalories(metValue, durationMin, weight) {
  // 热量(kcal) = MET × 体重(kg) × 时间(h)
  return Math.round(metValue * weight * (durationMin / 60));
}

function success(res, data = null, message = 'success') {
  return res.json({ success: true, message, data });
}

function error(res, message = 'error', status = 400) {
  return res.status(status).json({ success: false, message });
}

module.exports = {
  getToday,
  getNow,
  generateBindCode,
  calculateBMI,
  calculateBMR,
  calculateDailyCalories,
  calculateExerciseCalories,
  success,
  error
};
