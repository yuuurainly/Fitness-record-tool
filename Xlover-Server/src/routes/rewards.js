/**
 * 奖励模块路由
 * rewards表：id, creator_id, name, description, points_cost, icon, is_active, created_at
 * reward_claims表：id, user_id, reward_id, reward_name, points_cost, status(pending/confirmed/cancelled),
 *                  claimed_at, confirmed_at
 */
const express = require('express');
const db = require('../config/db');
const { authRequired } = require('../middleware/auth');
const { success, error, getToday } = require('../utils/helpers');

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
 *  1. GET / ：返回 { rewards: is_active=1按积分asc, userPoints: 当前用户最新积分 }
 * ============================================================ */
router.get('/', authRequired, (req, res) => {
  const rewards = db.prepare(
    'SELECT * FROM rewards WHERE is_active = 1 ORDER BY points_cost ASC'
  ).all();

  const pointsRecord = db.prepare(
    'SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1'
  ).get(req.user.id);
  const userPoints = pointsRecord?.balance || 0;

  return success(res, { rewards, userPoints });
});

/* ============================================================
 *  2. POST / ：伴侣端创建奖励
 * ============================================================ */
router.post('/', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以创建奖励', 403);
  }

  const { name, description, points_cost, icon } = req.body;

  if (!name || points_cost === undefined || points_cost === null) {
    return error(res, '奖励名称和所需积分不能为空');
  }
  if (points_cost < 0) {
    return error(res, '积分不能为负数');
  }

  const result = db.prepare(`
    INSERT INTO rewards (creator_id, name, description, points_cost, icon, is_active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(req.user.id, name, description || '', points_cost, icon || '🎁');

  const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(result.lastInsertRowid);
  return success(res, reward, '奖励创建成功');
});

/* ============================================================
 *  3. PUT /:id ：伴侣端编辑奖励或下架
 * ============================================================ */
router.put('/:id', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以编辑奖励', 403);
  }

  const rewardId = req.params.id;
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND creator_id = ?').get(rewardId, req.user.id);
  if (!reward) {
    return error(res, '奖励不存在或无权编辑', 404);
  }

  const { name, description, points_cost, icon, is_active } = req.body;

  db.prepare(`
    UPDATE rewards SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      points_cost = COALESCE(?, points_cost),
      icon = COALESCE(?, icon),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, description, points_cost, icon, is_active, rewardId);

  const updated = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId);
  return success(res, updated, '奖励已更新');
});

/* ============================================================
 *  4. DELETE /:id ：伴侣端删除奖励
 * ============================================================ */
router.delete('/:id', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以删除奖励', 403);
  }

  const rewardId = req.params.id;
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND creator_id = ?').get(rewardId, req.user.id);
  if (!reward) {
    return error(res, '奖励不存在或无权删除', 404);
  }

  db.prepare('DELETE FROM rewards WHERE id = ?').run(rewardId);
  return success(res, null, '奖励已删除');
});

/* ============================================================
 *  5. POST /:id/claim ：主角兑换奖励
 * ============================================================ */
router.post('/:id/claim', authRequired, (req, res) => {
  if (req.user.role !== 'main') {
    return error(res, '只有主角可以兑换奖励', 403);
  }

  const rewardId = req.params.id;
  const reward = db.prepare('SELECT * FROM rewards WHERE id = ? AND is_active = 1').get(rewardId);
  if (!reward) {
    return error(res, '奖励不存在或已下架', 404);
  }

  // 检查当前积分
  const pointsRecord = db.prepare(
    'SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1'
  ).get(req.user.id);
  const userPoints = pointsRecord?.balance || 0;

  if (userPoints < reward.points_cost) {
    return error(res, `积分不足，需要 ${reward.points_cost} 积分，当前 ${userPoints} 积分`);
  }

  // 用事务处理：扣积分 + 写兑换记录
  const tx = db.transaction(() => {
    const newBalance = addPointsHelper(
      req.user.id,
      -reward.points_cost,
      `兑换奖励: ${reward.name}`,
      rewardId
    );

    db.prepare(`
      INSERT INTO reward_claims (user_id, reward_id, reward_name, points_cost, status, claimed_at)
      VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `).run(req.user.id, rewardId, reward.name, reward.points_cost);

    return newBalance;
  });

  const newBalance = tx();
  return success(res, { newBalance }, '兑换成功，等待伴侣确认');
});

/* ============================================================
 *  6. GET /claims ：当前用户自己的兑换记录列表，或伴侣端看所有
 * ============================================================ */
router.get('/claims', authRequired, (req, res) => {
  let claims;
  if (req.user.role === 'partner') {
    // 伴侣端：看所有兑换记录（可按status过滤）
    const { status } = req.query;
    let sql = 'SELECT * FROM reward_claims';
    const params = [];
    if (status && status !== 'all') {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY claimed_at DESC';
    claims = db.prepare(sql).all(...params);
  } else {
    // 主角：看自己的
    claims = db.prepare(
      'SELECT * FROM reward_claims WHERE user_id = ? ORDER BY claimed_at DESC'
    ).all(req.user.id);
  }
  return success(res, { claims });
});

/* ============================================================
 *  7. PUT /claims/:id/confirm ：伴侣确认
 * ============================================================ */
router.put('/claims/:id/confirm', authRequired, (req, res) => {
  if (req.user.role !== 'partner') {
    return error(res, '只有伴侣可以确认兑换', 403);
  }

  const claimId = req.params.id;
  const claim = db.prepare('SELECT * FROM reward_claims WHERE id = ?').get(claimId);
  if (!claim) {
    return error(res, '兑换记录不存在', 404);
  }
  if (claim.status !== 'pending') {
    return error(res, '该兑换状态不是待确认，无法确认');
  }

  db.prepare(`
    UPDATE reward_claims SET status = 'confirmed', confirmed_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(claimId);

  return success(res, null, '兑换已确认');
});

/* ============================================================
 *  8. PUT /claims/:id/cancel ：主角取消自己pending的兑换，积分退还
 * ============================================================ */
router.put('/claims/:id/cancel', authRequired, (req, res) => {
  const claimId = req.params.id;
  const claim = db.prepare('SELECT * FROM reward_claims WHERE id = ? AND user_id = ?').get(claimId, req.user.id);
  if (!claim) {
    return error(res, '兑换记录不存在或无权取消', 404);
  }
  if (claim.status !== 'pending') {
    return error(res, '该兑换状态不是待确认，无法取消');
  }

  // 事务：退还积分 + 更新状态
  const tx = db.transaction(() => {
    const newBalance = addPointsHelper(
      claim.user_id,
      claim.points_cost,
      `取消兑换返还: ${claim.reward_name}`,
      claim.id
    );

    db.prepare("UPDATE reward_claims SET status = 'cancelled' WHERE id = ?").run(claimId);

    return newBalance;
  });

  const newBalance = tx();
  return success(res, { newBalance }, '兑换已取消，积分已返还');
});

module.exports = router;
