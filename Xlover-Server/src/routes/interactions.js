/**
 * 互动模块路由 - 表扬 / 记录点赞 / 记录评论 / 每日点赞
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday } = require('../utils/helpers');
const { sendToUser } = require('../websocket');

const router = express.Router();

// ========== 表扬 praises ==========

// 1. 发送表扬
router.post('/praises', authRequired, (req, res) => {
  const { receiver_id, content, effect_type } = req.body;

  if (!receiver_id) {
    return error(res, '接收者ID不能为空');
  }
  if (Number(receiver_id) === Number(req.user.id)) {
    return error(res, '不能表扬自己');
  }
  if (!content || !String(content).trim()) {
    return error(res, '表扬内容不能为空');
  }

  const senderNickname = req.user.nickname || '';
  const effect = effect_type || 'hearts';

  const result = db.prepare(`
    INSERT INTO praises (sender_id, receiver_id, content, sender_nickname, effect_type, is_viewed)
    VALUES (?, ?, ?, ?, ?, 0)
  `).run(req.user.id, receiver_id, content, senderNickname, effect);

  const praise = db.prepare('SELECT * FROM praises WHERE id = ?').get(result.lastInsertRowid);

  // WebSocket 实时推送
  sendToUser(receiver_id, {
    type: 'praise',
    id: praise.id,
    sender_id: praise.sender_id,
    receiver_id: praise.receiver_id,
    content: praise.content,
    sender_nickname: praise.sender_nickname,
    effect_type: praise.effect_type,
    is_viewed: praise.is_viewed,
    created_at: praise.created_at
  });

  return success(res, { praise }, '表扬发送成功');
});

// 2. 查询表扬列表
router.get('/praises', authRequired, (req, res) => {
  const viewed = req.query.viewed || 'all'; // all / unread / read
  const limit = parseInt(req.query.limit) || 50;

  let sql = `
    SELECT p.id, p.sender_id, p.receiver_id, p.content, p.sender_nickname,
           p.effect_type, p.is_viewed, p.created_at,
           u.avatar AS sender_avatar
    FROM praises p
    JOIN users u ON p.sender_id = u.id
    WHERE p.receiver_id = ?
  `;
  const params = [req.user.id];

  if (viewed === 'unread') {
    sql += ' AND p.is_viewed = 0';
  } else if (viewed === 'read') {
    sql += ' AND p.is_viewed = 1';
  }

  sql += ' ORDER BY p.created_at DESC LIMIT ?';
  params.push(limit);

  const praises = db.prepare(sql).all(...params);
  return success(res, { praises });
});

// 3. 标记单条表扬已读
router.put('/praises/:id/view', authRequired, (req, res) => {
  const praiseId = req.params.id;
  const praise = db.prepare(
    'SELECT * FROM praises WHERE id = ? AND receiver_id = ?'
  ).get(praiseId, req.user.id);

  if (!praise) {
    return error(res, '表扬不存在', 404);
  }

  db.prepare('UPDATE praises SET is_viewed = 1 WHERE id = ?').run(praiseId);
  return success(res, null, '已标记为已读');
});

// 4. 标记全部表扬已读
router.put('/praises/read-all', authRequired, (req, res) => {
  db.prepare(
    'UPDATE praises SET is_viewed = 1 WHERE receiver_id = ? AND is_viewed = 0'
  ).run(req.user.id);
  return success(res, null, '全部标记已读');
});

// ========== 记录点赞 record_likes ==========

// 5. 单条记录点赞
router.post('/record-likes', authRequired, (req, res) => {
  const { record_id } = req.body;

  if (!record_id || !String(record_id).includes('_')) {
    return error(res, 'record_id 格式错误，应为 food_XX / exercise_XX');
  }

  const targetUserId = req.user.partner_id;
  if (!targetUserId) {
    return error(res, '尚未绑定伴侣，无法点赞');
  }

  try {
    const result = db.prepare(`
      INSERT INTO record_likes (from_user_id, target_user_id, record_id)
      VALUES (?, ?, ?)
    `).run(req.user.id, targetUserId, record_id);

    const like = db.prepare('SELECT * FROM record_likes WHERE id = ?').get(result.lastInsertRowid);
    return success(res, { like }, '点赞成功');
  } catch (e) {
    // UNIQUE 冲突 => 已点赞
    if (e && String(e.message || '').includes('UNIQUE')) {
      return error(res, '已经点过赞了');
    }
    throw e;
  }
});

// 6. 取消点赞
router.delete('/record-likes/:record_id', authRequired, (req, res) => {
  const { record_id } = req.params;

  const result = db.prepare(`
    DELETE FROM record_likes
    WHERE from_user_id = ? AND record_id = ?
  `).run(req.user.id, record_id);

  if (result.changes === 0) {
    return error(res, '未找到该点赞记录', 404);
  }
  return success(res, null, '取消点赞成功');
});

// ========== 记录评论 record_comments ==========

// 7. 对记录评论
router.post('/record-comments', authRequired, (req, res) => {
  const { record_type, record_id, content } = req.body;

  if (!record_type) {
    return error(res, 'record_type 不能为空');
  }
  if (record_id === undefined || record_id === null || record_id === '') {
    return error(res, 'record_id 不能为空');
  }
  if (!content || !String(content).trim()) {
    return error(res, '评论内容不能为空');
  }

  const fromNickname = req.user.nickname || '';

  const result = db.prepare(`
    INSERT INTO record_comments (user_id, from_user_id, from_nickname, record_type, record_id, content)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(req.user.id, req.user.id, fromNickname, record_type, record_id, content);

  const comment = db.prepare('SELECT * FROM record_comments WHERE id = ?').get(result.lastInsertRowid);
  return success(res, { comment }, '评论成功');
});

// 8. 获取记录评论列表
router.get('/record-comments', authRequired, (req, res) => {
  const { record_type, record_id } = req.query;

  if (!record_type || record_id === undefined || record_id === null || record_id === '') {
    return error(res, 'record_type 和 record_id 不能为空');
  }

  const comments = db.prepare(`
    SELECT rc.id, rc.from_user_id, rc.from_nickname,
           rc.record_type, rc.record_id, rc.content, rc.created_at,
           u.avatar AS from_avatar
    FROM record_comments rc
    LEFT JOIN users u ON rc.from_user_id = u.id
    WHERE rc.record_type = ? AND rc.record_id = ?
    ORDER BY rc.created_at ASC
  `).all(record_type, record_id);

  return success(res, { comments });
});

// ========== 每日整体点赞 daily_likes ==========

// 9. 每日点赞
router.post('/daily-likes', authRequired, (req, res) => {
  const { target_user_id, record_date } = req.body;

  if (!target_user_id) {
    return error(res, 'target_user_id 不能为空');
  }
  if (Number(target_user_id) === Number(req.user.id)) {
    return error(res, '不能给自己点赞');
  }

  const date = record_date || getToday();

  try {
    const result = db.prepare(`
      INSERT INTO daily_likes (from_user_id, target_user_id, record_date)
      VALUES (?, ?, ?)
    `).run(req.user.id, target_user_id, date);

    const like = db.prepare('SELECT * FROM daily_likes WHERE id = ?').get(result.lastInsertRowid);
    return success(res, { like }, '点赞成功');
  } catch (e) {
    if (e && String(e.message || '').includes('UNIQUE')) {
      return error(res, '今天已经为该用户点过赞了');
    }
    throw e;
  }
});

// 10. 查询是否已赞
router.get('/daily-likes', authRequired, (req, res) => {
  const { target_user_id, record_date } = req.query;

  if (!target_user_id) {
    return error(res, 'target_user_id 不能为空');
  }

  const date = record_date || getToday();

  const row = db.prepare(`
    SELECT id, from_user_id, target_user_id, record_date, created_at
    FROM daily_likes
    WHERE from_user_id = ? AND target_user_id = ? AND record_date = ?
    LIMIT 1
  `).get(req.user.id, target_user_id, date);

  return success(res, { liked: !!row, like: row || null });
});

module.exports = router;
