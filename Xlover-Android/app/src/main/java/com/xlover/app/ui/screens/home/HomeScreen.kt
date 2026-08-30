package com.xlover.app.ui.screens.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.data.remote.dto.DashboardResponse
import com.xlover.app.ui.components.ActivityLevelDialog
import com.xlover.app.ui.components.AppStyleDialog
import com.xlover.app.ui.components.ServerUrlDialog
import com.xlover.app.ui.theme.*
import com.xlover.app.util.AppState
import com.xlover.app.util.SetStatusBarColor

// UI 模型
private data class UiFoodItem(
    val name: String,
    val calories: Int,
    val mealType: String,
    val time: String
)

private data class UiExerciseItem(
    val name: String,
    val duration: Int,
    val calories: Int,
    val icon: String
)

@Composable
fun HomeScreen(
    onNavigateToRecord: (Int) -> Unit = {},
    onNavigateToProgress: () -> Unit = {},
    onNavigateToTask: () -> Unit = {},
    onNavigateToMessage: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    SetStatusBarColor(color = CreamBackground, darkIcons = true)
    val uiState by viewModel.uiState.collectAsState()
    val todayTasks by viewModel.todayTasks.collectAsState()
    val waterGoal by viewModel.waterGoal.collectAsState()

    // 活动水平选择弹框：未选时点击"TDEE / 选择活动水平"弹出；已选时也可以随时点 TDEE 文字重新选
    var showActivityLevelDialog by remember { mutableStateOf(false) }
    var submittingActivityLevel by remember { mutableStateOf(false) }

    // 服务器地址修改弹框：FailureTracker 连续失败 N 次后由 AppState 触发
    var showServerUrlDialog by remember { mutableStateOf(false) }
    // 注意：lastSeenEvent 不再使用 remember（切Tab会重置），改为 AppState 单例内部的 consumed 计数器
    // 监听 AppState.requestOpenServerUrlDialog
    LaunchedEffect(AppState.requestOpenServerUrlDialog) {
        if (AppState.takeOpenServerUrlDialogEvent()) {
            showServerUrlDialog = true
        }
    }
    // 监听 AppState.requestOpenActivityLevel（通知点击 / 周一定时 Worker 立即触发）
    LaunchedEffect(AppState.requestOpenActivityLevel) {
        if (AppState.takeOpenActivityLevelEvent()) {
            showActivityLevelDialog = true
        }
    }

    // 页面可见时刷新数据
    LaunchedEffect(Unit) {
        viewModel.refresh()
    }

    // 服务器地址修改弹框（任何状态下都能显示，避免加载失败时被遮住）
    if (showServerUrlDialog) {
        ServerUrlDialog(
            onDismiss = { showServerUrlDialog = false },
            onChanged = { /* 保存成功后 Dashboard 自动生效，用户点重试即可刷新 */ }
        )
    }

    when (val state = uiState) {
        is HomeUiState.Loading -> {
            Box(modifier = Modifier.fillMaxSize().background(CreamBackground), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = CoralPrimary)
            }
        }
        is HomeUiState.Error -> {
            Box(modifier = Modifier.fillMaxSize().background(CreamBackground), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("加载失败", style = MaterialTheme.typography.titleMedium, color = TextSecondary)
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(state.message, style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = { viewModel.loadDashboard() },
                        modifier = Modifier.height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = CoralPrimary)
                    ) {
                        Text("重试")
                    }
                }
            }
        }
        is HomeUiState.Success -> {
            MainHomeContent(
                dashboard = state.data,
                todayTasks = todayTasks,
                waterGoal = waterGoal,
                onNavigateToRecord = onNavigateToRecord,
                onNavigateToProgress = onNavigateToProgress,
                onNavigateToTask = onNavigateToTask,
                onNavigateToMessage = onNavigateToMessage,
                onDrinkWater = { viewModel.drinkWater(state.data.waterToday) },
                onSetWaterGoal = { viewModel.setWaterGoal(it) },
                onShowActivityLevelDialog = { showActivityLevelDialog = true }
            )

            // 活动水平选择弹框
            if (showActivityLevelDialog) {
                ActivityLevelDialog(
                    currentLevelKey = state.data.profile.activityLevel,
                    onDismiss = {
                        showActivityLevelDialog = false
                        submittingActivityLevel = false
                    },
                    onConfirm = { levelKey, factor ->
                        submittingActivityLevel = true
                        viewModel.updateActivityLevel(levelKey, factor) { success, _ ->
                            submittingActivityLevel = false
                            if (success) showActivityLevelDialog = false
                        }
                    },
                    isSubmitting = submittingActivityLevel
                )
            }
        }
    }
}

@Composable
private fun MainHomeContent(
    dashboard: DashboardResponse?,
    todayTasks: List<com.xlover.app.data.remote.dto.TaskDto>,
    waterGoal: Int,
    onNavigateToRecord: (Int) -> Unit = {},
    onNavigateToProgress: () -> Unit = {},
    onNavigateToTask: () -> Unit = {},
    onNavigateToMessage: () -> Unit = {},
    onDrinkWater: () -> Unit = {},
    onSetWaterGoal: (Int) -> Unit = {},
    onShowActivityLevelDialog: () -> Unit = {},
) {
    // 身体数据是否缺失 - 此逻辑已删除（GuideScreen已强制填写，不再用"待填写"占位）
    val nickname = dashboard?.user?.nickname ?: "用户"
    val avatar = dashboard?.user?.avatar ?: "😊"
    val streakDays = dashboard?.user?.streakDays ?: 0
    // 当前体重展示：若今日有体重记录则显示记录值，否则显示"记录体重"点击跳转
    val todayWeightRecorded = dashboard?.weightProgress?.todayWeightRecorded == true
    val todayWeightValue: Double? = dashboard?.weightProgress?.todayWeightValue
    // lastKnownWeight：进度计算用（没记录时用后端返回的起始/上次最新值兜底），不影响显示
    val lastKnownWeight = dashboard?.weightProgress?.current ?: 65.0
    val targetWeight = dashboard?.profile?.targetWeight ?: 55.0
    // 起始体重 = 后端 profile.startWeight / weightProgress.start，保证 = 用户首次填写的体重
    val startWeight = dashboard?.weightProgress?.start ?: (dashboard?.profile?.startWeight ?: lastKnownWeight)
    val todayCalories = dashboard?.todayCalories?.consumed ?: 0
    val burnedCalories = dashboard?.todayCalories?.burned ?: 0
    val netCalories = todayCalories - burnedCalories
    // 活动水平是否已选：未选则不显示进度条，TDEE 文字改为"选择活动水平"可点击
    val activitySelected = dashboard?.profile?.activityFactorSelected == true
            && dashboard.profile.dailyMaxCalories != null
    // TDEE = dailyMaxCalories，未选活动水平时为 null
    val dailyMax: Int? = if (activitySelected) {
        dashboard?.profile?.dailyMaxCalories ?: dashboard?.todayCalories?.goal
    } else null
    // TDEE-500 红线：超过此值进度条变全红（仅活动水平已选时使用）
    val tdeeMinus500 = if (dailyMax != null) (dailyMax - 500).coerceAtLeast(0) else 0
    val overLimit = dailyMax != null && netCalories > tdeeMinus500
    // 进度：净热量 / TDEE（0~1 范围）；未选活动水平时不显示进度条
    val progress = if (dailyMax != null && dailyMax > 0) {
        (netCalories.toFloat() / dailyMax.coerceAtLeast(1)).coerceIn(0f, 1f)
    } else 0f
    val weightProgress = dashboard?.weightProgress?.percentage
        ?: ((lastKnownWeight - targetWeight) / (startWeight - targetWeight + 0.1) * 100).toInt().coerceIn(0, 100)
    val waterIntake = dashboard?.waterToday ?: 0
    // 今日未完成任务数（stat 第三项"任务"显示用）：0 显示"暂无"两字，>0 时才可点击跳转
    val pendingTaskCount = dashboard?.pendingTaskCount
        ?: (todayTasks.size - todayTasks.count { it.status == "completed" }).coerceAtLeast(0)
    val pendingTaskDisplay = if (pendingTaskCount <= 0) "暂无" else pendingTaskCount.toString()

    // 打卡逻辑：当天有任意记录就算已打卡
    val hasCheckedIn = dashboard?.todayFoods?.isNotEmpty() == true ||
        dashboard?.todayExercises?.isNotEmpty() == true

    val foods: List<UiFoodItem> = dashboard?.todayFoods?.map {
        UiFoodItem(it.name, it.calories, it.mealType, it.time)
    } ?: emptyList()

    val exercises: List<UiExerciseItem> = dashboard?.todayExercises?.map {
        UiExerciseItem(it.name, it.duration, it.calories, it.icon)
    } ?: emptyList()

    var showWaterGoalDialog by remember { mutableStateOf(false) }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // 1. 顶部问候卡
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = CreamSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "早上好，$nickname",
                                style = MaterialTheme.typography.headlineMedium,
                                color = TextPrimary,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = if (hasCheckedIn) "今日已打卡，连续第 $streakDays 天，继续加油！"
                                       else "今天还没记录哦，快开始吧！",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(CircleShape)
                                .background(CoralPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(avatar, fontSize = 22.sp, color = Color.White)
                        }
                    }
                }
            }

            // 2. 今日数据卡：体重进度 + 卡路里 + 喝水
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    // 体重进度卡
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = CreamSurface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
                        onClick = onNavigateToProgress
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("减重目标", style = MaterialTheme.typography.titleLarge, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                                Text("$weightProgress%", style = MaterialTheme.typography.titleLarge, color = CoralPrimary, fontWeight = FontWeight.Bold)
                            }
                            Spacer(modifier = Modifier.height(12.dp))
                            LinearProgressIndicator(
                                progress = { weightProgress / 100f },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(8.dp)
                                    .clip(CircleShape),
                                color = CoralPrimary,
                                trackColor = CreamVariant
                            )
                            Spacer(modifier = Modifier.height(12.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("起始 ${String.format("%.1f", startWeight)}kg", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                                Text(
                                    text = if (todayWeightRecorded && todayWeightValue != null)
                                        "当前 ${String.format("%.1f", todayWeightValue)}kg"
                                    else "记录体重",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (todayWeightRecorded) CoralPrimary else CoralPrimary.copy(alpha = 0.85f),
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier.clickable {
                                        if (!todayWeightRecorded) onNavigateToRecord(2)
                                    }
                                )
                                Text("目标 ${String.format("%.1f", targetWeight)}kg", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                            }
                        }
                    }

                    // 卡路里卡
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = CreamSurface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text("今日净热量", style = MaterialTheme.typography.titleMedium, color = TextSecondary)
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(
                                    text = "$netCalories",
                                    style = MaterialTheme.typography.displayMedium,
                                    color = CoralPrimary,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(" kcal", style = MaterialTheme.typography.titleMedium, color = TextSecondary, modifier = Modifier.padding(bottom = 8.dp))
                            }
                            Spacer(modifier = Modifier.height(16.dp))
                            // 进度条：仅活动水平已选时显示；净摄入超过 TDEE-500 时整段变红，否则蓝色（无标记点）
                            if (activitySelected && dailyMax != null) {
                                LinearProgressIndicator(
                                    progress = { progress },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(10.dp)
                                        .clip(CircleShape),
                                    color = if (overLimit) ErrorRed else CoralPrimary,
                                    trackColor = CreamVariant
                                )
                                Spacer(modifier = Modifier.height(8.dp))
                            }
                            // TDEE 行：未选活动水平时显示"选择活动水平"引导点击，已选时显示正常文字且可点击重新选择
                            Text(
                                text = if (activitySelected && dailyMax != null)
                                    "摄入 $todayCalories / TDEE $dailyMax kcal"
                                else "选择活动水平",
                                style = MaterialTheme.typography.bodySmall,
                                color = if (activitySelected) TextTertiary else CoralPrimary,
                                fontWeight = if (activitySelected) FontWeight.Normal else FontWeight.SemiBold,
                                modifier = Modifier.clickable(onClick = onShowActivityLevelDialog)
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                StatItem("摄入", "$todayCalories", CoralPrimary, "kcal")
                                VerticalDivider()
                                StatItem("消耗", "$burnedCalories", MintSecondary, "kcal")
                                VerticalDivider()
                                // 原来的"净热量"与上方大数字重复 → 改为"任务"显示未完成任务数；>0时点击跳转到任务-进行中；=0显示"暂无"
                                val taskClickable = if (pendingTaskCount > 0) {
                                    Modifier.clickable(onClick = onNavigateToTask)
                                } else Modifier
                                StatItem("任务", pendingTaskDisplay, SkyTertiary, "", taskClickable)
                            }
                        }
                    }

                    // 喝水卡 - 点击增加喝水
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = CreamSurface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable {
                                    if (waterIntake < waterGoal) onDrinkWater()
                                }
                                .padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(44.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(MintSecondary.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(Icons.Default.WaterDrop, contentDescription = "喝水", tint = MintSecondary, modifier = Modifier.size(24.dp))
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("今日喝水", style = MaterialTheme.typography.titleMedium, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    if (waterIntake >= waterGoal) "已达成目标！" else "点击图标喝水",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = TextSecondary
                                )
                            }
                            Column(horizontalAlignment = Alignment.End) {
                                Text("$waterIntake/$waterGoal", style = MaterialTheme.typography.titleLarge, color = MintSecondary, fontWeight = FontWeight.Bold)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("杯", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
                            }
                            // 设置目标按钮
                            IconButton(onClick = { showWaterGoalDialog = true }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Default.Settings, contentDescription = "设置目标", tint = TextTertiary, modifier = Modifier.size(18.dp))
                            }
                        }
                    }
                }
            }

            // 3. 今日任务卡
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = CreamSurface),
                    elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("今日任务", style = MaterialTheme.typography.titleLarge, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                            Text(
                                "${todayTasks.count { it.status == "completed" }}/${todayTasks.size}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = CoralPrimary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                        if (todayTasks.isEmpty()) {
                            Text(
                                "暂无任务，去任务页创建吧",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextTertiary
                            )
                        } else {
                            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                todayTasks.forEach { task ->
                                    val done = task.status == "completed"
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Box(
                                            modifier = Modifier
                                                .size(22.dp)
                                                .clip(CircleShape)
                                                .background(if (done) SuccessGreen else CreamVariant),
                                            contentAlignment = Alignment.Center
                                        ) {
                                            if (done) {
                                                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(14.dp))
                                            }
                                        }
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Text(
                                            task.title,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = if (done) TextTertiary else TextPrimary,
                                            fontWeight = if (done) FontWeight.Normal else FontWeight.Medium
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // 4. 快捷记录入口
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("快捷记录", style = MaterialTheme.typography.titleLarge, color = TextPrimary, fontWeight = FontWeight.SemiBold)
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        QuickActionCard("饮食", Icons.Default.Restaurant, CoralPrimary, "${foods.size} 条", Modifier.weight(1f)) { onNavigateToRecord(0) }
                        QuickActionCard("运动", Icons.Default.DirectionsRun, MintSecondary, "${exercises.size} 次", Modifier.weight(1f)) { onNavigateToRecord(1) }
                        QuickActionCard(
                            "体重",
                            Icons.Default.MonitorWeight,
                            SkyTertiary,
                            if (todayWeightRecorded && todayWeightValue != null) "${String.format("%.1f", todayWeightValue)}kg"
                            else "今日待记录",
                            Modifier.weight(1f)
                        ) { onNavigateToRecord(2) }
                    }
                }
            }

            // 5. 今日记录（饮食 + 运动）
            item {
                Text("今日记录", style = MaterialTheme.typography.titleLarge, color = TextPrimary, fontWeight = FontWeight.SemiBold)
            }

            items(foods) { food ->
                RecordItem(
                    icon = when (food.mealType) {
                        "breakfast" -> "🌅"
                        "lunch" -> "☀️"
                        "dinner" -> "🌙"
                        else -> "🍎"
                    },
                    title = food.name,
                    subtitle = food.time,
                    value = "${food.calories} kcal",
                    valueColor = CoralPrimary
                )
            }

            items(exercises) { exercise ->
                RecordItem(
                    icon = exercise.icon,
                    title = exercise.name,
                    subtitle = "${exercise.duration} 分钟",
                    value = "-${exercise.calories} kcal",
                    valueColor = MintSecondary
                )
            }

            item { Spacer(modifier = Modifier.height(16.dp)) }
        }
    }

    // 喝水目标设置对话框（沿用统一 AppStyleDialog 设计：CreamSurface + 20dp圆角 + 右下取消/确定按钮）
    if (showWaterGoalDialog) {
        var input by remember(waterGoal) { mutableStateOf(waterGoal.toString()) }
        val numeric = input.filter { it.isDigit() }
        val cups = numeric.toIntOrNull()
        val canConfirm = cups != null && cups in 1..20
        AppStyleDialog(
            title = "设置每日喝水目标",
            onDismiss = { showWaterGoalDialog = false },
            onConfirm = {
                cups?.let { onSetWaterGoal(it) }
                showWaterGoalDialog = false
            },
            confirmText = "确定",
            confirmEnabled = canConfirm
        ) {
            Text(
                "每天目标喝几杯水？",
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary
            )
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = input,
                onValueChange = { raw ->
                    // 只保留数字；首字符0则去掉，并且最多只允许 2 位数（范围上限 20）
                    val digits = raw.filter { c -> c.isDigit() }.trimStart('0').ifEmpty { "0" }
                    input = if (digits.length > 2) digits.take(2) else digits
                },
                label = { Text("杯数 (1-20)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextBlack,
                    unfocusedTextColor = TextBlack,
                    focusedBorderColor = CoralPrimary,
                    unfocusedBorderColor = DividerColor,
                    focusedLabelColor = CoralPrimary
                )
            )
        }
    }
}

@Composable
private fun StatItem(
    label: String,
    value: String,
    color: Color,
    unit: String,
    modifier: Modifier = Modifier
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = modifier
    ) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color, fontWeight = FontWeight.Bold)
        Text("$label $unit", style = MaterialTheme.typography.bodySmall, color = TextTertiary)
    }
}

@Composable
private fun VerticalDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(40.dp)
            .background(DividerColor)
    )
}

@Composable
private fun QuickActionCard(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, color: Color, subtitle: String, modifier: Modifier = Modifier, onClick: () -> Unit = {}) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
        onClick = onClick
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 16.dp, horizontal = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(20.dp))
            }
            Spacer(modifier = Modifier.height(8.dp))
            Text(title, style = MaterialTheme.typography.bodyMedium, color = TextPrimary, fontWeight = FontWeight.SemiBold)
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextTertiary)
        }
    }
}

@Composable
private fun RecordItem(
    icon: String,
    title: String,
    subtitle: String,
    value: String,
    valueColor: Color,
    showActions: Boolean = false
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(CreamVariant),
                contentAlignment = Alignment.Center
            ) {
                Text(icon, fontSize = 18.sp)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, style = MaterialTheme.typography.titleMedium, color = TextPrimary, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextTertiary)
            }
            Text(value, style = MaterialTheme.typography.titleMedium, color = valueColor, fontWeight = FontWeight.SemiBold)
            if (showActions) {
                Spacer(modifier = Modifier.width(8.dp))
                Icon(Icons.Default.FavoriteBorder, contentDescription = null, tint = TextTertiary, modifier = Modifier.size(18.dp))
            }
        }
    }
}



