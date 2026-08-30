const cloud = require('wx-server-sdk')
const got = require('got')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function getToday() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function getCurrentTime() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

async function sendPushplus(token, title, content) {
  if (!token) return false
  try {
    const res = await got('http://www.pushplus.plus/send', {
      method: 'POST',
      json: { token, title, content, template: 'txt' },
      timeout: { request: 10000 }
    })
    return res.body && res.body.code === 200
  } catch (err) {
    console.error('PushPlus 发送失败', err.message)
    return false
  }
}

exports.main = async (event, context) => {
  const today = getToday()
  const now = getCurrentTime()
  console.log(`[dailySummary] 开始执行 时间=${now} 日期=${today}`)

  try {
    // 找出所有设置了 summaryTime 的伴侣
    const usersRes = await db.collection('users').where({
      role: 'partner',
      partnerId: _.exists(true),
      pushplusToken: _.exists(true),
      summaryTime: _.exists(true)
    }).get()

    console.log(`[dailySummary] 找到 ${usersRes.data.length} 个需要推送总结的伴侣`)

    let sentCount = 0

    for (const partner of usersRes.data) {
      const summaryTime = partner.summaryTime
      if (summaryTime !== now) continue

      // 检查今天是否已推送
      try {
        const logRes = await db.collection('reminder_logs').where({
          _openid: partner._openid,
          reminderId: 'daily_summary',
          date: today
        }).count()
        if (logRes.total > 0) {
          console.log(`[dailySummary] ${partner._openid} 今日已推送，跳过`)
          continue
        }
      } catch (e) {}

      const partnerId = partner._openid
      const mainOpenid = partner.partnerId

      // 获取主角今日数据
      const [foodRes, exerciseRes, checkinRes, profileRes] = await Promise.all([
        db.collection('food_logs').where({ _openid: mainOpenid, date: today }).get(),
        db.collection('exercise_logs').where({ _openid: mainOpenid, date: today }).get(),
        db.collection('check_ins').where({ _openid: mainOpenid, date: today }).get(),
        db.collection('user_profiles').where({ _openid: mainOpenid }).get()
      ])

      // 组装总结内容
      const mainUser = await db.collection('users').where({ _openid: mainOpenid }).get()
      const mainName = mainUser.data[0]?.nickName || '她'

      const todayCalories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)
      const todayDuration = exerciseRes.data.reduce((sum, item) => sum + (item.duration || 0), 0)
      const todayBurn = exerciseRes.data.reduce((sum, item) => sum + (item.calories || 0), 0)

      let waterCount = 0
      let sleepDone = false
      let dietDone = false
      checkinRes.data.forEach(c => {
        if (c.type === 'water') waterCount = c.count || 0
        if (c.type === 'sleep') sleepDone = true
        if (c.type === 'diet') dietDone = true
      })

      let targetCalories = 1500
      if (profileRes.data[0]) {
        const p = profileRes.data[0]
        targetCalories = Math.round(10 * p.currentWeight + 6.25 * p.height - 5 * (p.age || 25) - 161)
      }

      const foodList = foodRes.data.map(f => `  · ${f.name} ${f.amount}g ${f.totalCalories}kcal`).join('\n')
      const exerciseList = exerciseRes.data.map(e => `  · ${e.typeName} ${e.duration}分钟 ${e.calories}kcal`).join('\n')

      let content = `📅 ${today} 每日总结\n\n`
      content += `💧 喝水：${waterCount}/8 杯 ${waterCount >= 8 ? '✅' : ''}\n\n`
      content += `🥗 饮食：${todayCalories}/${targetCalories} kcal\n`
      if (foodList) content += foodList + '\n'
      content += '\n'
      content += `🏃 运动：${todayDuration}分钟，消耗 ${todayBurn} kcal\n`
      if (exerciseList) content += exerciseList + '\n'
      content += '\n'
      content += `🌙 早睡：${sleepDone ? '✅ 已打卡' : '❌ 未打卡'}\n`

      // 计算完成率
      const items = [waterCount >= 8, todayDuration > 0, todayCalories > 0, sleepDone]
      const doneCount = items.filter(Boolean).length
      const rate = Math.round((doneCount / 4) * 100)

      let encouragement = ''
      if (rate === 100) encouragement = '🎉 今天全部完成了，太棒了！'
      else if (rate >= 75) encouragement = '💪 今天表现很好，继续保持！'
      else if (rate >= 50) encouragement = '😊 不错哦，再接再厉！'
      else encouragement = '🤗 今天辛苦了，明天一起加油！'

      content += `\n完成率：${doneCount}/4 (${rate}%)\n${encouragement}`

      const success = await sendPushplus(
        partner.pushplusToken,
        `📊 ${mainName}的每日总结`,
        content
      )

      if (success) {
        try {
          await db.collection('reminder_logs').add({
            data: {
              _openid: partner._openid,
              reminderId: 'daily_summary',
              date: today,
              time: now,
              createTime: db.serverDate()
            }
          })
        } catch (e) {}
        sentCount++
        console.log(`[dailySummary] 推送成功 ${mainName}`)
      }
    }

    console.log(`[dailySummary] 执行完成 发送=${sentCount}`)
    return { success: true, sent: sentCount, time: now }
  } catch (err) {
    console.error('[dailySummary] 错误', err)
    return { error: err.message }
  }
}