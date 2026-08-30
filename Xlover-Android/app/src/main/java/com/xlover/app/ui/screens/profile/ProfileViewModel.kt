package com.xlover.app.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.repository.AuthRepository
import com.xlover.app.data.repository.ProfileRepository
import com.xlover.app.data.repository.PointRequestsRepository
import com.xlover.app.data.repository.RemindersRepository
import com.xlover.app.data.remote.dto.*
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val isLoading: Boolean = false,
    val user: ProfileUser? = null,
    val profile: ProfileData? = null,
    val points: Int = 0,
    val pointsHistory: List<PointRecord> = emptyList(),
    val pointRequests: List<PointRequestDto> = emptyList(),
    val pendingReviews: List<PointRequestDto> = emptyList(),
    // 提醒列表
    val reminders: List<ReminderDto> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val repository: ProfileRepository,
    private val pointRequestsRepository: PointRequestsRepository,
    private val remindersRepository: RemindersRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    private val token: String get() = TokenManager.token

    fun loadProfile() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val resp = repository.getProfile(TokenManager.token)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        user = resp.data?.user,
                        profile = resp.data?.profile,
                        points = resp.data?.points ?: 0,
                        error = null
                    )
                    // 更新 TokenManager
                    resp.data?.user?.let {
                        TokenManager.nickname = it.nickname
                    }
                } else {
                    _uiState.value = _uiState.value.copy(error = resp.message)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            } finally {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }
        }
    }

    fun updateProfile(request: ProfileUpdateRequest, onResult: (Boolean, String?) -> Unit) {
        if (!TokenManager.isLoggedIn) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.updateProfile(TokenManager.token, request)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        user = resp.data?.user,
                        profile = resp.data?.profile
                    )
                    resp.data?.user?.let { TokenManager.nickname = it.nickname }
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun loadPointsHistory() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            try {
                val resp = repository.getPointsHistory(TokenManager.token)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        pointsHistory = resp.data?.records ?: emptyList(),
                        points = resp.data?.currentBalance ?: _uiState.value.points
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    // ========== 积分申请 ==========
    fun loadPointRequests(status: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = pointRequestsRepository.getPointRequests(token, status)
                if (resp.success) {
                    val list = resp.data?.requests
                        ?: resp.data?.list
                        ?: emptyList()
                    _uiState.value = _uiState.value.copy(
                        pointRequests = list,
                        pendingReviews = list.filter { it.status == "pending" }
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun createPointRequest(
        type: String = "custom",
        title: String,
        description: String = "",
        points: Int,
        recordDate: String? = null,
        exerciseId: Int? = null,
        onResult: (Boolean, String?) -> Unit
    ) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = pointRequestsRepository.createPointRequest(
                    token,
                    PointRequestRequest(
                        type = type,
                        title = title,
                        description = description,
                        points = points,
                        record_date = recordDate,
                        exercise_id = exerciseId
                    )
                )
                if (resp.success) {
                    loadPointRequests()
                    onResult(true, resp.message ?: "申请已提交")
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun approvePointRequest(id: Int, onResult: (Boolean, String?, Int?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录", null); return }
        viewModelScope.launch {
            try {
                val resp = pointRequestsRepository.approvePointRequest(token, id)
                if (resp.success) {
                    loadPointRequests()
                    loadProfile() // 积分余额可能变了
                    onResult(true, resp.message ?: "已通过", resp.data?.newBalance)
                } else {
                    onResult(false, resp.message, null)
                }
            } catch (e: Exception) {
                onResult(false, e.message, null)
            }
        }
    }

    fun rejectPointRequest(id: Int, reason: String? = null, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = pointRequestsRepository.rejectPointRequest(token, id, reason)
                if (resp.success) {
                    loadPointRequests()
                    onResult(true, resp.message ?: "已驳回")
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun cancelPointRequest(id: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = pointRequestsRepository.cancelPointRequest(token, id)
                if (resp.success) {
                    loadPointRequests()
                    onResult(true, resp.message ?: "已取消")
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    // ========== 提醒管理 ==========
    fun loadReminders(isActive: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = remindersRepository.getReminders(token, isActive)
                if (resp.success) {
                    val list = resp.data?.list
                        ?: resp.data?.reminders
                        ?: emptyList()
                    _uiState.value = _uiState.value.copy(reminders = list)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun createReminder(
        request: ReminderRequest,
        onResult: (Boolean, String?, ReminderDto?) -> Unit
    ) {
        if (token.isEmpty()) { onResult(false, "未登录", null); return }
        viewModelScope.launch {
            try {
                val resp = remindersRepository.createReminder(token, request)
                if (resp.success) {
                    loadReminders()
                    onResult(true, resp.message ?: "提醒已创建", resp.data)
                } else {
                    onResult(false, resp.message, null)
                }
            } catch (e: Exception) {
                onResult(false, e.message, null)
            }
        }
    }

    fun updateReminder(
        id: Int,
        request: ReminderUpdateRequest,
        onResult: (Boolean, String?) -> Unit
    ) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = remindersRepository.updateReminder(token, id, request)
                if (resp.success) {
                    loadReminders()
                    onResult(true, resp.message ?: "提醒已更新")
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun deleteReminder(id: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = remindersRepository.deleteReminder(token, id)
                if (resp.success) {
                    loadReminders()
                    onResult(true, resp.message ?: "提醒已删除")
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun toggleReminder(id: Int, isActive: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = remindersRepository.toggleReminder(token, id, isActive)
                if (resp.success) {
                    loadReminders()
                    onResult(true, resp.message)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    /**
     * 退出登录：
     * - 调用 AuthRepository.logout 断开 WebSocket + 清空 DataStore + 清空 TokenManager
     * - 完成后回调，由 UI 层执行导航跳转到登录页
     */
    fun logout(onDone: () -> Unit) {
        viewModelScope.launch {
            authRepository.logout()
            onDone()
        }
    }
}
