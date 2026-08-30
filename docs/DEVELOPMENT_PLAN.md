# Xlover 情侣减肥打卡 App - 开发计划

## 一、项目概述

复刻微信小程序 Xlover 为原生 Android 应用，面向情侣双人使用场景。
- 主角（减肥者）：记录饮食/运动/体重，完成任务，查看进度
- 伴侣（监督者）：发布任务，查看记录，点赞评论，发送表扬，设置提醒

## 二、技术栈

### 前端（Android）
- 语言：Kotlin
- UI：Jetpack Compose + Material Design 3
- 架构：MVVM + Clean Architecture
- 本地数据库：Room
- 网络：Retrofit + OkHttp + Moshi
- 异步：Kotlin Coroutines + Flow
- 依赖注入：Hilt
- 导航：Navigation Compose
- 图片加载：Coil
- 后台任务：WorkManager
- 实时通信：WebSocket（OkHttp）
- 图表：Vico（Compose 图表库）
- 最低 SDK：26（Android 8.0）
- 目标 SDK：34
- 编译 SDK：34

### 后端（Node.js）
- 运行时：Node.js 20+
- 框架：Express.js
- 数据库：SQLite（better-sqlite3）
- ORM：Prisma 或直接 SQL
- WebSocket：ws 库
- 认证：JWT
- 密码加密：bcrypt
- 定时任务：node-cron
- 进程守护：PM2

### 网络
- Tailscale 虚拟局域网（无公网 IP 方案）
- 服务器运行 Tailscale，手机安装 Tailscale 客户端

## 三、功能清单

### 3.1 引导与登录
- [ ] 用户名密码注册/登录
- [ ] 角色选择（主角/伴侣）
- [ ] 资料录入（身高、体重、目标体重、年龄、性别）
- [ ] 头像昵称设置
- [ ] 绑定码生成与输入（伴侣绑定主角）

### 3.2 首页（双角色）
**主角端：**
- [ ] 今日打卡按钮
- [ ] 今日饮食/运动/体重记录概览
- [ ] 目标进度条（当前体重 → 目标体重）
- [ ] 今日摄入量/净热量切换展示
- [ ] 收到的表扬（全屏爱心特效入口）

**伴侣端：**
- [ ] 主角今日记录分类展示
- [ ] 待表扬提醒
- [ ] 一键表扬按钮
- [ ] 点赞/评论入口
- [ ] 主角进度概览

### 3.3 记录模块
- [ ] 饮食记录（搜索食物库、添加自定义食物、份量、热量）
- [ ] 运动记录（运动类型、时长、基于 MET 计算消耗）
- [ ] 体重记录（体重、日期、BMI 计算）
- [ ] 步数展示（手动输入或读取系统步数）

### 3.4 任务系统
- [ ] 三种任务类型：单次、周期（每日/指定时间段）、习惯养成（连续天数）
- [ ] 伴侣发布任务（标题、描述、类型、积分奖励、时间设置）
- [ ] 主角接受/拒绝任务
- [ ] 主角打卡完成任务
- [ ] 任务列表管理（进行中/已完成/已过期）
- [ ] 完成任务获得积分

### 3.5 互动消息
- [ ] 互动留言（双方互发文字消息）
- [ ] 点赞（对每日记录整体点赞）
- [ ] 评论（对单条记录评论）
- [ ] 表扬系统（伴侣发送表扬 → 主角收到全屏爱心特效）
- [ ] 实时通知（WebSocket 推送）

### 3.6 进度与成就
- [ ] 体重趋势图（折线图，可切换周/月/全部）
- [ ] BMI 趋势
- [ ] 成就徽章系统（连续打卡、减重里程碑等）
- [ ] 任务完成统计
- [ ] 积分总数展示

### 3.7 提醒系统
- [ ] 伴侣自定义提醒（名称、图标、时间、重复规则）
- [ ] 服务器定时检查，到点通过 WebSocket 推送
- [ ] 本地通知兜底（WorkManager + AlarmManager）
- [ ] 提醒记录防重复

### 3.8 奖励系统
- [ ] 伴侣设置奖励（名称、所需积分、图标）
- [ ] 主角用积分兑换奖励
- [ ] 奖励兑换记录
- [ ] 伴侣确认兑换完成

### 3.9 我的/设置
- [ ] 个人资料查看与编辑
- [ ] 服务器地址配置（Tailscale IP）
- [ ] 绑定码查看/重新绑定
- [ ] 推送开关
- [ ] 关于页面

## 四、数据库设计（SQLite）

### users 用户表
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 用户ID |
| username | TEXT UNIQUE | 用户名 |
| password_hash | TEXT | 密码哈希 |
| nickname | TEXT | 昵称 |
| avatar | TEXT | 头像路径/URL |
| role | TEXT | main(主角) / partner(伴侣) |
| partner_id | INTEGER | 绑定的伴侣ID |
| bind_code | TEXT | 绑定码（主角生成） |
| created_at | DATETIME | 创建时间 |

### user_profiles 用户档案
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | 用户ID |
| gender | TEXT | male/female |
| age | INTEGER | 年龄 |
| height | REAL | 身高(cm) |
| current_weight | REAL | 当前体重(kg) |
| target_weight | REAL | 目标体重(kg) |
| activity_level | TEXT | 活动水平 |
| daily_calorie_goal | INTEGER | 每日热量目标 |
| updated_at | DATETIME | |

### body_records 体重记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| weight | REAL | 体重(kg) |
| bmi | REAL | BMI |
| record_date | DATE | 记录日期 |
| note | TEXT | 备注 |
| created_at | DATETIME | |

### food_logs 饮食记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| food_name | TEXT | 食物名称 |
| calories | REAL | 热量(kcal) |
| protein | REAL | 蛋白质(g) |
| carbs | REAL | 碳水(g) |
| fat | REAL | 脂肪(g) |
| serving_size | REAL | 份量 |
| meal_type | TEXT | breakfast/lunch/dinner/snack |
| record_date | DATE | |
| created_at | DATETIME | |

### food_library 食物库
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| name | TEXT | 食物名称 |
| calories_per_100g | REAL | 每100g热量 |
| protein | REAL | |
| carbs | REAL | |
| fat | REAL | |
| category | TEXT | 分类 |
| is_custom | INTEGER | 是否自定义 |
| user_id | INTEGER | 自定义食物所属用户 |

### exercise_logs 运动记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| exercise_type | TEXT | 运动类型 |
| duration | INTEGER | 时长(分钟) |
| calories_burned | REAL | 消耗热量 |
| met_value | REAL | MET值 |
| record_date | DATE | |
| note | TEXT | |
| created_at | DATETIME | |

### check_ins 打卡记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| checkin_date | DATE | 打卡日期 |
| streak_days | INTEGER | 连续天数 |
| created_at | DATETIME | |

### tasks 任务
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| creator_id | INTEGER FK | 发布者(伴侣)ID |
| assignee_id | INTEGER FK | 执行者(主角)ID |
| title | TEXT | 任务标题 |
| description | TEXT | 描述 |
| type | TEXT | single/recurring/habit |
| points | INTEGER | 奖励积分 |
| status | TEXT | pending/accepted/rejected/completed/expired |
| recurrence_rule | TEXT | 重复规则(JSON) |
| target_days | INTEGER | 习惯目标天数 |
| current_streak | INTEGER | 当前连续天数 |
| due_date | DATE | 截止日期 |
| completed_date | DATETIME | 完成时间 |
| created_at | DATETIME | |

### points 积分记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| change | INTEGER | 积分变动(正/负) |
| reason | TEXT | 变动原因 |
| reference_id | INTEGER | 关联ID(任务/奖励) |
| balance | INTEGER | 变动后余额 |
| created_at | DATETIME | |

### rewards 奖励
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| creator_id | INTEGER FK | 伴侣ID |
| name | TEXT | 奖励名称 |
| description | TEXT | 描述 |
| points_cost | INTEGER | 所需积分 |
| icon | TEXT | 图标 |
| is_active | INTEGER | 是否启用 |
| created_at | DATETIME | |

### reward_claims 奖励兑换记录
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | 兑换者(主角)ID |
| reward_id | INTEGER FK | 奖励ID |
| status | TEXT | pending/confirmed/cancelled |
| claimed_at | DATETIME | 兑换时间 |
| confirmed_at | DATETIME | 伴侣确认时间 |

### messages 互动留言
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| sender_id | INTEGER FK | |
| receiver_id | INTEGER FK | |
| content | TEXT | 消息内容 |
| is_read | INTEGER | 是否已读 |
| created_at | DATETIME | |

### praises 表扬
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| sender_id | INTEGER FK | 伴侣ID |
| receiver_id | INTEGER FK | 主角ID |
| message | TEXT | 表扬留言 |
| effect_type | TEXT | 特效类型(hearts/stars/confetti) |
| is_viewed | INTEGER | 是否已查看 |
| created_at | DATETIME | |

### record_likes 记录点赞
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | 点赞者(伴侣)ID |
| target_user_id | INTEGER FK | 被点赞者(主角)ID |
| record_date | DATE | 点赞的日期 |
| created_at | DATETIME | |

### record_comments 记录评论
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | 评论者ID |
| record_type | TEXT | food/exercise/weight |
| record_id | INTEGER | 关联记录ID |
| content | TEXT | 评论内容 |
| created_at | DATETIME | |

### reminders 提醒设置
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| creator_id | INTEGER FK | 伴侣ID |
| target_user_id | INTEGER FK | 主角ID |
| title | TEXT | 提醒名称 |
| icon | TEXT | 图标 |
| reminder_time | TEXT | 提醒时间(HH:MM) |
| repeat_days | TEXT | 重复日期(JSON, 如 [1,2,3,4,5]) |
| is_active | INTEGER | 是否启用 |
| created_at | DATETIME | |

### reminder_logs 提醒发送日志
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| reminder_id | INTEGER FK | |
| user_id | INTEGER FK | |
| sent_date | DATE | 发送日期 |
| sent_at | DATETIME | 发送时间 |

### achievements 成就徽章
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | |
| user_id | INTEGER FK | |
| achievement_type | TEXT | 成就类型 |
| title | TEXT | 成就名称 |
| description | TEXT | 描述 |
| icon | TEXT | 图标 |
| unlocked_at | DATETIME | 解锁时间 |

## 五、API 设计

### 认证
- POST /api/auth/register - 注册
- POST /api/auth/login - 登录
- GET /api/auth/me - 获取当前用户

### 用户
- PUT /api/users/profile - 更新资料
- POST /api/users/bind - 绑定伴侣（输入绑定码）
- GET /api/users/partner - 获取伴侣信息

### 记录
- GET /api/records/today - 获取今日所有记录
- POST /api/records/food - 添加饮食记录
- GET /api/records/food - 获取饮食记录列表
- DELETE /api/records/food/:id - 删除饮食记录
- POST /api/records/exercise - 添加运动记录
- GET /api/records/exercise - 获取运动记录列表
- DELETE /api/records/exercise/:id - 删除运动记录
- POST /api/records/weight - 添加体重记录
- GET /api/records/weight - 获取体重记录列表
- DELETE /api/records/weight/:id - 删除体重记录
- POST /api/checkin - 打卡

### 食物库
- GET /api/foods/search?q= - 搜索食物
- POST /api/foods - 添加自定义食物

### 任务
- GET /api/tasks - 获取任务列表
- POST /api/tasks - 创建任务（伴侣）
- PUT /api/tasks/:id - 更新任务
- POST /api/tasks/:id/accept - 接受任务
- POST /api/tasks/:id/reject - 拒绝任务
- POST /api/tasks/:id/complete - 完成任务（打卡）
- DELETE /api/tasks/:id - 删除任务

### 互动
- GET /api/messages - 获取消息列表
- POST /api/messages - 发送消息
- POST /api/praises - 发送表扬
- GET /api/praises/unviewed - 获取未查看表扬
- PUT /api/praises/:id/view - 标记表扬已查看
- POST /api/records/like - 点赞记录
- POST /api/records/comment - 评论记录
- GET /api/records/:date/interactions - 获取某日互动

### 进度
- GET /api/progress/weight?range=week|month|all - 体重趋势
- GET /api/progress/stats - 统计数据
- GET /api/achievements - 成就列表

### 提醒
- GET /api/reminders - 获取提醒列表
- POST /api/reminders - 创建提醒
- PUT /api/reminders/:id - 更新提醒
- DELETE /api/reminders/:id - 删除提醒

### 奖励
- GET /api/rewards - 获取奖励列表
- POST /api/rewards - 创建奖励（伴侣）
- PUT /api/rewards/:id - 更新奖励
- DELETE /api/rewards/:id - 删除奖励
- POST /api/rewards/:id/claim - 兑换奖励（主角）
- GET /api/rewards/claims - 获取兑换记录
- PUT /api/rewards/claims/:id/confirm - 确认兑换（伴侣）

### 积分
- GET /api/points/balance - 获取积分余额
- GET /api/points/history - 获取积分记录

### WebSocket
- ws://host:port/ws - WebSocket 连接（JWT 认证）
- 消息类型：message、praise、like、comment、reminder、task、reward

## 六、UI 设计规范

### 设计风格
- 现代简约，参考 Apple Health / 薄荷健康
- 大量留白，柔和圆角，轻盈阴影
- 卡片式布局，信息层级清晰

### 配色方案
- 主色调：珊瑚粉 #FF6B6B → 蜜桃橙 #FFA07A 渐变
- 辅助色：薄荷绿 #4ECDC4（运动/健康）、天空蓝 #45B7D1（信息）
- 背景色：奶油白 #FFFAF5、浅灰 #F8F9FA
- 文字色：深灰 #2D3436（主标题）、中灰 #636E72（正文）、浅灰 #B2BEC3（辅助）
- 成功：#00B894、警告：#FDCB6E、错误：#E17055

### 字体
- 标题：Noto Sans SC Bold / 系统粗体
- 正文：Noto Sans SC Regular / 系统默认
- 数字：等宽字体或 Roboto Mono（热量、体重等数据）

### 组件规范
- 卡片圆角：16dp
- 按钮圆角：12dp
- 卡片内边距：16dp
- 卡片间距：12dp
- 页面左右边距：20dp
- 阴影：elevation 2-4dp，柔和
- 图标：Material Icons + 自定义线性图标

### 动效
- 页面转场：淡入淡出 + 轻微缩放
- 按钮点击：scale 0.96 + 回弹
- 列表加载：骨架屏 + 淡入
- 表扬特效：全屏爱心/星星粒子动画
- 进度条：平滑动画填充

## 七、开发阶段

### 阶段 0：基础设施（当前）
- 项目骨架搭建
- 数据库设计与初始化
- 基础架构配置

### 阶段 1：认证与引导
- 后端：注册/登录/绑定 API
- 前端：登录页、引导页、角色选择
- 双角色导航框架

### 阶段 2：首页与记录
- 后端：记录 CRUD API、食物库
- 前端：首页 Dashboard、饮食/运动/体重记录

### 阶段 3：任务与积分
- 后端：任务 CRUD、积分系统
- 前端：任务页、积分展示

### 阶段 4：互动与消息
- 后端：留言/点赞/评论/表扬 API
- 前端：消息页、表扬特效、WebSocket

### 阶段 5：进度与成就
- 后端：统计 API
- 前端：趋势图、徽章、统计

### 阶段 6：提醒与奖励
- 后端：定时提醒、奖励 CRUD
- 前端：提醒设置、奖励兑换

### 阶段 7：打磨与部署
- UI 细节、动效
- 服务器部署
- 真机测试
