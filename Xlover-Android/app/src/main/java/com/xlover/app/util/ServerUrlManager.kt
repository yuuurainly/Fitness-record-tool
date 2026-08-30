package com.xlover.app.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * 服务器地址管理器：
 * - 从 DataStore 持久化读取/保存用户自定义服务器地址
 * - 未设置时回退到 Constants.DEFAULT_BASE_URL
 * - AppModule 的 Retrofit 拦截器会用 getUrl() 动态替换 BaseUrl
 * - WebSocket/ForegroundService 也使用这里的地址
 *
 * URL 格式要求：以 http:// 或 https:// 开头，以 / 结尾
 */
object ServerUrlManager {

    private val KEY_SERVER_URL = stringPreferencesKey(Constants.PREFS_SERVER_URL)

    /** 缓存当前地址（避免每次请求都走 DataStore 异步流） */
    @Volatile
    private var cachedUrl: String = Constants.DEFAULT_BASE_URL

    /** 用于异步加载服务器地址的协程作用域（应用级单例，生命周期与进程一致） */
    private val initScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * 异步初始化：从 DataStore 读取保存的服务器地址到内存缓存。
     * 应在 Application.onCreate 中调用，避免在主线程阻塞导致 ANR。
     * 在加载完成前，getUrl() 返回 [Constants.DEFAULT_BASE_URL]。
     */
    fun init(dataStore: DataStore<Preferences>) {
        initScope.launch {
            runCatching {
                val saved = dataStore.data.first()[KEY_SERVER_URL]
                if (!saved.isNullOrBlank()) {
                    cachedUrl = normalize(saved)
                }
            }
        }
    }

    /** 获取当前服务器地址（保证以 "/" 结尾） */
    fun getUrl(): String = cachedUrl

    /** 返回 Flow（用于 UI 订阅变化） */
    fun observeUrl(dataStore: DataStore<Preferences>): Flow<String> {
        return dataStore.data.map { prefs ->
            prefs[KEY_SERVER_URL]?.takeIf { it.isNotBlank() }?.let { normalize(it) }
                ?: Constants.DEFAULT_BASE_URL
        }
    }

    /** 保存新的服务器地址（同时更新内存缓存） */
    suspend fun setUrl(dataStore: DataStore<Preferences>, rawUrl: String): String {
        val normalized = normalize(rawUrl)
        dataStore.edit { it[KEY_SERVER_URL] = normalized }
        cachedUrl = normalized
        return normalized
    }

    /** 重置为默认地址 */
    suspend fun reset(dataStore: DataStore<Preferences>) {
        dataStore.edit { it.remove(KEY_SERVER_URL) }
        cachedUrl = Constants.DEFAULT_BASE_URL
    }

    /** 规范化 URL：补协议前缀、补尾斜杠 */
    fun normalize(raw: String): String {
        var url = raw.trim()
        if (url.isBlank()) return Constants.DEFAULT_BASE_URL
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = "http://$url"
        }
        if (!url.endsWith("/")) url += "/"
        return url
    }

    /** 显示用（去掉协议前缀和尾斜杠） */
    fun display(): String {
        return cachedUrl.removePrefix("http://")
            .removePrefix("https://")
            .removeSuffix("/")
    }

    /** 获取 WebSocket 地址 */
    fun wsUrl(token: String): String {
        val bare = cachedUrl.removeSuffix("/")
        val wsBase = bare.replace("https://", "wss://").replace("http://", "ws://")
        return "$wsBase/ws?token=${java.net.URLEncoder.encode(token, "UTF-8")}"
    }
}
