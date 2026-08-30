package com.xlover.app.ui.screens.record

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.repository.RecordsRepository
import com.xlover.app.data.remote.dto.*
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RecordUiState(
    val isLoading: Boolean = false,
    val foods: List<FoodRecordDto> = emptyList(),
    val foodSummary: FoodSummary? = null,
    val exercises: List<ExerciseRecordDto> = emptyList(),
    val exerciseSummary: ExerciseSummary? = null,
    val weights: List<WeightRecordDto> = emptyList(),
    // 新增：食物库/运动库
    val foodLibrary: List<FoodLibraryItem> = emptyList(),
    val exerciseLibrary: List<ExerciseLibraryItem> = emptyList(),
    // 新增：打卡汇总
    val waterCups: Int = 0,
    val checkInSummary: CheckInSummary? = null,
    val error: String? = null
)

@HiltViewModel
class RecordViewModel @Inject constructor(
    private val repository: RecordsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(RecordUiState())
    val uiState: StateFlow<RecordUiState> = _uiState.asStateFlow()

    private val token: String get() = TokenManager.token

    fun loadAll(date: String? = null) {
        loadFoods(date)
        loadExercises(date)
        loadWeights()
        loadSummary(date)
    }

    fun loadFoods(date: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val resp = repository.getFoods(token, date)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        foods = resp.data?.foods ?: emptyList(),
                        foodSummary = resp.data?.summary,
                        error = null
                    )
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

    fun loadExercises(date: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = repository.getExercises(token, date)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        exercises = resp.data?.exercises ?: emptyList(),
                        exerciseSummary = resp.data?.summary
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun loadWeights() {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = repository.getWeights(token, 7)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        weights = resp.data?.records ?: emptyList()
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    fun addFood(request: FoodRequest, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.addFood(token, request)
                if (resp.success) {
                    loadFoods()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun deleteFood(id: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.deleteFood(token, id)
                if (resp.success) {
                    loadFoods()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun addExercise(request: ExerciseRequest, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.addExercise(token, request)
                if (resp.success) {
                    loadExercises()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun deleteExercise(id: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.deleteExercise(token, id)
                if (resp.success) {
                    loadExercises()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun addWeight(request: WeightRequest, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.addWeight(token, request)
                if (resp.success) {
                    loadWeights()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun deleteWeight(id: Int, onResult: (Boolean, String?) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录"); return }
        viewModelScope.launch {
            try {
                val resp = repository.deleteWeight(token, id)
                if (resp.success) {
                    loadWeights()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    // ========== 食物库搜索 ==========
    fun searchFoodLibrary(keyword: String? = null, category: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = repository.searchFoodLibrary(token, keyword, category)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        foodLibrary = resp.data?.list ?: emptyList()
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    // ========== 运动库加载 ==========
    fun loadExerciseLibrary(keyword: String? = null, category: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = repository.getExerciseLibrary(token, keyword, category)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        exerciseLibrary = resp.data?.list ?: emptyList()
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }

    // ========== 打卡（喝水/睡觉/运动/饮食）==========
    fun checkIn(type: String, count: Int? = null, onResult: (Boolean, String?, Int) -> Unit) {
        if (token.isEmpty()) { onResult(false, "未登录", 0); return }
        viewModelScope.launch {
            try {
                val resp = repository.checkIn(token, CheckInRequest(type = type, count = count))
                if (resp.success) {
                    val newCount = resp.data?.count ?: 0
                    if (type == "water") {
                        _uiState.value = _uiState.value.copy(waterCups = newCount)
                    }
                    loadSummary()
                    onResult(true, resp.message, newCount)
                } else {
                    onResult(false, resp.message, 0)
                }
            } catch (e: Exception) {
                onResult(false, e.message, 0)
            }
        }
    }

    // ========== 打卡汇总 ==========
    fun loadSummary(date: String? = null) {
        if (token.isEmpty()) return
        viewModelScope.launch {
            try {
                val resp = repository.getRecordSummary(token, date)
                if (resp.success) {
                    _uiState.value = _uiState.value.copy(
                        checkInSummary = resp.data?.summary,
                        waterCups = resp.data?.summary?.water ?: 0
                    )
                }
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(error = e.message)
            }
        }
    }
}
