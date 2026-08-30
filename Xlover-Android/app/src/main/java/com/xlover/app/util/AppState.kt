package com.xlover.app.util

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * 应用级全局状态（跨页面事件总线）：
 *  - isGuideComplete：注册引导是否已完成（控制 NavGraph 起始路由）
 *
 *  事件模型：采用"单调计数器 + 已消费计数器"。
 *  【发射端】调用 emitOpenXXX() 将 requestXXX 自增。
 *  【UI 端】用 LaunchedEffect(AppState.requestXXX) 触发，然后调用 takeOpenXXXEvent() 原子地判断"是否有新事件"并把消费计数器对齐。
 *  因为两个计数器都存放在全局单例里，所以 remember 跨 Tab 切换、跨页面重组不会重置，能确保同一个事件只会被消费一次。
 */
object AppState {
    var isGuideComplete by mutableStateOf(false)

    // ---- 服务器地址修改对话框事件 ----
    var requestOpenServerUrlDialog by mutableIntStateOf(0)
        private set
    private var consumedOpenServerUrlDialog by mutableIntStateOf(0)

    fun emitOpenServerUrlDialog() {
        requestOpenServerUrlDialog++
    }

    /**
     * UI 端进入 LaunchedEffect 时调用：有新事件（request > consumed）则返回 true 并把消费指针对齐。
     * 保证同一个事件号无论 LaunchedEffect 因重组/切Tab重入多少次，只返回一次 true。
     */
    fun takeOpenServerUrlDialogEvent(): Boolean {
        return if (requestOpenServerUrlDialog > consumedOpenServerUrlDialog) {
            consumedOpenServerUrlDialog = requestOpenServerUrlDialog
            true
        } else false
    }

    // ---- 活动水平选择对话框事件 ----
    var requestOpenActivityLevel by mutableIntStateOf(0)
        private set
    private var consumedOpenActivityLevel by mutableIntStateOf(0)

    fun emitOpenActivityLevel() {
        requestOpenActivityLevel++
    }

    fun takeOpenActivityLevelEvent(): Boolean {
        return if (requestOpenActivityLevel > consumedOpenActivityLevel) {
            consumedOpenActivityLevel = requestOpenActivityLevel
            true
        } else false
    }
}
