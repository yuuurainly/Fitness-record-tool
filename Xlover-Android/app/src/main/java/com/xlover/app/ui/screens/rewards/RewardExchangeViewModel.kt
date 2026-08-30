package com.xlover.app.ui.screens.rewards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.remote.dto.RewardClaimResponse
import com.xlover.app.data.remote.dto.RewardDto
import com.xlover.app.data.repository.RewardsRepository
import com.xlover.app.util.FailureTracker
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RewardExchangeUiState(
    val isLoading: Boolean = true,
    val isClaiming: Boolean = false,
    val rewards: List<RewardDto> = emptyList(),
    val userPoints: Int = 0,
    val errorMessage: String? = null,
    val claimResultMessage: String? = null
)

@HiltViewModel
class RewardExchangeViewModel @Inject constructor(
    private val repository: RewardsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RewardExchangeUiState())
    val uiState: StateFlow<RewardExchangeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        val token = TokenManager.token.ifBlank { return }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, errorMessage = null, claimResultMessage = null)
            runCatching { repository.getRewards(token) }
                .onSuccess { resp ->
                    FailureTracker.onSuccess()
                    if (resp.success && resp.data != null) {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            rewards = resp.data.rewards,
                            userPoints = resp.data.userPoints
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            isLoading = false,
                            errorMessage = resp.message.ifBlank { "加载失败" }
                        )
                    }
                }
                .onFailure { t ->
                    FailureTracker.onFailure(t)
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        errorMessage = t.message ?: "网络错误"
                    )
                }
        }
    }

    fun claim(reward: RewardDto) {
        val token = TokenManager.token.ifBlank { return }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isClaiming = true, claimResultMessage = null, errorMessage = null)
            runCatching { repository.claimReward(token, reward.id) }
                .onSuccess { resp ->
                    FailureTracker.onSuccess()
                    handleClaimResult(resp.success, resp.message, resp.data, reward)
                }
                .onFailure { t ->
                    FailureTracker.onFailure(t)
                    _uiState.value = _uiState.value.copy(
                        isClaiming = false,
                        claimResultMessage = "兑换失败：${t.message ?: "网络错误"}"
                    )
                }
        }
    }

    private fun handleClaimResult(
        success: Boolean,
        message: String,
        data: RewardClaimResponse?,
        reward: RewardDto
    ) {
        val newBalance = data?.newBalance
            ?: data?.remainingPoints
            ?: (_uiState.value.userPoints - reward.points_cost).coerceAtLeast(0)
        if (success) {
            _uiState.value = _uiState.value.copy(
                isClaiming = false,
                userPoints = newBalance,
                claimResultMessage = message.ifBlank { "兑换成功，等待伴侣确认" }
            )
        } else {
            _uiState.value = _uiState.value.copy(
                isClaiming = false,
                claimResultMessage = message.ifBlank { "兑换失败" }
            )
        }
    }
}
