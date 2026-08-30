const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function getYesterday() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function getToday() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const yesterday = getYesterday()
  const today = getToday()
  console.log(`[midnightReward] 开始执行 昨天=${yesterday} 今天=${today}`)

  try {
    // 获取所有主角用户
    const usersRes = await db.collection('users').where({
      role: 'main',
      partnerId: _.exists(true)
    }).get()

    let rewardCount = 0

    for (const user of usersRes.data) {
      const openid = user._openid

      // 1. 检查昨天是否有饮食记录
      const foodRes = await db.collection('food_logs').where({
        _openid: openid,
        date: yesterday
      }).get()

      if (foodRes.data.length === 0) {
        console.log(`[midnightReward] ${openid} 昨天无饮食记录，跳过`)
        continue
      }

      const yesterdayCalories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)

      // 2. 获取目标热量
      let targetCalories = 1500
      const profileRes = await db.collection('user_profiles').where({ _openid: openid }).get()
      if (profileRes.data[0]) {
        const p = profileRes.data[0]
        targetCalories = Math.round(10 * p.currentWeight + 6.25 * p.height - 5 * (p.age || 25) - 161)
      }

      // 3. 检查是否已发过奖励
      const alreadyRewarded = await db.collection('points').where({
        _openid: openid,
        reason: '饮食达标奖励',
        date: yesterday
      }).count()

      if (alreadyRewarded.total > 0) {
        console.log(`[midnightReward] ${openid} 昨天已发放奖励，跳过`)
        continue
      }

      // 4. 判断是否达标：有饮食记录且未超过目标热量
      if (yesterdayCalories <= targetCalories) {
        await db.collection('points').add({
          data: {
            _openid: openid,
            value: 10,
            reason: '饮食达标奖励',
            date: yesterday,
            createTime: db.serverDate()
          }
        })
        rewardCount++
        console.log(`[midnightReward] ${openid} 饮食达标 ${yesterdayCalories}/${targetCalories}，+10积分`)

        // PushPlus 通知主角
        const token = user.pushplusToken
        if (token) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token,
                title: '🎉 昨日饮食达标奖励',
                content: `昨天摄入 ${yesterdayCalories}kcal，未超过目标 ${targetCalories}kcal，获得 +10 积分！`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('达标奖励推送失败', e.message)
          }
        }
      } else {
        console.log(`[midnightReward] ${openid} 饮食未达标 ${yesterdayCalories}/${targetCalories}，跳过`)
      }
    }

    console.log(`[midnightReward] 执行完成 奖励=${rewardCount}`)
    return { success: true, rewarded: rewardCount, date: yesterday }
  } catch (err) {
    console.error('[midnightReward] 错误', err)
    return { error: err.message }
  }
}
