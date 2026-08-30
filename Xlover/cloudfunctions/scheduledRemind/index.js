const cloud = require('wx-server-sdk')
const got = require('got')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const PUSHPLUS_API = 'http://www.pushplus.plus/send'

const DEFAULT_REMINDERS = {
  water: { name: '喝水提醒', desc: '该喝水啦！每天8杯水，保持身体水分充足哦 💧' },
  exercise: { name: '运动提醒', desc: '该动起来啦！今天运动了吗？一起打卡吧 🏃' },
  sleep: { name: '睡觉提醒', desc: '夜深了，早点休息吧。晚安，明天继续加油 🌙' }
}

function getToday() {
  // 云函数运行在 UTC，转为北京时间 (UTC+8)
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function getCurrentTime() {
  // 云函数运行在 UTC，转为北京时间 (UTC+8)
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

async function sendPushplus(token, title, content) {
  if (!token) return false
  try {
    const res = await got(PUSHPLUS_API, {
      method: 'POST',
      json: {
        token,
        title,
        content,
        template: 'txt'
      },
      timeout: { request: 10000 }
    })
    // got v11 json 选项会自动解析 body
    console.log('PushPlus 响应:', JSON.stringify(res.body))
    return res.body && res.body.code === 200
  } catch (err) {
    console.error('PushPlus 发送失败', err.message)
    return false
  }
}

exports.main = async (event, context) => {
  const today = getToday()
  const now = getCurrentTime()
  console.log(`[scheduledRemind] 开始执行 时间=${now} 日期=${today}`)

  // 1分钟窗口（每分钟触发）
  const timeWindow = [now]
  console.log(`[scheduledRemind] 时间窗口: ${timeWindow.join(',')}`)

  try {
    const remindRes = await db.collection('reminders').get()
    console.log(`[scheduledRemind] 查到 ${remindRes.data.length} 条提醒记录`)
    let sentCount = 0

    for (const record of remindRes.data) {
      const openid = record._openid
      const settings = record.settings || {}
      const settingKeys = Object.keys(settings).filter(k => settings[k] && settings[k].enabled)
      if (settingKeys.length === 0) continue

      // 获取用户的 pushplus token
      const userRes = await db.collection('users').where({ _openid: openid }).get()
      const user = userRes.data[0]
      const token = user?.pushplusToken
      if (!token) {
        console.log(`[scheduledRemind] 用户 ${openid} 未配置 pushplusToken，跳过`)
        continue
      }

      for (const reminderId of settingKeys) {
        const config = settings[reminderId]
        console.log(`[scheduledRemind] 检查提醒 ${reminderId} enabled=${config.enabled} time=${config.time}`)

        if (!config.enabled) continue
        if (!timeWindow.includes(config.time)) continue

        // 确定推送目标：伴侣给主角设置的提醒要推送到主角的 PushPlus
        let targetOpenid = openid
        let pushToken = token
        if (config.fromPartner && config.targetOpenid) {
          targetOpenid = config.targetOpenid
          // 查找主角的 pushplusToken
          const mainRes = await db.collection('users').where({ _openid: targetOpenid }).get()
          const mainUser = mainRes.data[0]
          if (mainUser?.pushplusToken) {
            pushToken = mainUser.pushplusToken
          } else {
            console.log(`[scheduledRemind] 伴侣提醒 ${reminderId}: 主角 ${targetOpenid} 未配置 pushplusToken，跳过`)
            continue
          }
        }

        // 检查今天是否已发送
        let alreadySent = false
        try {
          const logRes = await db.collection('reminder_logs').where({
            _openid: targetOpenid,
            reminderId,
            date: today
          }).count()
          alreadySent = logRes.total > 0
        } catch (e) {
          // reminder_logs 集合不存在，当作未发送
        }

        if (alreadySent) {
          console.log(`[scheduledRemind] ${reminderId} 今天已发送过，跳过`)
          continue
        }

        console.log(`[scheduledRemind] 准备发送 ${config.name || 'Xlover提醒'} 给 ${targetOpenid}`)
        const defaultInfo = DEFAULT_REMINDERS[reminderId] || {}
        const reminderName = config.name || defaultInfo.name || 'Xlover提醒'
        let reminderDesc = config.desc || defaultInfo.desc || '记得完成今日打卡哦~'
        // 伴侣设置的提醒，增加来源标注
        if (config.fromPartner) {
          const fromUser = await db.collection('users').where({ _openid: openid }).get()
          const fromName = fromUser.data[0]?.nickName || '伴侣'
          reminderDesc += `\n\n💕 来自 ${fromName} 的提醒`
        }
        const success = await sendPushplus(
          pushToken,
          `${reminderName}`,
          `${reminderDesc}\n\n⏰ 提醒时间：${config.time}\n📅 日期：${today}`
        )

        if (success) {
          try {
            await db.collection('reminder_logs').add({
              data: {
                _openid: targetOpenid,
                reminderId,
                date: today,
                time: now,
                createTime: db.serverDate()
              }
            })
          } catch (e) {
            console.log('reminder_logs 写入失败（集合可能不存在）', e.message)
          }
          sentCount++
          console.log(`[scheduledRemind] 发送成功 ${reminderName}`)
        } else {
          console.log(`[scheduledRemind] 发送失败 ${reminderName}`)
        }
      }
    }

    console.log(`[scheduledRemind] 执行完成 发送=${sentCount}`)
    return { success: true, checked: remindRes.data.length, sent: sentCount, time: now }
  } catch (err) {
    console.error('[scheduledRemind] 错误', err)
    return { error: err.message }
  }
}