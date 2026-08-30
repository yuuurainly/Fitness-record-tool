# Xlover 3.0 · 个人健康管家（多端 Monorepo）

[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs)](https://nodejs.org/)
[![Android](https://img.shields.io/badge/Android-8.0+-34A853?logo=android)](https://www.android.com/)
[![WeChat MiniProgram](https://img.shields.io/badge/小程序-微信-07C160?logo=wechat)](https://developers.weixin.qq.com/miniprogram/dev/framework/)
[![Express](https://img.shields.io/badge/backend-Express-000000?logo=express)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/database-SQLite-003B57?logo=sqlite)](https://www.sqlite.org/)
[![Cloudflare](https://img.shields.io/badge/deploy-Cloudflare%20Tunnel-F38020?logo=cloudflare)](https://www.cloudflare.com/products/tunnel/)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

> **Xlover** 是一套面向个人用户的轻量级健康管理全栈项目：记录每日饮食/运动/体重、智能分配宝箱奖励、每日任务与积分系统、多端数据实时同步。
> 后端 + 原生 Android App + 微信小程序端 + 部署方案 **一个仓库全部搞定**。

---

## ✨ 功能亮点

| 模块 | 功能 |
|------|------|
| 🍽️ 饮食记录 | 136+ 中文食物库，一键录入卡路里/蛋白质/碳水/脂肪 |
| 🏃 运动消耗 | 44+ 常见运动，记录时长自动计算消耗热量 |
| 📈 体重趋势 | 每日录入体重，生成折线趋势图 |
| 🎁 宝箱系统 | 按健康目标完成度，开出积分/成就/勋章奖励 |
| ✅ 每日任务 | 自定义任务清单，每日自动重置 |
| 💬 实时 WebSocket | 多端消息实时推送（例如：打卡宝箱即时弹窗） |
| 🖼️ 图形化启动器（Windows） | Tkinter 一键启动后端 + Cloudflare 公网隧道 |
| 🌐 Cloudflare 公网部署 | 零备案 / 零公网 IP / 自带 HTTPS / 免费 |

---

## 🏗️ 架构（最终部署形态）

```
   📱 Android 原生 App (Kotlin+Compose)      📱 微信小程序端
           │                                           │
           │  HTTPS / WSS (REST + WebSocket)          │
           ▼                                           ▼
     ┌──────────────────────────────────────────────────────┐
     │   🌐 Cloudflare 全球 CDN (xlover.你的域名.com)        │
     │      HTTPS 证书 / DDoS 防护 / 全球 300+ 边缘节点       │
     └──────────────────────────────────────────────────────┘
                           │ 加密隧道（出站 7844/UDP）
                           ▼
     ┌──────────────────────────────────────────────────────┐
     │  🏠 小主机 (Debian 12 · x86 N100 · 6W 24h 在线)       │
     │    ├─ PM2 ─ cloudflared（Cloudflare Tunnel 进程）     │
     │    └─ PM2 ─ Node.js v20 ─ Express + better-sqlite3    │
     │               └─ SQLite: database/xlover.db           │
     └──────────────────────────────────────────────────────┘
```

---

## 📁 目录结构（单主分支 Monorepo · 目录隔离）

```
Xlover3.0/
├── Xlover-Server/                 ← 🟢 后端（Node20 + Express + SQLite）
│   ├── src/
│   │   ├── index.js               # 主入口（Express + WebSocket）
│   │   ├── routes/                # 认证/用户/饮食/运动/体重/任务/宝箱/Settings
│   │   ├── middleware/            # JWT 鉴权/错误处理
│   │   ├── websocket/             # 实时消息推送
│   │   ├── cron/                  # 每日任务自动重置（node-cron）
│   │   └── config/db.js           # SQLite 单例配置
│   ├── database/
│   │   ├── init.js                # 建表迁移脚本（幂等）
│   │   ├── reset.js               # 数据库重置（自动备份）
│   │   └── seedFoods.js           # 136+ 中文食物库种子
│   ├── Xlover启动器.pyw           # ✨ Windows GUI 启动器（Tkinter）
│   ├── 启动Xlover服务.bat         #   GUI 启动入口
│   └── package.json
│
├── Xlover-Android/                ← 🤖 原生 Android App
│   ├── app/src/main/java/com/xlover/app/
│   │   ├── data/                  # Room DB / DataStore / Retrofit API
│   │   ├── di/                    # Hilt 依赖注入
│   │   ├── domain/                # UseCase / Repository 接口
│   │   └── ui/                    # Jetpack Compose 各页面
│   └── build.gradle.kts
│
├── Xlover/                        ← 💬 微信小程序端
│   ├── miniprogram/               # 小程序页面（首页/记录/任务/进度/我的）
│   └── cloudfunctions/            # 腾讯云函数（可选：短信/微信支付）
│
├── deploy/
│   ├── cloudflare-tunnel/         # ☁️ Windows / 小主机 Cloudflare Tunnel 部署脚本
│   │   ├── 00-快速临时隧道.bat    # 免注册 trycloudflare.com
│   │   ├── 01-登录并创建隧道.bat  # 正式 Named Tunnel + 固定域名
│   │   └── config.yml
│   └── migrate-to-mini-host/      # 🚚 小主机迁移包（强烈推荐）
│       ├── 迁移总览.md
│       ├── 01-小主机选购与系统安装.md   # N100 推荐 + Debian12 安装
│       ├── 02-环境初始化.sh             # Node20 + PM2 + cloudflared
│       ├── 03-部署后端服务.sh           # 依赖 + DB 迁移 + PM2 守护
│       ├── 04-Cloudflare固定域名配置.md # 免费域名 + Named Tunnel 绑定
│       ├── 05-日常运维与备份恢复.md     # PM2 速查 + crontab 自动备份
│       ├── ecosystem.config.cjs         # PM2 进程配置
│       ├── backup-db.sh                 # SQLite 每日自动备份
│       └── 打包迁移包.bat                # Windows 端一键打包项目
│
└── .gitignore                     # 排除数据库/密钥/.gradle/node_modules/logs/binary
```

---

## 🚀 快速开始（3 种方式）

### 方式 A · Windows GUI 一键启动（最傻瓜，新手上手 10 秒）

**适合：本机开发调试 / 临时演示**

```powershell
双击运行：
  Xlover-Server\启动Xlover服务.bat
  → 点 [安装依赖]  →  [重置数据库]  →  [启动后台服务]
  → 左侧 ☁️ Cloudflare 面板  →  [一键启动快速公网隧道]
  → 复制 https://xxx.trycloudflare.com 到 App 服务器地址
```

✅ 内置：自动装 Node v20 + 自动编译 better-sqlite3 + 自动下载 cloudflared.exe + 自动解析公网域名

---

### 方式 B · 本地后端开发（命令行）

**适合：后端接口开发 / 测试**

```bash
# 1. 环境（需要 Node.js 20 LTS，其他版本会导致 better-sqlite3 ABI 不兼容）
node -v   # 必须是 v20.x.x

# 2. 进入后端目录
cd Xlover-Server

# 3. 装依赖（国内加速镜像）
npm config set registry https://registry.npmmirror.com
npm install

# 4. 初始化数据库（结构 + 食物库种子）
npm run init-db      # 建表（幂等）
npm run seed-foods   # 136+ 中文食物库

# 5. 启动
npm run dev          # 开发模式（含日志 + 错误堆栈）
# 或
npm start            # 生产模式（pm2 start src/index.js）

# 6. 健康检查
curl http://localhost:3000/health
# → {"status":"ok","onlineUsers":0}
```

- 默认端口：`3000`
- WebSocket 路径：`ws://localhost:3000/ws`
- 数据库文件：`Xlover-Server/database/xlover.db`

---

### 方式 C · 迁移到低功耗小主机长期运行（💎 强烈推荐）

**适合：24 小时在线 · 月电费 3-5 元 · 固定自有域名永久不变**

推荐硬件：**畅网 N100 迷你主机（¥250-350，8GB+256GB SSD）**，功耗 6-15W。

> 👉 完整教程见 [deploy/migrate-to-mini-host/迁移总览.md](deploy/migrate-to-mini-host/)

1. 在 Windows 上运行 `deploy/migrate-to-mini-host/打包迁移包.bat`（含全量数据库）
2. 传到小主机 → `bash 02-环境初始化.sh` → `bash 03-部署后端服务.sh`
3. 浏览器注册 **¥6 首年的 .top 免费/低价域名** → Cloudflare 创建固定域名隧道
4. 以后所有运维：`pm2 status / pm2 logs / backup-db.sh`（文档05）

---

## 🧩 API 速览

> 详细接口文档，后端启动后访问 `http://localhost:3000/health` 验证；路由源码见 `Xlover-Server/src/routes/`。

| 路由前缀 | 模块 | 主要接口 |
|----------|------|----------|
| `/api/auth` | 认证 | `POST /register`、`POST /login`（返回 JWT）、`POST /logout` |
| `/api/users` | 用户 | `GET/PUT /me`、身高/体重/目标设置 / 设置项 |
| `/api/foods` | 食物库 | `GET /?q=鸡蛋`（搜索）、`GET /categories` |
| `/api/diets` | 饮食记录 | `GET /date/2026-08-30`、`POST /`、`PUT /:id`、`DELETE /:id` |
| `/api/exercises` | 运动库 | `GET /` |
| `/api/workouts` | 运动记录 | `GET /today`、`POST /` |
| `/api/weights` | 体重趋势 | `GET /range?start=&end=`、`POST /` |
| `/api/tasks` | 每日任务 | `GET /today`、`POST /`、`PATCH /:id/complete` |
| `/api/chests` | 宝箱 | `GET /available`、`POST /:id/open`（开宝箱）、`GET /records` |
| `/api/settings` | 设置 | `GET /`、`PUT /`（通知/主题/目标宏量营养素） |
| `/health` | 健康检查 | `GET /`（返回 status / onlineUsers） |
| `/ws` | WebSocket | 登录后 join room，任务/宝箱变更实时推送 |

### 请求示例

```bash
# 1. 注册
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"xlover","password":"123456","nickname":"小绿"}'

# 2. 登录（拿 JWT）
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"xlover","password":"123456"}'
# → {"token":"Bearer eyJhbG...","user":{...}}

# 3. 保存今天的早餐
curl -X POST http://localhost:3000/api/diets \
  -H "Authorization: Bearer eyJhbG..." \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-30","mealType":"breakfast","foodId":1,"grams":100}'

# 4. 开宝箱
curl -X POST http://localhost:3000/api/chests/3/open \
  -H "Authorization: Bearer eyJhbG..."
```

---

## 🛠️ 技术栈

### 后端（Xlover-Server）
| 组件 | 选型 | 作用 |
|------|------|------|
| 运行时 | **Node.js 20 LTS** | 统一版本（避免 better-sqlite3 NODE_MODULE_VERSION 错位） |
| 框架 | **Express 4** | HTTP 路由 + 中间件 |
| 数据库 | **SQLite3 + better-sqlite3** | 文件型单库，零运维（`database/xlover.db`） |
| 鉴权 | **JWT (jsonwebtoken + bcrypt)** | 无状态登录 |
| 实时 | **ws** | 原生 WebSocket（/ws 路径） |
| 定时任务 | **node-cron** | 每日 00:05 重置任务状态 + 生成次日宝箱池 |
| 跨域 / 参数 | **cors / body-parser / helmet** | 安全 & 通用中间件 |
| 日志 | **morgan + Winston** | 访问日志 + 错误日志 |
| 进程守护 | **PM2** | 24h 在线 + 开机自启 + 日志轮转 |
| 部署 | **Cloudflare Tunnel** | 免费、免备案、自带 HTTPS |

### Android（Xlover-Android）
- Kotlin + **Jetpack Compose**（声明式 UI）
- **Hilt** 依赖注入
- **Retrofit + OkHttp**（REST API，自带 JWT 拦截器）
- **Room** 本地缓存 + **DataStore (Proto)** 用户偏好
- **Navigation Compose** 路由
- Coil 图片加载 / WorkManager 后台同步

### 小程序（Xlover）
- 原生小程序 SDK + Vant Weapp 组件库
- 腾讯云函数（可选：微信支付、短信验证码、订阅消息推送）

---

## 🌐 部署 FAQ

**Q: 为什么不用 Docker？**
Node + SQLite 单体服务，PM2 就够用，Docker 多一层抽象反而带来卷映射/权限/备份复杂度。需要 Docker 时可自行在 `Xlover-Server/` 下加 `Dockerfile`。

**Q: 为什么 Cloudflare Tunnel 是最终方案，不做 frp/chmlfrp？**
- 完全免费 + 全球 300+ 节点 + 自带 HTTPS 证书
- 零入站端口开放，仅出站 UDP/TCP 连接，更安全
- 可以绑定「自有域名永久固定」，不需要每次改地址

**Q: 临时域名每次重启变？**
对，trycloudflare.com 是会话绑定的。长期使用请走「固定自有域名」流程（[文档 04](deploy/migrate-to-mini-host/04-Cloudflare固定域名配置.md)）。

**Q: 数据丢了怎么办？**
SQLite 是本地文件，`backup-db.sh` 会每日凌晨 3 点备份到 `database/backups/xlover.db.YYYYMMDD-HHMMSS.gz`，保留 30 天。

---

## 📝 Roadmap

- [x] 后端：23 张表 + 食物/运动种子 + JWT + WebSocket + node-cron 每日重置
- [x] GUI 启动器（Windows Tkinter）+ 一键 Cloudflare 公网隧道
- [x] 部署：Cloudflare Tunnel（临时域名 + 正式隧道 + 自有域名）
- [x] 迁移包：Debian 小主机 5 份文档 + 3 个脚本 + PM2 配置
- [x] Android 端：主页/记录/任务/进度/我的 5 大板块（Compose）
- [x] 小程序端：页面 + 云函数模板
- [ ] 接入 AI 食物识别（拍照录入饮食）
- [ ] 接入智能体对话（体重/饮食趋势咨询）
- [ ] GitHub Actions：Docker 镜像自动发布

---

## 🤝 贡献

1. 新开一个分支：`git checkout -b feature/xxx`
2. 改完提交：`npm run dev` 跑一遍后端，确认 `/health` OK + 登录正常
3. 推送 + 开 Pull Request：标题格式 `feat: 你做了什么` / `fix: 你修了什么`

---

## 📄 License

**MIT** — 你可以自由用于个人项目。商业使用时，请参考各依赖包的许可证。

---

<p align="center">
  <strong>💚 长期维护。Enjoy your Xlover！</strong>
</p>
