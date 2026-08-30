[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$serverPath = "D:\AI\豆包\Xlover3.0\Xlover-Server"
Set-Location $serverPath

# 优先使用 Node v20（C:\Users\Negen\nodejs）避免 better-sqlite3 ABI 不兼容（系统 Node v24 为 NODE_MODULE_VERSION 137，
# better-sqlite3 预编译包目前对应 115 = Node v20/v22）
$node20Dir = "C:\Users\Negen\nodejs"
if (Test-Path (Join-Path $node20Dir "node.exe")) {
    $env:PATH = "$node20Dir;$env:PATH"
    $ver = & node -v 2>&1
    Write-Host "[启动器] 已优先使用 Node $ver（来自 $node20Dir）" -ForegroundColor DarkYellow
}

function Show-Menu {
    Clear-Host
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "           Xlover 后台服务启动器" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  [1] 启动后台服务（开发模式，自动重启）"
    Write-Host "  [2] 启动后台服务（普通模式）"
    Write-Host "  [3] 初始化数据库（首次使用必需）"
    Write-Host "  [4] 导入食物库数据"
    Write-Host "  [5] 安装依赖（首次使用必需）"
    Write-Host "  [6] 查看本机 IP（用于 App 连接）"
    Write-Host "  [7] 退出"
    Write-Host ""
}

while ($true) {
    Show-Menu
    $choice = Read-Host "请输入选项数字并回车"

    switch ($choice) {
        "1" {
            Write-Host ""
            Write-Host "[启动后台 - 开发模式] 修改代码会自动重启" -ForegroundColor Green
            Write-Host ""
            npm run dev
            Write-Host ""
            Write-Host "后台已停止运行。" -ForegroundColor Yellow
            Read-Host "按回车键继续"
        }
        "2" {
            Write-Host ""
            Write-Host "[启动后台 - 普通模式]" -ForegroundColor Green
            Write-Host ""
            npm start
            Write-Host ""
            Write-Host "后台已停止运行。" -ForegroundColor Yellow
            Read-Host "按回车键继续"
        }
        "3" {
            Write-Host ""
            Write-Host "[初始化数据库] 将创建所需的数据表..." -ForegroundColor Green
            Write-Host ""
            npm run init-db
            Write-Host ""
            Read-Host "按回车键继续"
        }
        "4" {
            Write-Host ""
            Write-Host "[导入食物库数据]..." -ForegroundColor Green
            Write-Host ""
            npm run seed-foods
            Write-Host ""
            Read-Host "按回车键继续"
        }
        "5" {
            Write-Host ""
            Write-Host "[安装依赖] 首次使用需要安装，可能需要几分钟..." -ForegroundColor Green
            Write-Host ""
            npm install
            Write-Host ""
            Read-Host "按回车键继续"
        }
        "6" {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Cyan
            Write-Host "           本机网络 IP 地址" -ForegroundColor Cyan
            Write-Host "============================================" -ForegroundColor Cyan
            Write-Host ""
            ipconfig | Select-String "IPv4"
            Write-Host ""
            Write-Host "--------------------------------------------"
            Write-Host " 提示："
            Write-Host "   - 用模拟器测试：App内服务器地址填 http://10.0.2.2:3000"
            Write-Host "   - 用真机测试 ：App内服务器地址填 http://上面的IP:3000"
            Write-Host "   - 手机和电脑必须连同一个 WiFi"
            Write-Host "--------------------------------------------"
            Write-Host ""
            Read-Host "按回车键继续"
        }
        "7" {
            exit
        }
        default {
            Write-Host "输入无效，请重新选择。" -ForegroundColor Red
            Start-Sleep -Seconds 2
        }
    }
}