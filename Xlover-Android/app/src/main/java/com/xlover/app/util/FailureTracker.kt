package com.xlover.app.util

import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLHandshakeException

/**
 * 后端连接失败计数器：
 *  - 仅当异常类型明确为"网络层连接失败"（ConnectException / SocketTimeoutException /
 *    UnknownHostException / SSLHandshakeException / IOException 包装）时计入。
 *  - 业务层错误（HTTP 4xx、用户名密码错误等）不计入、也不清零。
 *  - 连续失败达到 [FAILURE_THRESHOLD] 次时，会触发 [onReachThreshold] 回调（仅触发一次，直到下次成功后重置）。
 *  - 任何一次网络请求成功（onSuccess）都会清零计数并复位触发状态。
 *
 *  使用方式：
 *   1. 在 Application 启动时调用 FailureTracker.init { ... } 设置回调。
 *   2. ViewModel/Repository 发起请求时：
 *      - 成功：FailureTracker.onSuccess()
 *      - 失败：FailureTracker.onFailure(throwable)
 */
object FailureTracker {

    const val FAILURE_THRESHOLD = 3

    private val consecutiveFailures = AtomicInteger(0)
    @Volatile
    private var thresholdFired = false
    @Volatile
    private var onReachThreshold: (() -> Unit)? = null

    /**
     * 初始化回调：当连续失败达到阈值时触发。UI 层（App/Activity）设置后可弹出服务器地址修改对话框。
     */
    fun init(callback: () -> Unit) {
        onReachThreshold = callback
    }

    /**
     * 后端请求"成功"时调用（业务层 HTTP 200 且 success=true 即算）。
     */
    fun onSuccess() {
        consecutiveFailures.set(0)
        thresholdFired = false
    }

    /**
     * 后端请求抛出异常时调用。只有"网络连接类异常"才会累计，否则直接忽略。
     */
    fun onFailure(t: Throwable?) {
        if (!isConnectivityError(t)) return
        val count = consecutiveFailures.incrementAndGet()
        if (count >= FAILURE_THRESHOLD && !thresholdFired) {
            thresholdFired = true
            val cb = onReachThreshold
            if (cb != null) {
                try {
                    cb()
                } catch (_: Exception) { }
            }
        }
    }

    /** 当前连续失败次数（用于调试或 UI 显示） */
    fun currentFailures(): Int = consecutiveFailures.get()

    /** 手动重置（用户修改服务器地址后调用，避免立即再次触发） */
    fun reset() {
        consecutiveFailures.set(0)
        thresholdFired = false
    }

    /**
     * 判断异常是否为"网络连接失败类"。
     *  递归解包 cause，查找 IOException（不含 ProtocolException 等业务子类）、ConnectException、
     *  SocketTimeoutException、UnknownHostException、SSLHandshakeException。
     */
    private fun isConnectivityError(t: Throwable?): Boolean {
        var cur: Throwable? = t
        val seen = HashSet<Throwable>()
        var depth = 0
        while (cur != null && depth < 10 && seen.add(cur)) {
            when (cur) {
                is ConnectException,
                is SocketTimeoutException,
                is UnknownHostException,
                is SSLHandshakeException -> return true
                is IOException -> {
                    // IOException 的纯网络子类算（Retrofit/OkHttp 连接失败会抛 IOException）
                    val name = cur.javaClass.simpleName
                    if (name !in NON_CONNECT_IO_EXCEPTIONS) return true
                }
            }
            cur = cur.cause
            depth++
        }
        return false
    }

    /** 这些 IOException 子类通常是业务/协议层，不算连接失败 */
    private val NON_CONNECT_IO_EXCEPTIONS = setOf(
        "ProtocolException",
        "MalformedJsonException",
        "EOFException",
        "UTFDataFormatException",
        "CharConversionException",
        "ZipException",
        "FileNotFoundException",
        "InterruptedIOException"
    )
}
