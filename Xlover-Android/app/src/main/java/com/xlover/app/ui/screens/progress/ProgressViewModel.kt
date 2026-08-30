package com.xlover.app.ui.screens.progress

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.repository.ProgressRepository
import com.xlover.app.data.remote.dto.*
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WeightChartPoint(
    val dayIndex: Int,   // x: 第N天序号
    val weight: Float,   // y: 体重 kg
    val date: String     // MM/dd 用于显示
)

data class ProgressUiState(
    val isLoading: Boolean = false,
    val weightRecords: List<WeightTrendRecord> = emptyList(),
    val weightTrend: List<WeightChartPoint> = emptyList(), // Vico 图表数据
    val currentWeight: Double = 0.0,
    val targetWeight: Double = 0.0,
    val height: Double = 0.0,
    val achievements: List<AchievementDto> = emptyList(),
    val stats: StatsData? = null,
    val error: String? = null
)

@HiltViewModel
class ProgressViewModel @Inject constructor(
    private val repository: ProgressRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProgressUiState())
    val uiState: StateFlow<ProgressUiState> = _uiState.asStateFlow()

    fun loadAll() {
        loadWeightProgress()
        loadAchievements()
        loadStats()
    }

    fun loadWeightProgress() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            try {
                val resp = repository.getWeightProgress(TokenManager.token, 30)
                if (resp.success) {
                    val records = resp.data?.records ?: emptyList()
                    // 转换为 Vico 图表可用数据：x=第N天序号, y=体重kg
                    val trend = records.mapIndexed { index, record ->
                        val monthDay = try {
                            val parts = record.record_date.split("-") // yyyy-MM-dd
                            if (parts.size >= 3) "${parts[1]}/${parts[2]}" else record.record_date
                        } catch (_: Exception) {
                            record.record_date
                        }
                        WeightChartPoint(
                            dayIndex = index,
                            weight = record.weight.toFloat(),
                            date = monthDay
                        )
                    }
                    _uiState.value = _uiState.value.copy(
                        weightRecords = records,
                        weightTrend = trend,
                        currentWeight = resp.data?.currentWeight ?: 0.0,
                        targetWeight = resp.data?.targetWeight ?: 0.0,
                        height = resp.data?.height ?: 0.0
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun loadAchievements() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            try {
                val resp = repository.getAchievements(TokenManager.token)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        achievements = resp.data?.achievements ?: emptyList(),
                        stats = resp.data?.stats
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun loadStats() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            try {
                val resp = repository.getStats(TokenManager.token)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(stats = resp.data?.data)
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }
}
