package com.xlover.app.ui.screens.task

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.data.remote.dto.TaskDto
import com.xlover.app.data.remote.dto.TaskRequest
import com.xlover.app.ui.components.AppStyleDialog
import com.xlover.app.ui.theme.*
import com.xlover.app.util.SetStatusBarColor
import com.xlover.app.util.TokenManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TaskScreen(
    initialTab: Int = 0,
    viewModel: TaskViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(initialTab) }
    var showCreateTask by remember { mutableStateOf(false) }
    val context = LocalContext.current

    // 操作结果统一反馈：避免 accept/reject/complete/create 静默吞掉成败
    val toast: (Boolean, String?, String) -> Unit = { success, msg, okMsg ->
        android.widget.Toast.makeText(
            context,
            if (success) okMsg else (msg ?: "操作失败"),
            android.widget.Toast.LENGTH_SHORT
        ).show()
    }

    LaunchedEffect(Unit) {
        if (TokenManager.isLoggedIn) viewModel.loadTasks()
    }

    SetStatusBarColor(CreamBackground)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "我的任务",
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = TextPrimary,
                modifier = Modifier.padding(start = 16.dp, top = 8.dp, bottom = 4.dp)
            )

            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = CreamBackground,
                contentColor = CoralPrimary, divider = { }
            ) {
                val tabs = listOf("进行中", "已完成", "待处理", "全部")
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                title,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = if (selectedTab == index) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (selectedTab == index) CoralPrimary else TextSecondary
                            )
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // 顶部统一消费 uiState.isLoading / error：避免静默吞掉错误
            if (uiState.isLoading && uiState.pendingTasks.isEmpty() &&
                uiState.acceptedTasks.isEmpty() && uiState.completedTasks.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxWidth().padding(16.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = CoralPrimary, modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
                }
            }
            uiState.error?.takeIf { it.isNotBlank() }?.let { errMsg ->
                Card(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ErrorRed.copy(alpha = 0.08f))
                ) {
                    Text(
                        errMsg,
                        style = MaterialTheme.typography.bodySmall,
                        color = ErrorRed,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }

            val tasks = when (selectedTab) {
                0 -> uiState.acceptedTasks
                1 -> uiState.completedTasks
                2 -> uiState.pendingTasks
                else -> uiState.pendingTasks + uiState.acceptedTasks + uiState.completedTasks
            }

            if (tasks.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Assignment, contentDescription = null, tint = TextSecondary.copy(alpha = 0.3f), modifier = Modifier.size(64.dp))
                        Spacer(modifier = Modifier.height(12.dp))
                        Text("暂无任务", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(tasks, key = { it.id }) { task ->
                        TaskCard(
                            task = task,
                            onAccept = {
                                viewModel.acceptTask(task.id) { success, msg ->
                                    toast(success, msg, "已接受任务")
                                }
                            },
                            onReject = {
                                viewModel.rejectTask(task.id) { success, msg ->
                                    toast(success, msg, "已拒绝任务")
                                }
                            },
                            onComplete = {
                                viewModel.completeTask(task.id) { success, msg, points ->
                                    toast(success, msg, if (success && points > 0) "完成！+${points} 积分" else "已完成")
                                }
                            }
                        )
                    }
                    item { Spacer(modifier = Modifier.height(80.dp)) }
                }
            }
        }

        // 右下角"+"按钮：和原 Scaffold FAB 同尺寸/颜色；加底部 padding 避免与底部导航栏重叠
        FilledIconButton(
            onClick = { showCreateTask = true },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 24.dp)
                .size(56.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = CoralPrimary,
                contentColor = Color.White
            )
        ) {
            Icon(Icons.Default.Add, contentDescription = "发布任务", modifier = Modifier.size(28.dp))
        }
    }

    if (showCreateTask) {
        CreateTaskDialog(
            onDismiss = { showCreateTask = false },
            onConfirm = { request ->
                viewModel.createTask(request) { success, msg ->
                    showCreateTask = false
                    toast(success, msg, "任务已发布")
                }
            }
        )
    }
}

@Composable
fun TaskCard(
    task: TaskDto,
    onAccept: () -> Unit,
    onReject: () -> Unit,
    onComplete: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            // TaskDto nullable 字段安全兜底（与后端 normalizeTask + DTO 默认值三层防护一致）
            val safeStatus = task.status ?: "pending"
            val safeType = task.type ?: "once"
            val safeDesc = task.description ?: ""
            val safePoints = task.points ?: 0
            Row(verticalAlignment = Alignment.CenterVertically) {
                val isCompleted = safeStatus == "completed"
                // 左上角状态色块：仅 completed 显示绿色勾，未完成任务显示非绿图标
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(
                            when (safeStatus) {
                                "completed" -> SuccessGreen.copy(alpha = 0.2f)
                                "pending" -> CoralPrimary.copy(alpha = 0.1f)
                                "accepted", "active" -> CoralLight.copy(alpha = 0.3f)
                                "rejected" -> TextTertiary.copy(alpha = 0.2f)
                                else -> SkyTertiary.copy(alpha = 0.15f)
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        when {
                            // 已完成任务：统一显示绿色勾
                            isCompleted -> Icons.Default.CheckCircle
                            // 未完成：习惯打卡显示循环图标，单次任务显示圆形/待办图标
                            safeType == "habit" -> Icons.Default.Repeat
                            else -> Icons.Default.RadioButtonUnchecked
                        },
                        contentDescription = null,
                        tint = when (safeStatus) {
                            "completed" -> SuccessGreen
                            "pending" -> CoralPrimary
                            "accepted", "active" -> CoralDark
                            "rejected" -> TextTertiary
                            else -> SkyTertiary
                        },
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(task.title, style = MaterialTheme.typography.titleMedium, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                    if (safeDesc.isNotEmpty()) {
                        Text(safeDesc, style = MaterialTheme.typography.bodySmall, color = TextSecondary, maxLines = 2)
                    }
                }
                // 积分徽章
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(CoralPrimary.copy(alpha = 0.1f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("+${safePoints}", color = CoralPrimary, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
            }

            // 状态标签
            Spacer(modifier = Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                val (statusText, statusColor) = when (safeStatus) {
                    "pending" -> "待接受" to CoralPrimary
                    "accepted", "active" -> "进行中" to MintSecondary
                    "completed" -> "已完成" to SuccessGreen
                    "rejected" -> "已拒绝" to TextTertiary
                    else -> safeStatus to TextSecondary
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(statusColor.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(statusText, color = statusColor, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Medium)
                }
                if (safeType == "habit" && task.current_streak > 0) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("连续 ${task.current_streak} 天", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
            }

            // 操作按钮
            if (safeStatus == "pending") {
                Spacer(modifier = Modifier.height(12.dp))
                Row {
                    OutlinedButton(
                        onClick = onReject,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = TextSecondary)
                    ) { Text("拒绝") }
                    Spacer(modifier = Modifier.width(12.dp))
                    Button(
                        onClick = onAccept,
                        modifier = Modifier
                            .weight(1f)
                            .height(40.dp),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = CoralPrimary)
                    ) { Text("开始") }
                }
            }

            if (safeStatus == "accepted" || safeStatus == "active") {
                Spacer(modifier = Modifier.height(12.dp))
                Button(
                    onClick = onComplete,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(40.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen)
                ) { Text("打卡完成", color = Color.White, fontWeight = FontWeight.Bold) }
            }
        }
    }
}


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreateTaskDialog(onDismiss: () -> Unit, onConfirm: (TaskRequest) -> Unit) {
    var title by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    // 后端任务类型枚举：once / cycle / habit
    // UI 文案对齐原来用户的：单次任务 => once ； 习惯打卡 => habit
    var taskType by remember { mutableStateOf("once") }
    // 习惯打卡：打卡次数（累计多少天完成）=> target_days
    var habitDays by remember { mutableStateOf("") }

    // 校验：标题必填；习惯打卡时要求打卡次数 >= 1
    val habitDaysValue = habitDays.toIntOrNull()
    val canConfirm = title.isNotBlank() &&
            (taskType == "once" || (habitDaysValue != null && habitDaysValue >= 1))

    AppStyleDialog(
        title = "发布任务",
        onDismiss = onDismiss,
        onConfirm = {
            val type = taskType
            val targetDaysVal = habitDays.toIntOrNull()?.coerceAtLeast(1) ?: 7
            onConfirm(
                TaskRequest(
                    title = title,
                    description = description.ifEmpty { null },
                    // 用户完成任务不自动发积分，由后台管理员手动添加，所以传0占位
                    points = 0,
                    type = type,
                    target_days = if (type == "habit") targetDaysVal else null
                )
            )
        },
        confirmText = "发布",
        confirmEnabled = canConfirm
    ) {
        OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("任务标题") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextBlack,
                unfocusedTextColor = TextBlack,
                focusedBorderColor = CoralPrimary,
                unfocusedBorderColor = DividerColor
            )
        )
        Spacer(modifier = Modifier.height(12.dp))
        OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("任务描述 (可选)") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextBlack,
                unfocusedTextColor = TextBlack,
                focusedBorderColor = CoralPrimary,
                unfocusedBorderColor = DividerColor
            )
        )
        // 单次任务：不显示奖励积分输入框（由后台管理员手动添加积分）
        // 习惯打卡：显示"打卡次数"输入框，值存入 target_days
        if (taskType == "habit") {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = habitDays,
                onValueChange = { habitDays = it.filter { c -> c.isDigit() } },
                label = { Text("打卡次数") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextBlack,
                    unfocusedTextColor = TextBlack,
                    focusedBorderColor = CoralPrimary,
                    unfocusedBorderColor = DividerColor
                )
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        Text("任务类型", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        Spacer(modifier = Modifier.height(8.dp))
        Row {
            FilterChip(
                selected = taskType == "once",
                onClick = { taskType = "once" },
                label = { Text("单次任务") },
                modifier = Modifier.padding(end = 8.dp),
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = CoralPrimary.copy(alpha = 0.15f),
                    selectedLabelColor = CoralPrimary
                )
            )
            FilterChip(
                selected = taskType == "habit",
                onClick = { taskType = "habit" },
                label = { Text("习惯打卡") },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = CoralPrimary.copy(alpha = 0.15f),
                    selectedLabelColor = CoralPrimary
                )
            )
        }
    }
}




