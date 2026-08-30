const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function getToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 推送通知伴侣（如果操作者是主角且伴侣配了pushplusToken）
async function notifyPartner(openid, title, content) {
  try {
    const user = await db.collection('users').where({ _openid: openid }).get()
    const partnerId = user.data[0]?.partnerId
    if (!partnerId) return
    const partner = await db.collection('users').where({ _openid: partnerId }).get()
    const token = partner.data[0]?.pushplusToken
    if (!token) return
    const got = require('got')
    await got('http://www.pushplus.plus/send', {
      method: 'POST',
      json: { token, title, content, template: 'txt' },
      timeout: { request: 10000 }
    })
  } catch (e) {
    console.log('notifyPartner 失败', e.message)
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { type } = event

  try {
    switch (type) {
      case 'setRole': {
        const { role } = event
        await db.collection('users').where({ _openid: openid }).update({
          data: { role }
        })
        return { success: true }
      }

      case 'savePushplusToken': {
        const { token } = event
        await db.collection('users').where({ _openid: openid }).update({
          data: { pushplusToken: token }
        })
        return { success: true }
      }

      case 'saveSummaryTime': {
        const { time } = event
        await db.collection('users').where({ _openid: openid }).update({
          data: { summaryTime: time }
        })
        return { success: true }
      }

      case 'createProfile': {
        const { profile } = event
        const today = getToday()
        await db.collection('user_profiles').add({
          data: {
            _openid: openid,
            height: parseFloat(profile.height),
            currentWeight: parseFloat(profile.currentWeight),
            startWeight: parseFloat(profile.currentWeight),
            targetWeight: parseFloat(profile.targetWeight),
            targetDate: profile.targetDate,
            age: parseInt(profile.age) || 25,
            bmi: parseFloat(profile.bmi),
            createTime: db.serverDate()
          }
        })
        // 记录初始体重
        await db.collection('body_records').add({
          data: {
            _openid: openid,
            weight: parseFloat(profile.currentWeight),
            bmi: parseFloat(profile.bmi),
            date: today,
            createTime: db.serverDate()
          }
        })
        return { success: true }
      }

      case 'bindPartner': {
        const { bindCode } = event
        // 查找对应的主角
        const mainUser = await db.collection('users').where({ bindCode: bindCode.toUpperCase() }).get()
        if (mainUser.data.length === 0) {
          return { success: false, message: '绑定码无效' }
        }
        
        const mainOpenid = mainUser.data[0]._openid
        
        // 更新双方关系
        await db.collection('users').where({ _openid: openid }).update({
          data: { partnerId: mainOpenid }
        })
        await db.collection('users').where({ _openid: mainOpenid }).update({
          data: { partnerId: openid }
        })
        
        return { success: true }
      }

      case 'checkin': {
        const { checkinType, waterCount, checked } = event
        const today = getToday()
        
        if (checkinType === 'water') {
          const existing = await db.collection('check_ins').where({
            _openid: openid,
            date: today,
            type: 'water'
          }).get()
          
          if (existing.data.length > 0) {
            await db.collection('check_ins').doc(existing.data[0]._id).update({
              data: { count: waterCount }
            })
          } else {
            await db.collection('check_ins').add({
              data: {
                _openid: openid,
                type: 'water',
                count: waterCount,
                date: today,
                createTime: db.serverDate()
              }
            })
          }
          
          // 每次喝水+1积分
          await db.collection('points').add({
            data: {
              _openid: openid,
              value: 1,
              reason: '喝水打卡',
              date: today,
              createTime: db.serverDate()
            }
          })
          
          // 满8杯通知伴侣
          if (waterCount === 8) {
            await notifyPartner(openid, '💧 她喝够8杯水啦！', '今天8杯水已全部完成，快去表扬她吧~')
          }
        } else if (checkinType === 'sleep') {
          if (checked) {
            await db.collection('check_ins').add({
              data: {
                _openid: openid,
                type: checkinType,
                date: today,
                createTime: db.serverDate()
              }
            })
            // 创建早睡积分审核申请
            const user = await db.collection('users').where({ _openid: openid }).get()
            const mainName = user.data[0]?.nickName || 'TA'
            await db.collection('point_requests').add({
              data: {
                _openid: openid,
                type: 'sleep',
                title: '早睡打卡积分申请',
                description: `${mainName} 已完成早睡打卡，申请 +10 积分`,
                points: 10,
                status: 'pending',
                date: today,
                createTime: db.serverDate()
              }
            })
            // PushPlus 通知伴侣
            const partnerId = user.data[0]?.partnerId
            if (partnerId) {
              const partnerRes = await db.collection('users').where({ _openid: partnerId }).get()
              const partnerToken = partnerRes.data[0]?.pushplusToken
              if (partnerToken) {
                try {
                  const got = require('got')
                  await got('http://www.pushplus.plus/send', {
                    method: 'POST',
                    json: {
                      token: partnerToken,
                      title: `🌙 ${mainName} 申请早睡积分`,
                      content: `${mainName} 已完成早睡打卡，申请 +10 积分，请到消息页面审核`,
                      template: 'txt'
                    },
                    timeout: { request: 10000 }
                  })
                } catch (e) {
                  console.log('早睡积分申请推送失败', e.message)
                }
              }
            }
          } else {
            // 取消早睡打卡，删除对应的积分申请
            const existing = await db.collection('check_ins').where({
              _openid: openid,
              date: today,
              type: checkinType
            }).get()
            if (existing.data.length > 0) {
              await db.collection('check_ins').doc(existing.data[0]._id).remove()
            }
            await db.collection('point_requests').where({
              _openid: openid,
              type: 'sleep',
              date: today,
              status: 'pending'
            }).remove()
          }
        } else {
          if (checked) {
            await db.collection('check_ins').add({
              data: {
                _openid: openid,
                type: checkinType,
                date: today,
                createTime: db.serverDate()
              }
            })
          } else {
            const existing = await db.collection('check_ins').where({
              _openid: openid,
              date: today,
              type: checkinType
            }).get()
            if (existing.data.length > 0) {
              await db.collection('check_ins').doc(existing.data[0]._id).remove()
            }
          }
        }
        
        return { success: true }
      }

      case 'addFoodLog': {
        const { name, calories, amount, meal, isCustom } = event
        const today = getToday()
        const totalCalories = Math.round(calories * amount / 100)
        
        await db.collection('food_logs').add({
          data: {
            _openid: openid,
            name,
            calories,
            amount: parseFloat(amount),
            totalCalories,
            meal,
            date: today,
            createTime: db.serverDate()
          }
        })

        const mealLabel = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
        await notifyPartner(openid, `🥗 她记录饮食啦！`, `${mealLabel[meal] || '一餐'}：${name} ${amount}g，${totalCalories}kcal`)

        if (isCustom) {
          // 添加到个人食物库
          const exist = await db.collection('food_library').where({
            _openid: openid,
            name
          }).count()
          if (exist.total === 0) {
            await db.collection('food_library').add({
              data: {
                _openid: openid,
                name,
                calories,
                createTime: db.serverDate()
              }
            })
          }
        }
        
        return { success: true }
      }

      case 'deleteFoodLog': {
        const { id } = event
        await db.collection('food_logs').doc(id).remove()
        return { success: true }
      }

      case 'addExercise': {
        const { exerciseType, typeName, icon, duration, calories } = event
        const today = getToday()
        
        await db.collection('exercise_logs').add({
          data: {
            _openid: openid,
            exerciseType,
            typeName,
            icon,
            duration: parseFloat(duration),
            calories,
            date: today,
            createTime: db.serverDate()
          }
        })

        await notifyPartner(openid, `🏃 她运动啦！`, `${typeName} ${duration}分钟，消耗 ${calories}kcal，快去表扬她吧~`)

        return { success: true }
      }

      case 'deleteExercise': {
        const { id } = event
        await db.collection('exercise_logs').doc(id).remove()
        return { success: true }
      }

      case 'syncWeRun': {
        const { encryptedData, iv } = event
        const today = getToday()
        let steps = 0

        if (encryptedData && iv) {
          try {
            const crypto = require('crypto')
            const wxContext = cloud.getWXContext()
            const sessionKey = Buffer.from(wxContext.SESSION_KEY, 'base64')
            const encryptedBuffer = Buffer.from(encryptedData, 'base64')
            const ivBuffer = Buffer.from(iv, 'base64')

            const decipher = crypto.createDecipheriv('aes-128-cbc', sessionKey, ivBuffer)
            decipher.setAutoPadding(true)
            let decoded = decipher.update(encryptedBuffer, 'binary', 'utf8')
            decoded += decipher.final('utf8')
            const decrypted = JSON.parse(decoded)

            if (decrypted.stepInfoList && decrypted.stepInfoList.length > 0) {
              const todayStepObj = decrypted.stepInfoList.find(s => {
                const d = new Date(s.timestamp * 1000)
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === today
              })
              steps = todayStepObj ? todayStepObj.step : 0
            }
          } catch (err) {
            console.error('解密微信运动数据失败', err)
          }
        }

        try {
          const existing = await db.collection('werun_steps').where({
            _openid: openid,
            date: today
          }).get()
          if (existing.data.length > 0) {
            await db.collection('werun_steps').doc(existing.data[0]._id).update({
              data: { steps }
            })
          } else {
            await db.collection('werun_steps').add({
              data: {
                _openid: openid,
                steps,
                date: today,
                createTime: db.serverDate()
              }
            })
          }
        } catch (e) {
          console.log('werun_steps 写入失败', e.message)
        }
        return { success: true, steps }
      }

      case 'addWeight': {
        const { weight, bodyFat, date } = event
        const existing = await db.collection('body_records').where({
          _openid: openid,
          date
        }).get()
        
        if (existing.data.length > 0) {
          await db.collection('body_records').doc(existing.data[0]._id).update({
            data: { weight: parseFloat(weight), bodyFat: bodyFat || null }
          })
        } else {
          await db.collection('body_records').add({
            data: {
              _openid: openid,
              weight: parseFloat(weight),
              bodyFat: bodyFat || null,
              date,
              createTime: db.serverDate()
            }
          })
        }
        
        // 更新当前体重
        const profile = await db.collection('user_profiles').where({ _openid: openid }).get()
        if (profile.data.length > 0) {
          await db.collection('user_profiles').doc(profile.data[0]._id).update({
            data: { currentWeight: parseFloat(weight) }
          })
        }
        
        return { success: true }
      }

      case 'toggleLike': {
        const { liked } = event
        const today = getToday()
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        
        if (!partnerId) return { success: false }
        
        if (liked) {
          await db.collection('likes').add({
            data: {
              fromOpenid: openid,
              targetOpenid: partnerId,
              date: today,
              createTime: db.serverDate()
            }
          })
        } else {
          const existing = await db.collection('likes').where({
            fromOpenid: openid,
            targetOpenid: partnerId,
            date: today
          }).get()
          if (existing.data.length > 0) {
            await db.collection('likes').doc(existing.data[0]._id).remove()
          }
        }
        
        return { success: true }
      }

      case 'sendMessage': {
        const { content } = event
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        const userInfo = user.data[0] || {}
        
        if (!partnerId) return { success: false }
        
        await db.collection('messages').add({
          data: {
            fromOpenid: openid,
            toOpenid: partnerId,
            content,
            nickName: userInfo.nickName || '',
            avatarUrl: userInfo.avatarUrl || '',
            createTime: db.serverDate()
          }
        })

        // PushPlus 推送通知对方
        try {
          const partnerRes = await db.collection('users').where({ _openid: partnerId }).get()
          const partnerToken = partnerRes.data[0]?.pushplusToken
          if (partnerToken) {
            const got = require('got')
            const senderName = user.data[0]?.nickName || 'TA'
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: partnerToken,
                title: `${senderName} 给你留了言`,
                content: `💬 ${content}`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          }
        } catch (e) {
          console.log('PushPlus 留言通知发送失败', e.message)
        }
        
        return { success: true }
      }

      case 'updateReminder': {
        const { reminderId, enabled, time, name, icon } = event
        // 先查自己的文档
        let existing = await db.collection('reminders').where({ _openid: openid }).get()
        let targetId = null
        if (existing.data.length > 0) {
          targetId = existing.data[0]._id
        } else {
          // 自己的没找到，查伴侣的文档
          const user = await db.collection('users').where({ _openid: openid }).get()
          const partnerId = user.data[0]?.partnerId
          if (partnerId) {
            existing = await db.collection('reminders').where({ _openid: partnerId }).get()
            if (existing.data.length > 0) {
              targetId = existing.data[0]._id
            }
          }
        }
        
        const updateData = {}
        if (enabled !== undefined) updateData[`settings.${reminderId}.enabled`] = enabled
        if (time !== undefined) updateData[`settings.${reminderId}.time`] = time
        if (name !== undefined) updateData[`settings.${reminderId}.name`] = name
        if (icon !== undefined) updateData[`settings.${reminderId}.icon`] = icon
        
        if (targetId) {
          await db.collection('reminders').doc(targetId).update({
            data: updateData
          })
        } else {
          const settings = {}
          settings[reminderId] = {}
          if (enabled !== undefined) settings[reminderId].enabled = enabled
          if (time !== undefined) settings[reminderId].time = time
          if (name !== undefined) settings[reminderId].name = name
          if (icon !== undefined) settings[reminderId].icon = icon
          await db.collection('reminders').add({
            data: {
              settings,
              createTime: db.serverDate()
            }
          })
        }
        
        return { success: true }
      }

      case 'addReminder': {
        const { name, icon, time, enabled, forPartner } = event
        const customId = `custom_${Date.now()}`

        // 始终存在自己的 reminders 文档里，标记 targetOpenid 表示是为谁设的
        let targetOpenid = ''
        if (forPartner) {
          const user = await db.collection('users').where({ _openid: openid }).get()
          targetOpenid = user.data[0]?.partnerId || ''
        }

        const existing = await db.collection('reminders').where({ _openid: openid }).get()

        let settings = {}
        if (existing.data.length > 0) {
          settings = existing.data[0].settings || {}
        }

        settings[customId] = {
          name,
          icon: icon || '⏰',
          time: time || '09:00',
          enabled: enabled || false,
          isCustom: true,
          fromPartner: !!forPartner,
          targetOpenid
        }

        if (existing.data.length > 0) {
          await db.collection('reminders').doc(existing.data[0]._id).update({
            data: { settings }
          })
        } else {
          await db.collection('reminders').add({
            data: {
              settings,
              createTime: db.serverDate()
            }
          })
        }
        
        return { success: true, reminderId: customId }
      }

      case 'deleteReminder': {
        const { reminderId } = event
        // 先查自己的文档
        let existing = await db.collection('reminders').where({ _openid: openid }).get()
        if (existing.data.length > 0) {
          let settings = existing.data[0].settings || {}
          if (settings[reminderId]) {
            // 微信云数据库 update 对嵌套对象是深度合并，必须用 _.remove() 才能删除字段
            await db.collection('reminders').doc(existing.data[0]._id).update({
              data: {
                [`settings.${reminderId}`]: _.remove()
              }
            })
            return { success: true }
          }
        }
        // 自己的没找到，查伴侣的文档（兼容旧数据）
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        if (partnerId) {
          existing = await db.collection('reminders').where({ _openid: partnerId }).get()
          if (existing.data.length > 0) {
            let settings = existing.data[0].settings || {}
            if (settings[reminderId]) {
              await db.collection('reminders').doc(existing.data[0]._id).update({
                data: {
                  [`settings.${reminderId}`]: _.remove()
                }
              })
              return { success: true }
            }
          }
        }
        return { success: false }
      }

      case 'addReward': {
        const { name, points } = event
        await db.collection('rewards').add({
          data: {
            creatorOpenid: openid,
            name,
            points: parseInt(points),
            createTime: db.serverDate()
          }
        })
        return { success: true }
      }

      case 'deleteReward': {
        const { id } = event
        await db.collection('rewards').doc(id).remove()
        return { success: true }
      }

      case 'exchangeReward': {
        const { rewardId } = event
        const reward = await db.collection('rewards').doc(rewardId).get()
        
        if (!reward.data) return { success: false, message: '奖励不存在' }
        
        // 检查积分
        const pointsRes = await db.collection('points').where({ _openid: openid }).get()
        const totalPoints = pointsRes.data.reduce((sum, p) => sum + (p.value || 0), 0)
        
        if (totalPoints < reward.data.points) {
          return { success: false, message: '积分不足' }
        }
        
        // 扣除积分
        await db.collection('points').add({
          data: {
            _openid: openid,
            value: -reward.data.points,
            reason: `兑换奖励：${reward.data.name}`,
            createTime: db.serverDate()
          }
        })
        
        // 记录兑换
        await db.collection('reward_claims').add({
          data: {
            _openid: openid,
            rewardId,
            rewardName: reward.data.name,
            points: reward.data.points,
            status: 'pending',
            createTime: db.serverDate()
          }
        })
        
        return { success: true }
      }

      case 'deleteReward': {
        const { rewardId } = event
        await db.collection('rewards').doc(rewardId).remove()
        return { success: true }
      }

      case 'updateBindCode': {
        const { bindCode } = event
        await db.collection('users').where({ _openid: openid }).update({
          data: { bindCode }
        })
        return { success: true }
      }

      case 'sendPraise': {
        const { content, targetOpenid: eventTarget } = event
        // 优先使用前端传递的，为空时从数据库查找
        let targetOpenid = eventTarget
        if (!targetOpenid) {
          const me = await db.collection('users').where({ _openid: openid }).get()
          targetOpenid = me.data[0]?.partnerId
        }
        if (!targetOpenid) return { success: false, error: '未绑定伴侣' }

        const fromUser = await db.collection('users').where({ _openid: openid }).get()
        const fromName = fromUser.data[0]?.nickName || 'TA'

        await db.collection('praises').add({
          data: {
            fromOpenid: openid,
            toOpenid: targetOpenid,
            content,
            fromName,
            read: false,
            createTime: db.serverDate()
          }
        })

        // PushPlus 推送主角
        const mainUser = await db.collection('users').where({ _openid: targetOpenid }).get()
        const mainToken = mainUser.data[0]?.pushplusToken
        if (mainToken) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: mainToken,
                title: `${fromName} 表扬了你 💕`,
                content: content,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('表扬推送失败', e.message)
          }
        }

        return { success: true }
      }

      case 'readPraises': {
        // 主角标记所有未读表扬为已读
        await db.collection('praises').where({
          toOpenid: openid,
          read: false
        }).update({
          data: { read: true }
        })
        return { success: true }
      }

      case 'likeRecord': {
        const { recordId, liked, targetOpenid: eventTarget } = event
        // 自动查找 partnerId
        let targetOpenid = eventTarget
        if (!targetOpenid) {
          const me = await db.collection('users').where({ _openid: openid }).get()
          targetOpenid = me.data[0]?.partnerId
        }
        if (!targetOpenid) return { success: false, error: '未绑定伴侣' }

        if (liked) {
          await db.collection('record_likes').add({
            data: {
              recordId,
              fromOpenid: openid,
              targetOpenid,
              createTime: db.serverDate()
            }
          })
        } else {
          await db.collection('record_likes').where({
            recordId,
            fromOpenid: openid
          }).remove()
        }
        return { success: true }
      }

      case 'commentRecord': {
        const { recordId, recordTitle, content, targetOpenid: eventTarget } = event
        // 自动查找 partnerId
        let targetOpenid = eventTarget
        if (!targetOpenid) {
          const me = await db.collection('users').where({ _openid: openid }).get()
          targetOpenid = me.data[0]?.partnerId
        }
        if (!targetOpenid || !content) return { success: false, error: '未绑定伴侣' }

        const fromUser = await db.collection('users').where({ _openid: openid }).get()
        const fromName = fromUser.data[0]?.nickName || 'TA'

        await db.collection('record_comments').add({
          data: {
            recordId,
            recordTitle,
            content,
            fromOpenid: openid,
            fromName,
            targetOpenid,
            createTime: db.serverDate()
          }
        })

        // PushPlus 推送通知主角
        const mainUser = await db.collection('users').where({ _openid: targetOpenid }).get()
        const mainToken = mainUser.data[0]?.pushplusToken
        if (mainToken) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: mainToken,
                title: `${fromName} 评论了「${recordTitle}」`,
                content: `💬 ${content}`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('评论推送失败', e.message)
          }
        }

        return { success: true }
      }

      case 'saveUserInfo': {
        const { nickName, avatarUrl } = event
        const updateData = {}
        if (nickName) updateData.nickName = nickName
        if (avatarUrl) updateData.avatarUrl = avatarUrl
        if (Object.keys(updateData).length > 0) {
          await db.collection('users').where({ _openid: openid }).update({
            data: updateData
          })
        }
        return { success: true }
      }

      // ===== 任务系统 =====
      case 'createTask': {
        const { task } = event
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        if (!partnerId) return { success: false, error: '未绑定伴侣' }

        const statusTextMap = { pending: '待接受', accepted: '已接受', active: '进行中', completed: '已完成', rejected: '已拒绝', failed: '已失败' }

        const taskData = {
          creatorOpenid: openid,
          targetOpenid: partnerId,
          title: task.title,
          description: task.description || '',
          type: task.type, // once | cycle | habit
          points: parseInt(task.points) || 10,
          status: 'pending',
          // 周期任务
          cycleMode: task.cycleMode || 'daily',
          periodStart: task.periodStart || '',
          periodEnd: task.periodEnd || '',
          cycleCount: parseInt(task.cycleCount) || 1,
          cycleDays: parseInt(task.cycleDays) || 1,
          // 习惯养成
          habitDays: parseInt(task.habitDays) || 7,
          habitStreak: 0,
          // 进度
          completedDays: 0,
          completions: [], // 打卡记录 [{date, createTime}]
          createTime: db.serverDate(),
          updateTime: db.serverDate()
        }

        await db.collection('tasks').add({ data: taskData })

        // PushPlus 推送主角
        const mainToken = (await db.collection('users').where({ _openid: partnerId }).get()).data[0]?.pushplusToken
        if (mainToken) {
          try {
            const got = require('got')
            const typeName = task.type === 'once' ? '单次任务' : task.type === 'cycle' ? '周期任务' : '习惯养成'
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: { token: mainToken, title: `📋 ${user.data[0]?.nickName || 'TA'} 发布了新任务`, content: `「${task.title}」\n类型：${typeName}\n完成可得 ${task.points} 积分\n\n请在任务页面查看并接受`, template: 'txt' },
              timeout: { request: 10000 }
            })
          } catch (e) { console.log('任务推送失败', e.message) }
        }

        return { success: true }
      }

      case 'acceptTask': {
        const { taskId } = event
        await db.collection('tasks').doc(taskId).update({
          data: { status: 'active', updateTime: db.serverDate() }
        })

        // 推送伴侣
        const task = (await db.collection('tasks').doc(taskId).get()).data
        if (task) {
          const creatorToken = (await db.collection('users').where({ _openid: task.creatorOpenid }).get()).data[0]?.pushplusToken
          if (creatorToken) {
            try {
              const got = require('got')
              const mainName = (await db.collection('users').where({ _openid: openid }).get()).data[0]?.nickName || 'TA'
              await got('http://www.pushplus.plus/send', {
                method: 'POST',
                json: { token: creatorToken, title: `${mainName} 接受了任务`, content: `「${task.title}」已接受，开始执行！`, template: 'txt' },
                timeout: { request: 10000 }
              })
            } catch (e) {}
          }
        }

        return { success: true }
      }

      case 'rejectTask': {
        const { taskId } = event
        await db.collection('tasks').doc(taskId).update({
          data: { status: 'rejected', updateTime: db.serverDate() }
        })

        const task = (await db.collection('tasks').doc(taskId).get()).data
        if (task) {
          const creatorToken = (await db.collection('users').where({ _openid: task.creatorOpenid }).get()).data[0]?.pushplusToken
          if (creatorToken) {
            try {
              const got = require('got')
              const mainName = (await db.collection('users').where({ _openid: openid }).get()).data[0]?.nickName || 'TA'
              await got('http://www.pushplus.plus/send', {
                method: 'POST',
                json: { token: creatorToken, title: `${mainName} 拒绝了任务`, content: `「${task.title}」已被拒绝`, template: 'txt' },
                timeout: { request: 10000 }
              })
            } catch (e) {}
          }
        }

        return { success: true }
      }

      case 'completeTask': {
        const { taskId } = event
        const today = getToday()
        const task = (await db.collection('tasks').doc(taskId).get()).data
        if (!task) return { error: '任务不存在' }
        if (task.status !== 'active') return { error: '任务不在进行中' }

        let earnedPoints = 0
        let newStatus = 'active'
        const newCompletions = [...(task.completions || [])]

        // 检查今天是否已打卡
        const alreadyDoneToday = newCompletions.some(c => c.date === today)
        if (alreadyDoneToday) return { error: '今天已打卡' }

        newCompletions.push({ date: today, createTime: db.serverDate() })

        if (task.type === 'once') {
          // 单次任务：打卡即完成
          newStatus = 'completed'
          earnedPoints = task.points
        } else if (task.type === 'cycle') {
          // 周期任务
          if (task.cycleMode === 'daily') {
            // 每天模式：完成次数达标
            const todayCount = newCompletions.filter(c => c.date === today).length
            if (todayCount >= task.cycleCount) {
              earnedPoints = task.points
            }
          } else {
            // 指定周期模式
            const periodStart = task.periodStart
            const periodEnd = task.periodEnd
            const periodCompletions = newCompletions.filter(c => c.date >= periodStart && c.date <= periodEnd)
            // 每天只计一次
            const uniqueDays = [...new Set(periodCompletions.map(c => c.date))]
            if (uniqueDays.length >= task.cycleCount) {
              newStatus = 'completed'
              earnedPoints = task.points
            }
          }
        } else if (task.type === 'habit') {
          // 习惯养成：连续不断型
          let streak = 0
          const uniqueDates = [...new Set(newCompletions.map(c => c.date))].sort().reverse()
          for (let i = 0; i < uniqueDates.length; i++) {
            const expectedDate = new Date()
            expectedDate.setDate(expectedDate.getDate() - i)
            const expectedStr = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`
            if (uniqueDates.includes(expectedStr)) {
              streak++
            } else if (i > 0) {
              break
            }
          }

          if (streak >= task.habitDays) {
            newStatus = 'completed'
            earnedPoints = task.points
          }
        }

        await db.collection('tasks').doc(taskId).update({
          data: {
            status: newStatus,
            completions: newCompletions,
            completedDays: [...new Set(newCompletions.map(c => c.date))].length,
            habitStreak: task.type === 'habit' ? (newCompletions.filter(c => c.date === today).length > 0 ? (() => {
              let s = 0; for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; if ([...new Set(newCompletions.map(c=>c.date))].includes(ds)) s++; else if (i>0) break; } return s;
            })() : task.habitStreak) : task.habitStreak,
            updateTime: db.serverDate()
          }
        })

        // 发放积分
        if (earnedPoints > 0) {
          await db.collection('points').add({
            data: { _openid: openid, value: earnedPoints, reason: `完成任务：${task.title}`, date: today, createTime: db.serverDate() }
          })
        }

        // 推送伴侣
        if (newStatus === 'completed') {
          const creatorToken = (await db.collection('users').where({ _openid: task.creatorOpenid }).get()).data[0]?.pushplusToken
          if (creatorToken) {
            try {
              const got = require('got')
              const mainName = (await db.collection('users').where({ _openid: openid }).get()).data[0]?.nickName || 'TA'
              await got('http://www.pushplus.plus/send', {
                method: 'POST',
                json: { token: creatorToken, title: `${mainName} 完成了任务！`, content: `「${task.title}」已完成，获得 ${earnedPoints} 积分`, template: 'txt' },
                timeout: { request: 10000 }
              })
            } catch (e) {}
          }
        }

        return { success: true, points: earnedPoints }
      }

      case 'deleteTask': {
        const { taskId } = event
        await db.collection('tasks').doc(taskId).remove()
        return { success: true }
      }

      case 'updateMainPoints': {
        // 伴侣手动调整主角积分
        const { points, reason } = event
        const user = await db.collection('users').where({ _openid: openid }).get()
        const mainOpenid = user.data[0]?.partnerId
        if (!mainOpenid) return { success: false, error: '未绑定伴侣' }
        if (!points || isNaN(points)) return { success: false, error: '积分值无效' }

        const fromName = user.data[0]?.nickName || '伴侣'
        await db.collection('points').add({
          data: {
            _openid: mainOpenid,
            value: parseInt(points),
            reason: reason || `伴侣手动调整`,
            date: getToday(),
            createTime: db.serverDate()
          }
        })
        return { success: true }
      }

      case 'unbindPartner': {
        const user = await db.collection('users').where({ _openid: openid }).get()
        const partnerId = user.data[0]?.partnerId
        if (partnerId) {
          // 清除双方的绑定关系
          await db.collection('users').where({ _openid: openid }).update({ data: { partnerId: '' } })
          await db.collection('users').where({ _openid: partnerId }).update({ data: { partnerId: '' } })
        }
        return { success: true }
      }

      case 'requestExercisePoints': {
        const { exerciseId, exerciseName, points } = event
        const today = getToday()
        const user = await db.collection('users').where({ _openid: openid }).get()
        const mainName = user.data[0]?.nickName || 'TA'
        const partnerId = user.data[0]?.partnerId

        if (!partnerId) return { success: false, error: '未绑定伴侣' }
        if (!points || isNaN(points) || points <= 0) return { success: false, error: '积分值无效' }

        await db.collection('point_requests').add({
          data: {
            _openid: openid,
            type: 'exercise',
            title: '运动积分申请',
            description: `${mainName} 完成运动「${exerciseName || '运动记录'}」，申请 +${points} 积分`,
            points: parseInt(points),
            exerciseId: exerciseId || '',
            status: 'pending',
            date: today,
            createTime: db.serverDate()
          }
        })

        // PushPlus 通知伴侣
        const partnerRes = await db.collection('users').where({ _openid: partnerId }).get()
        const partnerToken = partnerRes.data[0]?.pushplusToken
        if (partnerToken) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: partnerToken,
                title: `🏃 ${mainName} 申请运动积分`,
                content: `${mainName} 完成运动「${exerciseName || '运动记录'}」，申请 +${points} 积分，请到消息页面审核`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('运动积分申请推送失败', e.message)
          }
        }

        return { success: true }
      }

      case 'approvePointRequest': {
        const { requestId } = event
        const req = await db.collection('point_requests').doc(requestId).get()
        if (!req.data) return { success: false, error: '申请不存在' }
        if (req.data.status !== 'pending') return { success: false, error: '申请已处理' }

        const mainOpenid = req.data._openid
        const points = req.data.points
        const today = getToday()

        // 更新申请状态
        await db.collection('point_requests').doc(requestId).update({
          data: { status: 'approved', updateTime: db.serverDate() }
        })

        // 给主角加积分
        await db.collection('points').add({
          data: {
            _openid: mainOpenid,
            value: points,
            reason: req.data.title,
            date: today,
            createTime: db.serverDate()
          }
        })

        // PushPlus 通知主角
        const mainRes = await db.collection('users').where({ _openid: mainOpenid }).get()
        const mainToken = mainRes.data[0]?.pushplusToken
        if (mainToken) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: mainToken,
                title: `🎉 积分申请已通过`,
                content: `你的「${req.data.title}」已通过审核，获得 +${points} 积分！`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('积分通过推送失败', e.message)
          }
        }

        return { success: true }
      }

      case 'rejectPointRequest': {
        const { requestId } = event
        const req = await db.collection('point_requests').doc(requestId).get()
        if (!req.data) return { success: false, error: '申请不存在' }
        if (req.data.status !== 'pending') return { success: false, error: '申请已处理' }

        const mainOpenid = req.data._openid

        // 更新申请状态
        await db.collection('point_requests').doc(requestId).update({
          data: { status: 'rejected', updateTime: db.serverDate() }
        })

        // PushPlus 通知主角
        const mainRes = await db.collection('users').where({ _openid: mainOpenid }).get()
        const mainToken = mainRes.data[0]?.pushplusToken
        if (mainToken) {
          try {
            const got = require('got')
            await got('http://www.pushplus.plus/send', {
              method: 'POST',
              json: {
                token: mainToken,
                title: `❌ 积分申请未通过`,
                content: `你的「${req.data.title}」未通过审核`,
                template: 'txt'
              },
              timeout: { request: 10000 }
            })
          } catch (e) {
            console.log('积分拒绝推送失败', e.message)
          }
        }

        return { success: true }
      }

      default:
        return { error: '未知类型' }
    }
  } catch (err) {
    console.error('updateData 错误', err)
    return { error: err.message }
  }
}

async function addPoints(openid, value, reason) {
  await db.collection('points').add({
    data: {
      _openid: openid,
      value,
      reason,
      date: getToday(),
      createTime: db.serverDate()
    }
  })
}

async function checkStreakBonus(openid) {
  const today = getToday()
  const checkinRes = await db.collection('check_ins').where({
    _openid: openid
  }).orderBy('date', 'desc').limit(100).get()

  const uniqueDates = [...new Set(checkinRes.data.map(c => c.date))]
  let streak = 0
  for (let i = 0; i < uniqueDates.length; i++) {
    const expectedDate = new Date()
    expectedDate.setDate(expectedDate.getDate() - i)
    const expectedStr = `${expectedDate.getFullYear()}-${String(expectedDate.getMonth() + 1).padStart(2, '0')}-${String(expectedDate.getDate()).padStart(2, '0')}`
    if (uniqueDates.includes(expectedStr)) {
      streak++
    } else if (i > 0) {
      break
    }
  }

  // 分别检查各里程碑奖励是否已发放
  const bonuses = [
    { days: 3, points: 5 },
    { days: 7, points: 10 },
    { days: 30, points: 30 }
  ]

  for (const bonus of bonuses) {
    if (streak >= bonus.days) {
      const alreadyGiven = await db.collection('points').where({
        _openid: openid,
        reason: `连续打卡${bonus.days}天奖励`,
        date: today
      }).count()
      if (alreadyGiven.total === 0) {
        await addPoints(openid, bonus.points, `连续打卡${bonus.days}天奖励`)
      }
    }
  }
}
