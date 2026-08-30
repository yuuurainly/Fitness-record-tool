package com.xlover.app.ui.screens.task

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.xlover.app.data.repository.TasksRepository
import com.xlover.app.data.remote.dto.*
import com.xlover.app.util.TokenManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TaskUiState(
    val isLoading: Boolean = false,
    val pendingTasks: List<TaskDto> = emptyList(),
    val acceptedTasks: List<TaskDto> = emptyList(),
    val completedTasks: List<TaskDto> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class TaskViewModel @Inject constructor(
    private val repository: TasksRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(TaskUiState())
    val uiState: StateFlow<TaskUiState> = _uiState.asStateFlow()

    fun loadTasks() {
        if (!TokenManager.isLoggedIn) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val resp = repository.getTasks(TokenManager.token)
                if (resp.success) {
                    val all = resp.data?.tasks ?: emptyList()
                    _uiState.value = _uiState.value.copy(
                        pendingTasks = all.filter { it.status == "pending" },
                        acceptedTasks = all.filter { it.status == "accepted" || it.status == "active" },
                        completedTasks = all.filter { it.status == "completed" },
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

    fun acceptTask(id: Int, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val resp = repository.acceptTask(TokenManager.token, id)
                if (resp.success) {
                    loadTasks()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun rejectTask(id: Int, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val resp = repository.rejectTask(TokenManager.token, id)
                if (resp.success) {
                    loadTasks()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }

    fun completeTask(id: Int, onResult: (Boolean, String?, Int) -> Unit) {
        viewModelScope.launch {
            try {
                val resp = repository.completeTask(TokenManager.token, id)
                if (resp.success) {
                    loadTasks()
                    onResult(true, null, resp.data?.pointsEarned ?: 0)
                } else {
                    onResult(false, resp.message, 0)
                }
            } catch (e: Exception) {
                onResult(false, e.message, 0)
            }
        }
    }

    fun createTask(request: TaskRequest, onResult: (Boolean, String?) -> Unit) {
        viewModelScope.launch {
            try {
                val resp = repository.createTask(TokenManager.token, request)
                if (resp.success) {
                    loadTasks()
                    onResult(true, null)
                } else {
                    onResult(false, resp.message)
                }
            } catch (e: Exception) {
                onResult(false, e.message)
            }
        }
    }
}
