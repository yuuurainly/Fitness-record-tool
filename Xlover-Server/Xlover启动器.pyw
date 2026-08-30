# -*- coding: utf-8 -*-
"""
Xlover 后台服务 - 傻瓜式图形化启动器
========================================
功能：
  ✅ 一键启动 / 停止后台服务（自动选择兼容的 Node 版本）
  ✅ 实时日志显示窗口（彩色输出）
  ✅ 服务健康检查
  ✅ 数据库操作（初始化、导入食物库、重置）
  ✅ 一键安装依赖
  ✅ 显示本机 IP（手机连接用）
  ✅ 配置编辑器（修改端口、密钥等）
  ✅ 一键打开健康检查页面

使用方法：双击本文件即可启动（确保已安装 Python 3.8+）
"""

import os
import sys
import subprocess
import threading
import socket
import urllib.request
import urllib.error
import json
import re
import time
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, filedialog
from pathlib import Path

# ============================================================
# 全局配置
# ============================================================
SERVER_DIR = Path(__file__).parent.resolve()
ENV_FILE = SERVER_DIR / ".env"
PACKAGE_JSON = SERVER_DIR / "package.json"
NODE20_DIR = Path(r"C:\Users\Negen\nodejs")  # 优先使用的 Node 版本目录

# 颜色主题（匹配 Android App 风格：Cream + Coral）
COLORS = {
    "bg": "#FFF8EE",          # CreamSurface 背景
    "surface": "#FFFFFF",     # 卡片白底
    "primary": "#FF6B5B",     # CoralPrimary 主色
    "primary_dark": "#E85A4B",
    "accent": "#FFD9A8",      # 辅助色
    "text": "#2D3436",        # 主文字
    "text_sub": "#636E72",    # 次要文字
    "success": "#00B894",     # 绿色
    "warning": "#FDCB6E",     # 黄色
    "error": "#E17055",       # 红色
    "info": "#74B9FF",        # 蓝色
    "log_bg": "#1E272E",      # 日志区深色背景
    "log_text": "#DFE6E9",    # 日志文字
}


def get_local_ips():
    """获取本机所有 IPv4 地址"""
    ips = []
    try:
        hostname = socket.gethostname()
        # 优先获取所有网卡
        import platform
        if platform.system() == "Windows":
            # Windows 下用 ipconfig 更准确
            result = subprocess.run(
                ["ipconfig"], capture_output=True, text=True, encoding="gbk", errors="ignore"
            )
            for line in result.stdout.splitlines():
                if "IPv4" in line or "IPv4 地址" in line:
                    m = re.search(r"(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})", line)
                    if m:
                        ip = m.group(1)
                        if not ip.startswith("127."):
                            ips.append(ip)
        if not ips:
            # 兜底方案
            ip_list = socket.getaddrinfo(hostname, None, socket.AF_INET)
            for item in ip_list:
                ip = item[4][0]
                if not ip.startswith("127.") and ip not in ips:
                    ips.append(ip)
    except Exception:
        pass
    return ips if ips else ["127.0.0.1"]


def read_env():
    """读取 .env 文件为字典"""
    env = {}
    if ENV_FILE.exists():
        content = ENV_FILE.read_text(encoding="utf-8")
        for line in content.splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


def write_env(env_dict):
    """写入字典到 .env 文件"""
    lines = []
    for k, v in env_dict.items():
        lines.append(f"{k}={v}")
    ENV_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


# ============================================================
# 运行时解析：返回 (node_exe, npm_cli_js, runtime_env)
#   - 绝对路径调用，不依赖 PATH（避免 WinError 2）
#   - 优先使用 NODE20_DIR 下的 node（解决 better-sqlite3 ABI 不兼容）
#   - 强制 NODE_PATH 指向本项目 node_modules，阻止向上爬父目录
# ============================================================
def resolve_runtime():
    # 1. 定位 node.exe（绝对路径）
    candidates = []
    if NODE20_DIR.exists() and (NODE20_DIR / "node.exe").exists():
        candidates.append(NODE20_DIR / "node.exe")
    # 兜底系统 node
    sys_node = Path(r"C:\Program Files\nodejs\node.exe")
    if sys_node.exists():
        candidates.append(sys_node)

    node_exe = None
    node_root = None
    for c in candidates:
        try:
            v = subprocess.run(
                [str(c), "-v"], capture_output=True, text=True,
                encoding="utf-8", errors="ignore", timeout=5,
            ).stdout.strip()
            if v:
                node_exe = str(c)
                node_root = c.parent
                break
        except Exception:
            continue

    if not node_exe:
        return None, None, None

    # 2. 定位 npm-cli.js（不调用 npm.cmd / npm.ps1，省去命令解析烦恼）
    npm_cli_js = None
    # 2a. 优先 node 同目录下的 node_modules/npm/bin/npm-cli.js
    p = node_root / "node_modules" / "npm" / "bin" / "npm-cli.js"
    if p.exists():
        npm_cli_js = str(p)
    else:
        # 2b. 找常见全局安装位置
        for g in [
            Path.home() / "AppData" / "Roaming" / "npm" / "node_modules" / "npm" / "bin" / "npm-cli.js",
            Path(r"C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js"),
        ]:
            if g.exists():
                npm_cli_js = str(g)
                break

    # 3. 构建隔离运行环境
    env = os.environ.copy()
    # 将选中的 node 目录置于 PATH 最前（以防其他工具内部调 npm）
    env["PATH"] = str(node_root) + os.pathsep + env.get("PATH", "")
    # 阻止 Node 向上解析到父目录（D:\AI\豆包\Xlover3.0\node_modules 是旧版 better-sqlite3）
    local_modules = SERVER_DIR / "node_modules"
    env["NODE_PATH"] = str(local_modules)
    # 部分 npm 生态需要此变量：指向当前 server 目录自己的 node_modules
    # 防止 require('better-sqlite3') 一路爬到父级项目
    if local_modules.exists():
        pass  # OK
    return node_exe, npm_cli_js, env


# ============================================================
# 带颜色标签的日志 Text 组件
# ============================================================
class ColoredLogText(scrolledtext.ScrolledText):
    TAG_CONFIG = {
        "info":    {"foreground": COLORS["info"]},
        "success": {"foreground": COLORS["success"]},
        "warning": {"foreground": COLORS["warning"]},
        "error":   {"foreground": COLORS["error"]},
        "stdout":  {"foreground": COLORS["log_text"]},
        "header":  {"foreground": COLORS["accent"]},
    }

    def __init__(self, master, **kwargs):
        super().__init__(
            master,
            bg=COLORS["log_bg"],
            fg=COLORS["log_text"],
            insertbackground=COLORS["log_text"],
            font=("Consolas", 10),
            padx=10, pady=10,
            wrap="word",
            **kwargs,
        )
        self.configure(state="disabled")
        for tag, cfg in self.TAG_CONFIG.items():
            self.tag_configure(tag, **cfg)

    def append(self, text, tag="stdout"):
        self.configure(state="normal")
        # 自动识别日志级别
        auto_tag = tag
        if tag == "stdout":
            lower = text.lower()
            if any(k in lower for k in ["error", "err ", "失败", "错误", "exception", "fatal"]):
                auto_tag = "error"
            elif any(k in lower for k in ["warn", "警告"]):
                auto_tag = "warning"
            elif any(k in lower for k in ["success", "成功", "ok", "已启动", "done", "完成"]):
                auto_tag = "success"
        self.insert("end", text.rstrip() + "\n", auto_tag)
        self.see("end")
        self.configure(state="disabled")

    def clear(self):
        self.configure(state="normal")
        self.delete("1.0", "end")
        self.configure(state="disabled")


# ============================================================
# 主应用窗口
# ============================================================
class XloverLauncherApp:
    def __init__(self, root):
        self.root = root
        self.root.title("💕 Xlover 后台服务启动器")
        self.root.geometry("960x680")
        self.root.minsize(880, 600)
        self.root.configure(bg=COLORS["bg"])

        # 状态
        self.server_process = None
        self.server_running = False
        self.env = read_env()
        self.port = int(self.env.get("PORT", "3000"))

        self._setup_style()
        self._build_ui()
        self._auto_refresh_ips()
        self._check_node_env()

    # ----------------------------------------------------------
    # 样式设置
    # ----------------------------------------------------------
    def _setup_style(self):
        style = ttk.Style(self.root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure("TFrame", background=COLORS["bg"])
        style.configure("Card.TFrame", background=COLORS["surface"], relief="flat")

        style.configure(
            "TLabel",
            background=COLORS["bg"],
            foreground=COLORS["text"],
            font=("Microsoft YaHei UI", 10),
        )
        style.configure(
            "Card.TLabel",
            background=COLORS["surface"],
            foreground=COLORS["text"],
            font=("Microsoft YaHei UI", 10),
        )
        style.configure(
            "Title.TLabel",
            background=COLORS["bg"],
            foreground=COLORS["primary"],
            font=("Microsoft YaHei UI", 16, "bold"),
        )
        style.configure(
            "StatusRunning.TLabel",
            background=COLORS["success"],
            foreground="white",
            font=("Microsoft YaHei UI", 10, "bold"),
            padding=(14, 6),
        )
        style.configure(
            "StatusStopped.TLabel",
            background=COLORS["error"],
            foreground="white",
            font=("Microsoft YaHei UI", 10, "bold"),
            padding=(14, 6),
        )
        style.configure(
            "StatusStarting.TLabel",
            background=COLORS["warning"],
            foreground=COLORS["text"],
            font=("Microsoft YaHei UI", 10, "bold"),
            padding=(14, 6),
        )

        # 按钮
        style.configure(
            "Primary.TButton",
            font=("Microsoft YaHei UI", 10, "bold"),
            padding=(16, 8),
            background=COLORS["primary"],
            foreground="white",
            borderwidth=0,
        )
        style.map(
            "Primary.TButton",
            background=[("active", COLORS["primary_dark"]), ("disabled", "#FFB3A8")],
            foreground=[("disabled", "white")],
        )

        style.configure(
            "Action.TButton",
            font=("Microsoft YaHei UI", 9),
            padding=(12, 6),
            background=COLORS["surface"],
            foreground=COLORS["text"],
            borderwidth=1,
            relief="solid",
        )
        style.map(
            "Action.TButton",
            background=[("active", COLORS["accent"])],
        )

        style.configure(
            "Stop.TButton",
            font=("Microsoft YaHei UI", 10, "bold"),
            padding=(16, 8),
            background=COLORS["error"],
            foreground="white",
            borderwidth=0,
        )
        style.map(
            "Stop.TButton",
            background=[("active", "#C95641"), ("disabled", "#F5A898")],
        )

        # 分隔
        style.configure(
            "TLabelframe",
            background=COLORS["surface"],
            foreground=COLORS["primary"],
            borderwidth=1,
        )
        style.configure(
            "TLabelframe.Label",
            background=COLORS["surface"],
            foreground=COLORS["primary"],
            font=("Microsoft YaHei UI", 10, "bold"),
        )

    # ----------------------------------------------------------
    # 构建 UI
    # ----------------------------------------------------------
    def _build_ui(self):
        # 顶部标题栏
        top = ttk.Frame(self.root, style="TFrame")
        top.pack(fill="x", padx=20, pady=(18, 8))

        title = ttk.Label(top, text="💕 Xlover 后台服务启动器", style="Title.TLabel")
        title.pack(side="left")

        self.status_label = ttk.Label(top, text="● 服务未启动", style="StatusStopped.TLabel")
        self.status_label.pack(side="right")

        # IP 显示
        ip_frame = ttk.Frame(self.root, style="TFrame")
        ip_frame.pack(fill="x", padx=20, pady=(0, 8))
        ttk.Label(ip_frame, text="📡 本机 IP：", style="TLabel").pack(side="left")
        self.ip_text = tk.Text(
            ip_frame, height=1, font=("Consolas", 11, "bold"),
            bg=COLORS["surface"], fg=COLORS["primary_dark"],
            relief="flat", bd=0,
        )
        self.ip_text.pack(side="left", fill="x", expand=True, padx=4)
        self.ip_text.configure(state="disabled", cursor="xterm")
        copy_btn = ttk.Button(
            ip_frame, text="📋 复制", style="Action.TButton", width=8,
            command=self._copy_ips,
        )
        copy_btn.pack(side="left", padx=4)
        refresh_ip_btn = ttk.Button(
            ip_frame, text="🔄 刷新", style="Action.TButton", width=8,
            command=self._auto_refresh_ips,
        )
        refresh_ip_btn.pack(side="left")

        # 主区域：左侧卡片 + 右侧日志
        main = ttk.Frame(self.root, style="TFrame")
        main.pack(fill="both", expand=True, padx=20, pady=(8, 8))

        # 左侧控制面板
        left = ttk.Frame(main, style="TFrame", width=340)
        left.pack(side="left", fill="y")
        left.pack_propagate(False)

        # --- 控制卡片 ---
        ctrl_card = tk.Frame(left, bg=COLORS["surface"], highlightthickness=0)
        ctrl_card.pack(fill="x", pady=(0, 12))
        # 圆角效果通过 Canvas 画太复杂，直接用 Frame + 柔和色
        self._round_card(ctrl_card)

        tk.Label(
            ctrl_card, text="🎮 服务控制",
            bg=COLORS["surface"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 11, "bold"),
            anchor="w",
        ).pack(fill="x", padx=18, pady=(14, 6))

        self.start_btn = tk.Button(
            ctrl_card, text="▶  启动后台服务",
            font=("Microsoft YaHei UI", 11, "bold"),
            bg=COLORS["primary"], fg="white",
            activebackground=COLORS["primary_dark"], activeforeground="white",
            relief="flat", cursor="hand2",
            height=2, command=self._start_server,
        )
        self.start_btn.pack(fill="x", padx=18, pady=6)

        self.stop_btn = tk.Button(
            ctrl_card, text="⏹  停止后台服务",
            font=("Microsoft YaHei UI", 11, "bold"),
            bg=COLORS["error"], fg="white",
            activebackground="#C95641", activeforeground="white",
            relief="flat", cursor="hand2",
            height=2, command=self._stop_server, state="disabled",
        )
        self.stop_btn.pack(fill="x", padx=18, pady=(0, 6))

        row1 = tk.Frame(ctrl_card, bg=COLORS["surface"])
        row1.pack(fill="x", padx=18, pady=(0, 14))
        tk.Button(
            row1, text="🔍 健康检查",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2",
            command=self._health_check,
        ).pack(side="left", expand=True, fill="x", padx=(0, 4))
        tk.Button(
            row1, text="🌐 打开页面",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2",
            command=self._open_health_page,
        ).pack(side="left", expand=True, fill="x", padx=(4, 0))

        # --- 数据库卡片 ---
        db_card = tk.Frame(left, bg=COLORS["surface"])
        db_card.pack(fill="x", pady=(0, 12))
        self._round_card(db_card)

        tk.Label(
            db_card, text="🗄️  数据库工具",
            bg=COLORS["surface"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 11, "bold"), anchor="w",
        ).pack(fill="x", padx=18, pady=(14, 6))

        tk.Button(
            db_card, text="🔧 初始化数据库（首次使用）",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=lambda: self._run_npm_script("init-db", "初始化数据库"),
        ).pack(fill="x", padx=18, pady=3)

        tk.Button(
            db_card, text="🥗 导入食物库数据",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=lambda: self._run_npm_script("seed-foods", "导入食物库"),
        ).pack(fill="x", padx=18, pady=3)

        tk.Button(
            db_card, text="♻️  重置数据库（清空所有数据）",
            bg=COLORS["surface"], fg=COLORS["error"],
            activebackground="#FFD7CC", relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=self._reset_database,
        ).pack(fill="x", padx=18, pady=(3, 14))

        # --- 环境工具卡片 ---
        tool_card = tk.Frame(left, bg=COLORS["surface"])
        tool_card.pack(fill="x", pady=(0, 12))
        self._round_card(tool_card)

        tk.Label(
            tool_card, text="🛠️  环境 & 配置",
            bg=COLORS["surface"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 11, "bold"), anchor="w",
        ).pack(fill="x", padx=18, pady=(14, 6))

        tk.Button(
            tool_card, text="📦 安装依赖（首次使用必需）",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=self._install_deps,
        ).pack(fill="x", padx=18, pady=3)

        tk.Button(
            tool_card, text="✏️  编辑配置文件（端口/密钥等）",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=self._open_env_editor,
        ).pack(fill="x", padx=18, pady=3)

        tk.Button(
            tool_card, text="🧹 清空日志窗口",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=12, pady=8,
            command=self._clear_log,
        ).pack(fill="x", padx=18, pady=(3, 14))

        # --- Cloudflare 公网部署卡片 ---
        cf_card = tk.Frame(left, bg=COLORS["surface"])
        cf_card.pack(fill="x", pady=(0, 12))
        self._round_card(cf_card)

        tk.Label(
            cf_card, text="☁️  Cloudflare 公网部署",
            bg=COLORS["surface"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 11, "bold"), anchor="w",
        ).pack(fill="x", padx=18, pady=(14, 6))

        self.cf_status_label = tk.Label(
            cf_card, text="隧道状态：未启动",
            bg=COLORS["surface"], fg=COLORS["text_sub"],
            font=("Microsoft YaHei UI", 9), anchor="w",
        )
        self.cf_status_label.pack(fill="x", padx=18)

        # 公网地址显示框
        url_row = tk.Frame(cf_card, bg=COLORS["surface"])
        url_row.pack(fill="x", padx=18, pady=(6, 8))
        tk.Label(
            url_row, text="公网地址:",
            bg=COLORS["surface"], fg=COLORS["text_sub"],
            font=("Microsoft YaHei UI", 9), anchor="w",
        ).pack(fill="x")
        self.cf_url_text = tk.Text(
            url_row, height=1, font=("Consolas", 10, "bold"),
            bg=COLORS["bg"], fg=COLORS["primary_dark"],
            relief="flat", bd=0,
        )
        self.cf_url_text.pack(fill="x", pady=(2, 0))
        self.cf_url_text.insert("1.0", "（启动快速隧道后，自动填入 trycloudflare.com 域名）")
        self.cf_url_text.configure(state="disabled", fg=COLORS["text_sub"])

        self.cf_start_btn = tk.Button(
            cf_card, text="🚀 一键启动快速公网隧道（免注册）",
            bg=COLORS["primary"], fg="white",
            activebackground=COLORS["primary_dark"], activeforeground="white",
            relief="flat", cursor="hand2",
            font=("Microsoft YaHei UI", 9, "bold"),
            anchor="center", padx=12, pady=8,
            command=self._cf_start_quick,
        )
        self.cf_start_btn.pack(fill="x", padx=18, pady=(8, 4))

        self.cf_stop_btn = tk.Button(
            cf_card, text="⏹ 停止公网隧道",
            bg=COLORS["error"], fg="white",
            activebackground="#C95641", activeforeground="white",
            relief="flat", cursor="hand2",
            font=("Microsoft YaHei UI", 9, "bold"),
            anchor="center", padx=12, pady=8,
            command=self._cf_stop, state="disabled",
        )
        self.cf_stop_btn.pack(fill="x", padx=18, pady=(0, 4))

        cf_row2 = tk.Frame(cf_card, bg=COLORS["surface"])
        cf_row2.pack(fill="x", padx=18, pady=(2, 14))
        tk.Button(
            cf_row2, text="📋 复制公网地址",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=10, pady=7,
            command=self._cf_copy_url,
        ).pack(side="left", expand=True, fill="x", padx=(0, 3))
        tk.Button(
            cf_row2, text="🌐 公网健康检查",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 9), cursor="hand2", anchor="w",
            padx=10, pady=7,
            command=self._cf_health_check,
        ).pack(side="left", expand=True, fill="x", padx=(3, 0))

        # 右侧日志
        right = tk.Frame(main, bg=COLORS["surface"])
        right.pack(side="left", fill="both", expand=True, padx=(12, 0))
        self._round_card(right)

        log_header = tk.Frame(right, bg=COLORS["surface"])
        log_header.pack(fill="x", padx=16, pady=(14, 6))
        tk.Label(
            log_header, text="📜 实时运行日志",
            bg=COLORS["surface"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 11, "bold"),
        ).pack(side="left")
        tk.Label(
            log_header, text="（点击任务的 X 仅关闭窗口，如需停止服务请点左侧按钮）",
            bg=COLORS["surface"], fg=COLORS["text_sub"],
            font=("Microsoft YaHei UI", 8),
        ).pack(side="right")

        self.log = ColoredLogText(right, height=20)
        self.log.pack(fill="both", expand=True, padx=16, pady=(0, 16))

        # 底部提示
        bottom = tk.Frame(self.root, bg=COLORS["bg"])
        bottom.pack(fill="x", padx=20, pady=(0, 16))
        tk.Label(
            bottom,
            text="💡 提示：手机和电脑需连接同一 WiFi；App 内服务器地址填写：http://上面的IP:3000    |    模拟器请用 http://10.0.2.2:3000",
            bg=COLORS["bg"], fg=COLORS["text_sub"],
            font=("Microsoft YaHei UI", 9),
        ).pack(side="left")

    def _round_card(self, frame):
        """给 Frame 增加柔和边框效果"""
        frame.configure(
            highlightbackground="#E8DFD0",
            highlightthickness=1,
        )

    # ----------------------------------------------------------
    # 工具方法
    # ----------------------------------------------------------
    def _set_status(self, state):
        """设置状态标签 state: running / stopped / starting"""
        if state == "running":
            self.status_label.configure(style="StatusRunning.TLabel", text="● 服务运行中")
            self.start_btn.configure(state="disabled")
            self.stop_btn.configure(state="normal")
            self.server_running = True
        elif state == "stopped":
            self.status_label.configure(style="StatusStopped.TLabel", text="● 服务未启动")
            self.start_btn.configure(state="normal")
            self.stop_btn.configure(state="disabled")
            self.server_running = False
        elif state == "starting":
            self.status_label.configure(style="StatusStarting.TLabel", text="● 服务启动中…")
            self.start_btn.configure(state="disabled")
            self.stop_btn.configure(state="normal")
            self.server_running = False

    def _auto_refresh_ips(self):
        ips = get_local_ips()
        self.ip_text.configure(state="normal")
        self.ip_text.delete("1.0", "end")
        self.ip_text.insert("1.0", "    ".join(ips))
        self.ip_text.configure(state="disabled")
        self._ips_cache = ips

    def _copy_ips(self):
        ips = getattr(self, "_ips_cache", get_local_ips())
        text = "    ".join(ips)
        self.root.clipboard_clear()
        self.root.clipboard_append(f"http://{ips[0]}:{self.port}")
        messagebox.showinfo(
            "复制成功",
            f"已复制服务器地址到剪贴板：\nhttp://{ips[0]}:{self.port}\n\n"
            f"可直接粘贴到 App 的服务器地址栏。"
        )

    def _check_node_env(self):
        """启动时检查 Node 环境（严格模式）"""
        self.log.append("=" * 56, "header")
        self.log.append("  欢迎使用 Xlover 后台服务启动器", "header")
        self.log.append("=" * 56, "header")
        node_exe, npm_cli_js, env = resolve_runtime()
        if not node_exe:
            self.log.append("[启动器] ❌ 未找到可运行的 Node.js，请先安装 Node.js v20/v22 LTS", "error")
            self.log.append("            下载: https://nodejs.org/ （安装时勾选 Add to PATH）", "error")
            self._runtime_ok = False
            self.log.append("")
            return
        self._runtime_ok = True
        self._node_exe = node_exe
        self._npm_cli_js = npm_cli_js
        self._runtime_env = env

        self.log.append(f"[启动器] ✅ 使用 Node.js: {node_exe}", "success")
        # 执行版本检查
        try:
            v = subprocess.run(
                [node_exe, "-v"], capture_output=True, text=True,
                encoding="utf-8", errors="ignore", timeout=5,
            ).stdout.strip()
            self.log.append(f"[启动器] Node 版本: {v}", "info")
        except Exception as e:
            self.log.append(f"[启动器] ⚠️ 获取版本失败: {e}", "warning")

        if npm_cli_js:
            self.log.append(f"[启动器] ✅ 使用 npm: {npm_cli_js}", "success")
        else:
            self.log.append("[启动器] ❌ 未找到 npm-cli.js，npm 相关命令可能不可用", "error")

        # 检查 Xlover-Server 自己的 node_modules（防止爬到父目录）
        local_nm = SERVER_DIR / "node_modules"
        if local_nm.exists() and (local_nm / "better-sqlite3").exists():
            self.log.append("[启动器] ✅ 检测到 Xlover-Server 独立 node_modules，环境隔离正常", "success")
        else:
            self.log.append("[启动器] ⚠️ Xlover-Server/node_modules 尚未安装，请先点【安装依赖】", "warning")
        self.log.append("")

    # ----------------------------------------------------------
    # 启动 / 停止服务
    # ----------------------------------------------------------
    def _start_server(self):
        if self.server_running:
            return
        if self.server_process and self.server_process.poll() is None:
            return
        # 运行时检查
        if not getattr(self, "_runtime_ok", False):
            self.log.append("❌ 启动失败：未检测到兼容的 Node.js 环境", "error")
            return
        # 校验依赖
        if not (SERVER_DIR / "node_modules" / "better-sqlite3").exists():
            self.log.append("❌ 未安装依赖！请先点击【📦 安装依赖】", "error")
            messagebox.showwarning(
                "缺少依赖",
                "Xlover-Server 目录下没有安装 node_modules！\n\n请点击左侧【📦 安装依赖（首次使用必需）】按钮安装依赖。"
            )
            return

        self._set_status("starting")
        self.log.append("▶ 正在启动 Xlover 后台服务...", "info")
        self.log.append(f"  目录: {SERVER_DIR}", "info")
        self.log.append(f"  端口: {self.port}", "info")
        self.log.append(f"  Node: {self._node_exe}", "info")

        try:
            # 直接使用 node src/index.js（不通过 npm，避免子进程嵌套和 PATH 解析失败）
            self.server_process = subprocess.Popen(
                [self._node_exe, "src/index.js"],
                cwd=str(SERVER_DIR),
                env=self._runtime_env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            t = threading.Thread(target=self._read_process_output, args=(self.server_process,), daemon=True)
            t.start()
            # 后台健康检查
            threading.Thread(target=self._wait_for_ready, daemon=True).start()
        except Exception as e:
            self.log.append(f"❌ 启动失败: {e}", "error")
            self.log.append(f"   诊断：如果是找不到文件错误，请检查 Node 可执行文件路径是否正确", "warning")
            self._set_status("stopped")

    def _wait_for_ready(self):
        """启动后轮询健康检查，成功后切换状态"""
        url = f"http://127.0.0.1:{self.port}/health"
        for _ in range(40):  # 最长约 20 秒
            time.sleep(0.5)
            if not self.server_process or self.server_process.poll() is not None:
                return
            try:
                with urllib.request.urlopen(url, timeout=2) as resp:
                    if resp.status == 200:
                        data = json.loads(resp.read().decode("utf-8"))
                        self.log.append("", "stdout")
                        self.log.append(f"✅ 服务启动成功！健康检查返回: {json.dumps(data, ensure_ascii=False)}", "success")
                        ips = getattr(self, "_ips_cache", get_local_ips())
                        self.log.append(f"🌐 本机访问:   http://127.0.0.1:{self.port}", "info")
                        if ips:
                            self.log.append(f"📱 手机访问:   http://{ips[0]}:{self.port}", "info")
                        self._set_status("running")
                        return
            except Exception:
                continue

    def _stop_server(self):
        if not self.server_process or self.server_process.poll() is not None:
            self._set_status("stopped")
            return
        self.log.append("⏹ 正在停止后台服务...", "warning")
        try:
            # Windows 下用 taskkill 终止整个进程树（npm 会派生 node 子进程）
            pid = self.server_process.pid
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True, text=True, timeout=5,
            )
            # 兜底：再尝试一次直接 terminate
            try:
                self.server_process.terminate()
            except Exception:
                pass
            time.sleep(0.8)
            # 确认端口是否还在占用，二次清理
            self._kill_process_on_port(self.port)
            self.log.append("✅ 后台服务已停止", "success")
        except Exception as e:
            self.log.append(f"⚠️ 停止时出现异常: {e}", "warning")
        finally:
            self.server_process = None
            self._set_status("stopped")

    def _kill_process_on_port(self, port):
        """根据端口杀死进程（Windows）"""
        try:
            result = subprocess.run(
                ["netstat", "-ano"], capture_output=True, text=True,
                encoding="gbk", errors="ignore", timeout=5,
            )
            pids = set()
            for line in result.stdout.splitlines():
                if f":{port} " in line and "LISTENING" in line:
                    parts = line.split()
                    if parts:
                        pids.add(parts[-1])
            for pid in pids:
                subprocess.run(
                    ["taskkill", "/F", "/PID", pid],
                    capture_output=True, timeout=3,
                )
                self.log.append(f"  - 清理端口占用 PID={pid}", "info")
        except Exception:
            pass

    def _read_process_output(self, proc):
        """后台线程读取子进程输出"""
        try:
            for line in proc.stdout:
                line = line.rstrip()
                if line:
                    self.root.after(0, lambda l=line: self.log.append(l, "stdout"))
            # 进程结束
            rc = proc.wait()
            self.root.after(0, self._on_process_exit, rc)
        except Exception as e:
            self.root.after(0, lambda: self.log.append(f"日志读取异常: {e}", "error"))

    def _on_process_exit(self, returncode):
        self.log.append(f"⚠️ 子进程已退出，返回码: {returncode}", "warning")
        self.server_process = None
        self._set_status("stopped")

    # ----------------------------------------------------------
    # 健康检查 / 打开页面
    # ----------------------------------------------------------
    def _health_check(self):
        self.log.append("🔍 正在执行健康检查...", "info")

        def check():
            try:
                url = f"http://127.0.0.1:{self.port}/health"
                with urllib.request.urlopen(url, timeout=5) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    self.root.after(0, lambda: self.log.append(
                        f"✅ 服务正常！\n     status={data.get('status')}\n     在线用户={data.get('onlineUsers', 0)}\n     时间戳={data.get('timestamp')}",
                        "success",
                    ))
                    if not self.server_running:
                        self.root.after(0, lambda: self._set_status("running"))
            except urllib.error.URLError as e:
                self.root.after(0, lambda: self.log.append(f"❌ 连接失败: {e.reason}", "error"))
                self.root.after(0, lambda: self._set_status("stopped"))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(f"❌ 健康检查失败: {e}", "error"))

        threading.Thread(target=check, daemon=True).start()

    def _open_health_page(self):
        import webbrowser
        url = f"http://127.0.0.1:{self.port}/health"
        webbrowser.open(url)
        self.log.append(f"🌐 已打开浏览器: {url}", "info")

    # ----------------------------------------------------------
    # NPM 脚本 / 安装依赖 / 数据库操作（全部使用绝对路径）
    # ----------------------------------------------------------
    def _ensure_runtime(self, need_npm=False):
        if not getattr(self, "_runtime_ok", False):
            self.log.append("❌ 环境未就绪：未检测到兼容的 Node.js", "error")
            return None, None, None
        if need_npm and not self._npm_cli_js:
            self.log.append("❌ 环境未就绪：未找到 npm-cli.js，无法运行 npm 命令", "error")
            return None, None, None
        return self._node_exe, self._npm_cli_js, self._runtime_env

    def _run_npm_script(self, script_name, description):
        """运行 package.json 中的脚本（通过 node 调 npm-cli.js 绝对路径）"""
        node_exe, npm_cli_js, env = self._ensure_runtime(need_npm=True)
        if not node_exe:
            return

        if self.server_running:
            if not messagebox.askyesno(
                "确认操作",
                f"当前服务正在运行，执行【{description}】可能影响运行。\n是否停止服务后继续？",
            ):
                return
            self._stop_server()
            time.sleep(1.5)

        self.log.append(f"\n🧪 开始执行: {description} (npm run {script_name})", "info")

        def worker():
            try:
                proc = subprocess.Popen(
                    [node_exe, npm_cli_js, "run", script_name],
                    cwd=str(SERVER_DIR), env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                )
                for line in proc.stdout:
                    line = line.rstrip()
                    if line:
                        self.root.after(0, lambda l=line: self.log.append("  " + l, "stdout"))
                rc = proc.wait()
                if rc == 0:
                    self.root.after(0, lambda: self.log.append(f"✅ {description} 完成！", "success"))
                else:
                    self.root.after(0, lambda: self.log.append(f"❌ {description} 失败，返回码={rc}", "error"))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(f"❌ 执行异常: {e}", "error"))

        threading.Thread(target=worker, daemon=True).start()

    def _install_deps(self):
        node_exe, npm_cli_js, env = self._ensure_runtime(need_npm=True)
        if not node_exe:
            return

        if self.server_running:
            if not messagebox.askyesno(
                "确认操作",
                "当前服务正在运行，安装依赖前需要先停止服务。\n是否继续？",
            ):
                return
            self._stop_server()
            time.sleep(1.5)

        # 额外：如果发现父目录有 node_modules，先警告用户
        parent_nm = SERVER_DIR.parent / "node_modules"
        if parent_nm.exists() and not (SERVER_DIR / "node_modules").exists():
            if not messagebox.askyesno(
                "检测到父项目 node_modules",
                "检测到项目根目录（父目录）存在旧的 node_modules，\n"
                "而 Xlover-Server 自己还没有。为了避免模块冲突，\n\n"
                "建议：先删除父目录 node_modules 和 package-lock.json，\n"
                "然后再安装，确保依赖完全装在 Xlover-Server 下。\n\n"
                "是否继续安装（会装在 Xlover-Server 目录，但仍建议清理父目录）？",
            ):
                return

        self.log.append("\n📦 开始安装依赖（npm install --no-audit --no-fund）...", "info")
        self.log.append(f"   Node: {node_exe}", "info")
        self.log.append(f"   目录: {SERVER_DIR}", "info")
        self.log.append("   首次使用会比较慢（better-sqlite3 需要编译），请耐心等待～", "info")

        def worker():
            try:
                proc = subprocess.Popen(
                    [node_exe, npm_cli_js, "install", "--no-audit", "--no-fund"],
                    cwd=str(SERVER_DIR), env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                )
                for line in proc.stdout:
                    line = line.rstrip()
                    if line:
                        self.root.after(0, lambda l=line: self.log.append("  " + l, "stdout"))
                rc = proc.wait()
                if rc == 0:
                    # 校验 better-sqlite3 是否到位
                    ok = (SERVER_DIR / "node_modules" / "better-sqlite3").exists()
                    self.root.after(0, lambda: self.log.append(
                        "✅ 依赖安装完成！现在可以初始化数据库并启动服务了。" if ok else
                        "⚠️ 安装返回成功，但未检测到 better-sqlite3，建议重新安装或检查编译错误。",
                        "success" if ok else "warning",
                    ))
                else:
                    self.root.after(0, lambda: self.log.append(
                        f"❌ 依赖安装失败，返回码={rc}。请检查日志排查问题（常见：缺少 python / C++ 构建工具）。",
                        "error",
                    ))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(f"❌ 安装异常: {e}", "error"))

        threading.Thread(target=worker, daemon=True).start()

    def _reset_database(self):
        node_exe, _npm, env = self._ensure_runtime(need_npm=False)
        if not node_exe:
            return
        if not messagebox.askyesno(
            "⚠️  危险操作确认",
            "即将重置数据库，这会清空所有用户数据！\n\n"
            "    • 会自动备份旧数据库文件\n"
            "    • 会重建所有数据表\n"
            "    • 会重新导入食物库种子数据\n\n"
            "确定要继续吗？",
            icon="warning",
        ):
            return
        if self.server_running:
            self._stop_server()
            time.sleep(1.5)

        self.log.append("\n♻️  开始重置数据库（node database/reset.js）...", "warning")
        self.log.append(f"   Node: {node_exe}", "info")

        def worker():
            try:
                proc = subprocess.Popen(
                    [node_exe, "database/reset.js"],
                    cwd=str(SERVER_DIR), env=env,
                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                )
                for line in proc.stdout:
                    line = line.rstrip()
                    if line:
                        self.root.after(0, lambda l=line: self.log.append("  " + l, "stdout"))
                rc = proc.wait()
                if rc == 0:
                    self.root.after(0, lambda: self.log.append(
                        "✅ 数据库重置完成！所有数据已清空并重新初始化。", "success",
                    ))
                else:
                    self.root.after(0, lambda: self.log.append(
                        f"❌ 重置失败，返回码={rc}", "error",
                    ))
                    self.root.after(0, lambda: self.log.append(
                        "   → 常见原因：better-sqlite3 编译版本不匹配。请先【安装依赖】重新编译。",
                        "warning",
                    ))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(f"❌ 执行异常: {e}", "error"))

        threading.Thread(target=worker, daemon=True).start()

    # ----------------------------------------------------------
    # 配置文件编辑器
    # ----------------------------------------------------------
    def _open_env_editor(self):
        env = read_env()
        EnvEditorDialog(self.root, env, self._on_env_saved)

    def _on_env_saved(self, new_env):
        self.env = new_env
        self.port = int(new_env.get("PORT", "3000"))
        self.log.append(f"✏️  配置已保存，端口更新为 {self.port}", "success")
        if self.server_running:
            self.log.append("⚠️  当前服务正在使用旧端口配置，需要重启服务生效", "warning")

    def _clear_log(self):
        self.log.clear()
        self.log.append("🧹 日志已清空", "info")

    # ==========================================================
    # Cloudflare 公网隧道控制
    # ==========================================================
    CF_DIR = SERVER_DIR.parent / "deploy" / "cloudflare-tunnel"
    CF_EXE_LOCAL = SERVER_DIR / "cloudflared.exe"  # 优先放到启动器同目录

    def _cf_get_exe(self):
        """查找 cloudflared.exe，找到就返回绝对路径"""
        for p in [self.CF_EXE_LOCAL, self.CF_DIR / "cloudflared.exe"]:
            if p.exists():
                return str(p)
        return None

    def _cf_download_exe_async(self, on_done):
        """后台下载 cloudflared.exe 到 CF_DIR"""
        def worker():
            dst = self.CF_DIR / "cloudflared.exe"
            self.CF_DIR.mkdir(parents=True, exist_ok=True)
            url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
            self.root.after(0, lambda: self.log.append(
                "☁️  正在下载 cloudflared.exe（~20MB，首次使用需下载）...", "info",
            ))
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Xlover-Launcher"})
                with urllib.request.urlopen(req, timeout=600) as resp, open(dst, "wb") as f:
                    # 简单进度：分块写
                    total = int(resp.headers.get("Content-Length", "0"))
                    got = 0
                    while True:
                        chunk = resp.read(65536)
                        if not chunk:
                            break
                        f.write(chunk)
                        got += len(chunk)
                        if total and got % (1024 * 512) < 65536:
                            pct = int(got * 100 / total)
                            self.root.after(0, lambda p=pct: self.log.append(
                                f"  下载进度 {p}%", "info",
                            ))
                self.root.after(0, lambda: self.log.append("✅ cloudflared.exe 下载完成", "success"))
                self.root.after(0, lambda: on_done(str(dst)))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(
                    f"❌ 下载失败，请手动下载：\n     {url}\n     放到目录：{self.CF_DIR}\\cloudflared.exe\n     错误: {e}", "error",
                ))
                self.root.after(0, lambda: on_done(None))
        threading.Thread(target=worker, daemon=True).start()

    def _cf_set_url(self, url):
        """设置公网 URL 显示框"""
        self.cf_url_text.configure(state="normal", fg=COLORS["primary_dark"])
        self.cf_url_text.delete("1.0", "end")
        self.cf_url_text.insert("1.0", url if url else "（未获取到公网域名，请检查日志）")
        if not url:
            self.cf_url_text.configure(fg=COLORS["text_sub"])
        self.cf_url_text.configure(state="disabled")
        self._cf_url_cache = url

    def _cf_start_quick(self):
        """一键启动 Cloudflare Quick Tunnel"""
        # 检查本地后端
        if not self.server_running:
            if not messagebox.askyesno(
                "后端未启动",
                "本地后端服务尚未启动。\n\n隧道要转发的是本地 3000 端口，没有后端就没用。\n\n是否先点「启动后台服务」？",
            ):
                return
            self._start_server()
            # 等后端起来（最长等健康检查通过）
            for _ in range(30):
                time.sleep(0.5)
                if self.server_running:
                    break
            if not self.server_running:
                self.log.append("⚠️  后端未启动成功，隧道仍会启动但无法转发请求。", "warning")

        cf_exe = self._cf_get_exe()
        if not cf_exe:
            # 启动下载，完成后回调自己再启动
            self._cf_download_exe_async(lambda p: self.root.after(0, self._cf_do_start_quick, p))
            return
        self._cf_do_start_quick(cf_exe)

    def _cf_do_start_quick(self, cf_exe):
        if not cf_exe:
            return
        # 停止旧实例
        if getattr(self, "_cf_proc", None) and self._cf_proc.poll() is None:
            self._cf_stop()
            time.sleep(1)

        self.log.append("\n🚀 启动 Cloudflare 快速临时隧道 ...", "info")
        self.log.append(f"   可执行文件: {cf_exe}", "info")
        self.log.append("   转发目标: http://127.0.0.1:3000", "info")

        try:
            env = getattr(self, "_runtime_env", os.environ.copy())
            self._cf_proc = subprocess.Popen(
                [
                    cf_exe, "tunnel",
                    "--url", f"http://127.0.0.1:{self.port}",
                    "--no-autoupdate", "--loglevel", "info",
                ],
                cwd=str(SERVER_DIR),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True, encoding="utf-8", errors="replace", bufsize=1,
            )
        except Exception as e:
            self.log.append(f"❌ 启动隧道失败: {e}", "error")
            return

        self.cf_start_btn.configure(state="disabled")
        self.cf_stop_btn.configure(state="normal")
        self.cf_status_label.configure(
            text="隧道状态：启动中...（10秒内会出现公网域名）",
            fg=COLORS["warning"],
        )

        def reader():
            url_found = False
            try:
                for line in self._cf_proc.stdout:
                    line = line.rstrip()
                    if not line:
                        continue
                    # 自动解析 trycloudflare.com 域名（两种常见日志格式）
                    m = re.search(r"https?://[A-Za-z0-9-]+\.trycloudflare\.com", line)
                    if m and not url_found:
                        u = m.group(0)
                        self.root.after(0, lambda u=u: self._cf_set_url(u))
                        self.root.after(0, lambda u=u: self.log.append(
                            f"\n🌐 公网域名解析成功：{u}", "success",
                        ))
                        self.root.after(0, lambda: self.log.append(
                            "   👉 把此地址粘贴到 App 的服务器地址栏，即可在外网使用！", "info",
                        ))
                        self.root.after(0, lambda: self.cf_status_label.configure(
                            text="隧道状态：运行中 ✅", fg=COLORS["success"],
                        ))
                        url_found = True
                    # 只把关键行写入 GUI 日志（避免刷屏）
                    if any(k in line.lower() for k in [
                        "error", "fail", "registered", "connector",
                        "trycloudflare", "url", "tunnel", "couldn't",
                    ]):
                        self.root.after(0, lambda l=line: self.log.append(
                            "  [CF] " + l, "stdout",
                        ))
                rc = self._cf_proc.wait()
                self.root.after(0, lambda: self.log.append(
                    f"⚠️  Cloudflare 隧道已退出，返回码={rc}", "warning",
                ))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(f"隧道日志读取异常: {e}", "error"))
            finally:
                self.root.after(0, self._cf_mark_stopped)

        threading.Thread(target=reader, daemon=True).start()

    def _cf_mark_stopped(self):
        self._cf_proc = None
        self.cf_start_btn.configure(state="normal")
        self.cf_stop_btn.configure(state="disabled")
        self.cf_status_label.configure(text="隧道状态：未启动", fg=COLORS["text_sub"])

    def _cf_stop(self):
        proc = getattr(self, "_cf_proc", None)
        if not proc or proc.poll() is not None:
            self._cf_mark_stopped()
            return
        self.log.append("⏹ 正在停止 Cloudflare 隧道...", "warning")
        try:
            pid = proc.pid
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True, timeout=5,
            )
            try:
                proc.terminate()
            except Exception:
                pass
            time.sleep(0.8)
            self.log.append("✅ Cloudflare 隧道已停止", "success")
        except Exception as e:
            self.log.append(f"停止异常: {e}", "warning")
        finally:
            self._cf_set_url(None)
            self._cf_mark_stopped()

    def _cf_copy_url(self):
        url = getattr(self, "_cf_url_cache", None)
        if not url:
            messagebox.showinfo(
                "暂无公网地址",
                "还没获取到公网域名。\n请先点击【🚀 一键启动快速公网隧道】按钮。"
            )
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(url)
        messagebox.showinfo(
            "已复制 ✅",
            f"公网地址已复制到剪贴板：\n{url}\n\n粘贴到 App → 设置 → 服务器地址 即可。"
        )

    def _cf_health_check(self):
        url = getattr(self, "_cf_url_cache", None)
        if not url:
            messagebox.showinfo("提示", "请先启动隧道，获取公网地址后再检查。")
            return
        self.log.append(f"\n🌐 正在检查公网健康接口 {url}/health ...", "info")

        def worker():
            try:
                with urllib.request.urlopen(f"{url}/health", timeout=10) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    self.root.after(0, lambda: self.log.append(
                        f"✅ 公网联通正常！\n     status={data.get('status')}, 在线用户={data.get('onlineUsers',0)}",
                        "success",
                    ))
            except Exception as e:
                self.root.after(0, lambda: self.log.append(
                    f"❌ 公网健康检查失败: {e}\n"
                    "   → 常见原因：\n"
                    "     ① 本地后端未启动\n"
                    "     ② Cloudflare 还没完成连接（等 10 秒再试）\n"
                    "     ③ 隧道进程异常退出了",
                    "error",
                ))
        threading.Thread(target=worker, daemon=True).start()

    # ----------------------------------------------------------
    # 关闭窗口时清理
    # ----------------------------------------------------------
    def on_close(self):
        need_confirm = False
        msgs = []
        if self.server_running or (self.server_process and self.server_process.poll() is None):
            need_confirm = True
            msgs.append("后台服务正在运行")
        if getattr(self, "_cf_proc", None) and self._cf_proc.poll() is None:
            need_confirm = True
            msgs.append("Cloudflare 公网隧道正在运行")
        if need_confirm:
            if messagebox.askyesno(
                "确认退出",
                " + ".join(msgs) + "。\n\n退出窗口会一并全部停止。确定退出吗？",
            ):
                self._cf_stop()
                time.sleep(0.5)
                if self.server_running:
                    self._stop_server()
                    time.sleep(0.5)
                self.root.destroy()
        else:
            self.root.destroy()


# ============================================================
# .env 编辑器对话框
# ============================================================
class EnvEditorDialog(tk.Toplevel):
    def __init__(self, master, env, on_saved_callback):
        super().__init__(master)
        self.title("✏️  编辑配置文件")
        self.configure(bg=COLORS["bg"])
        self.geometry("520x520")
        self.resizable(False, False)
        self.transient(master)
        self.grab_set()
        self.on_saved = on_saved_callback
        self.entries = {}

        # 默认字段（中文说明）
        fields = [
            ("PORT", "服务端口号", "3000"),
            ("NODE_ENV", "运行环境 (development / production)", "development"),
            ("JWT_SECRET", "登录令牌加密密钥", "xlover_dev_secret_key_2024"),
            ("JWT_EXPIRES_IN", "登录有效期（如 30d = 30天）", "30d"),
            ("DB_PATH", "数据库文件路径（相对路径）", "./database/xlover.db"),
            ("TZ", "时区", "Asia/Shanghai"),
        ]

        tk.Label(
            self, text="⚙️ Xlover 服务配置编辑器",
            bg=COLORS["bg"], fg=COLORS["primary"],
            font=("Microsoft YaHei UI", 14, "bold"),
        ).pack(pady=(18, 10))

        tk.Label(
            self, text="修改后保存并重启服务生效",
            bg=COLORS["bg"], fg=COLORS["text_sub"],
            font=("Microsoft YaHei UI", 9),
        ).pack(pady=(0, 12))

        card = tk.Frame(self, bg=COLORS["surface"])
        card.pack(fill="both", expand=True, padx=20, pady=8)
        card.configure(highlightbackground="#E8DFD0", highlightthickness=1)

        canvas = tk.Canvas(card, bg=COLORS["surface"], highlightthickness=0)
        scrollbar = ttk.Scrollbar(card, orient="vertical", command=canvas.yview)
        scroll_frame = tk.Frame(canvas, bg=COLORS["surface"])
        scroll_frame.bind(
            "<Configure>", lambda e: canvas.configure(scrollregion=canvas.bbox("all"))
        )
        canvas.create_window((0, 0), window=scroll_frame, anchor="nw")
        canvas.configure(yscrollcommand=scrollbar.set)
        canvas.pack(side="left", fill="both", expand=True, padx=(8, 0), pady=8)
        scrollbar.pack(side="right", fill="y", padx=(0, 8), pady=8)

        self.env_entries = {}
        for i, (key, desc, default) in enumerate(fields):
            val = env.get(key, default)
            row = tk.Frame(scroll_frame, bg=COLORS["surface"])
            row.pack(fill="x", padx=12, pady=6)
            tk.Label(
                row, text=f"{key}",
                bg=COLORS["surface"], fg=COLORS["primary_dark"],
                font=("Consolas", 10, "bold"), anchor="w",
            ).pack(fill="x")
            tk.Label(
                row, text=f"  {desc}",
                bg=COLORS["surface"], fg=COLORS["text_sub"],
                font=("Microsoft YaHei UI", 8), anchor="w",
            ).pack(fill="x")
            ent = tk.Entry(
                row, font=("Consolas", 11),
                relief="solid", bd=1,
                bg="white", fg="#000000",  # 纯黑色输入文字
                insertbackground=COLORS["primary"],
                highlightcolor=COLORS["primary"],
                highlightthickness=1,
            )
            ent.insert(0, val)
            ent.pack(fill="x", ipady=5, pady=(4, 0))
            self.env_entries[key] = ent

        # 额外字段：显示 .env 中未列出的其他字段
        extra_keys = [k for k in env if k not in dict(fields)]
        if extra_keys:
            sep = tk.Frame(scroll_frame, bg=COLORS["accent"], height=1)
            sep.pack(fill="x", padx=12, pady=10)
            tk.Label(
                scroll_frame, text="其他自定义配置",
                bg=COLORS["surface"], fg=COLORS["text_sub"],
                font=("Microsoft YaHei UI", 9, "bold"),
            ).pack(anchor="w", padx=12)
            for key in extra_keys:
                val = env[key]
                row = tk.Frame(scroll_frame, bg=COLORS["surface"])
                row.pack(fill="x", padx=12, pady=5)
                tk.Label(
                    row, text=f"{key}",
                    bg=COLORS["surface"], fg=COLORS["text"],
                    font=("Consolas", 10), anchor="w",
                ).pack(fill="x")
                ent = tk.Entry(
                    row, font=("Consolas", 11),
                    relief="solid", bd=1,
                    bg="white", fg="#000000",
                    insertbackground=COLORS["primary"],
                )
                ent.insert(0, val)
                ent.pack(fill="x", ipady=5, pady=(3, 0))
                self.env_entries[key] = ent

        # 底部按钮
        btn_row = tk.Frame(self, bg=COLORS["bg"])
        btn_row.pack(fill="x", padx=20, pady=16)

        def cancel():
            self.destroy()

        def save():
            new_env = {}
            for k, ent in self.env_entries.items():
                v = ent.get().strip()
                if v:
                    new_env[k] = v
            write_env(new_env)
            self.on_saved(new_env)
            messagebox.showinfo("保存成功", "配置已保存！\n\n请重启服务使新配置生效。")
            self.destroy()

        tk.Button(
            btn_row, text="取消",
            bg=COLORS["surface"], fg=COLORS["text"],
            activebackground=COLORS["accent"], relief="solid", bd=1,
            font=("Microsoft YaHei UI", 10, "bold"),
            padx=24, pady=8, cursor="hand2",
            command=cancel,
        ).pack(side="right", padx=(8, 0))
        tk.Button(
            btn_row, text="💾  保存并关闭",
            bg=COLORS["primary"], fg="white",
            activebackground=COLORS["primary_dark"], activeforeground="white",
            relief="flat", font=("Microsoft YaHei UI", 10, "bold"),
            padx=24, pady=8, cursor="hand2",
            command=save,
        ).pack(side="right")


# ============================================================
# 入口
# ============================================================
def main():
    # Windows 下 DPI 缩放修复
    try:
        from ctypes import windll
        windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass

    root = tk.Tk()
    app = XloverLauncherApp(root)
    root.protocol("WM_DELETE_WINDOW", app.on_close)
    root.mainloop()


if __name__ == "__main__":
    main()
