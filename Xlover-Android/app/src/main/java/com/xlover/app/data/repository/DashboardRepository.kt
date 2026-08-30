package com.xlover.app.data.repository

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import com.xlover.app.data.remote.ApiService
import com.xlover.app.data.remote.dto.DashboardResponse
import com.xlover.app.util.Constants
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DashboardRepository @Inject constructor(
    private val apiService: ApiService,
    private val dataStore: DataStore<Preferences>
) {
    private val tokenKey = stringPreferencesKey(Constants.PREFS_TOKEN)

    suspend fun getToken(): String? = dataStore.data.first()[tokenKey]

    suspend fun getDashboard(): Result<DashboardResponse> {
        val token = getToken() ?: return Result.failure(Exception("未登录"))
        return try {
            val response = apiService.getDashboard(token)
            if (response.success && response.data != null) {
                Result.success(response.data)
            } else {
                Result.failure(Exception(response.message))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }
}
