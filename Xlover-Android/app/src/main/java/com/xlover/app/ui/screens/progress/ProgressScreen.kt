package com.xlover.app.ui.screens.progress

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.data.remote.dto.AchievementDto
import com.xlover.app.ui.theme.*
import com.xlover.app.util.SetStatusBarColor
import com.xlover.app.util.TokenManager

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProgressScreen(
    viewModel: ProgressViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }

    LaunchedEffect(Unit) {
        if (TokenManager.isLoggedIn) viewModel.loadAll()
    }

    SetStatusBarColor(CreamBackground)

    Column(modifier = Modifier.fillMaxSize().background(CreamBackground)) {
        Text(
            "进度",
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
            listOf("体重趋势", "成就", "统计").forEachIndexed { index, title ->
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
        if (uiState.isLoading && uiState.weightRecords.isEmpty() && uiState.achievements.isEmpty()) {
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
            0 -> WeightTrendTab(uiState)
            1 -> AchievementsTab(uiState)
            2 -> StatsTab(uiState)
        }
    }
}

@Composable
fun WeightTrendTab(uiState: ProgressUiState) {
    val records = uiState.weightRecords
    val trend = uiState.weightTrend
    val startWeight = records.firstOrNull()?.weight ?: uiState.currentWeight
    val totalToLose = (startWeight - uiState.targetWeight).coerceAtLeast(0.1)
    val lostSoFar = (startWeight - uiState.currentWeight).coerceAtLeast(0.0)
    val progress = (lostSoFar / totalToLose).coerceIn(0.0, 1.0).toFloat()

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        // 当前体重卡片
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CoralPrimary),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(modifier = Modifier.fillMaxWidth().padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            "当前体重",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                "${uiState.currentWeight}",
                                style = MaterialTheme.typography.displayMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Text(
                                " kg",
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White.copy(alpha = 0.8f),
                                modifier = Modifier.padding(bottom = 6.dp)
                            )
                        }
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text(
                            "目标",
                            style = MaterialTheme.typography.bodyMedium,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "${uiState.targetWeight} kg",
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = Color.White
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        val diff = uiState.currentWeight - uiState.targetWeight
                        Text(
                            "还差 ${String.format("%.1f", diff)} kg",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.9f)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // 进度条
                Text(
                    "已减重 ${String.format("%.1f", lostSoFar)} kg (${String.format("%.0f", progress * 100)}%)",
                    style = MaterialTheme.typography.labelMedium,
                    color = Color.White.copy(alpha = 0.85f)
                )
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { progress },
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .clip(RoundedCornerShape(5.dp)),
                    color = Color.White,
                    trackColor = Color.White.copy(alpha = 0.25f)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Vico 体重趋势图卡片
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(200.dp)
                .padding(horizontal = 0.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Box(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                if (trend.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            "暂无体重数据",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextSecondary
                        )
                    }
                } else {
                    WeightChart(trend)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        // 趋势列表
        Text(
            "体重记录",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            modifier = Modifier.padding(vertical = 4.dp)
        )

        if (records.isEmpty()) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("暂无体重记录", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(records.reversed()) { record ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(CoralPrimary.copy(alpha = 0.1f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                Icons.Default.MonitorWeight,
                                contentDescription = null,
                                tint = CoralPrimary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "${record.weight} kg",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Medium,
                                color = TextPrimary
                            )
                            Text(
                                record.record_date,
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                        Text(
                            "BMI ${String.format("%.1f", record.bmi)}",
                            style = MaterialTheme.typography.labelMedium,
                            color = CoralPrimary,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    HorizontalDivider(color = DividerColor)
                }
                item { Spacer(modifier = Modifier.height(20.dp)) }
            }
        }
    }
}

/**
 * 自绘体重趋势折线图（无需 Vico，避免版本 API 不兼容）
 */
@Composable
private fun WeightChart(trend: List<WeightChartPoint>) {
    val labelColor = TextSecondary
    val lineColor = CoralPrimary
    val gridColor = DividerColor.copy(alpha = 0.5f)

    // 把 Paint 实例提到 remember，避免在 Canvas 的 draw 阶段每帧 new Paint 造成内存抖动。
    // draw 阶段只更新 color 和 textSize（依赖 density/sp 转换，必须在 DrawScope 内设置）。
    val yLabelPaint = remember {
        android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = android.graphics.Paint.Align.RIGHT
        }
    }
    val xLabelPaint = remember {
        android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = android.graphics.Paint.Align.CENTER
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            if (trend.size < 2) return@Canvas

            val paddingLeft = 42.dp.toPx()
            val paddingBottom = 28.dp.toPx()
            val paddingTop = 16.dp.toPx()
            val paddingRight = 16.dp.toPx()

            val chartWidth = size.width - paddingLeft - paddingRight
            val chartHeight = size.height - paddingBottom - paddingTop

            val minWeight = trend.minOf { it.weight } - 0.5f
            val maxWeight = trend.maxOf { it.weight } + 0.5f
            val weightRange = (maxWeight - minWeight).coerceAtLeast(0.1f)

            // 横向网格线 + Y 轴 label
            val ySteps = 4
            for (i in 0..ySteps) {
                val yRatio = i / ySteps.toFloat()
                val y = paddingTop + chartHeight * (1 - yRatio)
                drawLine(
                    color = gridColor,
                    start = Offset(paddingLeft, y),
                    end = Offset(size.width - paddingRight, y),
                    strokeWidth = 1f
                )
                val label = "%.1f".format(minWeight + weightRange * yRatio)
                yLabelPaint.color = labelColor.value.toInt()
                yLabelPaint.textSize = 10.sp.toPx()
                drawContext.canvas.nativeCanvas.drawText(
                    label,
                    paddingLeft - 8.dp.toPx(),
                    y + 4.dp.toPx(),
                    yLabelPaint
                )
            }

            // X 轴 label（起点、中点、终点）
            val indices = listOf(0, trend.size / 2, trend.size - 1).distinct()
            indices.forEach { idx ->
                val xRatio = idx / (trend.size - 1).toFloat()
                val x = paddingLeft + chartWidth * xRatio
                xLabelPaint.color = labelColor.value.toInt()
                xLabelPaint.textSize = 10.sp.toPx()
                drawContext.canvas.nativeCanvas.drawText(
                    trend[idx].date,
                    x,
                    size.height - 6.dp.toPx(),
                    xLabelPaint
                )
            }

            // 数据点坐标
            val points = trend.mapIndexed { index, point ->
                val xRatio = if (trend.size > 1) index / (trend.size - 1).toFloat() else 0f
                val x = paddingLeft + chartWidth * xRatio
                val yRatio = (point.weight - minWeight) / weightRange
                val y = paddingTop + chartHeight * (1 - yRatio)
                Offset(x, y)
            }

            // 折线路径
            val path = Path().apply {
                points.forEachIndexed { i, p ->
                    if (i == 0) moveTo(p.x, p.y) else lineTo(p.x, p.y)
                }
            }
            drawPath(
                path = path,
                color = lineColor,
                style = Stroke(width = 3.dp.toPx(), cap = StrokeCap.Round)
            )

            // 数据点
            points.forEach { p ->
                drawCircle(color = Color.White, radius = 4.dp.toPx(), center = p)
                drawCircle(color = lineColor, radius = 2.5.dp.toPx(), center = p)
            }
        }
    }
}

@Composable
fun AchievementsTab(uiState: ProgressUiState) {
    val achievements = uiState.achievements
    val unlockedCount = achievements.count { it.unlocked }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        // 进度概览
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.SpaceAround
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "$unlockedCount",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = CoralPrimary
                    )
                    Text("已解锁", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "${achievements.size - unlockedCount}",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = TextSecondary
                    )
                    Text("未解锁", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        "${achievements.size}",
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold,
                        color = MintSecondary
                    )
                    Text("总成就", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyVerticalGrid(
            columns = GridCells.Fixed(3),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.fillMaxSize()
        ) {
            items(achievements) { achievement ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(1f),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (achievement.unlocked) CreamSurface else CreamVariant
                    ),
                    elevation = CardDefaults.cardElevation(defaultElevation = if (achievement.unlocked) 4.dp else 0.dp)
                ) {
                    Box(modifier = Modifier.fillMaxSize()) {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(12.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                achievement.icon,
                                style = MaterialTheme.typography.headlineMedium,
                                color = Color.Unspecified
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                achievement.title,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Medium,
                                color = if (achievement.unlocked) TextPrimary else TextSecondary.copy(alpha = 0.5f),
                                maxLines = 1
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                achievement.description,
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary.copy(alpha = if (achievement.unlocked) 0.8f else 0.4f),
                                maxLines = 2
                            )
                        }
                        // 未解锁：灰色遮罩 + 锁图标
                        if (!achievement.unlocked) {
                            Box(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(TextSecondary.copy(alpha = 0.18f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    Icons.Default.Lock,
                                    contentDescription = "未解锁",
                                    tint = Color.White,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }
                }
            }
            item { Spacer(modifier = Modifier.height(20.dp)) }
        }
    }
}

@Composable
fun StatsTab(uiState: ProgressUiState) {
    val stats = uiState.stats
    val s = stats ?: com.xlover.app.data.remote.dto.StatsData(
        totalCheckins = 0, maxStreak = 0, totalExerciseMinutes = 0,
        totalExerciseCalories = 0, totalWeightLost = 0.0, completedTasks = 0,
        totalPoints = 0, week = com.xlover.app.data.remote.dto.WeekStats(0, 0, 0)
    )

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text(
            "本周数据",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            modifier = Modifier.padding(vertical = 4.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            StatCard("摄入热量", "${s.week.caloriesConsumed}", "kcal", CoralPrimary, Modifier.weight(1f))
            Spacer(modifier = Modifier.width(12.dp))
            StatCard("消耗热量", "${s.week.caloriesBurned}", "kcal", MintSecondary, Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(12.dp))
        StatCard("运动时长", "${s.week.exerciseMinutes}", "分钟", SkyTertiary, Modifier.fillMaxWidth())

        Spacer(modifier = Modifier.height(20.dp))

        Text(
            "累计数据",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = TextPrimary,
            modifier = Modifier.padding(vertical = 4.dp)
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            StatCard("总打卡", "${s.totalCheckins}", "次", CoralPrimary, Modifier.weight(1f))
            Spacer(modifier = Modifier.width(12.dp))
            StatCard("最长连续", "${s.maxStreak}", "天", MintSecondary, Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            StatCard("累计运动", "${s.totalExerciseMinutes}", "分钟", SkyTertiary, Modifier.weight(1f))
            Spacer(modifier = Modifier.width(12.dp))
            StatCard("累计减重", "${s.totalWeightLost}", "kg", CoralLight, Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            StatCard("完成任务", "${s.completedTasks}", "个", MintSecondary, Modifier.weight(1f))
            Spacer(modifier = Modifier.width(12.dp))
            StatCard("总积分", "${s.totalPoints}", "分", CoralPrimary, Modifier.weight(1f))
        }
        Spacer(modifier = Modifier.height(20.dp))
    }
}

@Composable
fun StatCard(title: String, value: String, unit: String, color: Color, modifier: Modifier = Modifier) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = color)
                Spacer(modifier = Modifier.width(2.dp))
                Text(unit, style = MaterialTheme.typography.labelMedium, color = TextSecondary, modifier = Modifier.padding(bottom = 3.dp))
            }
        }
    }
}

private fun Double.ifZero(block: () -> Double): Double = if (this == 0.0) block() else this
