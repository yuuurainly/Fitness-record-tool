const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(date) {
  const d = new Date(date)
  // 转换为北京时间（UTC+8）
  const bjTime = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return `${bjTime.getUTCFullYear()}-${String(bjTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bjTime.getUTCDate()).padStart(2, '0')}`
}

// 获取北京时间今天的日期字符串
function getTodayBJ() {
  const now = new Date()
  const bjTime = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  return `${bjTime.getUTCFullYear()}-${String(bjTime.getUTCMonth() + 1).padStart(2, '0')}-${String(bjTime.getUTCDate()).padStart(2, '0')}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { type } = event

  try {
    // 获取当前用户信息
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    const user = userRes.data[0]
    if (!user) return { error: '用户不存在' }

    const partnerId = user.partnerId
    const today = getToday()

    switch (type) {
      case 'checkStatus': {
        const profileCount = await db.collection('user_profiles').where({ _openid: openid }).count()
        return { hasProfile: profileCount.total > 0 }
      }

      case 'getUserInfo': {
        return { data: user }
      }

      case 'getDashboard': {
        // 伴侣查询主角的 openid
        const targetOpenid = user.role === 'partner' && partnerId ? partnerId : openid

        // ===== 第一轮：所有独立查询并行（查主角数据）=====
        const [
          profileArr,
          foodRes,
          exerciseRes,
          checkinRes,
          streakRes,
          remindRes
        ] = await Promise.all([
          db.collection('user_profiles').where({ _openid: targetOpenid }).get().then(r => r.data[0] || null).catch(() => null),
          db.collection('food_logs').where({ _openid: targetOpenid, date: today }).orderBy('createTime', 'desc').get(),
          db.collection('exercise_logs').where({ _openid: targetOpenid, date: today }).orderBy('createTime', 'desc').get(),
          db.collection('check_ins').where({ _openid: targetOpenid, date: today }).get(),
          db.collection('check_ins').where({
            _openid: targetOpenid,
            type: _.in(['water', 'exercise', 'sleep'])
          }).orderBy('date', 'desc').limit(30).get(),
          db.collection('reminders').where({ _openid: openid }).get()
        ])

        const profile = profileArr
        const todayCalories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)
        let targetCalories = 1500
        if (profile) {
          targetCalories = Math.round(10 * profile.currentWeight + 6.25 * profile.height - 5 * (profile.age || 25) - 161)
        }
        const todayExercise = exerciseRes.data.reduce((sum, item) => sum + (item.duration || 0), 0)
        const todayExerciseCal = exerciseRes.data.reduce((sum, item) => sum + (item.calories || 0), 0)

        // 微信步数（容错）
        let werunStep = 0
        try {
          const werunRes = await db.collection('werun_steps').where({ _openid: targetOpenid, date: today }).limit(1).get()
          werunStep = werunRes.data[0]?.steps || 0
        } catch (e) {}

        // 打卡状态
        const checkins = { water: false, exercise: false, sleep: false, diet: false }
        let waterCount = 0
        checkinRes.data.forEach(c => {
          if (c.type === 'water') {
            waterCount = c.count || 0
            if (waterCount >= 8) checkins.water = true
          } else {
            checkins[c.type] = true
          }
        })

        // 连续打卡天数（使用北京时间）
        let streakDays = 0
        const checkinDates = [...new Set(streakRes.data.map(c => c.date))]
        const todayBJ = getTodayBJ()
        for (let i = 0; i < 365; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const expectedDate = formatDate(d)
          if (checkinDates.includes(expectedDate)) {
            streakDays++
          } else if (expectedDate !== todayBJ) {
            // 今天还没打卡不算断，继续往前查
            break
          }
        }

        // ===== 伴侣视角：构建主角任务记录列表（按类型分类）=====
        let taskCategories = []
        let pendingPraises = []

        if (user.role === 'partner') {
          const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }

          // 检查今天是否已表扬过
          let praisedToday = false
          try {
            // 云函数时区为 UTC，用 date 字段查询更可靠
            // 但 praises 没有 date 字段，用 createTime 范围查询（北京时间0点）
            const now = new Date()
            const bjOffset = 8 * 60 * 60 * 1000
            const bjTodayStart = new Date(now.getTime() + bjOffset)
            bjTodayStart.setUTCHours(0, 0, 0, 0)
            const bjTodayEnd = new Date(bjTodayStart.getTime() + 24 * 60 * 60 * 1000)
            const praiseRes = await db.collection('praises').where({
              fromOpenid: openid,
              createTime: _.gte(bjTodayStart).and(_.lt(bjTodayEnd))
            }).limit(1).get()
            praisedToday = praiseRes.data.length > 0
          } catch (e) {}

          // 构建各分类的记录
          const waterRecords = []
          const foodRecords = []
          const exerciseRecords = []

          // 喝水状态
          if (waterCount > 0) {
            const waterRec = {
              id: `water_${today}`,
              type: 'water',
              icon: '💧',
              title: waterCount >= 8 ? '完成8杯水' : `已喝 ${waterCount} 杯水`,
              desc: `${waterCount}/8 杯`,
              time: '',
              canLike: false,
              canComment: false
            }
            waterRecords.push(waterRec)
            if (waterCount >= 8 && !praisedToday) {
              pendingPraises.push({ type: 'water', icon: '💧', title: '喝够了8杯水', desc: `今日 ${waterCount} 杯` })
            }
          }

          // 饮食记录
          foodRes.data.forEach(f => {
            const recordId = 'food_' + f._id
            foodRecords.push({
              id: recordId,
              icon: '🥗',
              title: f.name,
              desc: `${mealLabel[f.meal] || ''} ${f.amount}g · ${f.totalCalories}kcal`,
              time: f.createTime ? new Date(f.createTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
              canLike: true,
              canComment: true
            })
            if (!praisedToday) pendingPraises.push({ type: 'food', icon: '🥗', title: f.name, desc: `${mealLabel[f.meal] || ''} ${f.amount}g · ${f.totalCalories}kcal` })
          })

          // 运动记录
          exerciseRes.data.forEach(e => {
            const recordId = 'exercise_' + e._id
            exerciseRecords.push({
              id: recordId,
              icon: e.icon || '🏃',
              title: e.typeName,
              desc: `${e.duration}分钟 · ${e.calories}kcal`,
              time: e.createTime ? new Date(e.createTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
              canLike: true,
              canComment: true
            })
            if (!praisedToday) pendingPraises.push({ type: 'exercise', icon: e.icon || '🏃', title: e.typeName, desc: `${e.duration}分钟 · ${e.calories}kcal` })
          })

          // 组装分类
          if (foodRecords.length > 0) {
            const totalFoodCal = foodRes.data.reduce((s, f) => s + (f.totalCalories || 0), 0)
            taskCategories.push({ category: '饮食', icon: '🥗', count: foodRecords.length, summary: `${totalFoodCal}kcal`, records: foodRecords })
          }
          if (exerciseRecords.length > 0) {
            const totalExCal = exerciseRes.data.reduce((s, e) => s + (e.calories || 0), 0)
            const totalExMin = exerciseRes.data.reduce((s, e) => s + (e.duration || 0), 0)
            taskCategories.push({ category: '运动', icon: '🏃', count: exerciseRecords.length, summary: `${totalExMin}分钟 · ${totalExCal}kcal`, records: exerciseRecords })
          }
          if (waterRecords.length > 0) {
            taskCategories.push({ category: '喝水', icon: '💧', count: 1, summary: `${waterCount}/8 杯`, records: waterRecords })
          }

          // 查询当前伴侣对所有可点赞记录的点赞状态
          const allLikeable = [...foodRecords, ...exerciseRecords]
          if (allLikeable.length > 0) {
            const likeableIds = allLikeable.map(r => r.id)
            try {
              const likeRes = await db.collection('record_likes').where({
                fromOpenid: openid,
                recordId: _.in(likeableIds)
              }).get()
              const likedSet = new Set(likeRes.data.map(l => l.recordId))

              const countRes = await db.collection('record_likes').where({
                recordId: _.in(likeableIds)
              }).get()
              const countMap = {}
              countRes.data.forEach(l => {
                countMap[l.recordId] = (countMap[l.recordId] || 0) + 1
              })

              taskCategories.forEach(cat => {
                cat.records.forEach(r => {
                  if (r.canLike) {
                    r.liked = likedSet.has(r.id)
                    r.likeCount = countMap[r.id] || 0
                  }
                })
              })
            } catch (e) {
              console.log('查询点赞状态失败', e.message)
            }
          }
        }

        // ===== 提醒（只返回已开启的，含来源）=====
        const reminderSettings = remindRes.data.length > 0 ? remindRes.data[0].settings : {}
        const defaultReminderMap = {
          water: { name: '喝水提醒', icon: '💧', desc: '记得补充水分哦', time: '10:00' },
          exercise: { name: '运动提醒', icon: '🏃', desc: '该动起来啦', time: '18:00' },
          sleep: { name: '睡觉提醒', icon: '🌙', desc: '早点休息，晚安', time: '22:30' }
        }
        const reminders = []
        // 自己设置的默认提醒
        Object.keys(defaultReminderMap).forEach(k => {
          const s = reminderSettings[k] || {}
          if (s.enabled) {
            reminders.push({
              id: k, name: defaultReminderMap[k].name, icon: defaultReminderMap[k].icon,
              desc: defaultReminderMap[k].desc, time: s.time || defaultReminderMap[k].time,
              fromPartner: false, setterName: ''
            })
          }
        })
        // 自己设置的自定义提醒
        Object.keys(reminderSettings).forEach(k => {
          if (!defaultReminderMap[k] && reminderSettings[k] && reminderSettings[k].enabled && reminderSettings[k].name) {
            const s = reminderSettings[k]
            if (!s.fromPartner && !s.targetOpenid) {
              // 自己设置的自定义提醒
              reminders.push({
                id: k, name: s.name, icon: s.icon || '⏰',
                desc: s.desc || '', time: s.time || '09:00',
                fromPartner: false, setterName: ''
              })
            } else if (s.fromPartner && !s.targetOpenid) {
              // 旧格式：伴侣给当前用户设置的（存在当前用户文档中，fromPartner=true 但无 targetOpenid）
              reminders.push({
                id: k, name: s.name, icon: s.icon || '⏰',
                desc: s.desc || '', time: s.time || '09:00',
                fromPartner: true, setterName: '💕 来自伴侣'
              })
            }
            // 新格式（有 targetOpenid）在下面统一处理
          }
        })

        // 如果当前用户有伴侣，拉取双方互相设置的提醒
        const userData = user
        if (userData?.partnerId) {
          try {
            // 1) 从对方文档拉取：对方给当前用户设置的提醒
            const partnerRemindRes = await db.collection('reminders').where({ _openid: userData.partnerId }).get()
            if (partnerRemindRes.data.length > 0) {
              const partnerSettings = partnerRemindRes.data[0].settings || {}
              let partnerName = ''
              for (const k of Object.keys(partnerSettings)) {
                const s = partnerSettings[k]
                if (s && s.fromPartner && s.targetOpenid === openid && s.enabled) {
                  if (!partnerName) {
                    const pRes = await db.collection('users').where({ _openid: userData.partnerId }).get()
                    partnerName = pRes.data[0]?.nickName || '伴侣'
                  }
                  reminders.push({
                    id: k, name: s.name, icon: s.icon || '⏰',
                    desc: s.desc || '', time: s.time || '09:00',
                    fromPartner: true, setterName: `💕 来自${partnerName}`
                  })
                }
              }
            }

            // 2) 从自己文档拉取：自己给伴侣/主角设置的提醒
            for (const k of Object.keys(reminderSettings)) {
              const s = reminderSettings[k]
              if (s && s.fromPartner && s.targetOpenid === userData.partnerId && s.enabled) {
                reminders.push({
                  id: k, name: s.name, icon: s.icon || '⏰',
                  desc: s.desc || '', time: s.time || '09:00',
                  fromPartner: true, setterName: '💕 你给TA设置的'
                })
              }
            }
          } catch (e) {
            console.log('拉取伴侣提醒失败', e.message)
          }
        }

        return {
          userInfo: { nickName: user.nickName, avatarUrl: user.avatarUrl },
          profile,
          streakDays,
          todayCalories,
          targetCalories,
          todayExercise,
          todayExerciseCal,
          waterCount,
          werunStep,
          checkins,
          partnerInfo: null,
          partnerCheckins: {},
          hasLiked: false,
          likeCount: 0,
          latestMessage: null,
          reminders,
          taskCategories,
          pendingPraises
        }
      }

      case 'getTodayRecords': {
        const records = []
        
        const foodRes = await db.collection('food_logs').where({ _openid: openid, date: today }).get()
        const todayCalories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)
        
        const exerciseRes = await db.collection('exercise_logs').where({ _openid: openid, date: today }).get()
        const todayExercise = exerciseRes.data.reduce((sum, item) => sum + (item.duration || 0), 0)
        
        const weightRes = await db.collection('body_records').where({ _openid: openid }).orderBy('date', 'desc').limit(1).get()
        const latestWeight = weightRes.data[0]?.weight || ''

        foodRes.data.forEach(item => {
          records.push({ id: item._id, icon: '🥗', name: item.name, detail: `${item.amount}g · ${item.meal}`, value: `${item.totalCalories}kcal`, time: '' })
        })
        exerciseRes.data.forEach(item => {
          records.push({ id: item._id, icon: item.icon || '🏃', name: item.typeName, detail: `${item.duration}分钟`, value: `${item.calories}kcal`, time: '' })
        })

        return { todayCalories, todayExercise, latestWeight, records }
      }

      case 'getFoodLogs': {
        const foodRes = await db.collection('food_logs').where({ _openid: openid, date: today }).orderBy('createTime', 'desc').get()
        const todayCalories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)
        
        let targetCalories = 1500
        const profileRes = await db.collection('user_profiles').where({ _openid: openid }).get()
        if (profileRes.data[0]) {
          const p = profileRes.data[0]
          targetCalories = Math.round(10 * p.currentWeight + 6.25 * p.height - 5 * (p.age || 25) - 161)
        }

        return { foodLogs: foodRes.data, todayCalories, targetCalories }
      }

      case 'getFoodLibrary': {
        const res = await db.collection('food_library').limit(50).get()
        return { foods: res.data }
      }

      case 'searchFood': {
        const { keyword } = event
        const res = await db.collection('food_library').where({
          name: db.RegExp({ regexp: keyword, options: 'i' })
        }).limit(20).get()
        return { foods: res.data }
      }

      case 'getExercises': {
        const exerciseRes = await db.collection('exercise_logs').where({ _openid: openid, date: today }).orderBy('createTime', 'desc').get()
        const todayDuration = exerciseRes.data.reduce((sum, item) => sum + (item.duration || 0), 0)
        const todayCalories = exerciseRes.data.reduce((sum, item) => sum + (item.calories || 0), 0)
        return { exercises: exerciseRes.data, todayDuration, todayCalories }
      }

      case 'getLatestWeight': {
        const res = await db.collection('body_records').where({ _openid: openid }).orderBy('date', 'desc').limit(1).get()
        return { weight: res.data[0]?.weight || 50 }
      }

      case 'getWeightHistory': {
        const res = await db.collection('body_records').where({ _openid: openid }).orderBy('date', 'desc').limit(30).get()
        return { history: res.data }
      }

      case 'getProgress': {
        // 徽章
        const badges = [
          { id: 'first_checkin', name: '初次打卡', desc: '完成第一次打卡', icon: '🌟', unlocked: false },
          { id: 'streak_7', name: '坚持一周', desc: '连续打卡7天', icon: '🔥', unlocked: false },
          { id: 'streak_30', name: '坚持一月', desc: '连续打卡30天', icon: '💎', unlocked: false },
          { id: 'streak_100', name: '百日达人', desc: '连续打卡100天', icon: '👑', unlocked: false },
          { id: 'weight_1', name: '首战告捷', desc: '减重1kg', icon: '🎯', unlocked: false },
          { id: 'weight_3', name: '渐入佳境', desc: '减重3kg', icon: '🚀', unlocked: false },
          { id: 'weight_5', name: '蜕变之路', desc: '减重5kg', icon: '🦋', unlocked: false },
          { id: 'diet_7', name: '饮食达人', desc: '热量控制达标7天', icon: '🥗', unlocked: false },
          { id: 'exercise_10h', name: '运动健将', desc: '累计运动10小时', icon: '🏆', unlocked: false }
        ]

        const checkinCount = await db.collection('check_ins').where({ _openid: openid }).count()
        const checkinRes = await db.collection('check_ins').where({ _openid: openid }).orderBy('date', 'desc').limit(100).get()
        const uniqueDates = [...new Set(checkinRes.data.map(c => c.date))]
        
        let maxStreak = 0
        let currentStreak = 0
        for (let i = 0; i < uniqueDates.length; i++) {
          const expectedDate = new Date()
          expectedDate.setDate(expectedDate.getDate() - i)
          const expectedStr = formatDate(expectedDate)
          if (uniqueDates.includes(expectedStr)) {
            currentStreak++
            maxStreak = Math.max(maxStreak, currentStreak)
          } else if (i > 0) {
            break
          }
        }

        if (checkinCount.total > 0) badges[0].unlocked = true
        if (maxStreak >= 7) badges[1].unlocked = true
        if (maxStreak >= 30) badges[2].unlocked = true
        if (maxStreak >= 100) badges[3].unlocked = true

        // 体重历史、减重用profile、运动统计 并行查询
        const [weightRes, profileRes, exerciseRes] = await Promise.all([
          db.collection('body_records').where({ _openid: openid }).orderBy('date', 'desc').limit(7).get(),
          db.collection('user_profiles').where({ _openid: openid }).get(),
          db.collection('exercise_logs').where({
            _openid: openid,
            date: _.gte(formatDate(new Date(Date.now() - new Date().getDay() * 86400000)))
          }).get()
        ])
        const weightHistory = weightRes.data

        // 减重徽章
        if (profileRes.data[0] && weightHistory.length > 0) {
          const startWeight = profileRes.data[0].startWeight || profileRes.data[0].currentWeight
          const latestWeight = weightHistory[0].weight
          const lost = startWeight - latestWeight
          if (lost >= 1) badges[4].unlocked = true
          if (lost >= 3) badges[5].unlocked = true
          if (lost >= 5) badges[6].unlocked = true
        }

        // 热量趋势（7天并行查询）
        let targetCalories = 2000
        if (profileRes.data[0]) {
          const p = profileRes.data[0]
          targetCalories = Math.round(10 * p.currentWeight + 6.25 * p.height - 5 * (p.age || 25) - 161)
        }

        const dateQueries = []
        for (let i = 6; i >= 0; i--) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          dateQueries.push(formatDate(d))
        }
        const foodResArr = await Promise.all(
          dateQueries.map(dateStr => db.collection('food_logs').where({ _openid: openid, date: dateStr }).get())
        )
        const caloriesTrend = foodResArr.map((foodRes, idx) => {
          const calories = foodRes.data.reduce((sum, item) => sum + (item.totalCalories || 0), 0)
          return {
            date: dateQueries[idx].slice(5),
            calories,
            percent: Math.min((calories / targetCalories) * 100, 100)
          }
        })

        // 运动统计
        const exerciseMap = {}
        exerciseRes.data.forEach(e => {
          if (!exerciseMap[e.exerciseType]) {
            exerciseMap[e.exerciseType] = { type: e.exerciseType, name: e.typeName, icon: e.icon, duration: 0 }
          }
          exerciseMap[e.exerciseType].duration += e.duration
        })
        
        const maxDuration = Math.max(...Object.values(exerciseMap).map(e => e.duration), 1)
        const exerciseStats = Object.values(exerciseMap).map(e => ({
          ...e,
          percent: (e.duration / maxDuration) * 100
        }))

        // 累计运动时长徽章
        const totalExerciseRes = await db.collection('exercise_logs').where({ _openid: openid }).get()
        const totalMinutes = totalExerciseRes.data.reduce((sum, item) => sum + (item.duration || 0), 0)
        if (totalMinutes >= 600) badges[8].unlocked = true

        return { badges, weightHistory, caloriesTrend, exerciseStats }
      }

      case 'getCheckinDays': {
        const { year, month } = event
        const monthStr = String(month).padStart(2, '0')
        const startDate = `${year}-${monthStr}-01`
        const endDate = `${year}-${monthStr}-31`
        
        const res = await db.collection('check_ins').where({
          _openid: openid,
          date: _.gte(startDate).lte(endDate)
        }).get()
        
        const days = [...new Set(res.data.map(c => c.date))]
        return { days }
      }

      case 'getProfile': {
        const totalPoints = await db.collection('points').where({ _openid: openid }).count()
        const totalCheckins = await db.collection('check_ins').where({ _openid: openid }).count()
        
        const checkinRes = await db.collection('check_ins').where({ _openid: openid }).orderBy('date', 'desc').limit(100).get()
        const uniqueDates = [...new Set(checkinRes.data.map(c => c.date))]
        let streakDays = 0
        const todayBJ = getTodayBJ()
        for (let i = 0; i < 365; i++) {
          const d = new Date()
          d.setDate(d.getDate() - i)
          const expectedDate = formatDate(d)
          if (uniqueDates.includes(expectedDate)) {
            streakDays++
          } else if (expectedDate !== todayBJ) {
            break
          }
        }

        const rewardCreatorId = user.role === 'partner' ? openid : (partnerId || openid)
        const rewardRes = await db.collection('rewards').where({ creatorOpenid: rewardCreatorId }).get()
        const claimQueryOpenid = user.role === 'partner' ? partnerId : openid
        const claimRes = await db.collection('reward_claims').where({ _openid: claimQueryOpenid || openid }).get()
        const claimedIds = claimRes.data.map(c => c.rewardId)

        const pointsRes = await db.collection('points').where({ _openid: openid }).get()
        const totalPointValue = pointsRes.data.reduce((sum, p) => sum + (p.value || 0), 0)

        // 获取伴侣昵称
        let partnerName = ''
        if (partnerId) {
          const partnerRes = await db.collection('users').where({ _openid: partnerId }).get()
          partnerName = partnerRes.data[0]?.nickName || ''
        }

        const rewards = rewardRes.data.map(r => ({
          ...r,
          canExchange: totalPointValue >= r.points && !claimedIds.includes(r._id),
          exchanged: claimedIds.includes(r._id)
        }))

        return {
          userInfo: { nickName: user.nickName, avatarUrl: user.avatarUrl },
          totalPoints: totalPointValue,
          totalCheckins: totalCheckins.total,
          streakDays,
          bindCode: user.bindCode,
          pushplusToken: user.pushplusToken || '',
          summaryTime: user.summaryTime || '',
          partnerName,
          rewards
        }
      }

      case 'getRewards': {
        const res = await db.collection('rewards').where({ creatorOpenid: openid }).orderBy('createTime', 'desc').get()
        return { rewards: res.data }
      }

      case 'getMessages': {
        const partnerId = user.partnerId
        if (!partnerId) return { messages: [] }
        
        const res = await db.collection('messages').where(_.or([
          { fromOpenid: openid, toOpenid: partnerId },
          { fromOpenid: partnerId, toOpenid: openid }
        ])).orderBy('createTime', 'desc').limit(50).get()
        
        const [selfRes, partnerRes] = await Promise.all([
          db.collection('users').where({ _openid: openid }).get(),
          db.collection('users').where({ _openid: partnerId }).get()
        ])
        
        const selfInfo = selfRes.data[0] || {}
        const partnerInfo = partnerRes.data[0] || {}
        
        const messages = res.data.reverse().map(m => {
          const isSelf = m.fromOpenid === openid
          const info = isSelf ? selfInfo : partnerInfo
          return {
            ...m,
            isSelf,
            time: formatDate(m.createTime),
            nickName: m.nickName || info.nickName || '',
            avatarUrl: m.avatarUrl || info.avatarUrl || ''
          }
        })
        
        return { messages }
      }

      case 'getReminders': {
        const defaultReminders = {
          water: { name: '喝水提醒', icon: '💧', desc: '记得补充水分哦', enabled: false, time: '10:00', isCustom: false },
          exercise: { name: '运动提醒', icon: '🏃', desc: '该动起来啦', enabled: false, time: '18:00', isCustom: false },
          sleep: { name: '睡觉提醒', icon: '🌙', desc: '早点休息，晚安', enabled: false, time: '22:30', isCustom: false }
        }

        const userRes = await db.collection('users').where({ _openid: openid }).get()
        const userData = userRes.data[0]
        const partnerId = userData?.partnerId

        // 1. 获取自己的 reminders 文档
        const ownRes = await db.collection('reminders').where({ _openid: openid }).get()
        const ownSettings = ownRes.data.length > 0 ? (ownRes.data[0].settings || {}) : {}

        // 2. 获取伴侣的 reminders 文档
        let partnerSettings = {}
        let partnerName = ''
        if (partnerId) {
          const partnerRes = await db.collection('reminders').where({ _openid: partnerId }).get()
          if (partnerRes.data.length > 0) {
            partnerSettings = partnerRes.data[0].settings || {}
          }
          const pUserRes = await db.collection('users').where({ _openid: partnerId }).get()
          partnerName = pUserRes.data[0]?.nickName || '伴侣'
        }

        // 3. 构建 myReminders：默认提醒 + 自己文档中非 forPartner/fromPartner 的自定义提醒
        const myReminders = []
        Object.keys(defaultReminders).forEach(k => {
          myReminders.push({ id: k, ...defaultReminders[k], ...(ownSettings[k] || {}), isCustom: false })
        })
        for (const k of Object.keys(ownSettings)) {
          if (!defaultReminders[k] && ownSettings[k] && ownSettings[k].name) {
            const s = ownSettings[k]
            // 有 targetOpenid/fromPartner 说明是给伴侣设的或伴侣设的，不归入 myReminders
            if (!s.targetOpenid && !s.fromPartner) {
              myReminders.push({ id: k, ...s, isCustom: true })
            }
          }
        }

        // 4. forPartnerReminders：我给TA设的提醒
        const forPartnerReminders = []
        // 新格式：在自己文档中，有 targetOpenid
        for (const k of Object.keys(ownSettings)) {
          const s = ownSettings[k]
          if (s && s.name && s.targetOpenid) {
            forPartnerReminders.push({ id: k, ...s, isCustom: true, forPartner: true })
          }
        }
        // 旧格式：在伴侣（主角）文档中，有 fromPartner 但无 targetOpenid
        for (const k of Object.keys(partnerSettings)) {
          const s = partnerSettings[k]
          if (s && s.name && s.fromPartner && !s.targetOpenid) {
            forPartnerReminders.push({ id: k, ...s, isCustom: true, forPartner: true })
          }
        }

        // 5. fromPartnerReminders：TA给我设的提醒
        const fromPartnerReminders = []
        // 新格式：在伴侣文档中，有 targetOpenid === openid
        for (const k of Object.keys(partnerSettings)) {
          const s = partnerSettings[k]
          if (s && s.targetOpenid === openid && s.fromPartner) {
            fromPartnerReminders.push({ id: k, ...s, isCustom: true, fromPartner: true, setterName: partnerName })
          }
        }
        // 旧格式：在自己文档中，有 fromPartner 但无 targetOpenid
        for (const k of Object.keys(ownSettings)) {
          const s = ownSettings[k]
          if (s && s.name && s.fromPartner && !s.targetOpenid) {
            fromPartnerReminders.push({ id: k, ...s, isCustom: true, fromPartner: true, setterName: partnerName })
          }
        }

        return { myReminders, forPartnerReminders, fromPartnerReminders }
      }

      case 'getFoodLibrary': {
        const res = await db.collection('food_library').where({ _openid: openid }).limit(100).get()
        return { foods: res.data }
      }

      case 'getClaims': {
        const res = await db.collection('reward_claims').where({ _openid: openid }).orderBy('createTime', 'desc').get()
        return { claims: res.data }
      }

      case 'getPendingPraises': {
        // 伴侣视角：查询今天主角已完成但伴侣还没表扬的事项
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        if (!partnerId) return { pending: [] }

        const today = getToday()
        const [foodRes, exerciseRes, checkinRes] = await Promise.all([
          db.collection('food_logs').where({ _openid: partnerId, date: today }).orderBy('createTime', 'desc').get(),
          db.collection('exercise_logs').where({ _openid: partnerId, date: today }).orderBy('createTime', 'desc').get(),
          db.collection('check_ins').where({ _openid: partnerId, date: today, type: 'water' }).get()
        ])

        const waterCount = checkinRes.data[0]?.count || 0
        const waterDone = waterCount >= 8

        const pending = []
        if (waterDone) pending.push({ type: 'water', icon: '💧', title: '喝够了8杯水', desc: `今日 ${waterCount} 杯` })
        exerciseRes.data.forEach(e => {
          pending.push({ type: 'exercise', icon: e.icon || '🏃', title: e.typeName, desc: `${e.duration}分钟 · ${e.calories}kcal` })
        })
        foodRes.data.forEach(f => {
          const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
          pending.push({ type: 'food', icon: '🥗', title: f.name, desc: `${mealLabel[f.meal] || ''} ${f.amount}g · ${f.totalCalories}kcal` })
        })

        return { pending }
      }

      case 'getUnreadPraises': {
        // 主角视角：查询未读表扬
        const res = await db.collection('praises').where({
          toOpenid: openid,
          read: false
        }).orderBy('createTime', 'desc').get()
        return { praises: res.data }
      }

      case 'getMyTasks': {
        // 主角视角：查看分配给自己的任务
        const today = getToday()
        const statusTextMap = { pending: '待接受', accepted: '已接受', active: '进行中', completed: '已完成', rejected: '已拒绝', failed: '已失败' }
        const res = await db.collection('tasks').where({ targetOpenid: openid }).orderBy('createTime', 'desc').get()

        let pendingCount = 0, activeCount = 0, completedCount = 0
        const tasks = res.data.map(t => {
          const st = statusTextMap[t.status] || t.status
          let progressText = ''

          if (t.status === 'active') {
            const completedDays = t.completedDays || 0
            if (t.type === 'habit') {
              progressText = `已连续 ${t.habitStreak || 0} / ${t.habitDays} 天`
            } else if (t.type === 'cycle') {
              if (t.cycleMode === 'period') {
                progressText = `已完成 ${completedDays} / ${t.cycleCount} 天`
              } else {
                progressText = `今日已完成 ${t.completions?.filter(c => c.date === today).length || 0} / ${t.cycleCount} 次`
              }
            }
          }

          if (t.status === 'pending') pendingCount++
          else if (t.status === 'active' || t.status === 'accepted') activeCount++
          else if (t.status === 'completed') completedCount++

          return { ...t, statusText: st, progressText }
        })

        return { tasks, pendingCount, activeCount, completedCount }
      }

      case 'getCreatedTasks': {
        // 伴侣视角：查看自己发布的任务
        const today = getToday()
        const statusTextMap = { pending: '待接受', accepted: '已接受', active: '进行中', completed: '已完成', rejected: '已拒绝', failed: '已失败' }
        const res = await db.collection('tasks').where({ creatorOpenid: openid }).orderBy('createTime', 'desc').get()

        const tasks = res.data.map(t => {
          const st = statusTextMap[t.status] || t.status
          let progressText = ''

          if (t.status === 'active') {
            const completedDays = t.completedDays || 0
            if (t.type === 'habit') {
              progressText = `已连续 ${t.habitStreak || 0} / ${t.habitDays} 天`
            } else if (t.type === 'cycle') {
              if (t.cycleMode === 'period') {
                progressText = `已完成 ${completedDays} / ${t.cycleCount} 天`
              } else {
                progressText = `今日已完成 ${t.completions?.filter(c => c.date === today).length || 0} / ${t.cycleCount} 次`
              }
            }
          }

          return { ...t, statusText: st, progressText }
        })

        return { tasks }
      }

      case 'getTaskStats': {
        // 通用任务统计
        const targetOpenid = user.role === 'partner' && partnerId ? partnerId : openid
        const creatorOpenid = user.role === 'partner' ? openid : (partnerId || '')

        const [myTaskRes, createdRes] = await Promise.all([
          db.collection('tasks').where({ targetOpenid }).get(),
          creatorOpenid ? db.collection('tasks').where({ creatorOpenid }).get() : Promise.resolve({ data: [] })
        ])

        const myTasks = myTaskRes.data
        const createdTasks = createdRes.data

        const totalTasks = myTasks.length
        const completedTasks = myTasks.filter(t => t.status === 'completed').length
        const activeTasks = myTasks.filter(t => t.status === 'active').length
        const pendingTasks = myTasks.filter(t => t.status === 'pending').length
        const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

        // 积分统计（含所有积分，包括伴侣手动调整）
        const pointsRes = await db.collection('points').where({ _openid: targetOpenid }).get()
        const totalPoints = pointsRes.data.reduce((s, p) => s + (p.value || 0), 0)

        return {
          totalTasks, completedTasks, activeTasks, pendingTasks, completionRate,
          totalPoints,
          createdCount: createdTasks.length
        }
      }

      case 'getPointRequests': {
        // 主角视角：查看自己的积分申请历史
        // 伴侣视角：查看伴侣（主角）的待审核积分申请
        const targetOpenid = user.role === 'partner' && partnerId ? partnerId : openid
        const isPartner = user.role === 'partner'

        let query = {}
        if (isPartner) {
          // 伴侣只看 pending 状态的申请
          query = { _openid: targetOpenid, status: 'pending' }
        } else {
          // 主角看自己的所有申请
          query = { _openid: openid }
        }

        const res = await db.collection('point_requests').where(query).orderBy('createTime', 'desc').limit(50).get()

        // 如果是主角，补充申请者的昵称信息
        const requests = res.data.map(r => ({
          ...r,
          _id: r._id,
          statusText: r.status === 'pending' ? '待审核' : r.status === 'approved' ? '已通过' : '未通过'
        }))

        // 统计待审核数量
        const pendingCount = isPartner
          ? requests.length
          : requests.filter(r => r.status === 'pending').length

        return { requests, pendingCount }
      }

      default:
        return { error: '未知类型' }
    }
  } catch (err) {
    console.error('getUserData 错误', err)
    return { error: err.message }
  }
}
