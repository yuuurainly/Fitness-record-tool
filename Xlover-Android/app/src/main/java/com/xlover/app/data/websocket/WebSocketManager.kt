package com.xlover.app.data.websocket

import android.content.Context
import android.widget.Toast
import com.xlover.app.util.Constants
import com.xlover.app.util.NotificationHelper
import com.xlover.app.util.ServerUrlManager
import com.xlover.app.util.TokenManager
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import okhttp3.*
import okio.ByteString
import org.json.JSONObject

/**
 * WebSocket 消息事件（UI 层订阅）
 */
sealed class WsEvent {
    data class Connected(val serverUrl: String) : WsEvent()
    object Disconnected : WsEvent()
    data class Error(val t: Throwable) : WsEvent()

    data class Reminder(val id: Int, val title: String, val icon: String?) : WsEvent()

    data class Message(val fromUserId: Int, val fromNickname: String?, val content: String?) : WsEvent()
    data class ToastText(val text: String) : WsEvent()
    data class RawJson(val type: String, val json: JSONObject) : WsEvent()
}

/**
 * WebSocket 单例管理器
 * - connect(token, serverUrl)：连接到 ws://host/ws?token=xxx
 * - 心跳每30秒 ping
 * - 断线指数退避重连（2s→4s→8s→…→最大32s）
 * - 通过 events: SharedFlow<WsEvent> 向 UI / 服务分发事件
 */
object WebSocketManager {

    private const val HEARTBEAT_INTERVAL_MS = 30_000L
    private const val MAX_RECONNECT_DELAY_MS = 32_000L
    private const val INIT_RECONNECT_DELAY_MS = 2_000L

    private val okHttpClient by lazy {
        OkHttpClient.Builder()
            .retryOnConnectionFailure(false)
            .pingInterval(30, java.util.concurrent.TimeUnit.SECONDS)
            .build()
    }

    private var webSocket: WebSocket? = null
    private var scope: CoroutineScope? = null
    private var heartbeatJob: Job? = null
    private var reconnectJob: Job? = null

    private var currentToken: String = ""
    private var currentServerUrl: String = ""
    private var currentWsUrl: String = ""
    private var reconnectDelay = INIT_RECONNECT_DELAY_MS
    private var isManualClose = false

    private val _events = MutableSharedFlow<WsEvent>(
        extraBufferCapacity = 16,
        onBufferOverflow = kotlinx.coroutines.channels.BufferOverflow.DROP_OLDEST
    )
    val events: SharedFlow<WsEvent> = _events.asSharedFlow()

    /**
     * 连接 WebSocket
     */
    @Synchronized
    fun connect(
        token: String,
        serverUrl: String = Constants.DEFAULT_BASE_URL,
        context: Context? = null
    ) {
        if (token.isBlank()) return
        // 如果参数相同且已连接/正在连接，则跳过
        if (currentToken == token && currentServerUrl == serverUrl && webSocket != null) return
        disconnect()

        currentToken = token
        currentServerUrl = serverUrl
        isManualClose = false
        reconnectDelay = INIT_RECONNECT_DELAY_MS

        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
        currentWsUrl = buildWsUrl(serverUrl, token)

        doConnect(context)
    }

    @Synchronized
    private fun doConnect(context: Context?) {
        val request = try {
            Request.Builder().url(currentWsUrl).build()
        } catch (e: Exception) {
            scope?.launch { _events.emit(WsEvent.Error(e)) }
            scheduleReconnect(context)
            return
        }

        val listener = object : WebSocketListener() {
            override fun onOpen(ws: WebSocket, response: Response) {
                webSocket = ws
                reconnectDelay = INIT_RECONNECT_DELAY_MS
                scope?.launch { _events.emit(WsEvent.Connected(currentServerUrl)) }
                startHeartbeat()
            }

            override fun onMessage(ws: WebSocket, text: String) {
                handleIncoming(text, context)
            }

            override fun onMessage(ws: WebSocket, bytes: ByteString) {
                handleIncoming(bytes.utf8(), context)
            }

            override fun onClosing(ws: WebSocket, code: Int, reason: String) {
                ws.close(1000, null)
            }

            override fun onClosed(ws: WebSocket, code: Int, reason: String) {
                webSocket = null
                heartbeatJob?.cancel()
                scope?.launch { _events.emit(WsEvent.Disconnected) }
                if (!isManualClose) scheduleReconnect(context)
            }

            override fun onFailure(ws: WebSocket, t: Throwable, response: Response?) {
                webSocket = null
                heartbeatJob?.cancel()
                scope?.launch { _events.emit(WsEvent.Error(t)) }
                if (!isManualClose) scheduleReconnect(context)
            }
        }

        try {
            okHttpClient.newWebSocket(request, listener)
        } catch (e: Exception) {
            scope?.launch { _events.emit(WsEvent.Error(e)) }
            scheduleReconnect(context)
        }
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope?.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
                try {
                    val ws = webSocket ?: break
                    ws.send("{\"type\":\"ping\"}")
                } catch (_: Exception) { }
            }
        }
    }

    private fun scheduleReconnect(context: Context?) {
        if (isManualClose) return
        reconnectJob?.cancel()
        val delayMs = reconnectDelay.coerceAtMost(MAX_RECONNECT_DELAY_MS)
        reconnectDelay = (reconnectDelay * 2).coerceAtMost(MAX_RECONNECT_DELAY_MS)
        reconnectJob = scope?.launch {
            delay(delayMs)
            if (!isManualClose) doConnect(context)
        }
    }

    /**
     * 主动断开
     */
    @Synchronized
    fun disconnect() {
        isManualClose = true
        reconnectJob?.cancel()
        reconnectJob = null
        heartbeatJob?.cancel()
        heartbeatJob = null
        try {
            webSocket?.close(1000, "client disconnect")
        } catch (_: Exception) { }
        webSocket = null
        // 必须在 scope 取消之前发出事件，否则 scope?.launch 会因 scope 为 null 而失效。
        // tryEmit 是同步调用，不依赖协程作用域。
        _events.tryEmit(WsEvent.Disconnected)
        scope?.cancel()
        scope = null
    }

    /**
     * 发送 JSON 文本
     */
    fun send(json: String): Boolean {
        return try {
            webSocket?.send(json) == true
        } catch (_: Exception) { false }
    }

    /**
     * 处理入站消息：按 type 分发
     *  - reminder  → 本地通知 + WsEvent.Reminder
     *  - message   → 本地通知 + WsEvent.Message
     *  - diet_bonus / achievement_unlocked → Toast + 通知
     *  - point_request → 通知
     */
    private fun handleIncoming(text: String, context: Context?) {
        val ctx = context ?: return
        val json = try { JSONObject(text) } catch (_: Exception) { return }
        val type = json.optString("type", "")

        scope?.launch { _events.emit(WsEvent.RawJson(type, json)) }

        when (type) {
            "reminder" -> {
                val id = json.optInt("reminderId", System.currentTimeMillis().toInt())
                val title = json.optString("title", "Xlover 提醒")
                val icon = json.optString("icon").ifBlank { null }
                NotificationHelper.showNotification(
                    ctx, NotificationHelper.CHANNEL_REMINDERS,
                    id.coerceIn(2000, 2999),
                    title,
                    "时间到啦～ ${icon?.let { "$it" } ?: "⏰"}",
                    null
                )
                _events.tryEmit(WsEvent.Reminder(id, title, icon))
            }

            "message" -> {
                val fromId = json.optInt("from_user_id", 0)
                val fromNick = json.optString("sender_nickname", "伴侣")
                val content = json.optString("content", "收到新消息")

                NotificationHelper.showNotification(
                    ctx, NotificationHelper.CHANNEL_MESSAGES,
                    3100,
                    "$fromNick 发来消息",
                    content,
                    null
                )
                _events.tryEmit(WsEvent.Message(fromId, fromNick, content))
            }

            "diet_bonus" -> {
                val msg = json.optString("message", "今日饮食达标，恭喜！")
                val points = json.optInt("points", 5)
                NotificationHelper.showNotification(
                    ctx, NotificationHelper.CHANNEL_MESSAGES,
                    3200,
                    "饮食达标奖励",
                    "$msg (+${points}积分)"
                )
                _events.tryEmit(WsEvent.ToastText("$msg (+${points}积分)"))
                scope?.launch(Dispatchers.Main) {
                    Toast.makeText(ctx, "$msg (+${points}积分)", Toast.LENGTH_LONG).show()
                }
            }

            "achievement_unlocked" -> {
                val title = json.optString("title", "新成就解锁!")
                val icon = json.optString("icon", "🏆")
                NotificationHelper.showNotification(
                    ctx, NotificationHelper.CHANNEL_MESSAGES,
                    3300,
                    "成就解锁",
                    "$icon $title"
                )
                _events.tryEmit(WsEvent.ToastText("成就解锁：$icon $title"))
                scope?.launch(Dispatchers.Main) {
                    Toast.makeText(ctx, "$icon 解锁成就：$title", Toast.LENGTH_LONG).show()
                }
            }

            "point_request" -> {
                val action = json.optString("action", "new")
                val prTitle = json.optString("title", "新的积分申请")
                val points = json.optInt("points", 0)
                val (nTitle, nText) = when (action) {
                    "approved" -> "积分申请通过" to "申请《$prTitle》通过，+${points}积分"
                    "rejected" -> "积分申请驳回" to "申请《$prTitle》被驳回"
                    else -> "积分申请待审核" to "《$prTitle》申请 ${points} 积分，等待审核"
                }
                NotificationHelper.showNotification(
                    ctx, NotificationHelper.CHANNEL_MESSAGES,
                    3400 + (json.optInt("requestId", 0) % 100),
                    nTitle, nText
                )
            }
        }
    }

    /**
     * 根据 base URL 和 token 生成 ws:// URL
     *  e.g. http://192.168.1.56:3000/  -> ws://192.168.1.56:3000/ws?token=xxx
     */
    private fun buildWsUrl(baseUrl: String, token: String): String {
        val bare = baseUrl.removeSuffix("/")
        val wsBase = bare.replace("https://", "wss://").replace("http://", "ws://")
        val rawToken = token.removePrefix("Bearer ").trim()
        return "$wsBase/ws?token=$rawToken"
    }

    /**
     * 便捷方法：从 TokenManager 自动读取 token 并连接
     */
    fun connectFromTokenManager(context: Context? = null) {
        if (!TokenManager.isLoggedIn) return
        connect(TokenManager.token, ServerUrlManager.getUrl(), context)
    }
}
