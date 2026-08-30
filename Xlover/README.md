# Xlover 💕

情侣减肥打卡小程序 —— 让两个人一起，温柔地变好。

基于**微信原生小程序 + 微信云开发**构建，双角色设计（主角 + 伴侣），通过任务发布、实时互动、PushPlus 微信推送，让减肥这件事变得有趣又有人陪。

---

## ✨ 核心功能

### 双角色体系

| | 主角（减肥者） | 伴侣（监督者） |
|---|---|---|
| **首页** | 今日打卡、饮食/运动/体重记录、目标进度、摄入量/净热量切换 | 主角今日记录（分类展示）、待表扬、一键表扬、点赞评论、主角进度概览 |
| **任务** | — | 发布任务（单次/周期/习惯）、管理任务 |
| **记录** | 饮食记录、运动记录、体重记录、微信步数同步 | — |
| **进度** | 体重趋势、成就徽章、任务统计 | 主角进度概览 |
| **消息** | 互动留言、收到的表扬全屏特效 | 互动留言（PushPlus 推送到主角微信） |
| **我的** | PushPlus 推送配置、奖励兑换 | PushPlus 推送配置、任务管理入口 |

### 任务系统

- **三种任务类型**：单次任务、周期任务（每日重复/指定时间段）、习惯养成（连续天数）
- 伴侣发布 → 主角接受/拒绝 → 打卡完成
- 完成任务获得积分，积分可兑换奖励

### 实时互动

- **PushPlus 微信推送**：主角完成打卡/饮食/运动时，伴侣即时收到微信通知
- **表扬系统**：伴侣发送表扬 → 主角收到全屏爱心特效
- **点赞评论**：伴侣可对主角每条今日记录点赞和评论，评论通过 PushPlus 推送给主角
- **互动留言**：双方可互发留言，通过 PushPlus 推送到对方微信

### 提醒系统

- 伴侣可自定义提醒（喝水、运动、早睡等），支持自定义名称、图标、时间
- 云函数每分钟检查，到点通过 PushPlus 推送到主角微信
- 提醒记录存入 `reminder_logs` 防止重复推送

---

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 微信原生小程序（WXML + WXSS + JS） |
| 后端 | 微信云开发（云函数 + 云数据库 + 云存储） |
| 推送 | [PushPlus](http://www.pushplus.plus/)（免费 200 条/天） |
| 依赖 | `wx-server-sdk`、`got`（HTTP 请求） |

---

## 📁 项目结构

```
Xlover2.0/
├── miniprogram/                 # 小程序前端
│   ├── app.js                    # 应用入口（云环境初始化、登录、食物库初始化）
│   ├── app.json                  # 全局配置（页面路由、自定义 tabBar）
│   ├── app.wxss                  # 全局样式
│   ├── custom-tab-bar/           # 自定义底部导航（按角色动态显示）
│   ├── pages/
│   │   ├── guide/                # 引导页（角色选择、资料录入、头像昵称收集）
│   │   ├── index/                # 首页（打卡、概览、伴侣互动）
│   │   ├── record/               # 记录入口（饮食/运动/体重）
│   │   ├── food/                 # 饮食记录
│   │   ├── exercise/             # 运动记录
│   │   ├── weight/               # 体重记录
│   │   ├── task/                 # 任务页（伴侣发布/主角打卡）
│   │   ├── progress/             # 进度页（体重趋势、成就徽章）
│   │   ├── message/              # 消息页（互动留言）
│   │   ├── remind/               # 提醒设置
│   │   ├── rewardSettings/        # 奖励设置
│   │   ├── rewardExchange/       # 奖励兑换
│   │   └── profile/              # 我的（设置、PushPlus 配置）
│   ├── utils/
│   │   └── util.js               # 工具函数（BMI、热量计算、日期格式化等）
│   └── images/                   # 图片资源
│
├── cloudfunctions/              # 云函数
│   ├── login/                    # 微信登录
│   ├── getUserData/              # 读取用户数据（首页 dashboard、任务列表等）
│   ├── updateData/               # 写入数据（打卡、记录、表扬、点赞、评论等）
│   ├── initFoodLibrary/          # 食物库初始化
│   ├── scheduledRemind/          # 定时提醒（cron: 每分钟）
│   └── dailySummary/             # 每日总结推送（cron: 每分钟）
│
├── project.config.json           # 项目配置
└── .gitignore
```

---

## 🚀 部署指南

### 前置条件

1. 注册[微信小程序](https://mp.weixin.qq.com/)账号，获取 AppID
2. 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
3. 注册 [PushPlus](http://www.pushplus.plus/) 账号，获取推送 Token

### 步骤

#### 1. 导入项目

用微信开发者工具打开本项目目录，填入你的 AppID。

#### 2. 开通云开发

- 在开发者工具中点击「云开发」按钮开通
- 记下云环境 ID，替换 `miniprogram/app.js` 中的 `envId`：
  ```js
  globalData: {
    envId: '你的云环境ID'
  }
  ```

#### 3. 创建数据库集合

在云开发控制台手动创建以下集合：

| 集合名 | 用途 |
|---|---|
| `users` | 用户信息（角色、绑定码、partnerId、PushPlus Token 等） |
| `user_profiles` | 用户档案（身高、体重、目标等） |
| `body_records` | 体重记录 |
| `food_logs` | 饮食记录 |
| `exercise_logs` | 运动记录 |
| `check_ins` | 打卡记录 |
| `food_library` | 食物库 |
| `tasks` | 任务 |
| `points` | 积分记录 |
| `rewards` | 奖励 |
| `reward_claims` | 奖励兑换记录 |
| `messages` | 互动留言 |
| `likes` | 点赞（每日整体点赞） |
| `record_likes` | 记录点赞（单条记录点赞） |
| `record_comments` | 记录评论 |
| `praises` | 表扬 |
| `reminders` | 提醒设置 |
| `reminder_logs` | 提醒发送日志（防重复） |
| `werun_steps` | 微信运动步数 |

#### 4. 部署云函数

在开发者工具中，右键每个云函数文件夹，选择「上传并部署：云端安装依赖」。

需要部署的云函数：
- `login`
- `getUserData`
- `updateData`
- `initFoodLibrary`

带定时触发器的云函数，右键后选择「上传触发器」（需单独上传）：
- `scheduledRemind`（每分钟检查提醒）
- `dailySummary`（每分钟检查每日总结）

#### 5. 配置 PushPlus

1. 在主角手机上注册 PushPlus，获取 Token
2. 在伴侣手机上注册 PushPlus，获取 Token
3. 双方在小程序「我的」页面填入各自的 Token

#### 6. 体验

- 主角扫码进入小程序，完成引导（填写资料）
- 主角在「我的」页面查看绑定码
- 伴侣扫码进入小程序，选择伴侣角色，输入绑定码完成绑定

---

## ⚙️ 关键设计说明

### 自定义 TabBar

使用 `custom-tab-bar` 组件替代原生 tabBar，根据 `userRole`（`main` / `partner`）动态显示不同导航：

- **主角**：首页 → 记录 → 进度 → 消息 → 我的
- **伴侣**：首页 → 任务 → 进度 → 消息 → 我的

### PushPlus 推送架构

由于微信小程序的订阅消息需要用户每次手动授权，本项目改用 PushPlus 实现可靠推送：

- 主角完成打卡/饮食/运动 → `updateData` 云函数内调用 `notifyPartner()` → PushPlus → 伴侣微信
- 伴侣发送表扬/评论/留言 → `updateData` 云函数 → PushPlus → 主角微信
- 定时提醒 → `scheduledRemind` 云函数（cron 每分钟）→ PushPlus → 主角微信

### 云函数时区

微信云函数运行在 UTC 时区，代码中使用 `new Date(Date.now() + 8 * 60 * 60 * 1000)` 转换为北京时间。

---

## 📝 工具函数

`miniprogram/utils/util.js` 提供：

| 函数 | 说明 |
|---|---|
| `formatTime(date)` | 格式化时间 `YYYY/MM/DD HH:MM:SS` |
| `formatDate(date)` | 格式化日期 `YYYY-MM-DD` |
| `getToday()` | 获取今日日期字符串 |
| `getWeekStart()` | 获取本周起始日期 |
| `calculateBMI(weight, height)` | 计算 BMI |
| `calculateCalories(weight, height, age, gender, activityLevel)` | Mifflin-St Jeor 公式计算每日推荐热量 |
| `calculateExerciseCalories(type, duration, weight)` | 基于 MET 值计算运动消耗热量 |
| `calculateDaysDiff(date1, date2)` | 计算日期差天数 |
| `debounce(fn, delay)` | 防抖函数 |

---

## 📄 License

私人项目，仅供个人使用。
