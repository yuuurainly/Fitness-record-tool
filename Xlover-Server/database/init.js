/**
 * 数据库初始化脚本
 * 用法：  npm run init-db   或   node database/init.js
 *
 * 说明：所有 CREATE TABLE 使用 IF NOT EXISTS，保证幂等；
 *       表的扩展字段（water_goal / activity_level / activity_factor）
 *       由 src/migrations.js 在服务启动时 runMigrations() 增量补齐。
 */
const path = require('path');
const db = require('../src/config/db');

console.log('============================================');
console.log(' Xlover 数据库初始化');
console.log('============================================');

const tables = [
  /* ============= 用户 & 档案 ============= */
  `CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname      TEXT,
    avatar        TEXT,
    role          TEXT DEFAULT 'main',
    partner_id    INTEGER,
    bind_code     TEXT UNIQUE,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS user_profiles (
    user_id              INTEGER PRIMARY KEY,
    start_weight         REAL DEFAULT 60,
    current_weight       REAL DEFAULT 60,
    target_weight        REAL,
    daily_calorie_goal   INTEGER DEFAULT 1800,
    height               REAL,
    age                  INTEGER,
    gender               TEXT,
    water_goal           INTEGER DEFAULT 8,
    activity_level       TEXT,
    activity_factor      REAL,
    target_date          TEXT,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 记录 ============= */
  `CREATE TABLE IF NOT EXISTS food_logs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL,
    food_name          TEXT NOT NULL,
    calories_per_100g  REAL DEFAULT 0,
    calories           REAL DEFAULT 0,
    protein            REAL DEFAULT 0,
    carbs              REAL DEFAULT 0,
    fat                REAL DEFAULT 0,
    serving_size       REAL DEFAULT 100,
    meal_type          TEXT DEFAULT 'lunch',
    food_id            INTEGER,
    record_date        TEXT NOT NULL,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_logs (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    exercise_type    TEXT NOT NULL,
    type_name        TEXT,
    icon             TEXT,
    duration         INTEGER DEFAULT 0,
    calories_burned  REAL DEFAULT 0,
    met_value        REAL,
    record_date      TEXT NOT NULL,
    exercise_library_id INTEGER,
    note             TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS body_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    weight       REAL NOT NULL,
    bmi          REAL,
    body_fat     REAL,
    record_date  TEXT NOT NULL,
    note         TEXT,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS check_ins (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL,
    type        TEXT NOT NULL,
    date        TEXT NOT NULL,
    count       INTEGER DEFAULT 1,
    start_time  TEXT,
    end_time    TEXT,
    quality     TEXT,
    steps       INTEGER,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 任务 / 积分 / 奖励 ============= */
  `CREATE TABLE IF NOT EXISTS tasks (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id       INTEGER NOT NULL,
    assignee_id      INTEGER,
    title            TEXT NOT NULL,
    description      TEXT,
    type             TEXT DEFAULT 'once',
    points           INTEGER DEFAULT 0,
    cycle_mode       TEXT DEFAULT 'daily',
    period_start     TEXT,
    period_end       TEXT,
    cycle_count      INTEGER DEFAULT 1,
    cycle_days       INTEGER DEFAULT 1,
    habit_days       INTEGER,
    habit_streak     INTEGER DEFAULT 0,
    completed_days   INTEGER DEFAULT 0,
    completions      TEXT DEFAULT '[]',
    status           TEXT DEFAULT 'pending',
    due_date         TEXT,
    accepted_at      DATETIME,
    completed_at     DATETIME,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    /* ---------- 兼容旧 DTO / 接口（normalizeTask 读取）---------- */
    task_type        TEXT,
    points_reward    INTEGER,
    recurrence_rule  TEXT,
    target_days      TEXT,
    current_streak   INTEGER DEFAULT 0,
    completed_date   TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS points (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    change        INTEGER NOT NULL,
    reason        TEXT,
    reference_id  INTEGER,
    balance       INTEGER DEFAULT 0,
    record_date   TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS point_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id         INTEGER NOT NULL,
    type            TEXT DEFAULT 'custom',
    title           TEXT NOT NULL,
    description     TEXT,
    points          INTEGER NOT NULL,
    exercise_id     INTEGER,
    status          TEXT DEFAULT 'pending',
    reviewer_id     INTEGER,
    record_date     TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS rewards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id    INTEGER,
    name          TEXT NOT NULL,
    description   TEXT,
    points_cost   INTEGER NOT NULL,
    icon          TEXT,
    is_active     INTEGER DEFAULT 1,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS reward_claims (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL,
    reward_id     INTEGER NOT NULL,
    reward_name   TEXT,
    points_cost   INTEGER,
    status        TEXT DEFAULT 'success',
    claimed_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at  DATETIME
  )`,

  /* ============= 提醒 / 消息 ============= */
  `CREATE TABLE IF NOT EXISTS reminders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    creator_id      INTEGER NOT NULL,
    user_id         INTEGER,
    target_user_id  INTEGER NOT NULL,
    title           TEXT NOT NULL,
    icon            TEXT,
    description     TEXT,
    reminder_time   TEXT NOT NULL,
    repeat_days     TEXT,
    is_active       INTEGER DEFAULT 1,
    source_tag      TEXT DEFAULT 'self',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS reminder_logs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    reminder_id  INTEGER NOT NULL,
    user_id      INTEGER NOT NULL,
    sent_date    TEXT NOT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id     INTEGER NOT NULL,
    receiver_id   INTEGER NOT NULL,
    content       TEXT,
    type          TEXT DEFAULT 'text',
    media_url     TEXT,
    is_read       INTEGER DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 互动 ============= */
  `CREATE TABLE IF NOT EXISTS record_likes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    record_id      TEXT NOT NULL,
    from_user_id   INTEGER NOT NULL,
    target_user_id INTEGER,
    user_id        INTEGER,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS record_comments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    record_type     TEXT NOT NULL,
    record_id       INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    from_user_id    INTEGER,
    from_nickname   TEXT,
    content         TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS interactions (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id   INTEGER NOT NULL,
    to_user_id     INTEGER NOT NULL,
    interaction_type TEXT NOT NULL,
    ref_type       TEXT,
    ref_id         INTEGER,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 食物库 / 运动库 ============= */
  `CREATE TABLE IF NOT EXISTS food_library (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    name               TEXT NOT NULL,
    category           TEXT,
    calories_per_100g  REAL NOT NULL,
    protein            REAL DEFAULT 0,
    carbs              REAL DEFAULT 0,
    fat                REAL DEFAULT 0,
    icon               TEXT,
    is_custom          INTEGER DEFAULT 0,
    user_id            INTEGER,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS exercise_library (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    type_key   TEXT,
    category   TEXT,
    met_value  REAL NOT NULL,
    icon       TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 成就 ============= */
  `CREATE TABLE IF NOT EXISTS achievements (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id          INTEGER NOT NULL,
    achievement_type TEXT NOT NULL,
    title            TEXT,
    description      TEXT,
    icon             TEXT,
    unlocked_at      DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ============= 伴侣/互动废用表（保留空表防 SQL "no such table" 崩溃） ============= */
  `CREATE TABLE IF NOT EXISTS praises (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id         INTEGER NOT NULL,
    receiver_id       INTEGER NOT NULL,
    content           TEXT,
    sender_nickname   TEXT,
    effect_type       TEXT,
    is_viewed         INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS daily_likes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    from_user_id   INTEGER NOT NULL,
    target_user_id INTEGER NOT NULL,
    record_date    TEXT NOT NULL,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(from_user_id, target_user_id, record_date)
  )`,

  `CREATE TABLE IF NOT EXISTS werun_steps (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    date       TEXT NOT NULL,
    steps      INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, date)
  )`,
];

let ok = 0;
for (const sql of tables) {
  try {
    db.exec(sql);
    const m = /CREATE TABLE IF NOT EXISTS (\w+)/.exec(sql);
    const name = m ? m[1] : '—';
    console.log(`  ✅ ${name}`);
    ok++;
  } catch (e) {
    console.error(`  ❌ ${sql.split('\n')[0]}  ->`, e.message);
    process.exitCode = 1;
    process.exit(1);
  }
}

console.log(`\n🎉 建表完成（${ok} 张表），DB 文件: ${path.resolve(db.name || 'database/xlover.db')}`);
console.log('💡 下一步：  npm run seed-foods   （导入食物+运动+初始奖品）');
