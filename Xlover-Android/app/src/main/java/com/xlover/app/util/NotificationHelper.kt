package com.xlover.app.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.xlover.app.MainActivity

/**
 * 本地通知工具：
 *  3 个 channel：
 *  - xlover_foreground  IMPORTANCE_LOW   前台保活专用
 *  - xlover_reminders   IMPORTANCE_HIGH  带声音振动，提醒用
 *  - xlover_messages    IMPORTANCE_HIGH  消息/表扬用
 */
object NotificationHelper {

    const val CHANNEL_FOREGROUND = "xlover_foreground"
    const val CHANNEL_REMINDERS = "xlover_reminders"
    const val CHANNEL_MESSAGES = "xlover_messages"

    private var channelsEnsured = false

    /**
     * 确保所有 NotificationChannel 已创建（Android O+ 必需）
     * 重复调用安全，已存在的 channel 不会被重新创建
     */
    fun ensureChannels(context: Context) {
        if (channelsEnsured) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            channelsEnsured = true
            return
        }
        val nm = context.getSystemService(NotificationManager::class.java) ?: return

        // 1. 前台保活
        val foreground = NotificationChannel(
            CHANNEL_FOREGROUND,
            "Xlover 后台保活",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "前台服务持续运行，保持连接和提醒能力"
            setShowBadge(false)
            enableVibration(false)
            enableLights(false)
        }
        nm.createNotificationChannel(foreground)

        // 2. 提醒（带声音振动）
        val reminders = NotificationChannel(
            CHANNEL_REMINDERS,
            "Xlover 提醒",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "喝水、运动、睡眠等定时提醒"
            enableVibration(true)
            enableLights(true)
        }
        nm.createNotificationChannel(reminders)

        // 3. 消息 / 表扬
        val messages = NotificationChannel(
            CHANNEL_MESSAGES,
            "Xlover 消息与表扬",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "伴侣消息、表扬通知、积分通知"
            enableVibration(true)
            enableLights(true)
        }
        nm.createNotificationChannel(messages)

        channelsEnsured = true
    }

    /**
     * 显示一条本地通知
     * @param context Context
     * @param channelId  上述 CHANNEL_* 之一
     * @param notificationId 通知 ID（同 ID 会覆盖更新）
     * @param title 标题
     * @param content 正文
     * @param pendingIntent 点击后跳转，默认打开 MainActivity
     */
    fun showNotification(
        context: Context,
        channelId: String,
        notificationId: Int,
        title: String,
        content: String,
        pendingIntent: PendingIntent? = null
    ) {
        ensureChannels(context)
        val pi = pendingIntent ?: createDefaultPendingIntent(context)

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(content)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .setPriority(
                when (channelId) {
                    CHANNEL_FOREGROUND -> NotificationCompat.PRIORITY_LOW
                    else -> NotificationCompat.PRIORITY_HIGH
                }
            )
            .apply {
                // 尝试设置主题色（R资源引用不到时忽略）
                try {
                    color = ContextCompat.getColor(context, android.R.color.holo_blue_dark)
                } catch (_: Exception) { }
            }
            .build()

        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        } catch (_: SecurityException) {
            // 未授权 POST_NOTIFICATIONS 时静默失败
        }
    }

    /**
     * 取消某条通知
     */
    fun cancelNotification(context: Context, notificationId: Int) {
        try {
            NotificationManagerCompat.from(context).cancel(notificationId)
        } catch (_: Exception) { }
    }

    /**
     * 默认 PendingIntent：打开 MainActivity
     */
    private fun createDefaultPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getActivity(context, 0, intent, flags)
    }
}
