/**
 * 数据库完整重置脚本
 * 用法：  node database/reset.js
 *
 * 流程（兼容文件被占用）：
 *   阶段 A：尝试备份旧 .db/.shm/.wal → 成功则全新建库
 *   阶段 B：若被占用（常见：后端进程/测试连着 SQLite），
 *           就直接在当前连接上 DROP TABLE 所有表 → 按 init.js 重建
 *   1) 建表（20 张）
 *   2) 导入种子（food library + exercise library + 初始奖品）
 *   3) DELETE sqlite_sequence → 自增 ID 从 1 开始
 *
 * ⚠️  会清空全部用户数据 + 记录 + 任务 + 积分，仅在全新部署/清脏数据用
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'xlover.db');
const SHM = DB_PATH + '-shm';
const WAL = DB_PATH + '-wal';

console.log('============================================');
console.log(' ⚠️  Xlover 数据库重置（清空全部数据！）');
console.log('============================================');
console.log('  目标 DB: ' + DB_PATH);

/* ---------- 1. 尝试 Rename 备份（非关键，失败则就地 DROP） ---------- */
let renamed = false;
try {
  const stamp = Date.now();
  for (const p of [DB_PATH, SHM, WAL]) {
    if (fs.existsSync(p)) {
      fs.renameSync(p, p + '.bak.' + stamp);
      console.log('  🗂️  已备份: ' + path.basename(p) + ' → .bak.' + stamp);
      renamed = true;
    }
  }
} catch (e) {
  console.log('  ℹ️  文件被其它进程占用，改用就地 DROP 模式（备份跳过）: ' + e.message.split('\n')[0]);
  renamed = false;
}

/* ---------- 2. 打开连接 ---------- */
const db = require('../src/config/db');

/* ---------- 3. 如果没删掉原文件，就 DROP 掉全部表 ---------- */
if (!renamed) {
  const allTables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type='table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(r => r.name);

  if (allTables.length) {
    console.log(`\n[drop] 删除现有表（${allTables.length} 张）...`);
    // SQLite 没启用外键时可以任意顺序删除，这里保险起见逐个删
    db.exec('PRAGMA foreign_keys = OFF');
    const tx = db.transaction(() => {
      for (const t of allTables) {
        db.exec(`DROP TABLE IF EXISTS "${t}"`);
        console.log('  ✅ DROP ' + t);
      }
    });
    tx();
  }
}

/* ---------- 4. 建表 ---------- */
console.log('\n[1/3] 建表...');
require('./init.js');

/* ---------- 5. 种子 ---------- */
console.log('\n[2/3] 导入种子数据...');
require('./seedFoods.js');

/* ---------- 6. 重置自增 ID ---------- */
console.log('\n[3/3] 重置自增 ID...');
try {
  const hasSeq = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"
  ).get();
  if (hasSeq) db.exec('DELETE FROM sqlite_sequence');
  console.log('  ✅ 所有自增 ID 已重置为从 1 开始');
} catch (e) {
  console.warn('  ⚠️  重置自增ID失败（可忽略）: ' + e.message);
}

/* ---------- 7. 摘要打印 ---------- */
const count = (tbl) => {
  try { return db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n; }
  catch { return 0; }
};
console.log('\n============================================');
console.log(' ✅ 重置完成！当前各表行数：');
console.log('   users            : ' + count('users'));
console.log('   user_profiles    : ' + count('user_profiles'));
console.log('   food_library     : ' + count('food_library'));
console.log('   exercise_library : ' + count('exercise_library'));
console.log('   rewards          : ' + count('rewards'));
console.log('   tasks            : ' + count('tasks'));
console.log('   points           : ' + count('points'));
console.log('============================================');
console.log('\n💡 下一步：  npm start   启动后端服务');
