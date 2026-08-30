/**
 * 积分申请审核模块路由（最新commit核心功能）
 * point_requests表字段：
 *   id, user_id(申请人-主角), type(sleep/exercise/custom), title, description,
 *   points(申请积分), exercise_id(可选关联运动记录), status(pending/approved/rejected),
 *   reviewer_id, record_date, created_at, updated_at
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday } = require('../utils/helpers');
const { sendToUser } = require('../websocket');

const router = express.Router();

/* ---------- 内部通用函数：积分变动（带 record_date + 余额累计）---------- */
function addPointsHelper(userId, change, reason, refId) {
  const last = db.prepare('SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const balance = (last?.balance || 0) + change;
  db.prepare(`
    INSERT INTO points (user_id, change, reason, reference_id, balance, record_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, change, reason, refId || null, balance, getToday());
  return balance;
}

/* ============================================================
 *  1. POST / ：主角创建申请。默认type=custom, status=pending。
 *     成功推送给partner_id: {type:'point_request', action:'new', ...}
 * ============================================================ */
router.post('/', authRequired, (req, res) => {
  if (req.user.role !== 'main') {
    return error(res, '只有主角可以创建积分申请', 403);
  }

  const {
    type = 'custom',
    title,
    description = '',
    points,
    exercise_id = null,
    record_date
  } = req.body;

  if (!title) {
    return error(res, '申请标题不能为空');
  }
  if (points === undefined || points === null || points < 0) {
    return error(res, '申请积分不能为空且不能为负数');
  }
  if (!['sleep', 'exercise', 'custom'].includes(type)) {
    return error(res, '申请类型必须是 sleep / exercise / custom');
  }

  const finalRecordDate = record_date || getToday();

  const result = db.prepare(`
    INSERT INTO point_requests (
      user_id, type, title, description, points, exercise_id,
      status, record_date, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(req.user.id, type, title, description, points, exercise_id, finalRecordDate);

  const request = db.prepare('SELECT * FROM point_requests WHERE id = ?').get(result.lastInsertRowid);

  // 推送给伴侣
  if (req.user.partner_id) {
    sendToUser(req.user.partner_id, {
      type: 'point_request',
      action: 'new',
      requestId: request.id,
      title: request.title,
      points: request.points,
      requestType: request.type,
      timestamp: Date.now()
    });
  }

  return success(res, request, '积分申请已提交，等待伴侣审核');
});

/* ============================================================
 *  2. GET / ：列表。
 *     role=partner → 看别人的申请（可按status过滤）
 *     role=main → 看自己的申请
 * ============================================================ */
router.get('/', authRequired, (req, res) => {
  const { status, type } = req.query;
  const isPartner = req.user.role === 'partner';

  let sql;
  const params = [];

  if (isPartner) {
    sql = 'SELECT pr.*, u.nickname as user_nickname, u.avatar as user_avatar FROM point_requests pr LEFT JOIN users u ON pr.user_id = u.id WHERE 1=1';
  } else {
    sql = 'SELECT * FROM point_requests WHERE user_id = ?';
    params.push(req.user.id);
  }

  if (status && status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (type && type !== 'all') {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ' ORDER BY created_at DESC, id DESC';

  const requests = db.prepare(sql).all(...params);
  return success(res, { requests });
});

/* ============================================================
 *  3. GET /:id ：详情
 * ============================================================ */
router.get('/:id', authRequired, (req, res) => {
  const requestId = req.params.id;
  const isPartner = req.user.role === 'partner';

  let request;
  if (isPartner) {
    // 伴侣可以看所有
    request = db.prepare(`
      SELECT pr.*, u.nickname as user_nickname, u.avatar as user_avatar
      FROM point_requests pr LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.id = ?
    `).get(requestId);
  } else {
    // 主角只能看自己的
    request = db.prepare('SELECT * FROM point_requests WHERE id = ? AND user_id = ?').get(requestId, req.user.id);
  }

  if (!request) {
    return error(res, '申请不存在或无权查看', 404);
  }
  return success(res, request);
});

/* ============================================================
 *  4. PUT /:id/approve ：伴侣端审核通过
 *     ① UPDATE status='approved' reviewer_id=req.user.id
 *     ② 给user_id加积分（写points，reason='积分申请: '+title）
 *     推送消息给主角
 * ============================================================ */
router.put('/:id/approve', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以审核积分申请', 403);
  }

  const requestId = req.params.id;
  const request = db.prepare('SELECT * FROM point_requests WHERE id = ?').get(requestId);
  if (!request) {
    return error(res, '申请不存在', 404);
  }
  if (request.status !== 'pending') {
    return error(res, '该申请状态不是待审核，无法通过');
  }

  // 事务：更新状态 + 发放积分
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE point_requests SET
        status = 'approved',
        reviewer_id = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.user.id, requestId);

    const newBalance = addPointsHelper(
      request.user_id,
      request.points,
      `积分申请: ${request.title}`,
      requestId
    );

    return newBalance;
  });

  const newBalance = tx();

  // 推送消息给主角
  sendToUser(request.user_id, {
    type: 'point_request',
    action: 'approved',
    requestId: request.id,
    title: request.title,
    points: request.points,
    newBalance,
    timestamp: Date.now()
  });

  return success(res, { newBalance }, '申请已通过，积分已发放');
});

/* ============================================================
 *  5. PUT /:id/reject ：伴侣驳回
 *     UPDATE status='rejected' reviewer_id。body可选{ reason } 写description
 *     推送主角
 * ============================================================ */
router.put('/:id/reject', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以驳回积分申请', 403);
  }

  const requestId = req.params.id;
  const request = db.prepare('SELECT * FROM point_requests WHERE id = ?').get(requestId);
  if (!request) {
    return error(res, '申请不存在', 404);
  }
  if (request.status !== 'pending') {
    return error(res, '该申请状态不是待审核，无法驳回');
  }

  const { reason } = req.body || {};
  // 如果提供了驳回理由，追加到 description
  let finalDescription = request.description || '';
  if (reason) {
    finalDescription = finalDescription
      ? `${finalDescription}\n【驳回理由】${reason}`
      : `【驳回理由】${reason}`;
  }

  db.prepare(`
    UPDATE point_requests SET
      status = 'rejected',
      reviewer_id = ?,
      description = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(req.user.id, finalDescription, requestId);

  // 推送主角
  sendToUser(request.user_id, {
    type: 'point_request',
    action: 'rejected',
    requestId: request.id,
    title: request.title,
    reason: reason || '',
    timestamp: Date.now()
  });

  return success(res, null, '申请已驳回');
});

/* ============================================================
 *  6. PUT /:id/cancel ：主角取消自己pending的
 * ============================================================ */
router.put('/:id/cancel', authRequired, (req, res) => {
  const requestId = req.params.id;
  const request = db.prepare(
    'SELECT * FROM point_requests WHERE id = ? AND user_id = ?'
  ).get(requestId, req.user.id);
  if (!request) {
    return error(res, '申请不存在或无权取消', 404);
  }
  if (request.status !== 'pending') {
    return error(res, '该申请状态不是待审核，无法取消');
  }

  db.prepare(`
    UPDATE point_requests SET
      status = 'cancelled',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(requestId);

  return success(res, null, '申请已取消');
});

module.exports = router;
