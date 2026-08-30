/**
 * Xlover 数据库初始化脚本（对齐小程序实际代码功能）
 *
 * 用法：
 *   node database/init.js    # 删除旧库并重建所有表
 *   node database/seed.js    # 紧接着初始化食物库和运动库数据
 *
 * 使用 Node.js 内置 node:sqlite（无需编译 better-sqlite3）
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'xlover.db');

// ========== 0. 清理旧库（重建用，带重试避免文件锁）==========
function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }
function tryUnlink(file, retries = 5, delay = 500) {
  if (!fs.existsSync(file)) return;
  for (let i = 0; i < retries; i++) {
    try {
      fs.unlinkSync(file);
      console.log('已删除:', file);
      return;
    } catch (e) {
      if (i === retries - 1) {
        console.warn(`⚠️  删除${file}失败（${e.code}），跳过并尝试继续...`);
      } else {
        const w = (i + 1) * delay;
        console.log(`等待${w}ms后重试删除 ${path.basename(file)}...`);
        sleep(w);
      }
    }
  }
}
tryUnlink(dbPath);
const shmFile = dbPath + '-shm';
const walFile = dbPath + '-wal';
tryUnlink(shmFile);
tryUnlink(walFile);

if (!fs.existsSync(path.dirname(dbPath))) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new DatabaseSync(dbPath);
// node:sqlite 没有 pragma 方法，用 exec
function pragma(stmt) { db.exec(`PRAGMA ${stmt}`); }
pragma('journal_mode = WAL');
pragma('foreign_keys = ON');
console.log('开始创建数据库表...\n');

// ========== 1. 建表语句 ==========
const tables = [
  /* ============================ 用户与档案 ============================ */
  `CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'main',            -- main=主角/partner=伴侣
    partner_id INTEGER,
    bind_code TEXT,                                -- 主角生成的绑定码
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE user_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    gender TEXT DEFAULT 'female',
    age INTEGER DEFAULT 25,
    height REAL DEFAULT 165,
    start_weight REAL DEFAULT 0,                   -- 起始体重（减重基准）
    current_weight REAL DEFAULT 60,
    target_weight REAL DEFAULT 55,
    target_date TEXT DEFAULT '',                   -- 目标日期 YYYY-MM-DD
    activity_level TEXT DEFAULT 'moderate',        -- sedentary/light/moderate/active/very_active
    daily_calorie_goal INTEGER DEFAULT 1800,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============================ 打卡（按类型，对齐小程序 check_ins）============================ */
  `CREATE TABLE check_ins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,                           -- water/exercise/sleep/diet
    count INTEGER DEFAULT 1,                      -- 喝水计数：1~8
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_checkins_user_date_type ON check_ins(user_id, date, type)`,

  /* ============================ 体重记录 ============================ */
  `CREATE TABLE body_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    weight REAL NOT NULL,
    bmi REAL,
    body_fat REAL,                                 -- 体脂率，可选
    record_date DATE NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_body_records_user_date ON body_records(user_id, record_date)`,

  /* ============================ 饮食记录 ============================ */
  `CREATE TABLE food_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    food_name TEXT NOT NULL,
    calories_per_100g REAL DEFAULT 0,             -- 每100g热量
    calories REAL DEFAULT 0,                       -- 实际摄入热量（份量换算后）
    protein REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    serving_size REAL DEFAULT 100,                 -- 份量g
    meal_type TEXT DEFAULT 'lunch',                -- breakfast/lunch/dinner/snack
    record_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_food_logs_user_date ON food_logs(user_id, record_date)`,

  /* ============================ 饮食 - 食物库 ============================ */
  `CREATE TABLE food_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    calories_per_100g REAL DEFAULT 0,
    protein REAL DEFAULT 0,
    carbs REAL DEFAULT 0,
    fat REAL DEFAULT 0,
    category TEXT DEFAULT 'other',                 -- staple/meat/vegetable/fruit/snack/drink/dairy/other
    is_custom INTEGER DEFAULT 0,
    user_id INTEGER,                               -- 自定义食物所属用户
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_food_library_name ON food_library(name)`,

  /* ============================ 运动库（内置常见运动 + MET 值）============================ */
  `CREATE TABLE exercise_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type_key TEXT UNIQUE NOT NULL,                 -- 英文key，如 running/walking
    name TEXT NOT NULL,                            -- 中文名：跑步/散步
    icon TEXT DEFAULT '🏃',
    met_value REAL DEFAULT 5,                      -- MET值
    category TEXT DEFAULT 'cardio'                 -- cardio/strength/flexibility/housework
  )`,

  /* ============================ 运动记录 ============================ */
  `CREATE TABLE exercise_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    exercise_type TEXT NOT NULL,
    type_name TEXT NOT NULL,
    icon TEXT DEFAULT '🏃',
    duration INTEGER NOT NULL,                     -- 分钟
    calories_burned REAL DEFAULT 0,                -- 消耗热量
    met_value REAL DEFAULT 0,
    record_date DATE NOT NULL,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_exercise_logs_user_date ON exercise_logs(user_id, record_date)`,

  /* ============================ 微信步数同步（安卓：手动或系统步数）============================ */
  `CREATE TABLE werun_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    steps INTEGER DEFAULT 0,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  )`,

  /* ============================ 任务系统（对齐小程序3种任务）============================ */
  `CREATE TABLE tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,                   -- 伴侣发布者
    assignee_id INTEGER NOT NULL,                  -- 主角执行者
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    type TEXT NOT NULL DEFAULT 'single',           -- once=单次 / cycle=周期 / habit=习惯
    points INTEGER DEFAULT 10,
    status TEXT DEFAULT 'pending',                 -- pending/accepted/rejected/active/completed/expired/failed
    -- 周期任务
    cycle_mode TEXT DEFAULT 'daily',               -- daily / period（时间段）
    period_start TEXT DEFAULT '',
    period_end TEXT DEFAULT '',
    cycle_count INTEGER DEFAULT 1,                 -- 每日重复N次 或 周期内完成N天
    cycle_days INTEGER DEFAULT 1,
    -- 习惯养成
    habit_days INTEGER DEFAULT 7,                  -- 目标连续天数
    habit_streak INTEGER DEFAULT 0,                -- 当前连续天数
    -- 进度
    completed_days INTEGER DEFAULT 0,              -- 完成总天数
    completions TEXT DEFAULT '[]',                 -- 打卡记录JSON：[{date,created_at}]
    due_date TEXT DEFAULT '',                      -- 截止日期
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_tasks_assignee ON tasks(assignee_id, status)`,
  `CREATE INDEX idx_tasks_creator ON tasks(creator_id)`,

  /* ============================ 积分 ============================ */
  `CREATE TABLE points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    change INTEGER NOT NULL,                       -- 正/负
    reason TEXT DEFAULT '',
    reference_id INTEGER,                          -- 关联 task/reward id
    balance INTEGER DEFAULT 0,                     -- 变动后的余额（便于前端直接展示）
    record_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_points_user ON points(user_id, created_at)`,

  /* ============================ 积分申请审核（小程序最新commit核心功能）============================ */
  `CREATE TABLE point_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                      -- 申请人（主角）
    type TEXT NOT NULL,                            -- sleep / exercise / custom
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    points INTEGER NOT NULL DEFAULT 0,             -- 申请积分数量
    exercise_id INTEGER,                           -- 运动记录关联
    status TEXT DEFAULT 'pending',                 -- pending / approved / rejected
    reviewer_id INTEGER,                           -- 审核人（伴侣）
    record_date DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_point_requests_status ON point_requests(status)`,
  `CREATE INDEX idx_point_requests_user ON point_requests(user_id)`,

  /* ============================ 奖励系统 ============================ */
  `CREATE TABLE rewards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,                   -- 伴侣创建
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    points_cost INTEGER NOT NULL,
    icon TEXT DEFAULT '🎁',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE reward_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,                      -- 兑换人（主角）
    reward_id INTEGER NOT NULL,
    reward_name TEXT DEFAULT '',
    points_cost INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',                 -- pending / confirmed / cancelled
    claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at DATETIME
  )`,

  /* ============================ 消息 / 互动 ============================ */
  `CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    is_read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_messages_pair ON messages(sender_id, receiver_id, created_at)`,

  `CREATE TABLE praises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER NOT NULL,                    -- 伴侣
    receiver_id INTEGER NOT NULL,                  -- 主角
    content TEXT NOT NULL,                         -- 表扬内容
    sender_nickname TEXT DEFAULT '',
    effect_type TEXT DEFAULT 'hearts',             -- hearts / stars / confetti
    is_viewed INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_praises_receiver ON praises(receiver_id, is_viewed)`,

  /* ============================ 记录点赞（单条记录维度，对齐小程序 record_likes）============================ */
  `CREATE TABLE record_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,                 -- 点赞人（伴侣）
    target_user_id INTEGER NOT NULL,               -- 被点赞人（主角）
    record_id TEXT NOT NULL,                       -- "food_XX"/"exercise_XX"，字符串因为前缀
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_user_id, record_id)
  )`,
  `CREATE INDEX idx_record_likes_target ON record_likes(record_id)`,

  /* ============================ 记录评论（对齐小程序 record_comments）============================ */
  `CREATE TABLE record_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    from_nickname TEXT DEFAULT '',
    record_type TEXT NOT NULL,                     -- food / exercise / weight
    record_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE INDEX idx_record_comments ON record_comments(record_type, record_id)`,

  /* ============================ 每日整体点赞（对齐小程序 likes 表）============================ */
  `CREATE TABLE daily_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    record_date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_user_id, target_user_id, record_date)
  )`,

  /* ============================ 提醒系统（对齐 reminders + reminder_logs）============================ */
  `CREATE TABLE reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id INTEGER NOT NULL,                   -- 设置人
    target_user_id INTEGER NOT NULL,               -- 接收人
    title TEXT NOT NULL,
    icon TEXT DEFAULT '⏰',
    description TEXT DEFAULT '',
    reminder_time TEXT NOT NULL,                   -- HH:MM
    repeat_days TEXT DEFAULT '[1,2,3,4,5,6,7]',     -- JSON, 周一=1~周日=7
    is_active INTEGER DEFAULT 1,
    source_tag TEXT DEFAULT 'self',                -- self / from_partner / for_partner
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE reminder_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    sent_date DATE NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(reminder_id, sent_date)
  )`,

  /* ============================ 成就徽章 ============================ */
  `CREATE TABLE achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    achievement_type TEXT NOT NULL,                -- first_checkin / streak_7 / weight_1 ...
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    icon TEXT DEFAULT '⭐',
    unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_type)
  )`
];

// ========== 2. 执行建表 ==========
let ok = 0, failed = 0;
tables.forEach(sql => {
  try {
    db.exec(sql);
    ok++;
  } catch (e) {
    failed++;
    console.error('建表失败:', e.message);
    console.error('SQL:', sql.substring(0, 80) + '...');
  }
});

console.log(`\n✅ 建表完成：成功 ${ok} 条，失败 ${failed} 条`);

// ========== 3. 设置触发器：profile 更新时同步当前体重到 body_records（可选，略）==========

// node:sqlite 的 close 方法名是 close()（与 better-sqlite3 相同，但若不存在则忽略）
if (typeof db.close === 'function') { try { db.close(); } catch (e) {} }
console.log('数据库位置:', dbPath);
console.log('\n⚠️  请接着运行：node database/seed.js   # 初始化食物库+运动库种子数据');
