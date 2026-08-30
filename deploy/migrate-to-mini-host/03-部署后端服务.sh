#!/bin/bash
# ============================================================
# Xlover 后端 · 小主机部署脚本
# 上传代码 → 装依赖 → 迁移数据库 → PM2 守护启动
# 用法：bash 03-部署后端服务.sh
# 前提：已运行 02-环境初始化.sh，且打包好的项目已传到 ~/xlover-deploy.tar.gz
# ============================================================
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Xlover 后端 · 部署服务${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 定位项目目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

# 如果是从 ~/Xlover-Server 运行的，直接用
if [ ! -f "$PROJECT_DIR/package.json" ]; then
    # 尝试上级目录
    if [ -f "$PROJECT_DIR/../package.json" ]; then
        PROJECT_DIR="$PROJECT_DIR/.."
    elif [ -f "$HOME/Xlover-Server/package.json" ]; then
        PROJECT_DIR="$HOME/Xlover-Server"
    else
        echo -e "${RED}❌ 找不到 package.json${NC}"
        echo -e "${YELLOW}请确认项目已上传。期望位置：${NC}"
        echo "  ~/Xlover-Server/package.json"
        echo "  或把 03-部署后端服务.sh 放在项目根目录下运行"
        exit 1
    fi
fi

cd "$PROJECT_DIR"
echo -e "${GREEN}项目目录: $PROJECT_DIR${NC}"
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[1/5] 安装后端依赖...${NC}"
# 使用国内镜像加速
npm config set registry https://registry.npmmirror.com
npm install --no-audit --no-fund --omit=dev 2>&1 | tail -5
echo -e "${GREEN}  ✅ 依赖安装完成${NC}"

# 验证 better-sqlite3
if node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')" 2>/dev/null; then
    echo -e "${GREEN}  ✅ better-sqlite3 模块验证通过${NC}"
else
    echo -e "${RED}  ❌ better-sqlite3 加载失败，尝试重新编译...${NC}"
    # Linux 上有 build-essential 应该能编译
    npm rebuild better-sqlite3 2>&1 | tail -5
    node -e "require('better-sqlite3'); console.log('better-sqlite3 OK')" || {
        echo -e "${RED}  ❌ better-sqlite3 编译失败，请确认已装 build-essential 和 python3${NC}"
        exit 1
    }
    echo -e "${GREEN}  ✅ 重新编译后 better-sqlite3 验证通过${NC}"
fi
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[2/5] 迁移数据库（全量）...${NC}"
DB_FILE="database/xlover.db"
if [ -f "$DB_FILE" ]; then
    echo -e "${GREEN}  ✅ 数据库文件已存在（从 Windows 全量迁移过来）${NC}"
    echo "  大小: $(du -h $DB_FILE | cut -f1)"
    # 运行迁移脚本（幂等，补齐表结构）
    node database/init.js 2>&1 | tail -5
    echo -e "${GREEN}  ✅ 数据库表结构已同步${NC}"
else
    echo -e "${YELLOW}  ⚠️  未找到数据库文件，全新初始化...${NC}"
    node database/reset.js
    node database/seedFoods.js
    echo -e "${GREEN}  ✅ 全新数据库已初始化${NC}"
fi
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[3/5] 配置环境变量 (.env)...${NC}"
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}  ✅ 已从 .env.example 创建 .env${NC}"
        echo -e "${YELLOW}  ⚠️  请编辑 .env 填入实际配置（JWT密钥等）${NC}"
    else
        echo -e "${YELLOW}  ⚠️  无 .env 也无 .env.example，跳过${NC}"
    fi
else
    echo -e "${GREEN}  ✅ .env 已存在（从 Windows 迁移）${NC}"
fi
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[4/5] 创建日志目录 + 复制 PM2 配置...${NC}"
mkdir -p logs

# 如果迁移包里的 ecosystem.config.cjs 不在项目根，复制过来
if [ -f "deploy/migrate-to-mini-host/ecosystem.config.cjs" ] && [ ! -f "ecosystem.config.cjs" ]; then
    cp deploy/migrate-to-mini-host/ecosystem.config.cjs .
    echo -e "${GREEN}  ✅ 已复制 PM2 配置到项目根目录${NC}"
elif [ -f "ecosystem.config.cjs" ]; then
    echo -e "${GREEN}  ✅ PM2 配置已在项目根目录${NC}"
fi

# 复制备份脚本
if [ -f "deploy/migrate-to-mini-host/backup-db.sh" ] && [ ! -f "backup-db.sh" ]; then
    cp deploy/migrate-to-mini-host/backup-db.sh .
    chmod +x backup-db.sh
fi
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[5/5] 用 PM2 启动后端 + cloudflared...${NC}"
# 先停旧的（如果存在）
pm2 delete xlover-backend 2>/dev/null || true
pm2 delete xlover-tunnel 2>/dev/null || true

# 启动后端
pm2 start ecosystem.config.cjs --only xlover-backend
echo -e "${GREEN}  ✅ xlover-backend 已启动${NC}"

# cloudflared 隧道先不启动（需要先配置域名/token，见文档04）
echo -e "${YELLOW}  ⏳ cloudflared 隧道待配置（见 04-Cloudflare固定域名配置.md）${NC}"

# 保存 PM2 状态
pm2 save
echo -e "${GREEN}  ✅ PM2 状态已保存（开机自启）${NC}"
echo ""

# --------------------------------------------------
# 健康检查
echo -e "${YELLOW}等待后端启动（3秒）...${NC}"
sleep 3

echo -e "${YELLOW}健康检查: curl http://localhost:3000/health${NC}"
if curl -s http://localhost:3000/health | grep -q '"ok"'; then
    echo -e "${GREEN}  ✅ 后端服务运行正常！${NC}"
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}  🎉 后端部署完成！${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo "  本地地址: http://localhost:3000"
    echo "  健康检查: http://localhost:3000/health"
    echo ""
    echo -e "${YELLOW}→ 下一步：配置 Cloudflare 固定域名${NC}"
    echo -e "${YELLOW}  参考文档: 04-Cloudflare固定域名配置.md${NC}"
else
    echo -e "${RED}  ❌ 后端健康检查失败，查看日志：${NC}"
    echo "  pm2 logs xlover-backend --lines 30"
    exit 1
fi
