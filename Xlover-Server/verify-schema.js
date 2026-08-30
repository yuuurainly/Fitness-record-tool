const fs = require("fs");
const path = require("path");

/* ---- 1. 从 init.js 解析每张表的列集合 ---- */
const initPath = path.resolve(process.argv[2] || "database/init.js");
const initText = fs.readFileSync(initPath, "utf8");
const createRegex = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*`,?/g;
const tableCols = {};
let m;
while ((m = createRegex.exec(initText)) !== null) {
  const tbl = m[1];
  const body = m[2];
  const cols = new Set();
  for (const line of body.split("\n")) {
    const mm = line.match(/^\s*(\w+)\s+/);
    if (!mm) continue;
    const col = mm[1];
    if (/^(PRIMARY|UNIQUE|FOREIGN|CHECK)$/.test(col)) continue;
    cols.add(col);
  }
  tableCols[tbl] = cols;
}
console.log("init.js 建表数:", Object.keys(tableCols).length);

/* ---- 2. 从 routes 扫描所有 INSERT INTO tbl (a,b,c) / UPDATE tbl SET a=? 的列引用 ---- */
const srcDir = path.resolve(__dirname, "src");
const refs = {}; // tbl -> Set(col)
const addRef = (tbl, col) => {
  if (!refs[tbl]) refs[tbl] = new Set();
  if (col) refs[tbl].add(col);
};

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) walk(fp);
    else if (fp.endsWith(".js")) {
      const code = fs.readFileSync(fp, "utf8");
      // INSERT INTO table (a,b,c)
      const insRe = /INSERT\s+INTO\s+(\w+)\s*\(\s*([^)]+)\s*\)/gi;
      let mm;
      while ((mm = insRe.exec(code))) {
        const tbl = mm[1];
        mm[2].split(",").forEach(c => {
          const col = c.trim().replace(/`/g, "").split(/\s+/)[0];
          if (col && !/^(?:VALUES|SELECT)$/i.test(col)) addRef(tbl, col);
        });
      }
      // UPDATE table SET  col = ...  or  col=?
      const updRe = /UPDATE\s+(\w+)\s+SET\s+([\s\S]*?)(?:WHERE|$)/gim;
      while ((mm = updRe.exec(code))) {
        const tbl = mm[1];
        mm[2].split(",").forEach(pair => {
          const m2 = pair.match(/(\w+)\s*=/);
          if (m2) addRef(tbl, m2[1]);
        });
      }
      // SELECT col FROM tbl 或 WHERE tbl.col
      const selRe = /FROM\s+(\w+)\s+(?:\w+\s+)?WHERE\s+([\s\S]*?)(?:ORDER|GROUP|LIMIT|\)|$)/gi;
      while ((mm = selRe.exec(code))) {
        const tbl = mm[1];
        const clause = mm[2];
        const colRe = /\b(?:\w+\.)?([a-zA-Z_][a-zA-Z_0-9]*)\s*(?:=|IN|IS|>|<|<>|!=|LIKE)/g;
        let m3;
        while ((m3 = colRe.exec(clause))) {
          const col = m3[1];
          if (!/^(AND|OR|NOT|NULL|TRUE|FALSE|LIKE|IN|WHERE|\d+)$/.test(col)) {
            if (!tableCols[tbl] || tableCols[tbl].has(col)) addRef(tbl, col);
          }
        }
      }
    }
  }
}
walk(srcDir);

/* ---- 3. Diff 打印 ---- */
console.log("\n========= 表/列 差异扫描 =========");
let issues = 0;
for (const tbl of Object.keys(tableCols).sort()) {
  const expected = tableCols[tbl];
  const used = refs[tbl] || new Set();
  const missing = [...used].filter(c => !expected.has(c));
  if (missing.length) {
    console.log(`❌ ${tbl} => 代码里引用但 init.js 没建: ${missing.join(", ")}`);
    issues++;
  }
}
// 也打印：代码里用到但 init.js 完全没建的表
for (const tbl of Object.keys(refs).sort()) {
  if (!tableCols[tbl]) {
    // 白名单：别名/视图/排除 known-temp
    if (/^(?:sqlite_sequence)$/.test(tbl)) continue;
    console.log(`⚠️  ${tbl} => 代码引用但 init.js 里无此表`);
    issues++;
  }
}
if (issues === 0) console.log("✅ 完全匹配：所有代码引用的表/列 init.js 里都有");
process.exit(issues > 0 ? 1 : 0);
