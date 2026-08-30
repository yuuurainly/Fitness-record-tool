/* ================================================================
 * 后端API冒烟测试：覆盖用户绑定+核心记录+任务奖励+互动+积分申请+提醒
 * ================================================================ */
const http = require('http');
const BASE = 'http://localhost:3000';

function api(method, path, body = undefined, token = undefined) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + path);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      method, headers
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, raw: data }); }
      });
    }).on('error', reject);
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

const colors = {
  pass: '\x1b[32m✓\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  info: '\x1b[36mℹ\x1b[0m'
};
let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`${colors.pass} ${name} ${detail}`); }
  else    { fail++; console.log(`${colors.fail} ${name} ${detail}`); }
}
async function expect(name, method, path, body, token, predicate, showResp = false) {
  const r = await api(method, path, body, token);
  const ok = predicate(r);
  check(name, ok, ok ? '' : ` status=${r.status} ${JSON.stringify(r.body).substring(0,200)}`);
  if (showResp || !ok) console.log('   ↳ ', JSON.stringify(r.body).substring(0, 300));
  return r;
}

(async () => {
  console.log('\n========== Xlover 后端 API 冒烟测试 ==========\n');

  // 0. 健康检查
  await expect('健康检查', 'GET', '/health', undefined, undefined,
    r => r.status === 200 && r.body.status === 'ok');

  // 1. 注册主角
  const mainReg = await api('POST', '/api/auth/register', {
    username: 'mainuser', password: '123456', nickname: '主角小美', role: 'main'
  });
  let mainToken, mainId, bindCode;
  if (mainReg.status === 200 && mainReg.body.success) {
    mainToken = mainReg.body.data.token;
    mainId = mainReg.body.data.user.id;
    bindCode = mainReg.body.data.user.bind_code;
    check('注册主角', true, `bindCode=${bindCode}`);
  } else if (mainReg.status === 400 && /已被注册/.test(mainReg.body.message)) {
    // 已存在则登录
    const login = await api('POST', '/api/auth/login', { username: 'mainuser', password: '123456' });
    mainToken = login.body.data.token; mainId = login.body.data.user.id;
    bindCode = login.body.data.user.bind_code;
    check('登录主角(已存在)', !!mainToken, `bindCode=${bindCode}`);
  } else {
    check('注册主角', false, mainReg.body?.message || mainReg.raw);
  }

  // 2. 注册伴侣
  let partnerToken, partnerId;
  const pReg = await api('POST', '/api/auth/register', {
    username: 'partuser', password: '123456', nickname: '伴侣小帅', role: 'partner'
  });
  if (pReg.status === 200 && pReg.body.success) {
    partnerToken = pReg.body.data.token; partnerId = pReg.body.data.user.id;
    check('注册伴侣', true);
  } else {
    const login = await api('POST', '/api/auth/login', { username: 'partuser', password: '123456' });
    partnerToken = login.body?.data?.token; partnerId = login.body?.data?.user?.id;
    check('登录伴侣(已存在)', !!partnerToken);
  }

  // 3. 绑定伴侣（伴侣输入主角的绑定码）
  await expect('绑定伴侣', 'POST', '/api/auth/bind', { bindCode }, partnerToken,
    r => r.status === 200 && r.body.success);

  // 4. 主角更新档案：start_weight/身高/年龄/性别
  await expect('主角更新档案', 'PUT', '/api/profile',
    { start_weight: 70, current_weight: 68, target_weight: 60, height: 165, age: 25, gender: 'female', activity_level: 'moderate' },
    mainToken, r => r.status === 200 && r.body.success);

  // 5. 食物库搜索
  await expect('食物库搜索', 'GET', '/api/records/food-library?keyword=%E9%B8%A1%E8%83%B8',
    undefined, mainToken,
    r => r.body?.success && Array.isArray(r.body.data.list) && r.body.data.list.length > 0,
    false);

  // 6. 食物库分类
  await expect('食物库分类', 'GET', '/api/records/food-library/categories',
    undefined, mainToken, r => r.body?.success && Array.isArray(r.body.data.categories));

  // 7. 运动库列表
  await expect('运动库列表', 'GET', '/api/records/exercise-library?category=cardio',
    undefined, mainToken, r => r.body?.success && r.body.data.list.length > 0);

  // 8. 主角添加早餐：鸡胸肉（从食物库取id=45就是鸡胸肉）
  const lib = (await api('GET', '/api/records/food-library?keyword=%E9%B8%A1%E8%83%B8', undefined, mainToken)).body.data.list[0];
  await expect('添加早餐(鸡胸肉150g)', 'POST', '/api/records/food',
    { food_name: lib.name, food_id: lib.id, serving_size: 150, meal_type: 'breakfast' },
    mainToken, r => r.body?.success && r.body.data.id > 0);

  // 9. 主角添加午餐：米饭
  const rice = (await api('GET', '/api/records/food-library?keyword=%E7%99%BD%E7%B1%B3%E9%A5%AD', undefined, mainToken)).body.data.list[0];
  await expect('添加午餐(米饭200g)', 'POST', '/api/records/food',
    { food_name: rice.name, food_id: rice.id, serving_size: 200, meal_type: 'lunch' },
    mainToken, r => r.body?.success);

  // 10. 主角添加运动：跑步30min，取运动库running_slow
  const runEx = (await api('GET', '/api/records/exercise-library?keyword=%E6%85%A2%E8%B7%91', undefined, mainToken)).body.data.list[0];
  const exLog = await expect('添加运动(慢跑30分钟)', 'POST', '/api/records/exercise',
    { exercise_type: runEx.type_key, duration: 30, exercise_library_id: runEx.id },
    mainToken, r => r.body?.success && r.body.data.calories_burned > 0, true);

  // 11. 主角体重记录67.8
  await expect('记录体重67.8kg', 'POST', '/api/records/weight',
    { weight: 67.8, note: '早起测量' }, mainToken,
    r => r.body?.success && Math.abs(r.body.data.weight - 67.8) < 0.001);

  // 12. 喝水打卡 x3
  for (let i=0;i<3;i++) {
    await api('POST', '/api/records/checkins', { type:'water' }, mainToken);
  }
  const chk = await api('GET', '/api/records/checkins', undefined, mainToken);
  check('喝水打卡x3', chk.body?.success && chk.body.data.summary.water === 3,
    `summary=${JSON.stringify(chk.body?.data?.summary)}`);

  // 13. 伴侣发布任务（单次+习惯各1个）
  const taskR = await expect('伴侣发布单次任务', 'POST', '/api/tasks',
    { title:'喝水8杯今日打卡', description:'多喝水', type:'once', points:10 },
    partnerToken, r => r.body?.success && r.body.data.id > 0, true);
  const taskId = taskR.body?.data?.id;

  await expect('伴侣发布习惯任务', 'POST', '/api/tasks',
    { title:'7天晨跑习惯', type:'habit', habit_days:7, points:50 },
    partnerToken, r => r.body?.success);

  // 14. 主角接受任务 + 打卡（完成单次）
  await expect('主角接受任务', 'PUT', `/api/tasks/${taskId}/accept`,
    {}, mainToken, r => r.body?.success && r.body.data.status === 'active');
  const doneR = await expect('主角完成单次任务', 'PUT', `/api/tasks/${taskId}/complete`,
    {}, mainToken, r => r.body?.success && r.body.data.completed === true, true);
  check('任务完成发放积分', doneR.body?.data?.pointsEarned === 10,
    `pointsEarned=${doneR.body?.data?.pointsEarned}`);

  // 15. 伴侣发送表扬 + WebSocket
  await expect('伴侣发送表扬全屏特效', 'POST', '/api/interactions/praises',
    { receiver_id: mainId, content: '今天太棒啦！喝水打卡完成 ❤️', effect_type:'hearts' },
    partnerToken, r => r.body?.success);

  // 16. 伴侣点赞记录
  const foodId = (await api('GET', '/api/records/food', undefined, mainToken)).body.data.foods[0]?.id;
  if (foodId) {
    await expect('伴侣点赞早餐记录', 'POST', '/api/interactions/record-likes',
      { record_id: `food_${foodId}` }, partnerToken, r => r.body?.success);
    await expect('伴侣评论早餐记录', 'POST', '/api/interactions/record-comments',
      { record_type:'food', record_id: foodId, content:'高蛋白低脂肪，很棒！👍' },
      partnerToken, r => r.body?.success);
  }

  // 17. 伴侣今日整体点赞
  await expect('伴侣今日整体点赞', 'POST', '/api/interactions/daily-likes',
    { target_user_id: mainId }, partnerToken, r => r.body?.success);

  // 18. 伴侣发布奖励
  const rw = await expect('伴侣发布奖励', 'POST', '/api/rewards',
    { name:'看一场电影', description:'周末一起去电影院', points_cost: 30, icon:'🎬' },
    partnerToken, r => r.body?.success && r.body.data.id > 0, true);
  const rewardId = rw.body?.data?.id;

  // 19. 主角查看奖励列表
  await expect('主角查看奖励列表', 'GET', '/api/rewards', undefined, mainToken,
    r => r.body?.success && r.body.data.rewards.length > 0);

  // 20. 主角发起积分申请（早睡=10分）—— 新commit核心功能
  const prR = await expect('主角发起早睡积分申请', 'POST', '/api/point-requests',
    { type:'sleep', title:'昨晚22:30前入睡', description:'连续3天早睡，申请+10分', points:10 },
    mainToken, r => r.body?.success && r.body.data.id > 0, true);
  const prId = prR.body?.data?.id;

  // 21. 伴侣查看待审核申请
  await expect('伴侣待审核申请列表', 'GET', '/api/point-requests?status=pending',
    undefined, partnerToken, r => r.body?.success && r.body.data.requests.length > 0);

  // 22. 伴侣审核通过
  await expect('伴侣审核通过积分申请', 'PUT', `/api/point-requests/${prId}/approve`,
    {}, partnerToken, r => r.body?.success, true);

  // 23. 伴侣创建提醒（给主角：早上8点喝水）
  await expect('伴侣为主角创建提醒', 'POST', '/api/reminders',
    { target_user_id: mainId, title:'记得喝水', icon:'💧', description:'工作再忙也要喝水哦',
      reminder_time:'08:00', repeat_days:[1,2,3,4,5,6,7] },
    partnerToken, r => r.body?.success);

  // 24. 主角查看自己的提醒
  await expect('主角查看提醒列表', 'GET', '/api/reminders', undefined, mainToken,
    r => r.body?.success && r.body.data.list.length > 0);

  // 25. Dashboard 检查
  const dash = await expect('主角Dashboard', 'GET', '/api/dashboard', undefined, mainToken,
    r => r.body?.success && r.body.data.user, true);

  // 26. 统计&体重趋势
  await expect('进度统计', 'GET', '/api/progress/stats', undefined, mainToken,
    r => r.body?.success && typeof r.body.data.totalPoints === 'number');

  await expect('体重趋势', 'GET', '/api/progress/weight?days=7', undefined, mainToken,
    r => r.body?.success);

  // 27. 消息发送
  await expect('伴侣给主角发消息', 'POST', '/api/messages',
    { content:'记得今天的任务哦~' }, partnerToken,
    r => r.body?.success);

  // 28. 主角查积分记录
  await expect('主角积分明细', 'GET', '/api/profile/points', undefined, mainToken,
    r => r.body?.success);

  console.log(`\n========== 测试结束：${colors.pass}通过 ${pass}  ${colors.fail}失败 ${fail} ==========\n`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
