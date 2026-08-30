#!/bin/bash
# ============================================================
# Xlover 后端 · 小主机环境初始化（Debian 12）
# 一键安装：Node.js v20 LTS + PM2 + cloudflared + 基础工具
# 用法：bash 02-环境初始化.sh
# ============================================================
set -e

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  Xlover 后端 · 环境初始化${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# 检查是否 root 或有 sudo
if [ "$EUID" -ne 0 ] && ! sudo -n true 2>/dev/null; then
    echo -e "${RED}请用 root 或有 sudo 权限的用户运行：sudo bash 02-环境初始化.sh${NC}"
    exit 1
fi

SUDO=""
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
fi

# --------------------------------------------------
echo -e "${YELLOW}[1/5] 更新系统 + 装基础工具...${NC}"
$SUDO apt-get update -qq
$SUDO apt-get upgrade -y -qq
$SUDO apt-get install -y -qq curl wget git vim ufw htop build-essential python3 2>/dev/null
echo -e "${GREEN}  ✅ 系统更新 + 基础工具完成${NC}"
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[2/5] 安装 Node.js v20 LTS (via NodeSource)...${NC}"
if command -v node &> /dev/null; then
    CURRENT_VER=$(node -v)
    if [[ "$CURRENT_VER" == v20.* ]]; then
        echo -e "${GREEN}  ✅ Node.js 已安装: $CURRENT_VER${NC}"
    else
        echo -e "${YELLOW}  ⚠️  当前 Node 版本 $CURRENT_VER，需要升级到 v20...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO apt-get install -y -qq nodejs
        echo -e "${GREEN}  ✅ Node.js 升级完成: $(node -v)${NC}"
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO apt-get install -y -qq nodejs
    echo -e "${GREEN}  ✅ Node.js 安装完成: $(node -v)${NC}"
fi
echo "  npm 版本: $(npm -v)"
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[3/5] 安装 PM2 (进程守护)...${NC}"
if command -v pm2 &> /dev/null; then
    echo -e "${GREEN}  ✅ PM2 已安装: $(pm2 -v)${NC}"
else
    $SUDO npm install -g pm2
    echo -e "${GREEN}  ✅ PM2 安装完成: $(pm2 -v)${NC}"
fi

# 配置 PM2 开机自启
$SUDO env PATH=$PATH:/usr/bin pm2 startup systemd -u $(whoami) --hp /home/$(whoami) 2>/dev/null || true
echo -e "${GREEN}  ✅ PM2 开机自启已配置${NC}"
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[4/5] 安装 cloudflared (Cloudflare Tunnel)...${NC}"
if command -v cloudflared &> /dev/null; then
    echo -e "${GREEN}  ✅ cloudflared 已安装: $(cloudflared --version)${NC}"
else
    # Debian x86_64
    ARCH=$(dpkg --print-architecture)
    if [ "$ARCH" == "amd64" ]; then
        CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb"
    elif [ "$ARCH" == "arm64" ]; then
        CF_URL="https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb"
    else
        echo -e "${RED}  ❌ 不支持的架构: $ARCH${NC}"
        exit 1
    fi

    echo "  下载: $CF_URL"
    wget -q --show-progress -O /tmp/cloudflared.deb "$CF_URL"
    $SUDO dpkg -i /tmp/cloudflared.deb
    rm -f /tmp/cloudflared.deb
    echo -e "${GREEN}  ✅ cloudflared 安装完成: $(cloudflared --version)${NC}"
fi
echo ""

# --------------------------------------------------
echo -e "${YELLOW}[5/5] 配置防火墙...${NC}"
$SUDO ufw allow 22/tcp 2>/dev/null  # SSH
# 不需要开 3000 端口！Cloudflare Tunnel 是出站连接，不需要入站端口
$SUDO ufw --force enable
echo -e "${GREEN}  ✅ 防火墙已启用（仅开放 SSH 22 端口）${NC}"
echo ""

# --------------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  🎉 环境初始化完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo "  Node.js : $(node -v)"
echo "  npm     : $(npm -v)"
echo "  PM2     : $(pm2 -v)"
echo "  cloudflared : $(cloudflared --version 2>&1)"
echo ""
echo -e "${YELLOW}→ 下一步：在 Windows 上运行「打包迁移包.bat」生成压缩包${NC}"
echo -e "${YELLOW}  然后传到小主机，执行 03-部署后端服务.sh${NC}"
echo ""
