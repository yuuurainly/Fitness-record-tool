package com.xlover.app.ui.screens.guide

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.remote.dto.ProfileUpdateRequest
import com.xlover.app.data.repository.AuthRepository
import com.xlover.app.data.repository.ProfileRepository
import com.xlover.app.util.Constants
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class GuideUiState(
    val currentStep: Int = 0,
    val gender: String = "male",
    val age: String = "",
    val height: String = "",
    val currentWeight: String = "",
    val targetWeight: String = "",
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
    val isComplete: Boolean = false
)

@HiltViewModel
class GuideViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val profileRepository: ProfileRepository,
    private val dataStore: DataStore<Preferences>
) : ViewModel() {

    private val _uiState = MutableStateFlow(GuideUiState())
    val uiState: StateFlow<GuideUiState> = _uiState.asStateFlow()

    fun updateField(field: String, value: String) {
        _uiState.value = when (field) {
            "gender" -> _uiState.value.copy(gender = value)
            "age" -> _uiState.value.copy(age = value)
            "height" -> _uiState.value.copy(height = value)
            "currentWeight" -> _uiState.value.copy(currentWeight = value)
            "targetWeight" -> _uiState.value.copy(targetWeight = value)
            else -> _uiState.value
        }
    }

    fun prevStep() {
        val current = _uiState.value.currentStep
        if (current > 0) {
            _uiState.value = _uiState.value.copy(currentStep = current - 1)
        }
    }

    /**
     * 提交身体数据并直接完成引导。
     */
    fun submitProfileAndComplete() {
        if (_uiState.value.isLoading) return
        val state = _uiState.value
        // 基础输入校验
        val heightValue = state.height.toDoubleOrNull()
        val currentWeightValue = state.currentWeight.toDoubleOrNull()
        val targetWeightValue = state.targetWeight.toDoubleOrNull()
        val ageValue = state.age.toIntOrNull()
        if (heightValue == null || currentWeightValue == null || targetWeightValue == null) {
            _uiState.value = _uiState.value.copy(errorMessage = "请填写有效的身高和体重")
            return
        }
        if (ageValue == null || ageValue !in 5..120) {
            _uiState.value = _uiState.value.copy(errorMessage = "请填写有效的年龄")
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null)
            try {
                val token = TokenManager.token
                // 计算 BMI（后端要求必需字段：bmi = weightKg / (heightM^2)）
                val heightM = heightValue / 100.0
                val bmi = if (heightM > 0) {
                    val raw = currentWeightValue / (heightM * heightM)
                    kotlin.math.round(raw * 100) / 100.0
                } else 0.0

                val resp = profileRepository.updateProfile(
                    token,
                    ProfileUpdateRequest(
                        gender = state.gender,
                        age = ageValue,
                        height = heightValue,
                        current_weight = currentWeightValue,
                        target_weight = targetWeightValue,
                        start_weight = currentWeightValue,
                        bmi = bmi
                    )
                )
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = null
                    )
                    completeGuide()
                } else {
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = resp.message ?: "保存失败"
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    errorMessage = e.message ?: "网络错误"
                )
            }
        }
    }

    fun completeGuide() {
        viewModelScope.launch {
            // 保存引导完成状态到 DataStore
            dataStore.edit {
                it[booleanPreferencesKey(Constants.PREFS_IS_GUIDE_COMPLETE)] = true
            }
            _uiState.value = _uiState.value.copy(isComplete = true)
        }
    }
}
