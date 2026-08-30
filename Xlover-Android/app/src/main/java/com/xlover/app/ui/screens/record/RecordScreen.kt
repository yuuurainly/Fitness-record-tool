package com.xlover.app.ui.screens.record

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
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.data.remote.dto.*
import com.xlover.app.ui.components.AppStyleDialog
import com.xlover.app.ui.theme.*
import com.xlover.app.util.SetStatusBarColor
import com.xlover.app.util.TokenManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordScreen(
    initialTab: Int = 0,
    viewModel: RecordViewModel = hiltViewModel()
) {
    var selectedTab by remember { mutableIntStateOf(initialTab) }
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(initialTab) { selectedTab = initialTab }

    LaunchedEffect(Unit) {
        if (TokenManager.isLoggedIn) viewModel.loadAll()
    }

    SetStatusBarColor(CreamBackground)

    var showAddFood by remember { mutableStateOf(false) }
    var showAddExercise by remember { mutableStateOf(false) }
    var showAddWeight by remember { mutableStateOf(false) }

    // 操作结果 Toast：统一封装成功/失败反馈，避免回调静默吞掉成败
    val onResult: (Boolean, String?, String) -> Unit = { success, msg, successMsg ->
        android.widget.Toast.makeText(
            context,
            if (success) successMsg else (msg ?: "操作失败"),
            android.widget.Toast.LENGTH_SHORT
        ).show()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                "记录",
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
                listOf("饮食", "运动", "体重").forEachIndexed { index, title ->
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
            if (uiState.isLoading && uiState.foods.isEmpty() && uiState.exercises.isEmpty() && uiState.weights.isEmpty()) {
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

            when (selectedTab) {
                0 -> FoodTab(uiState, viewModel, showAddFood, onResult) { showAddFood = it }
                1 -> ExerciseTab(uiState, viewModel, showAddExercise, onResult) { showAddExercise = it }
                2 -> WeightTab(uiState, viewModel, showAddWeight, onResult) { showAddWeight = it }
            }
        }

        // 右下角"+"按钮：和之前 Scaffold 的 FAB 同尺寸同颜色；加 padding 避免和底部导航栏/最后一条内容重叠
        FilledIconButton(
            onClick = {
                when (selectedTab) {
                    0 -> showAddFood = true
                    1 -> showAddExercise = true
                    2 -> showAddWeight = true
                }
            },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 16.dp, bottom = 24.dp)
                .size(56.dp),
            colors = IconButtonDefaults.filledIconButtonColors(
                containerColor = CoralPrimary,
                contentColor = Color.White
            )
        ) {
            Icon(Icons.Default.Add, contentDescription = "添加", modifier = Modifier.size(28.dp))
        }
    }
}

// ==================== 饮食 Tab ====================

@Composable
fun FoodTab(
    uiState: RecordUiState,
    viewModel: RecordViewModel,
    showDialog: Boolean,
    onResult: (Boolean, String?, String) -> Unit,
    onDialogChange: (Boolean) -> Unit
) {
    val foods = uiState.foods
    val summary = uiState.foodSummary

    Column(modifier = Modifier.fillMaxSize()) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                StatItem("热量", "${summary?.totalCalories ?: foods.sumOf { it.calories.toInt() }}", "kcal", CoralPrimary)
                StatItem("条数", "${foods.size}", "条", MintSecondary)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (foods.isEmpty()) {
            EmptyState("还没有饮食记录", "点击右下角添加今天的饮食")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(foods, key = { it.id }) { food ->
                    FoodItemCard(food) {
                        viewModel.deleteFood(food.id) { success, msg ->
                            onResult(success, msg, "已删除")
                        }
                    }
                }
                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }

    if (showDialog) {
        AddFoodDialog(
            onDismiss = { onDialogChange(false) },
            onConfirm = { request ->
                viewModel.addFood(request) { success, msg ->
                    onDialogChange(false)
                    onResult(success, msg, "添加成功")
                }
            }
        )
    }
}

@Composable
fun FoodItemCard(food: FoodRecordDto, onDelete: () -> Unit) {
    var showDelete by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().height(72.dp).clickable { showDelete = true },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(CoralLight.copy(alpha = 0.3f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Restaurant, contentDescription = null, tint = CoralPrimary, modifier = Modifier.size(22.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(food.food_name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium, color = TextPrimary)
                val mealLabel = when (food.meal_type) {
                    "breakfast" -> "早餐"
                    "lunch" -> "午餐"
                    "dinner" -> "晚餐"
                    else -> "加餐"
                }
                val timeStr = try { food.created_at.substring(11, 16) } catch (_: Exception) { "" }
                Text("$mealLabel · $timeStr", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${food.calories.toInt()}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = CoralPrimary)
                Text("kcal", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
        }
    }

    if (showDelete) {
        ConfirmDeleteDialog(
            title = "删除记录",
            message = "确定删除「${food.food_name}」吗？",
            onConfirm = { showDelete = false; onDelete() },
            onDismiss = { showDelete = false }
        )
    }
}

// ==================== 运动 Tab ====================

@Composable
fun ExerciseTab(
    uiState: RecordUiState,
    viewModel: RecordViewModel,
    showDialog: Boolean,
    onResult: (Boolean, String?, String) -> Unit,
    onDialogChange: (Boolean) -> Unit
) {
    val exercises = uiState.exercises
    val summary = uiState.exerciseSummary

    Column(modifier = Modifier.fillMaxSize()) {
        Card(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                StatItem("消耗", "${summary?.totalCalories ?: exercises.sumOf { it.calories_burned.toInt() }}", "kcal", CoralPrimary)
                StatItem("时长", "${summary?.totalDuration ?: exercises.sumOf { it.duration }}", "分钟", MintSecondary)
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        if (exercises.isEmpty()) {
            EmptyState("还没有运动记录", "点击右下角添加今天的运动")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(exercises, key = { it.id }) { exercise ->
                    ExerciseItemCard(exercise) {
                        viewModel.deleteExercise(exercise.id) { success, msg ->
                            onResult(success, msg, "已删除")
                        }
                    }
                }
                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }

    if (showDialog) {
        AddExerciseDialog(
            onDismiss = { onDialogChange(false) },
            onConfirm = { request ->
                viewModel.addExercise(request) { success, msg ->
                    onDialogChange(false)
                    onResult(success, msg, "添加成功")
                }
            }
        )
    }
}

@Composable
fun ExerciseItemCard(exercise: ExerciseRecordDto, onDelete: () -> Unit) {
    var showDelete by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().height(72.dp).clickable { showDelete = true },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(MintSecondary.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.DirectionsRun, contentDescription = null, tint = MintSecondary, modifier = Modifier.size(22.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(exercise.exercise_type, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium, color = TextPrimary)
                Text("${exercise.duration}分钟", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("${exercise.calories_burned.toInt()}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = MintSecondary)
                Text("kcal", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
        }
    }

    if (showDelete) {
        ConfirmDeleteDialog(
            title = "删除记录",
            message = "确定删除「${exercise.exercise_type}」吗？",
            onConfirm = { showDelete = false; onDelete() },
            onDismiss = { showDelete = false }
        )
    }
}

// ==================== 体重 Tab ====================

@Composable
fun WeightTab(
    uiState: RecordUiState,
    viewModel: RecordViewModel,
    showDialog: Boolean,
    onResult: (Boolean, String?, String) -> Unit,
    onDialogChange: (Boolean) -> Unit
) {
    val weights = uiState.weights

    Column(modifier = Modifier.fillMaxSize()) {
        if (weights.isNotEmpty()) {
            val latest = weights.last()
            Card(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CoralPrimary),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("当前体重", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.8f))
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("${latest.weight}", style = MaterialTheme.typography.displayMedium, color = Color.White, fontWeight = FontWeight.Bold)
                        Text(" kg", style = MaterialTheme.typography.titleMedium, color = Color.White.copy(alpha = 0.8f), modifier = Modifier.padding(bottom = 6.dp))
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("BMI: ${String.format("%.1f", latest.bmi ?: 0.0)}", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f))
                }
            }
            Spacer(modifier = Modifier.height(12.dp))
        }

        if (weights.isEmpty()) {
            EmptyState("还没有体重记录", "点击右下角记录今天的体重")
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(weights.reversed(), key = { it.id }) { weight ->
                    WeightItemCard(weight) {
                        viewModel.deleteWeight(weight.id) { success, msg ->
                            onResult(success, msg, "已删除")
                        }
                    }
                }
                item { Spacer(modifier = Modifier.height(80.dp)) }
            }
        }
    }

    if (showDialog) {
        AddWeightDialog(
            onDismiss = { onDialogChange(false) },
            onConfirm = { request ->
                viewModel.addWeight(request) { success, msg ->
                    onDialogChange(false)
                    onResult(success, msg, "记录成功")
                }
            }
        )
    }
}

@Composable
fun WeightItemCard(weight: WeightRecordDto, onDelete: () -> Unit) {
    var showDelete by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier.fillMaxWidth().height(72.dp).clickable { showDelete = true },
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier.size(44.dp).clip(RoundedCornerShape(12.dp))
                    .background(SkyTertiary.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.MonitorWeight, contentDescription = null, tint = SkyTertiary, modifier = Modifier.size(22.dp))
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("${weight.weight} kg", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium, color = TextPrimary)
                Text(weight.record_date, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            }
            Column(horizontalAlignment = Alignment.End) {
                Text("BMI ${String.format("%.1f", weight.bmi ?: 0.0)}", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Medium, color = SkyTertiary)
            }
        }
    }

    if (showDelete) {
        ConfirmDeleteDialog(
            title = "删除记录",
            message = "确定删除 ${weight.weight}kg 的记录吗？",
            onConfirm = { showDelete = false; onDelete() },
            onDismiss = { showDelete = false }
        )
    }
}

// ==================== 通用组件 ====================

@Composable
fun StatItem(label: String, value: String, unit: String, color: Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
        Text("$label($unit)", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
    }
}

@Composable
fun EmptyState(title: String, subtitle: String) {
    Column(
        modifier = Modifier.fillMaxSize().padding(40.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(Icons.Default.Fastfood, contentDescription = null, tint = TextSecondary.copy(alpha = 0.3f), modifier = Modifier.size(64.dp))
        Spacer(modifier = Modifier.height(16.dp))
        Text(title, style = MaterialTheme.typography.bodyMedium, color = TextSecondary, fontWeight = FontWeight.Medium)
        Spacer(modifier = Modifier.height(4.dp))
        Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextSecondary.copy(alpha = 0.7f))
    }
}

/** 删除确认对话框 - App配色风格 */
@Composable
fun ConfirmDeleteDialog(
    title: String,
    message: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title, fontWeight = FontWeight.Bold) },
        text = { Text(message) },
        confirmButton = {
            TextButton(onClick = onConfirm, colors = ButtonDefaults.textButtonColors(contentColor = ErrorRed)) {
                Text("删除")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("取消") }
        }
    )
}

// ==================== 自定义添加对话框（App配色风格）====================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddFoodDialog(onDismiss: () -> Unit, onConfirm: (FoodRequest) -> Unit) {
    var name by remember { mutableStateOf("") }
    var calories by remember { mutableStateOf("") }
    var mealType by remember { mutableStateOf("lunch") }

    // 输入校验：食物名非空 + 热量 > 0
    val canConfirm = name.isNotBlank() && (calories.toDoubleOrNull() ?: 0.0) > 0

    AppStyleDialog(
        title = "添加饮食记录",
        onDismiss = onDismiss,
        onConfirm = {
            onConfirm(
                FoodRequest(
                    food_name = name,
                    calories = calories.toDoubleOrNull() ?: 0.0,
                    protein = 0.0,
                    carbs = 0.0,
                    fat = 0.0,
                    meal_type = mealType
                )
            )
        },
        confirmText = "添加",
        confirmEnabled = canConfirm
    ) {
        OutlinedTextField(
            value = name,
            onValueChange = { name = it },
            label = { Text("食物名称") },
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
            value = calories,
            onValueChange = { calories = it.filter { c -> c.isDigit() || c == '.' } },
            label = { Text("热量 (kcal)") },
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
        Text("餐次", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
        Spacer(modifier = Modifier.height(8.dp))
        Row {
            listOf("早餐" to "breakfast", "午餐" to "lunch", "晚餐" to "dinner", "加餐" to "snack").forEach { (label, value) ->
                FilterChip(
                    selected = mealType == value,
                    onClick = { mealType = value },
                    label = { Text(label, style = MaterialTheme.typography.labelMedium) },
                    modifier = Modifier.padding(end = 6.dp),
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = CoralPrimary.copy(alpha = 0.15f),
                        selectedLabelColor = CoralPrimary
                    )
                )
            }
        }
    }
}

// 后端已内置的运动类型（MET_FALLBACK_MAP）
private val KNOWN_EXERCISE_TYPES = setOf(
    "步行", "走路", "散步", "快走", "行走",
    "跑步", "慢跑",
    "骑行", "自行车", "单车",
    "游泳", "自由泳", "蛙泳",
    "瑜伽", "普拉提", "拉伸",
    "力量训练", "举重", "健身房", "无氧",
    "跳绳", "hiit", "HIIT",
    "羽毛球", "网球", "乒乓球", "篮球", "足球"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddExerciseDialog(onDismiss: () -> Unit, onConfirm: (ExerciseRequest) -> Unit) {
    var type by remember { mutableStateOf("") }
    var duration by remember { mutableStateOf("") }
    var metValue by remember { mutableStateOf("") }

    // 判断是否需要显示 MET 输入框（未在后端内置的类型才需要）
    val isKnownType = KNOWN_EXERCISE_TYPES.any { known ->
        type.contains(known) || known.contains(type)
    }
    val showMetInput = type.isNotBlank() && !isKnownType

    // 输入校验：运动类型非空 + 时长 > 0
    val canConfirm = type.isNotBlank() && (duration.toIntOrNull() ?: 0) > 0

    AppStyleDialog(
        title = "添加运动记录",
        onDismiss = onDismiss,
        onConfirm = {
            onConfirm(
                ExerciseRequest(
                    exercise_type = type,
                    duration = duration.toIntOrNull() ?: 0,
                    calories_burned = null,  // 让后端按 MET 公式自动计算
                    met_value = if (showMetInput) metValue.toDoubleOrNull() else null
                )
            )
        },
        confirmText = "添加",
        confirmEnabled = canConfirm
    ) {
        OutlinedTextField(
            value = type,
            onValueChange = { type = it },
            label = { Text("运动类型") },
            singleLine = true,
            placeholder = { Text("如：跑步、游泳、瑜伽") },
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
            value = duration,
            onValueChange = { duration = it.filter { c -> c.isDigit() } },
            label = { Text("时长 (分钟)") },
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
        // 只有当运动类型不在后端内置列表时，才显示 MET 输入框
        if (showMetInput) {
            Spacer(modifier = Modifier.height(12.dp))
            OutlinedTextField(
                value = metValue,
                onValueChange = { metValue = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("MET 值 (运动强度)") },
                supportingText = { Text("未识别的运动类型，请填写 MET 值，参考：走路3.5 跑步9.8 游泳8.0") },
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
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "消耗热量由系统按 MET 公式自动计算",
            style = MaterialTheme.typography.bodySmall,
            color = TextSecondary
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddWeightDialog(onDismiss: () -> Unit, onConfirm: (WeightRequest) -> Unit) {
    var weight by remember { mutableStateOf("") }
    var note by remember { mutableStateOf("") }

    // 输入校验：体重在合理范围 20-300 kg，避免输入 0 或异常值
    val weightValue = weight.toDoubleOrNull() ?: 0.0
    val canConfirm = weightValue in 20.0..300.0

    AppStyleDialog(
        title = "记录体重",
        onDismiss = onDismiss,
        onConfirm = {
            onConfirm(
                WeightRequest(
                    weight = weightValue,
                    note = note.ifEmpty { null }
                )
            )
        },
        confirmText = "记录",
        confirmEnabled = canConfirm
    ) {
        OutlinedTextField(
            value = weight,
            onValueChange = { weight = it.filter { c -> c.isDigit() || c == '.' } },
            label = { Text("体重 (kg)") },
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
            value = note,
            onValueChange = { note = it },
            label = { Text("备注 (可选)") },
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
}


