package com.xlover.app.service

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.xlover.app.data.websocket.WebSocketManager
import com.xlover.app.util.NotificationHelper
import dagger.hilt.android.AndroidEntryPoint

/**
 * 前台保活服务：
 *  - 创建通知渠道 xlover_foreground（IMPORTANCE_LOW）
 *  - 常驻通知："Xlover 伴侣陪伴中"
 *  - 启动 WebSocketManager.connect 保持 WebSocket 实时连接
 *  - onDestroy 时断开 WebSocket、停止前台、stopSelf
 */
@AndroidEntryPoint
class XloverForegroundService : Service() {

    companion object {
        const val FOREGROUND_ID = 1001
        const val ACTION_START = "com.xlover.app.action.START_FOREGROUND"
        const val ACTION_STOP = "com.xlover.app.action.STOP_FOREGROUND"
    }

    override fun onCreate() {
        super.onCreate()
        NotificationHelper.ensureChannels(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == ACTION_STOP) {
            stopXlover()
            return START_NOT_STICKY
        }

        // 1. 构建并启动前台通知
        //    Android 12+（API 31+）在后台启动前台服务会抛 ForegroundServiceStartNotAllowedException，
        //    必须捕获，否则会 Crash。捕获后停止服务，避免残留。
        try {
            startForeground(FOREGROUND_ID, buildForegroundNotification())
        } catch (e: Exception) {
            stopSelf()
            return START_NOT_STICKY
        }

        // 2. 启动 WebSocket 连接（从 TokenManager 自动读取 token）
        try {
            WebSocketManager.connectFromTokenManager(this)
        } catch (_: Exception) { }

        return START_STICKY
    }

    override fun onDestroy() {
        stopXlover()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopXlover() {
        try {
            WebSocketManager.disconnect()
        } catch (_: Exception) { }
        try {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } catch (_: Exception) {
            try { @Suppress("DEPRECATION") stopForeground(true) } catch (_: Exception) { }
        }
        try { stopSelf() } catch (_: Exception) { }
    }

    private fun buildForegroundNotification(): Notification {
        NotificationHelper.ensureChannels(this)
        return NotificationCompat.Builder(this, NotificationHelper.CHANNEL_FOREGROUND)
            .setContentTitle("Xlover 伴侣陪伴中")
            .setContentText("后台保持连接，实时接收消息和提醒")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .setOngoing(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(null)
            .build()
    }
}
