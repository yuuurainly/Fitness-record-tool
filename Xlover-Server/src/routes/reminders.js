/**
 * 提醒系统模块路由
 * reminders表字段：
 *   id, creator_id, target_user_id, title, icon, description, reminder_time(HH:MM),
 *   repeat_days(JSON 默认"[1,2,3,4,5,6,7]"), is_active(0/1),
 *   source_tag(self/from_partner/for_partner), created_at
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error } = require('../utils/helpers');

const router = express.Router();

/* ---------- 内部工具：解析/序列化 repeat_days ---------- */
function parseRepeatDays(raw) {
  if (!raw) return [1, 2, 3, 4, 5, 6, 7];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [1, 2, 3, 4, 5, 6, 7];
  } catch (e) {
    return [1, 2, 3, 4, 5, 6, 7];
  }
}
function stringifyRepeatDays(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    return '[1,2,3,4,5,6,7]';
  }
  return JSON.stringify(arr);
}

/**
 * 根据角色和 target_user_id 推断 source_tag 默认值
 */
function inferSourceTag(creatorRole, creatorId, targetUserId, partnerId) {
  // 若伴侣创建，且发给主角（partner_id）→ for_partner
  if (creatorRole === 'partner' && targetUserId === partnerId) {
    return 'for_partner';
  }
  // 若主角创建，且发给伴侣（partner_id）→ from_partner（对接收方来说来源是伴侣视角的反向，但按需求是self或for_partner）
  // 实际说明：source_tag=self表示自建自用，from_partner=接收自伴侣，for_partner=我发给伴侣
  if (targetUserId !== creatorId) {
    // 发给别人
    return creatorRole === 'partner' ? 'for_partner' : 'from_partner';
  }
  return 'self';
}

/* ============================================================
 *  1. GET / ：当前用户相关的提醒
 *     —— 我创建的（creator_id=我）或 我接收的（target_user_id=我）
 *     按 reminder_time 升序
 * ============================================================ */
router.get('/', authRequired, (req, res) => {
  const userId = req.user.id;
  const { is_active } = req.query;

  let sql = `
    SELECT * FROM reminders
    WHERE creator_id = ? OR target_user_id = ?
  `;
  const params = [userId, userId];

  if (is_active !== undefined && is_active !== 'all' && is_active !== '') {
    const activeVal = is_active === '1' || is_active === true ? 1 : 0;
    sql += ' AND is_active = ?';
    params.push(activeVal);
  }
  sql += ' ORDER BY reminder_time ASC, id ASC';

  const reminders = db.prepare(sql).all(...params).map(r => ({
    ...r,
    repeat_days: parseRepeatDays(r.repeat_days)
  }));

  return success(res, { list: reminders, reminders });
});

/* ============================================================
 *  2. POST / ：创建提醒
 *     body: { target_user_id默认=自己或partner, title, icon, description,
 *             reminder_time, repeat_days数组转JSON, source_tag默认'self' }
 *     若是partner创建发给主角→source_tag='for_partner'
 * ============================================================ */
router.post('/', authRequired, (req, res) => {
  const {
    target_user_id,
    title,
    icon = '⏰',
    description = '',
    reminder_time,
    repeat_days,
    source_tag
  } = req.body;

  if (!title) {
    return error(res, '提醒标题不能为空');
  }
  if (!reminder_time || !/^\d{2}:\d{2}$/.test(reminder_time)) {
    return error(res, '提醒时间不能为空且格式必须为 HH:MM');
  }

  // target_user_id 默认：若有partner_id且没指定，则根据角色
  let finalTargetId = target_user_id;
  if (!finalTargetId) {
    // 默认自己
    finalTargetId = req.user.id;
  }

  // 推断 source_tag
  let finalSourceTag = source_tag;
  if (!finalSourceTag) {
    finalSourceTag = inferSourceTag(req.user.role, req.user.id, finalTargetId, req.user.partner_id);
  }

  const repeatDaysJson = stringifyRepeatDays(repeat_days);

  const result = db.prepare(`
    INSERT INTO reminders (
      creator_id, target_user_id, title, icon, description,
      reminder_time, repeat_days, is_active, source_tag, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
  `).run(
    req.user.id,
    finalTargetId,
    title,
    icon,
    description,
    reminder_time,
    repeatDaysJson,
    finalSourceTag
  );

  const reminder = db.prepare('SELECT * FROM reminders WHERE id = ?').get(result.lastInsertRowid);
  reminder.repeat_days = parseRepeatDays(reminder.repeat_days);
  return success(res, reminder, '提醒创建成功');
});

/* ============================================================
 *  3. PUT /:id ：编辑。只能编辑自己创建的。
 * ============================================================ */
router.put('/:id', authRequired, (req, res) => {
  const reminderId = req.params.id;
  const reminder = db.prepare(
    'SELECT * FROM reminders WHERE id = ? AND creator_id = ?'
  ).get(reminderId, req.user.id);
  if (!reminder) {
    return error(res, '提醒不存在或无权编辑', 404);
  }

  const {
    target_user_id,
    title,
    icon,
    description,
    reminder_time,
    repeat_days,
    is_active,
    source_tag
  } = req.body;

  // 校验时间格式（如果提供了）
  if (reminder_time !== undefined && !/^\d{2}:\d{2}$/.test(reminder_time)) {
    return error(res, '提醒时间格式必须为 HH:MM');
  }

  let repeatDaysJson = undefined;
  if (repeat_days !== undefined) {
    repeatDaysJson = stringifyRepeatDays(repeat_days);
  }

  db.prepare(`
    UPDATE reminders SET
      target_user_id = COALESCE(?, target_user_id),
      title = COALESCE(?, title),
      icon = COALESCE(?, icon),
      description = COALESCE(?, description),
      reminder_time = COALESCE(?, reminder_time),
      repeat_days = COALESCE(?, repeat_days),
      is_active = COALESCE(?, is_active),
      source_tag = COALESCE(?, source_tag)
    WHERE id = ?
  `).run(
    target_user_id,
    title,
    icon,
    description,
    reminder_time,
    repeatDaysJson,
    is_active,
    source_tag,
    reminderId
  );

  const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  updated.repeat_days = parseRepeatDays(updated.repeat_days);
  return success(res, updated, '提醒已更新');
});

/* ============================================================
 *  4. DELETE /:id ：删除
 * ============================================================ */
router.delete('/:id', authRequired, (req, res) => {
  const reminderId = req.params.id;
  const reminder = db.prepare(
    'SELECT * FROM reminders WHERE id = ? AND creator_id = ?'
  ).get(reminderId, req.user.id);
  if (!reminder) {
    return error(res, '提醒不存在或无权删除', 404);
  }

  db.prepare('DELETE FROM reminders WHERE id = ?').run(reminderId);
  return success(res, null, '提醒已删除');
});

/* ============================================================
 *  5. PUT /:id/toggle ：切换 is_active。body: { is_active: 0或1 }
 * ============================================================ */
router.put('/:id/toggle', authRequired, (req, res) => {
  const reminderId = req.params.id;
  const reminder = db.prepare(
    'SELECT * FROM reminders WHERE id = ? AND creator_id = ?'
  ).get(reminderId, req.user.id);
  if (!reminder) {
    return error(res, '提醒不存在或无权操作', 404);
  }

  const { is_active } = req.body;
  if (is_active === undefined || is_active === null) {
    return error(res, 'is_active 参数不能为空（0 或 1）');
  }
  const activeVal = is_active === 1 || is_active === '1' || is_active === true ? 1 : 0;

  db.prepare('UPDATE reminders SET is_active = ? WHERE id = ?').run(activeVal, reminderId);

  const updated = db.prepare('SELECT * FROM reminders WHERE id = ?').get(reminderId);
  updated.repeat_days = parseRepeatDays(updated.repeat_days);
  return success(res, updated, activeVal === 1 ? '提醒已启用' : '提醒已禁用');
});

module.exports = router;
