/**
 * 云端历史数据导出（只读）
 *
 * 用途：把当前用户的云端历史分批读出，交给小程序端的本地迁移逻辑。
 * 特性：
 *  - 只读：不写入、不删除任何云端数据
 *  - 分页：单次最多 100 条，客户端按 skip 循环拉取
 *  - 诊断：同时返回集合总数与 openid 命中数，用于判断是否存在
 *    「由云函数写入、没有 _openid 因而无法归属」的历史文档
 *
 * 注意：部署后需要在微信开发者工具中「上传并部署：云端安装依赖」。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 只允许导出这些集合，避免误读其它数据
const ALLOWED = ['user_profiles', 'body_records', 'exercise_logs', 'food_logs']
const MAX_LIMIT = 100

exports.main = async (event) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  if (!openid) return { error: '无法获取 openid' }

  const { collection, skip = 0, limit = MAX_LIMIT, diagnostics = false } = event || {}

  if (ALLOWED.indexOf(collection) === -1) {
    return { error: `不支持的集合：${collection}`, allowed: ALLOWED }
  }

  const size = Math.min(Math.max(parseInt(limit, 10) || MAX_LIMIT, 1), MAX_LIMIT)
  const from = Math.max(parseInt(skip, 10) || 0, 0)

  try {
    const res = await db.collection(collection)
      .where({ _openid: openid })
      .skip(from)
      .limit(size)
      .get()

    const data = res.data || []
    const result = {
      collection,
      skip: from,
      count: data.length,
      hasMore: data.length === size,
      data
    }

    if (diagnostics) {
      // 命中数与集合总数对比：差值说明有文档缺少 _openid，无法归属到任何用户
      const matched = await db.collection(collection).where({ _openid: openid }).count()
      const total = await db.collection(collection).count()
      result.diagnostics = {
        matchedForOpenid: matched.total,
        collectionTotal: total.total,
        unattributable: Math.max(total.total - matched.total, 0)
      }
    }

    return result
  } catch (err) {
    return { error: err.message || '读取云端数据失败', collection }
  }
}
