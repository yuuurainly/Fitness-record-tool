// PM2 守护配置文件 - Xlover 后端 + Cloudflare Tunnel
// 文件位置：~/Xlover-Server/ecosystem.config.cjs
// 使用：pm2 start ecosystem.config.cjs

module.exports = {
  apps: [
    {
      name: 'xlover-backend',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        NODE_PATH: __dirname + '/node_modules'
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_file_size: '10M',
      retain_log_files: 7,
      merge_logs: true,
      time: true
    },
    {
      name: 'xlover-tunnel',
      script: 'cloudflared',
      args: 'tunnel --no-autoupdate --config ' + __dirname + '/deploy/cloudflare-tunnel/config.yml run',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      error_file: './logs/tunnel-error.log',
      out_file: './logs/tunnel-out.log',
      log_file_size: '10M',
      retain_log_files: 7,
      merge_logs: true,
      time: true,
      // cloudflared 可能需要用 env 里的 token 方式启动，见文档04
      env: {
        // 正式隧道建好后，在 Cloudflare 控制台拿到 Token 填这里：
        // TUNNEL_TOKEN: 'eyJhIjoi...'
      }
    }
  ]
};
