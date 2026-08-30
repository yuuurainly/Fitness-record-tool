package com.xlover.app.work

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.xlover.app.MainActivity
import com.xlover.app.util.NotificationHelper
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * 活动水平提醒 Worker：
 *  由 WorkManager 周期性（每周）触发。
 *  运行时会判断今天是否为周一，若是则弹出本地通知："新的一周，别忘了选择本周活动水平~"。
 *  用户点击通知后直接打开 MainActivity，并携带 EXTRA 要求立即弹出活动水平选择对话框。
 */
@HiltWorker
class ActivityLevelReminderWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val EXTRA_OPEN_ACTIVITY_LEVEL = "com.xlover.app.OPEN_ACTIVITY_LEVEL"
        const val NOTIF_ID_ACTIVITY_LEVEL = 10086
        const val WORK_NAME = "activity_level_reminder"
    }

    override suspend fun doWork(): Result {
        // 计算"今天是周几"（1=周日，2=周一，...，7=周六；Java 约定）
        val cal = java.util.Calendar.getInstance()
        val dayOfWeek = cal.get(java.util.Calendar.DAY_OF_WEEK)
        val isMonday = dayOfWeek == java.util.Calendar.MONDAY

        // 不论是否周一，WorkManager 都会按时执行（Periodic 周期就是一周一次），
        // 但为避免周期漂移导致的非周一提醒，这里额外判断一下。
        if (!isMonday) return Result.success()

        val ctx = applicationContext
        val pi = createActivityLevelPendingIntent(ctx)
        NotificationHelper.showNotification(
            context = ctx,
            channelId = NotificationHelper.CHANNEL_REMINDERS,
            notificationId = NOTIF_ID_ACTIVITY_LEVEL,
            title = "新的一周，温柔开始",
            content = "本周打算怎样活动？点击选择本周活动水平，科学计算每日推荐热量~",
            pendingIntent = pi
        )
        return Result.success()
    }

    private fun createActivityLevelPendingIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_MAIN
            addCategory(Intent.CATEGORY_LAUNCHER)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_OPEN_ACTIVITY_LEVEL, true)
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        } else {
            PendingIntent.FLAG_UPDATE_CURRENT
        }
        return PendingIntent.getActivity(context, NOTIF_ID_ACTIVITY_LEVEL, intent, flags)
    }
}
