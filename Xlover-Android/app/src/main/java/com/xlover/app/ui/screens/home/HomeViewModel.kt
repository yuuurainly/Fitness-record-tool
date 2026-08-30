package com.xlover.app.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.remote.dto.DashboardResponse
import com.xlover.app.data.remote.dto.TaskDto
import com.xlover.app.data.remote.dto.CheckInRequest
import com.xlover.app.data.remote.dto.ProfileUpdateRequest
import com.xlover.app.data.repository.DashboardRepository
import com.xlover.app.data.repository.RecordsRepository
import com.xlover.app.data.repository.TasksRepository
import com.xlover.app.data.repository.ProfileRepository
import com.xlover.app.util.FailureTracker
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class HomeUiState {
    data object Loading : HomeUiState()
    data class Success(val data: DashboardResponse) : HomeUiState()
    data class Error(val message: String) : HomeUiState()
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val dashboardRepository: DashboardRepository,
    private val recordsRepository: RecordsRepository,
    private val tasksRepository: TasksRepository,
    private val profileRepository: ProfileRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<HomeUiState>(HomeUiState.Loading)
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _todayTasks = MutableStateFlow<List<TaskDto>>(emptyList())
    val todayTasks: StateFlow<List<TaskDto>> = _todayTasks.asStateFlow()

    // 喝水目标：后端持久化值（profile.waterGoal），UI 初始化后刷新 dashboard 会覆盖掉 8 的默认
    private val _waterGoal = MutableStateFlow(8)
    val waterGoal: StateFlow<Int> = _waterGoal.asStateFlow()

    // 喝水防重复点击标志
    private val _isDrinking = MutableStateFlow(false)
    val isDrinking: StateFlow<Boolean> = _isDrinking.asStateFlow()

    /** 首页可见时调用刷新 */
    fun refresh() {
        loadDashboard()
        loadTodayTasks()
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = HomeUiState.Loading
            dashboardRepository.getDashboard()
                .onSuccess { data ->
                    FailureTracker.onSuccess()
                    applyDashboardData(data)
                    _uiState.value = HomeUiState.Success(data)
                }
                .onFailure { e ->
                    FailureTracker.onFailure(e)
                    _uiState.value = HomeUiState.Error(e.message ?: "加载失败")
                }
        }
    }

    private fun applyDashboardData(data: DashboardResponse) {
        // 同步后端持久化的喝水目标，避免重启后又变成 8
        val wg = data.profile.waterGoal
        if (wg in 1..20) _waterGoal.value = wg
    }

    /** 静默刷新 dashboard：不重置 Loading 状态，避免喝水等小操作导致整页闪烁。 */
    private fun refreshDashboardSilently() {
        viewModelScope.launch {
            dashboardRepository.getDashboard()
                .onSuccess { data ->
                    applyDashboardData(data)
                    _uiState.value = HomeUiState.Success(data)
                }
                .onFailure { /* 静默失败，保持当前数据不变 */ }
        }
    }

    private fun loadTodayTasks() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            try {
                val token = TokenManager.token
                val response = tasksRepository.getTasks(token)
                if (response.success && response.data != null) {
                    _todayTasks.value = response.data.tasks.filter { it.status != "rejected" }
                }
            } catch (_: Exception) { }
        }
    }

    /** 喝水：+1 杯，不超过 DB 中用户自定义 waterGoal。带防重复点击保护。 */
    fun drinkWater(currentCount: Int) {
        if (_isDrinking.value) return
        if (currentCount >= _waterGoal.value) return
        _isDrinking.value = true
        viewModelScope.launch {
            try {
                val token = TokenManager.token
                recordsRepository.checkIn(token, CheckInRequest(type = "water"))
                // 静默刷新，不触发整页 Loading 闪烁
                refreshDashboardSilently()
            } catch (_: Exception) { } finally {
                _isDrinking.value = false
            }
        }
    }

    /**
     * 设置喝水目标：持久化到后端 user_profiles.water_goal。
     * 成功后静默刷新 dashboard，保证目标值下次启动仍生效。
     */
    fun setWaterGoal(rawGoal: Int) {
        val goal = rawGoal.coerceIn(1, 20)
        _waterGoal.value = goal // 先乐观更新 UI
        viewModelScope.launch {
            try {
                val token = TokenManager.token
                profileRepository.updateProfile(
                    token,
                    ProfileUpdateRequest(water_goal = goal)
                )
                // 刷新保证后端数据与前端完全一致
                refreshDashboardSilently()
            } catch (_: Exception) { /* 保留本地乐观值，不会回滚成 8 */ }
        }
    }

    /**
     * 首页"选择活动水平"弹框确认后调用：写入活动水平档位 + 系数，后端重新计算 TDEE。
     * 成功后静默刷新 dashboard。
     */
    fun updateActivityLevel(levelKey: String, factor: Double, onDone: (Boolean, String?) -> Unit = { _, _ -> }) {
        viewModelScope.launch {
            try {
                val token = TokenManager.token
                val result = profileRepository.updateProfile(
                    token,
                    ProfileUpdateRequest(activity_level = levelKey, activity_factor = factor)
                )
                refreshDashboardSilently()
                onDone(true, null)
            } catch (e: Exception) {
                onDone(false, e.message ?: "保存失败，请重试")
            }
        }
    }
}
