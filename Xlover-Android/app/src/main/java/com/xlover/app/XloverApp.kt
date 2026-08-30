package com.xlover.app

import android.app.Application
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.xlover.app.util.AppState
import com.xlover.app.util.DataStoreHolder
import com.xlover.app.util.FailureTracker
import com.xlover.app.util.ServerUrlManager
import com.xlover.app.work.ActivityLevelReminderWorker
import dagger.hilt.android.HiltAndroidApp
import java.util.Calendar
import java.util.concurrent.TimeUnit

@HiltAndroidApp
class XloverApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // 1. 异步预加载服务器地址缓存，避免后续在主线程阻塞读取导致 ANR
        ServerUrlManager.init(DataStoreHolder.get(this))

        // 2. 连接失败阈值回调：触发 UI 层弹出"修改服务器地址"对话框
        FailureTracker.init {
            // 不在当前线程直弹 UI：AppState 是 Compose mutableState，写操作需在主线程
            appHandler?.post { AppState.emitOpenServerUrlDialog() }
        }
        appHandler = android.os.Handler(mainLooper)

        // 3. 注册周一 9 点的活动水平提醒 Worker（周期 = 7 天）
        scheduleActivityLevelReminder()
    }

    /**
     * 调度每周一 9:00 的活动水平提醒。
     *  - 使用 Periodic + flexInterval 近似；Periodic 的最小间隔 = 15 分钟，flex 允许其在周期末尾附近漂移。
     *  - 这里先计算"距离下一个周一 9:00 的毫秒数"作为初始延迟，后续周期以 7 天为间隔。
     */
    private fun scheduleActivityLevelReminder() {
        val firstDelayMs = calcMillisUntilNextMonday9am()
        val request = PeriodicWorkRequestBuilder<ActivityLevelReminderWorker>(
            7, TimeUnit.DAYS,
            1, TimeUnit.HOURS
        )
            .setInitialDelay(firstDelayMs, TimeUnit.MILLISECONDS)
            .addTag(ActivityLevelReminderWorker.WORK_NAME)
            .build()
        try {
            WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                ActivityLevelReminderWorker.WORK_NAME,
                ExistingPeriodicWorkPolicy.UPDATE,
                request
            )
        } catch (_: Exception) { }
    }

    /** 计算"下一个周一 9:00:00"距今的毫秒数（本地时区）。若今天是周一且已过 9 点，则顺延 7 天。 */
    private fun calcMillisUntilNextMonday9am(): Long {
        val now = Calendar.getInstance()
        val target = Calendar.getInstance().apply {
            set(Calendar.DAY_OF_WEEK, Calendar.MONDAY)
            set(Calendar.HOUR_OF_DAY, 9)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        // 如果 target <= now（今天就是周一但已过 9 点，或者当前已在本周二之后导致 target 落在过去），则 +7 天
        if (!target.after(now)) {
            target.add(Calendar.DAY_OF_MONTH, 7)
        }
        return (target.timeInMillis - now.timeInMillis).coerceAtLeast(TimeUnit.MINUTES.toMillis(5))
    }

    companion object {
        /** 主线程 Handler，用于把跨层回调（例如 FailureTracker）切回主线程写 Compose State */
        @Volatile
        var appHandler: android.os.Handler? = null
    }
}
