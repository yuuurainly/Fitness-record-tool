/**
 * 消息模块路由
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error } = require('../utils/helpers');
const { sendToUser } = require('../websocket');

const router = express.Router();

// 获取与伴侣的消息历史
router.get('/', authRequired, (req, res) => {
  const partnerId = req.user.partner_id;
  if (!partnerId) {
    return success(res, { messages: [] });
  }

  const limit = parseInt(req.query.limit) || 100;
  const before = req.query.before; // 消息ID，用于分页

  let query = `
    SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE (m.sender_id = ? AND m.receiver_id = ?)
       OR (m.sender_id = ? AND m.receiver_id = ?)
  `;
  const params = [req.user.id, partnerId, partnerId, req.user.id];

  if (before) {
    query += ' AND m.id < ?';
    params.push(before);
  }

  query += ' ORDER BY m.created_at DESC LIMIT ?';
  params.push(limit);

  const messages = db.prepare(query).all(...params).reverse();

  // 标记对方发来的消息为已读
  db.prepare('UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0')
    .run(partnerId, req.user.id);

  return success(res, { messages });
});

// 发送消息
router.post('/', authRequired, (req, res) => {
  const { content } = req.body;
  const partnerId = req.user.partner_id;

  if (!content || !content.trim()) {
    return error(res, '消息内容不能为空');
  }
  if (!partnerId) {
    return error(res, '请先绑定伴侣');
  }

  const result = db.prepare(`
    INSERT INTO messages (sender_id, receiver_id, content)
    VALUES (?, ?, ?)
  `).run(req.user.id, partnerId, content.trim());

  const message = db.prepare(`
    SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
    FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?
  `).get(result.lastInsertRowid);

  // WebSocket 实时推送
  sendToUser(partnerId, {
    type: 'message',
    messageId: message.id,
    senderId: req.user.id,
    senderName: req.user.nickname,
    content: message.content,
    timestamp: Date.now()
  });

  return success(res, message, '消息发送成功');
});

// 获取未读消息数
router.get('/unread-count', authRequired, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND is_read = 0').get(req.user.id).count;
  return success(res, { count });
});

module.exports = router;
