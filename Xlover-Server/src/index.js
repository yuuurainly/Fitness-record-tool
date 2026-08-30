/**
 * Xlover 后端服务入口
 */
require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const cron = require('node-cron');

const { setupWebSocket, sendToUser } = require('./websocket');
const { getToday } = require('./utils/helpers');
const db = require('./config/db');
const { runMigrations } = require('./migrations');

// Startup database migrations (idempotent)
runMigrations();

// 路由
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const recordsRoutes = require('./routes/records');
const tasksRoutes = require('./routes/tasks');
const interactionsRoutes = require('./routes/interactions');
const progressRoutes = require('./routes/progress');
const messagesRoutes = require('./routes/messages');
const rewardsRoutes = require('./routes/rewards');
const profileRoutes = require('./routes/profile');
const pointRequestsRoutes = require('./routes/pointRequests');
const remindersRoutes = require('./routes/reminders');

const app = express();
const server = http.createServer(app);

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    onlineUsers: require('./websocket').getOnlineCount()
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/interactions', interactionsRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/point-requests', pointRequestsRoutes);
app.use('/api/reminders', remindersRoutes);

// 404 处理
app.use((req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

// 启动 WebSocket
setupWebSocket(server);

// 定时任务：每分钟检查提醒
cron.schedule('* * * * *', () => {
  try {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = getToday();
    const dayOfWeek = now.getDay() === 0 ? 7 : now.getDay(); // 1-7, 周一为1

    const reminders = db.prepare(`
      SELECT r.*, u.nickname as target_nickname
      FROM reminders r
      JOIN users u ON r.target_user_id = u.id
      WHERE r.is_active = 1 AND r.reminder_time = ?
    `).all(currentTime);

    reminders.forEach(reminder => {
      const repeatDays = JSON.parse(reminder.repeat_days || '[1,2,3,4,5,6,7]');
      if (!repeatDays.includes(dayOfWeek)) return;

      // 检查是否已发送
      const sent = db.prepare('SELECT id FROM reminder_logs WHERE reminder_id = ? AND sent_date = ?').get(reminder.id, today);
      if (sent) return;

      // 发送推送
      const pushed = sendToUser(reminder.target_user_id, {
        type: 'reminder',
        title: reminder.title,
        icon: reminder.icon,
        reminderId: reminder.id,
        timestamp: Date.now()
      });

      // 记录发送日志
      db.prepare('INSERT INTO reminder_logs (reminder_id, user_id, sent_date) VALUES (?, ?, ?)').run(reminder.id, reminder.target_user_id, today);

      console.log(`提醒已发送: ${reminder.title} -> 用户 ${reminder.target_user_id} (${pushed ? '在线推送' : '离线，待同步'})`);
    });
  } catch (err) {
    console.error('定时提醒检查错误:', err.message);
  }
});

// 内部工具：积分变动（带 record_date + 余额累计）
function addPointsHelper(userId, change, reason, referenceId) {
  const last = db.prepare('SELECT balance FROM points WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
  const balance = (last?.balance || 0) + change;
  db.prepare(`
    INSERT INTO points (user_id, change, reason, reference_id, balance, record_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, change, reason, referenceId || null, balance, getToday());
  return balance;
}

// 内部工具：判断指定日期某用户是否饮食达标（摄入<=目标热量 且 喝水>=6杯）
function isDietQualified(userId, date) {
  const profile = db.prepare('SELECT daily_calorie_goal FROM user_profiles WHERE user_id = ?').get(userId);
  if (!profile) return false;

  // 今日总摄入热量
  const foodRow = db.prepare(`
    SELECT COALESCE(SUM(calories), 0) as total
    FROM food_logs
    WHERE user_id = ? AND record_date = ?
  `).get(userId, date);
  const totalCalories = foodRow.total || 0;
  if (totalCalories > profile.daily_calorie_goal) return false;

  // 今日喝水杯数（type=water，多笔count求和）
  const waterRow = db.prepare(`
    SELECT COALESCE(SUM(count), 0) as cups
    FROM check_ins
    WHERE user_id = ? AND date = ? AND type = 'water'
  `).get(userId, date);
  const cups = waterRow.cups || 0;
  if (cups < 6) return false;

  return true;
}

// 内部工具：获取YYYY-MM-DD往前推N天的日期字符串
function daysAgo(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 定时任务：每日 22:00 执行饮食达标总结 + 连续打卡成就解锁
cron.schedule('0 22 * * *', () => {
  try {
    const today = getToday();
    console.log(`[每日总结 ${today}] 开始执行饮食达标检查...`);

    // 找出所有绑定关系的主角（role='main' 且已绑定伴侣）
    const mainUsers = db.prepare(`
      SELECT u.id, u.username, u.nickname, u.partner_id
      FROM users u
      WHERE u.role = 'main' AND u.partner_id IS NOT NULL
    `).all();

    for (const user of mainUsers) {
      const qualified = isDietQualified(user.id, today);
      if (!qualified) continue;

      // a. 发放5分达标奖励
      addPointsHelper(user.id, 5, '今日饮食达标奖励', null);

      // b. 推送给主角
      sendToUser(user.id, {
        type: 'diet_bonus',
        message: '今天饮食达标！+5积分',
        points: 5
      });

      // c. 推送给伴侣
      if (user.partner_id) {
        sendToUser(user.partner_id, {
          type: 'partner_diet_bonus',
          nickname: user.nickname || user.username
        });
      }

      console.log(`[每日总结] 用户 ${user.nickname}(#${user.id}) 饮食达标，奖励+5分`);

      // 检查连续达标 >=7天，解锁成就 streak_7
      const already = db.prepare(`
        SELECT id FROM achievements WHERE user_id = ? AND achievement_type = ?
      `).get(user.id, 'streak_7');
      if (already) continue;

      // 往前推6天 + 今天 = 共7天，检查是否全部达标
      let streak = 0;
      for (let i = 0; i < 7; i++) {
        const d = daysAgo(today, i);
        if (isDietQualified(user.id, d)) {
          streak++;
        } else {
          break;
        }
      }

      if (streak >= 7) {
        db.prepare(`
          INSERT INTO achievements (user_id, achievement_type, title, description, icon)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          user.id,
          'streak_7',
          '七日自律之星',
          '连续7天饮食打卡达标，坚持就是胜利！',
          '🔥'
        );

        // 推送解锁成就
        sendToUser(user.id, {
          type: 'achievement_unlocked',
          achievementType: 'streak_7',
          title: '七日自律之星',
          icon: '🔥'
        });

        console.log(`[每日总结] 用户 ${user.nickname}(#${user.id}) 解锁成就 streak_7（连续${streak}天达标）`);
      }
    }

    console.log(`[每日总结 ${today}] 执行完成，共处理 ${mainUsers.length} 位主角`);
  } catch (err) {
    console.error('每日饮食达标总结错误:', err.message);
  }
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Xlover 后端服务已启动`);
  console.log(`  端口: ${PORT}`);
  console.log(`  环境: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  健康检查: http://localhost:${PORT}/health`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`========================================\n`);
});

module.exports = { app, server };

