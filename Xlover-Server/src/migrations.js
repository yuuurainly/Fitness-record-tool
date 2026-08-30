/**
 * 数据库 Migration（轻量级、幂等）
 * SQLite 下用 PRAGMA table_info 精确检查列是否存在，再 ADD COLUMN，避免重复报错。
 */
const db = require('./config/db');

function hasColumn(tableName, columnName) {
  try {
    // node:sqlite DatabaseSync.prepare 可直接执行 PRAGMA，.all() 返回行数组
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    // PRAGMA table_info 每行: cid, name, type, notnull, dflt_value, pk
    return Array.isArray(rows) && rows.some(r => String(r.name) === String(columnName));
  } catch (e) {
    // 兜底：如果查询方式不兼容，走 try-add/catch-duplicate 路径，
    // 但外层也有 catch，所以直接返回 false 尝试 ALTER
    return false;
  }
}

function runMigrations() {
  try {
    // Migration #0: users.avatar 默认空串，旧 NULL 全部兜底为 ''
    // （前端 DTO 要求 avatar 非空，避免 "Non-null value 'avatar' was null" 报错）
    try {
      const stmt = db.prepare(`PRAGMA table_info(users)`).all();
      const avatarCol = stmt.find(r => String(r.name) === 'avatar');
      // 如果 avatar 列 dflt_value 不是 ''，重建默认值
      // SQLite 不能直接 ALTER COLUMN DEFAULT，所以用 UPDATE + 设置 SQL 层兜底来处理
      const affected = db.prepare("UPDATE users SET avatar = '' WHERE avatar IS NULL OR avatar = 'NULL'").run();
      if (affected.changes > 0) {
        console.log(`[migration] OK: users.avatar — 将 ${affected.changes} 行 NULL/空值修复为 '' 空串`);
      } else {
        console.log('[migration] SKIP: users.avatar 无需修复');
      }
    } catch (e0) {
      console.warn('[migration] #0 warning:', e0.message);
    }

    // Migration #1: user_profiles.water_goal（每日喝水目标杯数，默认8）
    if (!hasColumn('user_profiles', 'water_goal')) {
      db.exec('ALTER TABLE user_profiles ADD COLUMN water_goal INTEGER DEFAULT 8');
      console.log('[migration] OK: user_profiles.water_goal added (default 8)');
    } else {
      console.log('[migration] SKIP: user_profiles.water_goal already exists');
    }

    // Migration #2: user_profiles.activity_level / activity_factor（活动水平档位 + 系数，默认NULL=未选）
    if (!hasColumn('user_profiles', 'activity_level')) {
      db.exec(`ALTER TABLE user_profiles ADD COLUMN activity_level TEXT`);
      console.log('[migration] OK: user_profiles.activity_level added (default NULL)');
    } else {
      console.log('[migration] SKIP: user_profiles.activity_level already exists');
    }
    if (!hasColumn('user_profiles', 'activity_factor')) {
      db.exec(`ALTER TABLE user_profiles ADD COLUMN activity_factor REAL`);
      console.log('[migration] OK: user_profiles.activity_factor added (default NULL)');
    } else {
      console.log('[migration] SKIP: user_profiles.activity_factor already exists');
    }

    // Migration #3: user_profiles.target_date（目标达成日期，TEXT yyyy-MM-dd）
    if (!hasColumn('user_profiles', 'target_date')) {
      db.exec(`ALTER TABLE user_profiles ADD COLUMN target_date TEXT`);
      console.log('[migration] OK: user_profiles.target_date added');
    } else {
      console.log('[migration] SKIP: user_profiles.target_date already exists');
    }

    // Migration #4: praises 表（伴侣表扬，已废用但需空表占位防 SQL 崩溃）
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS praises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL, receiver_id INTEGER NOT NULL,
        content TEXT, sender_nickname TEXT, effect_type TEXT,
        is_viewed INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);
      const c = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='praises'").get().n;
      console.log(`[migration] ${c ? 'OK' : 'SKIP'}: praises 表已就位`);
    } catch (e) { console.warn('[migration] #4 warning:', e.message); }

    // Migration #5: daily_likes 表（每日互赞/伴侣打卡，已废用但需空表占位）
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS daily_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_user_id INTEGER NOT NULL, target_user_id INTEGER NOT NULL,
        record_date TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(from_user_id, target_user_id, record_date)
      )`);
      const c = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='daily_likes'").get().n;
      console.log(`[migration] ${c ? 'OK' : 'SKIP'}: daily_likes 表已就位`);
    } catch (e) { console.warn('[migration] #5 warning:', e.message); }

    // Migration #6: werun_steps 表（微信运动步数，已废用但需空表占位）
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS werun_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL, date TEXT NOT NULL,
        steps INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, date)
      )`);
      const c = db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='werun_steps'").get().n;
      console.log(`[migration] ${c ? 'OK' : 'SKIP'}: werun_steps 表已就位`);
    } catch (e) { console.warn('[migration] #6 warning:', e.message); }

    // Migration #7: point_requests 表结构修复
    // 旧版字段（requester_id / request_type / amount / reason）与实际代码使用的字段
    // （user_id / type / title / description / points / exercise_id / reviewer_id / record_date / updated_at）
    // 完全不一致，会导致 "no such column: user_id" HTTP 500。
    // 处理：如果存在 point_requests 且没有 user_id 列，则重命名旧表为 point_requests_old，
    //       然后按新 schema 重建一张空表（正常情况下旧表为空，不影响任何数据）。
    try {
      const pointTableInfo = db.prepare(`PRAGMA table_info(point_requests)`).all();
      const has = (col) => pointTableInfo.some(r => String(r.name) === col);
      const exists = pointTableInfo.length > 0;
      if (!exists) {
        console.log('[migration] SKIP: point_requests 不存在，将由 init.js 首次创建');
      } else if (has('user_id') && has('points') && has('title') && has('updated_at')) {
        console.log('[migration] SKIP: point_requests 字段已是新版，无需修复');
      } else {
        const stamp = Date.now();
        db.exec(`ALTER TABLE point_requests RENAME TO point_requests_old_${stamp}`);
        db.exec(`CREATE TABLE point_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          type TEXT DEFAULT 'custom',
          title TEXT NOT NULL,
          description TEXT,
          points INTEGER NOT NULL,
          exercise_id INTEGER,
          status TEXT DEFAULT 'pending',
          reviewer_id INTEGER,
          record_date TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        console.log(`[migration] OK: point_requests 重建为新 schema（旧表已归档 point_requests_old_${stamp}）`);
      }
    } catch (e) {
      console.warn('[migration] #7 warning:', e.message);
    }

    // Migration #7a: tasks.completed_at 列（打卡完成时写入）
    // ⚠️  必须在 Migration #8 之前执行：先 ADD COLUMN 避免 Migration #8 因 expect 缺 completed_at
    //     触发整表 RENAME+重建，清空已有任务数据
    try {
      if (!hasColumn('tasks', 'completed_at')) {
        db.exec('ALTER TABLE tasks ADD COLUMN completed_at DATETIME');
        console.log('[migration] OK: tasks.completed_at added via ALTER TABLE (data preserved)');
      } else {
        console.log('[migration] SKIP: tasks.completed_at already exists');
      }
    } catch (e7a) {
      console.warn('[migration] #7a warning:', e7a.message);
    }

    // Migration #8: 批量修复 6 张旧表列结构不匹配
    // 检测关键列是否存在，缺一则 RENAME 为 _old_时间戳 并按新版 schema 重建空表。
    // （当前所有表都无有效数据，这种方式最稳最快）
    const schema8 = {
      tasks: {
        expect: ['type','points','cycle_mode','cycle_days','habit_streak','completions','completed_at','updated_at','current_streak'],
        ddl: `CREATE TABLE tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          creator_id INTEGER NOT NULL, assignee_id INTEGER,
          title TEXT NOT NULL, description TEXT,
          type TEXT DEFAULT 'once', points INTEGER DEFAULT 0,
          cycle_mode TEXT DEFAULT 'daily', period_start TEXT, period_end TEXT,
          cycle_count INTEGER DEFAULT 1, cycle_days INTEGER DEFAULT 1,
          habit_days INTEGER, habit_streak INTEGER DEFAULT 0,
          completed_days INTEGER DEFAULT 0, completions TEXT DEFAULT '[]',
          status TEXT DEFAULT 'pending', due_date TEXT,
          accepted_at DATETIME,
          completed_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          task_type TEXT, points_reward INTEGER,
          recurrence_rule TEXT, target_days TEXT,
          current_streak INTEGER DEFAULT 0, completed_date TEXT
        )`
      },
      reminders: {
        expect: ['creator_id','description','source_tag'],
        ddl: `CREATE TABLE reminders (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          creator_id INTEGER NOT NULL, user_id INTEGER, target_user_id INTEGER NOT NULL,
          title TEXT NOT NULL, icon TEXT, description TEXT,
          reminder_time TEXT NOT NULL, repeat_days TEXT,
          is_active INTEGER DEFAULT 1, source_tag TEXT DEFAULT 'self',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      food_library: {
        expect: ['is_custom','user_id'],
        ddl: `CREATE TABLE food_library (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL, category TEXT,
          calories_per_100g REAL NOT NULL,
          protein REAL DEFAULT 0, carbs REAL DEFAULT 0, fat REAL DEFAULT 0,
          icon TEXT, is_custom INTEGER DEFAULT 0, user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      record_likes: {
        expect: ['from_user_id','target_user_id'],
        ddl: `CREATE TABLE record_likes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT NOT NULL,
          from_user_id INTEGER NOT NULL, target_user_id INTEGER, user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      record_comments: {
        expect: ['from_user_id','from_nickname'],
        ddl: `CREATE TABLE record_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_type TEXT NOT NULL, record_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL, from_user_id INTEGER, from_nickname TEXT,
          content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`
      },
      reward_claims: {
        expect: ['confirmed_at'],
        ddl: `CREATE TABLE reward_claims (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL, reward_id INTEGER NOT NULL,
          reward_name TEXT, points_cost INTEGER,
          status TEXT DEFAULT 'success',
          claimed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          confirmed_at DATETIME
        )`
      }
    };
    const stamp8 = Date.now();
    for (const [tbl, rule] of Object.entries(schema8)) {
      try {
        const cols = db.prepare(`PRAGMA table_info("${tbl}")`).all().map(r => String(r.name));
        if (cols.length === 0) {
          console.log(`[migration] SKIP: ${tbl} 不存在，将由 init.js 首次创建`);
          continue;
        }
        const missing = rule.expect.filter(c => !cols.includes(c));
        if (missing.length === 0) {
          console.log(`[migration] SKIP: ${tbl} 字段匹配`);
          continue;
        }
        db.exec(`ALTER TABLE "${tbl}" RENAME TO "${tbl}_old_${stamp8}"`);
        db.exec(rule.ddl);
        console.log(`[migration] OK: ${tbl} 重建（缺列 ${missing.join(',')}，旧表 ${tbl}_old_${stamp8}）`);
      } catch (e) {
        console.warn(`[migration] #8 ${tbl} warning:`, e.message);
      }
    }
  } catch (e) {
    // 任何异常仅打印，不阻塞服务启动
    console.warn('[migration] warning:', e.message);
  }
}

module.exports = { runMigrations };
