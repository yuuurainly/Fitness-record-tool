const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

function generateBindCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  try {
    // 查找用户
    let userRes = await db.collection('users').where({ _openid: openid }).get()
    let user = userRes.data[0]

    if (!user) {
      // 新用户
      const bindCode = generateBindCode()
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickName: '',
          avatarUrl: '',
          role: '',
          bindCode,
          partnerId: '',
          createTime: db.serverDate()
        }
      })
      return {
        openid,
        isNewUser: true,
        bindCode
      }
    }

    // 已有用户
    const hasProfile = await db.collection('user_profiles').where({ _openid: openid }).count()

    return {
      openid,
      isNewUser: false,
      hasProfile: hasProfile.total > 0,
      userInfo: {
        nickName: user.nickName,
        avatarUrl: user.avatarUrl,
        role: user.role
      }
    }
  } catch (err) {
    console.error('登录失败', err)
    return { error: err.message }
  }
}
