package com.xlover.app.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import com.xlover.app.data.remote.ApiService
import com.xlover.app.data.remote.dto.*
import com.xlover.app.data.websocket.WebSocketManager
import com.xlover.app.util.Constants
import com.xlover.app.util.TokenManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val apiService: ApiService,
    private val dataStore: DataStore<Preferences>
) {
    private val tokenKey = stringPreferencesKey(Constants.PREFS_TOKEN)
    private val roleKey = stringPreferencesKey(Constants.PREFS_ROLE)

    val tokenFlow: Flow<String?> = dataStore.data.map { it[tokenKey] }
    val roleFlow: Flow<String?> = dataStore.data.map { it[roleKey] }

    suspend fun getToken(): String? = dataStore.data.first()[tokenKey]

    suspend fun login(username: String, password: String): Result<AuthResponse> {
        return try {
            val response = apiService.login(LoginRequest(username, password))
            if (response.success && response.data != null) {
                saveAuthData(response.data)
                Result.success(response.data)
            } else {
                Result.failure(Exception(response.message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun register(username: String, password: String, nickname: String): Result<AuthResponse> {
        return try {
            val response = apiService.register(RegisterRequest(username, password, nickname))
            if (response.success && response.data != null) {
                saveAuthData(response.data)
                Result.success(response.data)
            } else {
                Result.failure(Exception(response.message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private suspend fun saveAuthData(auth: AuthResponse) {
        // 设置全局 TokenManager
        TokenManager.token = "Bearer ${auth.token}"
        TokenManager.userId = auth.user.id
        TokenManager.username = auth.user.username
        TokenManager.nickname = auth.user.nickname
        TokenManager.role = auth.user.role
        TokenManager.partnerId = auth.user.partner_id ?: 0
        TokenManager.bindCode = auth.user.bind_code ?: ""

        dataStore.edit { prefs ->
            prefs[tokenKey] = "Bearer ${auth.token}"
            prefs[stringPreferencesKey(Constants.PREFS_USER_ID)] = auth.user.id.toString()
            prefs[stringPreferencesKey(Constants.PREFS_USERNAME)] = auth.user.username
            prefs[stringPreferencesKey(Constants.PREFS_NICKNAME)] = auth.user.nickname
            prefs[roleKey] = auth.user.role
            auth.user.partner_id?.let {
                prefs[stringPreferencesKey(Constants.PREFS_PARTNER_ID)] = it.toString()
            }
            auth.user.bind_code?.let {
                prefs[stringPreferencesKey(Constants.PREFS_BIND_CODE)] = it
            }
        }
    }

    suspend fun logout() {
        // 先断开 WebSocket，避免登出后仍持旧 token 继续连接，触发失效重连风暴
        WebSocketManager.disconnect()
        TokenManager.clear()
        dataStore.edit { it.clear() }
    }

    suspend fun isLoggedIn(): Boolean = getToken() != null
}
