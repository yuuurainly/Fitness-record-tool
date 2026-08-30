/**
 * 认证路由
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { authRequired, generateToken } = require('../middleware/auth');
const { success, error, generateBindCode, calculateBMI, calculateDailyCalories } = require('../utils/helpers');

const router = express.Router();

/**
 * 注册
 */
router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body;
  // 界面已移除角色选择，默认注册为主角；兼容旧调用方显式传 role
  const role = ['main', 'partner'].includes(req.body.role) ? req.body.role : 'main';

  if (!username || !password) {
    return error(res, '用户名和密码不能为空');
  }
  if (username.length < 3 || username.length > 20) {
    return error(res, '用户名长度应为 3-20 个字符');
  }
  if (password.length < 6) {
    return error(res, '密码长度至少 6 位');
  }

  // 检查用户名是否已存在
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return error(res, '用户名已被注册');
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const bindCode = role === 'main' ? generateBindCode() : null;

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, nickname, avatar, role, bind_code)
    VALUES (?, ?, ?, '', ?, ?)
  `).run(username, passwordHash, nickname || username, role, bindCode);

  const userId = result.lastInsertRowid;

  // 创建默认档案
  db.prepare(`
    INSERT INTO user_profiles (user_id, start_weight, current_weight, daily_calorie_goal) VALUES (?, 60, 60, 1800)
  `).run(userId);

  const token = generateToken(userId);
  const user = db.prepare('SELECT id, username, nickname, avatar, role, partner_id, bind_code FROM users WHERE id = ?').get(userId);

  return success(res, { token, user }, '注册成功');
});

/**
 * 登录
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return error(res, '用户名和密码不能为空');
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return error(res, '用户名或密码错误');
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return error(res, '用户名或密码错误');
  }

  const token = generateToken(user.id);
  const { password_hash, ...safeUser } = user;

  // 确保partner信息同步返回
  if (user.partner_id) {
    const partner = db.prepare('SELECT id, username, nickname, avatar, role FROM users WHERE id = ?').get(user.partner_id);
    if (partner) {
      safeUser.partner = partner;
    }
  }

  return success(res, { token, user: safeUser }, '登录成功');
});

/**
 * 获取当前用户信息
 */
router.get('/me', authRequired, (req, res) => {
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
  const partner = req.user.partner_id
    ? db.prepare('SELECT id, username, nickname, avatar, role FROM users WHERE id = ?').get(req.user.partner_id)
    : null;

  return success(res, { user: req.user, profile, partner });
});

/**
 * 绑定伴侣
 */
router.post('/bind', authRequired, (req, res) => {
  const { bindCode } = req.body;

  if (!bindCode) {
    return error(res, '请输入绑定码');
  }

  // 查找绑定码对应的主角
  const mainUser = db.prepare('SELECT * FROM users WHERE bind_code = ? AND role = ?').get(bindCode.toUpperCase(), 'main');
  if (!mainUser) {
    return error(res, '绑定码无效');
  }

  if (mainUser.id === req.user.id) {
    return error(res, '不能绑定自己');
  }

  if (mainUser.partner_id) {
    return error(res, '该主角已绑定伴侣');
  }

  if (req.user.partner_id) {
    return error(res, '你已绑定伴侣，如需重新绑定请先解绑');
  }

  // 双向绑定
  db.prepare('UPDATE users SET partner_id = ? WHERE id = ?').run(mainUser.id, req.user.id);
  db.prepare('UPDATE users SET partner_id = ? WHERE id = ?').run(req.user.id, mainUser.id);

  const updatedUser = db.prepare('SELECT id, username, nickname, avatar, role, partner_id, bind_code FROM users WHERE id = ?').get(req.user.id);
  const partner = db.prepare('SELECT id, username, nickname, avatar, role FROM users WHERE id = ?').get(mainUser.id);

  return success(res, { user: updatedUser, partner }, '绑定成功');
});

/**
 * 解绑
 */
router.post('/unbind', authRequired, (req, res) => {
  if (!req.user.partner_id) {
    return error(res, '你还没有绑定伴侣');
  }

  const partnerId = req.user.partner_id;

  // 双向解绑
  db.prepare('UPDATE users SET partner_id = NULL WHERE id = ?').run(req.user.id);
  db.prepare('UPDATE users SET partner_id = NULL WHERE id = ?').run(partnerId);

  // 如果是主角，重新生成绑定码
  if (req.user.role === 'main') {
    const newCode = generateBindCode();
    db.prepare('UPDATE users SET bind_code = ? WHERE id = ?').run(newCode, req.user.id);
  }

  return success(res, null, '解绑成功');
});

module.exports = router;
