/**
 * 任务模块路由 - 对齐小程序3种任务（单次once/周期cycle/习惯habit）
 * 表字段：cycle_mode / cycle_days / cycle_count / period_start / period_end /
 *         habit_days / habit_streak / completed_days / completions(JSON) / completed_at
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday } = require('../utils/helpers');
const { sendToUser } = require('../websocket');

const router = express.Router();

/* ---------- 内部工具：积分变动（带 record_date + 余额累计）---------- */
function addPoints(userId, change, reason, referenceId) {
  const last = db.prepare('SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const balance = (last?.balance || 0) + change;
  db.prepare(`
    INSERT INTO points (user_id, change, reason, reference_id, balance, record_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, change, reason, referenceId, balance, getToday());
  return balance;
}

/* ---------- 内部：任务字段映射（新 tasks 表字段 → 前端 TaskDto 兼容字段）---------- */
function buildRecurrenceRule(t) {
  const type = t.type || 'once';
  if (type === 'habit') {
    return `habit_${t.habit_days || 7}days`;
  }
  if (type === 'cycle') {
    const mode = t.cycle_mode || 'daily';
    if (mode === 'period' && t.period_start && t.period_end) {
      return `cycle_${t.period_start}_${t.period_end}_${t.cycle_days || 1}days`;
    }
    return `cycle_${mode}_x${t.cycle_count || 1}_${t.cycle_days || 1}days`;
  }
  return 'once';
}
function buildTargetDays(t) {
  const type = t.type || 'once';
  if (type === 'habit') return t.habit_days || 0;
  if (type === 'cycle') return t.cycle_days || 0;
  return 1;
}
// 将 DB 行映射成前端兼容的 TaskDto 字段集合
function normalizeTask(t) {
  return {
    ...t,
    // 字段 NULL 兜底：避免前端 Moshi "Non-null value was null" 崩溃
    assignee_id: t.assignee_id ?? t.creator_id ?? 0,
    description: t.description ?? '',
    type: t.type ?? 'once',
    status: t.status ?? 'pending',
    points: t.points ?? 0,
    completions: parseCompletions(t.completions),
    recurrence_rule: buildRecurrenceRule(t),
    target_days: buildTargetDays(t),
    current_streak: t.habit_streak || t.completed_days || 0,
    completed_date: t.completed_at ? String(t.completed_at).substring(0, 10) : null
  };
}

/* ---------- 内部：解析 completions(JSON) ---------- */
function parseCompletions(raw) {
  try { return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function stringifyCompletions(arr) {
  return JSON.stringify(arr || []);
}

/* ============================================================
 *  1. 获取任务列表（主角端：自己创建的 + 自己被分配的 合并展示）
 * ============================================================ */
router.get('/', authRequired, (req, res) => {
  const { status, type } = req.query;
  const uid = req.user.id;
  let sql = 'SELECT * FROM tasks WHERE (creator_id = ? OR assignee_id = ?)';
  const params = [uid, uid];

  if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
  if (type && type !== 'all')   { sql += ' AND type = ?';   params.push(type); }
  sql += ' ORDER BY updated_at DESC, id DESC';

  const tasks = db.prepare(sql).all(...params).map(normalizeTask);

  return success(res, { tasks });
});

/* ============================================================
 *  2. 发布任务（主角端，自己发布自己执行）
 * ============================================================ */
router.post('/', authRequired, (req, res) => {
  const {
    title, description, type = 'once', points = 10,
    cycle_mode = 'daily', period_start = '', period_end = '',
    cycle_count = 1, cycle_days = 1,
    habit_days = 7,
    due_date = ''
  } = req.body;

  if (!title) return error(res, '任务标题不能为空');
  if (!['once', 'cycle', 'habit'].includes(type)) {
    return error(res, '任务类型必须是 once / cycle / habit');
  }

  const result = db.prepare(`
    INSERT INTO tasks (
      creator_id, assignee_id, title, description, type, points,
      cycle_mode, period_start, period_end, cycle_count, cycle_days,
      habit_days, habit_streak, completed_days, completions, due_date,
      status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active')
  `).run(
    req.user.id, req.user.id, title, description || '', type, points,
    cycle_mode, period_start, period_end, cycle_count, cycle_days,
    habit_days, 0, 0, '[]', due_date
  );

  const task = normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid));
  return success(res, task, '任务发布成功');
});

/* ============================================================
 *  3. 接受 / 拒绝任务
 * ============================================================ */
router.put('/:id/accept', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND (assignee_id = ? OR creator_id = ?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!t) return error(res, '任务不存在', 404);
  if (t.status !== 'pending') return error(res, '任务状态不允许接受');

  db.prepare("UPDATE tasks SET status='active', updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .run(t.id);
  const updated = normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
  return success(res, updated, '任务已接受');
});

router.put('/:id/reject', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND (assignee_id = ? OR creator_id = ?)')
    .get(req.params.id, req.user.id, req.user.id);
  if (!t) return error(res, '任务不存在', 404);
  if (t.status !== 'pending') return error(res, '任务状态不允许拒绝');

  db.prepare("UPDATE tasks SET status='rejected', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id);
  return success(res, null, '任务已拒绝');
});
/* ============================================================
 *  4. 任务打卡（核心）- 单次/周期/习惯三种分别处理
 * ============================================================ */
router.put('/:id/checkin', authRequired, (req, res) => {
  const taskId = req.params.id;
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND assignee_id = ?')
    .get(taskId, req.user.id);
  if (!t) return error(res, '任务不存在', 404);
  if (t.status !== 'active') return error(res, `当前任务状态为 ${t.status}，不可打卡`);

  const today = getToday();
  let completions = parseCompletions(t.completions);

  // 防止同日重复打卡（周期/习惯按天去重）
  const alreadyToday = completions.some(c => c.date === today);
  if (t.type !== 'once' && alreadyToday) {
    return error(res, '今天已打卡过该任务');
  }

  completions.push({ date: today, created_at: new Date().toISOString() });

  // 按类型判断是否完成
  let completedDays = (t.completed_days || 0) + 1;
  let habitStreak = t.habit_streak || 0;
  let newStatus = t.status;
  let pointsEarned = 0;

  if (t.type === 'once') {
    // 单次任务：打卡=完成
    newStatus = 'completed';
    pointsEarned = t.points || 0;
  } else if (t.type === 'cycle') {
    // 周期任务：完成 cycle_days 天视为完成
    if (completedDays >= (t.cycle_days || 1)) {
      newStatus = 'completed';
      pointsEarned = t.points || 0;
    }
  } else if (t.type === 'habit') {
    // 习惯任务：连续打卡 habit_days 天
    habitStreak += 1;
    if (habitStreak >= (t.habit_days || 7)) {
      newStatus = 'completed';
      pointsEarned = t.points || 0;
    }
  }

  const completedAt = newStatus === 'completed' ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE tasks SET
      completions = ?,
      completed_days = ?,
      habit_streak = ?,
      status = ?,
      completed_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    stringifyCompletions(completions),
    completedDays,
    habitStreak,
    newStatus,
    completedAt,
    t.id
  );

  let newBalance = null;
  if (pointsEarned > 0) {
    newBalance = addPoints(req.user.id, pointsEarned, `完成任务: ${t.title}`, t.id);
    // 通知伴侣
    sendToUser(t.creator_id, {
      type: 'task',
      action: 'completed',
      taskId: t.id,
      title: t.title,
      points: pointsEarned,
      timestamp: Date.now()
    });
  }

  const updated = normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));

  return success(res, {
    task: updated,
    pointsEarned,
    newBalance,
    completed: newStatus === 'completed'
  }, newStatus === 'completed' ? '任务完成，积分已发放' : '打卡成功');
});

/* ============================================================
 *  5. 完成任务（兼容旧 complete 端点 = 打卡）
 * ============================================================ */
router.put('/:id/complete', authRequired, (req, res) => {
  // 复用打卡逻辑（复制一份避免路由转发问题）
  const taskId = req.params.id;
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND assignee_id = ?')
    .get(taskId, req.user.id);
  if (!t) return error(res, '任务不存在', 404);
  if (t.status !== 'active' && t.status !== 'accepted')
    return error(res, `当前任务状态为 ${t.status}，不可完成`);

  // 兼容性：如果还是 accepted，先升级为 active
  if (t.status === 'accepted') {
    db.prepare("UPDATE tasks SET status='active' WHERE id=?").run(t.id);
    t.status = 'active';
  }

  const today = getToday();
  const completions = [...parseCompletions(t.completions), { date: today, created_at: new Date().toISOString() }];
  let completedDays = (t.completed_days || 0) + 1;
  let habitStreak = (t.habit_streak || 0) + 1;
  const finished =
    (t.type === 'once') ||
    (t.type === 'cycle' && completedDays >= (t.cycle_days || 1)) ||
    (t.type === 'habit' && habitStreak >= (t.habit_days || 7));

  const pointsEarned = finished ? (t.points || 0) : 0;
  const newStatus = finished ? 'completed' : 'active';
  const completedAt = finished ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE tasks SET
      completions = ?, completed_days = ?, habit_streak = ?,
      status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(JSON.stringify(completions), completedDays, habitStreak, newStatus, completedAt, t.id);

  let newBalance = null;
  if (pointsEarned > 0) {
    newBalance = addPoints(req.user.id, pointsEarned, `完成任务: ${t.title}`, t.id);
    sendToUser(t.creator_id, {
      type: 'task', action: 'completed', taskId: t.id,
      title: t.title, points: pointsEarned, timestamp: Date.now()
    });
  }
  const updated = normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
  return success(res, { task: updated, pointsEarned, newBalance, completed: finished },
    finished ? '任务完成，积分已发放' : '打卡成功');
});

/* ============================================================
 *  6. 编辑 / 删除任务（伴侣端）
 * ============================================================ */
router.put('/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND creator_id = ?')
    .get(req.params.id, req.user.id);
  if (!t) return error(res, '任务不存在或无权编辑', 404);

  const { title, description, points, due_date, is_active } = req.body;
  db.prepare(`
    UPDATE tasks SET
      title = COALESCE(?, title),
      description = COALESCE(?, description),
      points = COALESCE(?, points),
      due_date = COALESCE(?, due_date),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, description, points, due_date, t.id);

  if (is_active === 0 || is_active === false) {
    db.prepare("UPDATE tasks SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE id=?").run(t.id);
  }

  const updated = normalizeTask(db.prepare('SELECT * FROM tasks WHERE id = ?').get(t.id));
  return success(res, updated, '任务已更新');
});

router.delete('/:id', authRequired, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id = ? AND creator_id = ?')
    .get(req.params.id, req.user.id);
  if (!t) return error(res, '任务不存在或无权删除', 404);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(t.id);
  return success(res, null, '任务已删除');
});

module.exports = router;

