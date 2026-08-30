/**
 * Xlover 后端 API 全面测试脚本
 */
const http = require('http');

const BASE = 'http://localhost:3000';
let mainToken = '';
let partnerToken = '';
let foodId = 0;
let exerciseId = 0;
let weightId = 0;
let taskId = 0;
let praiseId = 0;
let messageId = 0;
let rewardId = 0;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(`${BASE}${path}`, options, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(chunks) });
        } catch {
          resolve({ status: res.statusCode, body: chunks });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function test(name, condition, detail) {
  if (condition) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name} ${detail ? '- ' + JSON.stringify(detail) : ''}`);
    failed++;
  }
}

async function run() {
  console.log('\n========================================');
  console.log('  Xlover 后端 API 全面测试');
  console.log('========================================\n');

  // 1. 健康检查
  console.log('【1】健康检查');
  const health = await request('GET', '/health');
  test('健康检查返回 200', health.status === 200);
  test('status=ok', health.body.status === 'ok');

  // 2. 认证 - 登录
  console.log('\n【2】认证模块');
  const mainLogin = await request('POST', '/api/auth/login', { username: 'xiaojianfei', password: '123456' });
  test('主角登录成功', mainLogin.body.success === true, mainLogin.body);
  mainToken = mainLogin.body.data?.token || '';
  test('获取主角 token', !!mainToken);

  const partnerLogin = await request('POST', '/api/auth/login', { username: 'xiaojiandu', password: '123456' });
  test('伴侣登录成功', partnerLogin.body.success === true);
  partnerToken = partnerLogin.body.data?.token || '';
  test('获取伴侣 token', !!partnerToken);

  const me = await request('GET', '/api/auth/me', null, mainToken);
  test('获取当前用户信息', me.body.success === true);

  // 3. Dashboard
  console.log('\n【3】Dashboard');
  const dash = await request('GET', '/api/dashboard', null, mainToken);
  test('获取 Dashboard 成功', dash.body.success === true, dash.body);
  test('包含用户信息', !!dash.body.data?.user);
  test('包含今日热量', !!dash.body.data?.todayCalories);
  test('包含今日饮食', Array.isArray(dash.body.data?.todayFoods));
  test('包含今日运动', Array.isArray(dash.body.data?.todayExercises));
  test('包含体重进度', !!dash.body.data?.weightProgress);
  test('包含伴侣信息', !!dash.body.data?.partner);

  // 4. 记录模块 - 饮食
  console.log('\n【4】记录模块 - 饮食');
  const addFood = await request('POST', '/api/records/food', {
    food_name: '测试食物-香蕉', calories: 105, protein: 1.3, carbs: 27, fat: 0.4, meal_type: 'snack'
  }, mainToken);
  test('添加饮食记录成功', addFood.body.success === true, addFood.body);
  foodId = addFood.body.data?.id || 0;
  test('获取饮食记录ID', foodId > 0);

  const getFood = await request('GET', '/api/records/food', null, mainToken);
  test('获取饮食列表成功', getFood.body.success === true);
  test('饮食列表包含汇总', !!getFood.body.data?.summary);

  const updateFood = await request('PUT', `/api/records/food/${foodId}`, { calories: 120 }, mainToken);
  test('更新饮食记录成功', updateFood.body.success === true);
  test('更新后热量为120', updateFood.body.data?.calories === 120);

  // 5. 记录模块 - 运动
  console.log('\n【5】记录模块 - 运动');
  const addExercise = await request('POST', '/api/records/exercise', {
    exercise_type: '测试运动-游泳', duration: 30, met_value: 6.0, note: '测试'
  }, mainToken);
  test('添加运动记录成功', addExercise.body.success === true, addExercise.body);
  exerciseId = addExercise.body.data?.id || 0;
  test('获取运动记录ID', exerciseId > 0);

  const getExercise = await request('GET', '/api/records/exercise', null, mainToken);
  test('获取运动列表成功', getExercise.body.success === true);

  // 6. 记录模块 - 体重
  console.log('\n【6】记录模块 - 体重');
  const addWeight = await request('POST', '/api/records/weight', {
    weight: 66.8, note: '测试称重'
  }, mainToken);
  test('添加体重记录成功', addWeight.body.success === true, addWeight.body);
  weightId = addWeight.body.data?.id || 0;
  test('获取体重记录ID', weightId > 0);
  test('自动计算BMI', !!addWeight.body.data?.bmi);

  const getWeight = await request('GET', '/api/records/weight?days=7', null, mainToken);
  test('获取体重趋势成功', getWeight.body.success === true);

  // 7. 任务模块
  console.log('\n【7】任务模块');
  const addTask = await request('POST', '/api/tasks', {
    title: '测试任务-喝水', description: '喝够2000ml水', type: 'single', points: 15
  }, partnerToken);
  test('伴侣发布任务成功', addTask.body.success === true, addTask.body);
  taskId = addTask.body.data?.id || 0;
  test('获取任务ID', taskId > 0);

  const getTasks = await request('GET', '/api/tasks?status=pending', null, mainToken);
  test('主角获取待接受任务', getTasks.body.success === true);

  const acceptTask = await request('PUT', `/api/tasks/${taskId}/accept`, null, mainToken);
  test('接受任务成功', acceptTask.body.success === true);
  test('任务状态变为accepted', acceptTask.body.data?.status === 'accepted');

  const completeTask = await request('PUT', `/api/tasks/${taskId}/complete`, null, mainToken);
  test('完成任务成功', completeTask.body.success === true, completeTask.body);
  test('获得积分', (completeTask.body.data?.pointsEarned || 0) > 0);

  // 8. 互动模块 - 表扬
  console.log('\n【8】互动模块 - 表扬');
  const sendPraise = await request('POST', '/api/interactions/praises', {
    receiver_id: partnerLogin.body.data.user.id, message: '测试表扬-你真棒！', effect_type: 'hearts'
  }, mainToken);
  test('发送表扬成功', sendPraise.body.success === true, sendPraise.body);
  praiseId = sendPraise.body.data?.praise?.id || 0;
  test('获取表扬ID', praiseId > 0);

  const getPraises = await request('GET', '/api/interactions/praises?viewed=all', null, partnerToken);
  test('获取表扬列表成功', getPraises.body.success === true);

  const viewPraise = await request('PUT', `/api/interactions/praises/${praiseId}/view`, null, partnerToken);
  test('标记表扬已读成功', viewPraise.body.success === true);

  // 9. 进度模块
  console.log('\n【9】进度模块');
  const weightProgress = await request('GET', '/api/progress/weight?days=7', null, mainToken);
  test('获取体重趋势成功', weightProgress.body.success === true);

  const achievements = await request('GET', '/api/progress/achievements', null, mainToken);
  test('获取成就列表成功', achievements.body.success === true);

  const stats = await request('GET', '/api/progress/stats', null, mainToken);
  test('获取数据统计成功', stats.body.success === true);
  test('统计包含总打卡数', stats.body.data?.totalCheckins !== undefined);

  // 10. 消息模块
  console.log('\n【10】消息模块');
  const sendMsg = await request('POST', '/api/messages', { content: '测试消息-你好呀' }, mainToken);
  test('发送消息成功', sendMsg.body.success === true, sendMsg.body);
  messageId = sendMsg.body.data?.id || 0;
  test('获取消息ID', messageId > 0);

  const getMsgs = await request('GET', '/api/messages', null, mainToken);
  test('获取消息历史成功', getMsgs.body.success === true);

  const unread = await request('GET', '/api/messages/unread-count', null, partnerToken);
  test('获取未读消息数成功', unread.body.success === true);

  // 11. 奖励模块
  console.log('\n【11】奖励模块');
  const addReward = await request('POST', '/api/rewards', {
    name: '测试奖励-奶茶', description: '一杯奶茶', points_cost: 50, icon: '🧋'
  }, partnerToken);
  test('伴侣发布奖励成功', addReward.body.success === true, addReward.body);
  rewardId = addReward.body.data?.id || 0;
  test('获取奖励ID', rewardId > 0);

  const getRewards = await request('GET', '/api/rewards', null, mainToken);
  test('获取奖励列表成功', getRewards.body.success === true);

  // 12. 个人资料模块
  console.log('\n【12】个人资料模块');
  const getProfile = await request('GET', '/api/profile', null, mainToken);
  test('获取个人资料成功', getProfile.body.success === true);
  test('包含用户信息', !!getProfile.body.data?.user);
  test('包含档案信息', !!getProfile.body.data?.profile);
  test('包含积分', getProfile.body.data?.points !== undefined);

  const updateProfile = await request('PUT', '/api/profile', { nickname: '小减肥测试' }, mainToken);
  test('更新个人资料成功', updateProfile.body.success === true);
  test('昵称更新成功', updateProfile.body.data?.user?.nickname === '小减肥测试');

  // 恢复昵称
  await request('PUT', '/api/profile', { nickname: '小减肥' }, mainToken);

  const getPoints = await request('GET', '/api/profile/points', null, mainToken);
  test('获取积分记录成功', getPoints.body.success === true);

  // 13. 清理测试数据
  console.log('\n【13】清理测试数据');
  if (foodId) {
    const delFood = await request('DELETE', `/api/records/food/${foodId}`, null, mainToken);
    test('删除饮食记录成功', delFood.body.success === true);
  }
  if (exerciseId) {
    const delEx = await request('DELETE', `/api/records/exercise/${exerciseId}`, null, mainToken);
    test('删除运动记录成功', delEx.body.success === true);
  }
  if (weightId) {
    const delW = await request('DELETE', `/api/records/weight/${weightId}`, null, mainToken);
    test('删除体重记录成功', delW.body.success === true);
  }
  if (taskId) {
    const delTask = await request('DELETE', `/api/tasks/${taskId}`, null, partnerToken);
    test('删除任务成功', delTask.body.success === true);
  }
  if (rewardId) {
    const delReward = await request('DELETE', `/api/rewards/${rewardId}`, null, partnerToken);
    // 奖励没有删除接口，跳过
  }

  // 总结
  console.log('\n========================================');
  console.log(`  测试完成: ✅ 通过 ${passed}  ❌ 失败 ${failed}`);
  console.log('========================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('测试执行出错:', err);
  process.exit(1);
});
