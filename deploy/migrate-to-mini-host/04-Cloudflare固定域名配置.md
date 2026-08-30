# 04 · Cloudflare 固定域名配置教程

> 目标：在小主机上配置 Cloudflare 正式隧道，绑定**固定域名**（永久不变），替代 trycloudflare.com 临时随机域名。

---

## 📋 你会得到什么

```
📱 App → https://xlover.你的域名.com → Cloudflare → 小主机:3000
```

- 域名**永久不变**（重启、断电、换网络都不影响）
- Cloudflare 免费 CDN 加速 + HTTPS 证书自动续签
- 无需公网 IP、无需备案、无需开端口

---

## ① 注册免费/低价域名

### 方案 A · Cloudflare Registrar 直接注册（推荐，最省事）

1. 打开 https://dash.cloudflare.com → 登录（没账号就注册一个，免费）
2. 左侧菜单 → **Domain Registration** → **Register Domain**
3. 搜你想要的域名，比如 `xlover-app`
4. 选最便宜的后缀：

| 后缀 | 首年价格 | 续费价格 | 推荐 |
|------|---------|---------|------|
| `.xyz` | 约 $1-3 | 约 $10 | ⭐⭐⭐⭐⭐ |
| `.top` | 约 $1-5 | 约 $5-10 | ⭐⭐⭐⭐ |
| `.site` | 约 $2-5 | 约 $10-20 | ⭐⭐⭐ |

> Cloudflare Registrar 以成本价出售，无加价，自动托管 DNS，最省心。

5. 填个人信息 → 付款 → 域名立即生效（DNS 自动在 Cloudflare 上）

### 方案 B · 在阿里云/腾讯云买（需手动切 NS）

如果在国内注册商买更便宜的域名（如 ¥6/首年的 .top）：
1. 在阿里云/腾讯云买域名
2. 在 Cloudflare 添加域名：`Add a Site` → 输入你的域名
3. Cloudflare 会给你 2 个 NS 地址，如 `xxx.ns.cloudflare.com`
4. 回到阿里云/腾讯云 → 域名管理 → 修改 DNS 服务器 → 填入 Cloudflare 的 NS
5. 等待 10 分钟 ~ 24 小时生效

---

## ② 创建正式隧道（Named Tunnel）

### 方法一：命令行创建（推荐）

SSH 登录小主机：

```bash
# 登录 Cloudflare 授权
cloudflared tunnel login

# 会显示一个 URL，复制到浏览器打开 → 选你的域名 → 授权
# 授权后回到终端，会显示 "You have successfully logged in"

# 创建名为 xlover-backend 的隧道
cloudflared tunnel create xlover-backend

# 输出类似：
# Created tunnel xlover-backend with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
# 隧道 ID 已写入 ~/.cloudflared/xxx-xxx.json
```

### 方法二：Zero Trust 控制台创建（图形化）

1. 打开 https://one.dash.cloudflare.com/
2. 左侧 **Networks** → **Tunnels** → **Create a tunnel**
3. 选 **Cloudflared** → 命名为 `xlover-backend` → **Save**
4. 在 "Install and run a connector" 页面复制 Token
5. 回到 SSH：

```bash
# 用 Token 启动 cloudflared（PM2 守护）
cloudflared service install <粘贴你的Token>
```

---

## ③ 配置路由（绑定子域名到本地后端）

### 方法一：命令行 config.yml（推荐，配置文件管理最清晰）

SSH 登录小主机，编辑配置：

```bash
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: xlover-backend
credentials-file: /home/xlover/.cloudflared/<隧道ID>.json

ingress:
  - hostname: xlover.你的域名.com
    service: http://localhost:3000
  - hostname: ws.你的域名.com
    service: http://localhost:3000
  - service: http_status:404
EOF
```

> 把 `<隧道ID>` 换成 `cloudflared tunnel create` 输出的 ID
> 把 `你的域名.com` 换成你注册的域名

### 方法二：Zero Trust 控制台图形化配置

1. https://one.dash.cloudflare.com/ → Networks → Tunnels → 点 `xlover-backend` → Configure
2. 切到 **Public Hostname** 标签
3. **Add a public hostname**：
   - Subdomain: `xlover`
   - Domain: 选你的域名
   - Type: `HTTP`
   - URL: `localhost:3000`
4. **Save**

---

## ④ 配置 DNS（如果用方法一命令行）

```bash
# 自动在 Cloudflare DNS 添加 CNAME 记录指向隧道
cloudflared tunnel route dns xlover-backend xlover.你的域名.com

# 输出类似：Added CNAME xlover.你的域名.com -> xxx.trycloudflare.com
```

> 这条命令帮你自动加了一条 CNAME：`xlover.你的域名.com → <隧道ID>.cfargotunnel.com`
> 如果在控制台创建的隧道（方法二），这步自动完成

---

## ⑤ 启动隧道（PM2 守护）

SSH 登录小主机：

```bash
cd ~/Xlover-Server

# 编辑 PM2 配置，确保 cloudflared 用 config.yml 启动
# 如果 03-部署后端服务.sh 已经复制了 ecosystem.config.cjs，直接编辑它
nano ecosystem.config.cjs
```

找到 `xlover-tunnel` 那段，确认 args 和配置：

```javascript
{
  name: 'xlover-tunnel',
  script: 'cloudflared',
  args: 'tunnel --no-autoupdate --config ' + __dirname + '/.cloudflared/config.yml run xlover-backend',
  // 或者如果用 Token 方式（方法二创建）：
  // args: 'tunnel --no-autoupdate run --token <你的Token>',
  ...
}
```

把 `config.yml` 复制到项目目录：

```bash
cp ~/.cloudflared/config.yml .cloudflared/config.yml
# 注意路径：ecosystem.config.cjs 里的 __dirname 是项目根目录
# 所以 config.yml 放在 项目根/.cloudflared/config.yml
```

启动：

```bash
pm2 start ecosystem.config.cjs --only xlover-tunnel
pm2 save
```

---

## ⑥ 验证固定域名可用

### 在小主机上验证

```bash
# 看 cloudflared 日志
pm2 logs xlover-tunnel --lines 30

# 应看到 "Registered tunnel connection" 字样
```

### 在 Windows 上验证

打开浏览器或 PowerShell：

```powershell
# 健康检查
curl https://xlover.你的域名.com/health

# 应返回: {"status":"ok","timestamp":"...","onlineUsers":0}
```

✅ **从现在开始，你的域名永久固定，重启小主机/断电/换网络都不影响！**

---

## ⑦ 常见问题

### Q: cloudflared 启动报 "credentials file not found"

```bash
# 检查隧道 ID 文件
ls ~/.cloudflared/*.json
# 应有 xxx-xxx.json，把它路径填进 config.yml 的 credentials-file
```

### Q: 访问域名显示 530 / 1033

DNS 未生效或 CNAME 错误。检查 Cloudflare DNS 面板是否有 `xlover → <隧道ID>.cfargotunnel.com` 的 CNAME（橙色云朵）。

### Q: 访问域名显示 502 Bad Gateway

后端没启动。SSH 登录：

```bash
pm2 status   # xlover-backend 应是 online
pm2 logs xlover-backend --lines 30  # 看报错
```

### Q: App 能连但 WebSocket 连不上

确认 config.yml 里 hostname 和 service 对了。WebSocket 走 `/ws` 路径，Cloudflare 默认支持 WebSocket 透传，不需要特殊配置。

---

## 🎯 最终架构图

```
📱 App
  ↓ HTTPS
🌐 xlover.你的域名.com (永久固定)
  ↓ Cloudflare 全球 CDN
🏠 小主机 (Debian 12)
  ├── PM2 → cloudflared (永久隧道进程)
  └── PM2 → node src/index.js (后端)
      └── SQLite xlover.db (含全量迁移数据)
```

下一步：日常运维参考 `05-日常运维与备份恢复.md`
