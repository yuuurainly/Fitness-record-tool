/**
 * WebSocket 服务器
 * 处理实时消息推送
 */
const { WebSocketServer } = require('ws');
const { verifyToken } = require('../middleware/auth');

// 存储在线用户的 WebSocket 连接
// userId -> Set<WebSocket>
const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    // 从 URL query 参数获取 token
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, '未提供认证令牌');
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      ws.close(4002, '令牌无效');
      return;
    }

    const userId = decoded.userId;
    ws.userId = userId;

    // 添加到客户端集合
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId).add(ws);

    console.log(`用户 ${userId} 已连接 WebSocket，当前在线: ${clients.get(userId).size} 个连接`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, message);
      } catch (err) {
        console.error('WebSocket 消息解析错误:', err.message);
      }
    });

    ws.on('close', () => {
      const userClients = clients.get(userId);
      if (userClients) {
        userClients.delete(ws);
        if (userClients.size === 0) {
          clients.delete(userId);
        }
      }
      console.log(`用户 ${userId} 断开 WebSocket`);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket 错误 (用户 ${userId}):`, err.message);
    });

    // 发送连接成功消息
    ws.send(JSON.stringify({ type: 'connected', message: 'WebSocket 连接成功' }));
  });

  console.log('WebSocket 服务器已启动，路径: /ws');
  return wss;
}

/**
 * 处理客户端发来的消息
 */
function handleClientMessage(ws, message) {
  // 目前客户端主要是接收推送，不需要处理太多上行消息
  // 可以处理心跳、已读回执等
  switch (message.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    case 'read_receipt':
      // 标记消息已读，可以在这里处理
      break;
    default:
      console.log('收到未知类型消息:', message.type);
  }
}

/**
 * 向指定用户推送消息
 */
function sendToUser(userId, message) {
  const userClients = clients.get(userId);
  if (!userClients || userClients.size === 0) {
    return false;
  }

  const data = JSON.stringify(message);
  let sentCount = 0;
  userClients.forEach(ws => {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
      sentCount++;
    }
  });
  return sentCount > 0;
}

/**
 * 检查用户是否在线
 */
function isUserOnline(userId) {
  const userClients = clients.get(userId);
  return userClients && userClients.size > 0;
}

/**
 * 获取在线用户数量
 */
function getOnlineCount() {
  return clients.size;
}

module.exports = {
  setupWebSocket,
  sendToUser,
  isUserOnline,
  getOnlineCount
};
