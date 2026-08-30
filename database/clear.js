/**
 * 清空数据库内容（保留表结构，重置自增 ID）
 *
 * 用法：node database/clear.js
 *
 * 适用场景：init.js 因 db 文件被占用（EBUSY）无法删除重建时，
 * 用本脚本等效清空所有业务表数据，随后再跑 seed.js 重新填充
 * 食物库/运动库种子数据，达到"彻底重置"的同等效果。
 *
 * 使用 Node.js 内置 node:sqlite（无需编译 better-sqlite3）
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(__dirname, 'xlover.db');
const db = new DatabaseSync(dbPath);
function pragma(stmt) { db.exec(`PRAGMA ${stmt}`); }

// 清空前先关外键检查，避免外键约束阻断 DELETE
pragma('foreign_keys = OFF');

// 所有业务表（顺序无所谓，因为已关外键检查）
const tables = [
  'users',
  'user_profiles',
  'check_ins',
  'body_records',
  'food_logs',
  'food_library',
  'exercise_library',
  'exercise_logs',
  'werun_steps',
  'tasks',
  'points',
  'point_requests',
  'rewards',
  'reward_claims',
  'messages',
  'praises',
  'record_likes',
  'record_comments',
  'daily_likes',
  'reminders',
  'reminder_logs',
  'achievements'
];

console.log('开始清空数据库内容...\n');

let cleared = 0;
let skipped = 0;

try {
  db.exec('BEGIN');
  tables.forEach(t => {
    try {
      // 用 WHERE 1 兜底，部分 SQLite 版本不支持无 WHERE 的 DELETE
      const r = db.prepare(`DELETE FROM ${t} WHERE 1`).run();
      cleared++;
      console.log(`  ✅ ${t}: 删除 ${typeof r.changes === 'number' ? r.changes : '?'} 行`);
    } catch (e) {
      skipped++;
      console.log(`  ⚠️  ${t}: ${e.message}`);
    }
  });

  // 重置自增 ID，让后续插入从 1 开始（用 prepare 绑定参数，exec 不支持占位符）
  try {
    const placeholders = tables.map(() => '?').join(',');
    db.prepare(`DELETE FROM sqlite_sequence WHERE name IN (${placeholders})`).run(...tables);
    console.log('\n  ✅ 已重置 sqlite_sequence');
  } catch (e) {
    // 某些表可能没出现在 sqlite_sequence，忽略
    console.log(`\n  ⚠️  重置 sqlite_sequence 时: ${e.message}`);
  }

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('\n❌ 清空失败:', e.message);
  process.exit(1);
}

// 重新打开外键检查
pragma('foreign_keys = ON');

console.log(`\n🎉 清空完成：成功 ${cleared} 张表，跳过 ${skipped} 张表`);
console.log('数据库位置:', dbPath);
console.log('\n⚠️  请接着运行：node database/seed.js   # 重新填充食物库+运动库种子数据');

try { db.close(); } catch (e) {}
