package com.xlover.app

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.lifecycle.lifecycleScope
import com.xlover.app.service.XloverForegroundService
import com.xlover.app.ui.navigation.XloverNavGraph
import com.xlover.app.ui.theme.XloverTheme
import com.xlover.app.util.AppState
import com.xlover.app.util.Constants
import com.xlover.app.util.NotificationHelper
import com.xlover.app.util.TokenManager
import com.xlover.app.work.ActivityLevelReminderWorker
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var dataStore: DataStore<Preferences>

    /** POST_NOTIFICATIONS 权限请求器 */
    private val requestNotificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 用户选择之后无需额外处理 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // 初始状态栏：奶油白 + 深色图标，避免启动黑屏
        window.statusBarColor = Color.parseColor("#FFFAF5")
        window.navigationBarColor = Color.parseColor("#FFFAF5")
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = true
            isAppearanceLightNavigationBars = true
        }

        // 预先创建通知渠道
        NotificationHelper.ensureChannels(this)

        // 检查/请求通知权限（targetSdk >= 33 必须运行时授权）
        ensureNotificationPermission()

        // 处理启动 Intent（例如通知点击带 EXTRA_OPEN_ACTIVITY_LEVEL）
        handleIntent(intent)

        // 同步从 DataStore 恢复 token（确保 NavGraph 启动时 TokenManager 已有正确的登录状态）
        val prefs = kotlinx.coroutines.runBlocking { dataStore.data.first() }
        val token = prefs[stringPreferencesKey(Constants.PREFS_TOKEN)]
        if (!token.isNullOrBlank()) {
            TokenManager.token = token
            prefs[stringPreferencesKey(Constants.PREFS_USER_ID)]
                ?.toIntOrNull()?.let { TokenManager.userId = it }
            prefs[stringPreferencesKey(Constants.PREFS_NICKNAME)]
                ?.let { TokenManager.nickname = it }
            prefs[stringPreferencesKey(Constants.PREFS_USERNAME)]
                ?.let { TokenManager.username = it }
            prefs[stringPreferencesKey(Constants.PREFS_ROLE)]
                ?.let { TokenManager.role = it }
            prefs[stringPreferencesKey(Constants.PREFS_PARTNER_ID)]
                ?.toIntOrNull()?.let { TokenManager.partnerId = it }
            prefs[stringPreferencesKey(Constants.PREFS_BIND_CODE)]
                ?.let { TokenManager.bindCode = it }
            AppState.isGuideComplete = prefs[booleanPreferencesKey(Constants.PREFS_IS_GUIDE_COMPLETE)] == true

            // 启动前台保活服务
            startForegroundServiceCompat()
        }

        setContent {
            XloverTheme {
                XloverNavGraph()
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /**
     * 处理启动/通知点击 Intent：
     *  - EXTRA_OPEN_ACTIVITY_LEVEL = true → 通过 AppState 发射事件，首页收到后立即弹活动水平选择对话框
     */
    private fun handleIntent(intent: Intent?) {
        intent ?: return
        if (intent.getBooleanExtra(ActivityLevelReminderWorker.EXTRA_OPEN_ACTIVITY_LEVEL, false)) {
            AppState.emitOpenActivityLevel()
            // 消费掉 extra，避免旋转屏幕等场景重复触发
            intent.removeExtra(ActivityLevelReminderWorker.EXTRA_OPEN_ACTIVITY_LEVEL)
        }
    }

    /**
     * 登录成功后外部调用的入口：启动前台服务（例如在 NavGraph 的登录回调中调用）
     */
    fun onLoginSucceeded() {
        ensureNotificationPermission()
        startForegroundServiceCompat()
    }

    /**
     * 安全地启动前台保活服务
     */
    private fun startForegroundServiceCompat() {
        val intent = Intent(this, XloverForegroundService::class.java).apply {
            action = XloverForegroundService.ACTION_START
        }
        try {
            ContextCompat.startForegroundService(this, intent)
        } catch (_: Exception) {
            // Android 14 前后台限制等场景忽略即可
        }
    }

    /**
     * targetSdk >= 33：POST_NOTIFICATIONS 运行时权限检查
     */
    private fun ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            try {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            } catch (_: Exception) { }
        }
    }
}
