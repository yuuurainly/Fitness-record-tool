#!/bin/bash
# ============================================================
# Xlover 数据库自动备份脚本
# 用法：手动运行 或 加入 crontab 每天自动备份
# crontab -e → 添加：0 3 * * * /home/xlover/Xlover-Server/backup-db.sh
# ============================================================

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_FILE="$PROJECT_DIR/database/xlover.db"
BACKUP_DIR="$PROJECT_DIR/database/backups"
RETAIN_DAYS=30

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/xlover.db.$TIMESTAMP"

echo "[$(date)] 开始备份..."

if [ ! -f "$DB_FILE" ]; then
    echo "❌ 数据库文件不存在: $DB_FILE"
    exit 1
fi

# SQLite 安全备份（使用 .backup 命令，避免复制正在写入的 WAL 文件）
sqlite3 "$DB_FILE" ".backup '$BACKUP_FILE'" 2>/dev/null || cp "$DB_FILE" "$BACKUP_FILE"

if [ -f "$BACKUP_FILE" ]; then
    # 压缩
    gzip -f "$BACKUP_FILE"
    SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)
    echo "✅ 备份成功: $BACKUP_FILE.gz ($SIZE)"
else
    echo "❌ 备份失败"
    exit 1
fi

# 清理超过 RETAIN_DAYS 天的旧备份
find "$BACKUP_DIR" -name "xlover.db.*.gz" -mtime +$RETAIN_DAYS -delete 2>/dev/null
echo "✅ 已清理 ${RETAIN_DAYS} 天前的旧备份"
echo "[$(date)] 备份完成"
