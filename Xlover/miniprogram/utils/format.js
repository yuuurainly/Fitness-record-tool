/**
 * 展示层格式化工具（纯函数）
 */

function pad (n) {
  return String(n).padStart(2, '0')
}

function toDateStr (d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function today (now) {
  return toDateStr(now ? new Date(now) : new Date())
}

function parseDate (dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

function addDays (dateStr, delta) {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() + delta)
  return toDateStr(d)
}

/** 返回以 endDate 结尾、长度 n 的连续日期（升序） */
function lastNDates (endDate, n) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endDate, -i))
  return out
}

/** 2026-10-13 → 10-13 */
function monthDay (dateStr) {
  return String(dateStr).slice(5)
}

/** 2026-10-13 → 10月13日 */
function humanDate (dateStr) {
  const [, m, d] = String(dateStr).split('-')
  return `${Number(m)}月${Number(d)}日`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
function weekday (dateStr) {
  return WEEKDAYS[parseDate(dateStr).getDay()]
}

function round1 (n) {
  return Math.round(Number(n) * 10) / 10
}

function clamp (n, min, max) {
  return Math.min(Math.max(n, min), max)
}

/** 相对今天的自然语言日期 */
function relativeDay (dateStr, todayStr) {
  const base = todayStr || today()
  if (dateStr === base) return '今天'
  if (dateStr === addDays(base, -1)) return '昨天'
  if (dateStr === addDays(base, 1)) return '明天'
  return humanDate(dateStr)
}

module.exports = {
  pad,
  toDateStr,
  today,
  parseDate,
  addDays,
  lastNDates,
  monthDay,
  humanDate,
  weekday,
  round1,
  clamp,
  relativeDay
}
