package com.xlover.app.ui.screens.guide

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.ui.theme.*
import com.xlover.app.util.SetStatusBarColor

@Composable
fun GuideScreen(
    onGuideComplete: () -> Unit = {},
    viewModel: GuideViewModel = hiltViewModel()
) {
    SetStatusBarColor(color = CreamBackground, darkIcons = true)
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val density = LocalDensity.current

    // 通过 ime 的底部 padding 判断键盘是否可见（adjustNothing + imePadding 组合）
    val imeBottomPaddingValues = WindowInsets.ime.asPaddingValues()
    val imeBottomPx = with(density) { imeBottomPaddingValues.calculateBottomPadding().toPx() }
    val imeVisible = imeBottomPx > 2f
    val iconSize: Dp = 160.dp
    val spacerAfterIndicator: Dp = 24.dp
    val buttonsTopPadding: Dp = 32.dp
    val buttonsBottomPadding: Dp = 32.dp
    val slideAnimMs = 300

    LaunchedEffect(uiState.isComplete) {
        if (uiState.isComplete) {
            onGuideComplete()
        }
    }
    // 错误消息以 Toast 形式反馈，避免静默吞掉
    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let {
            android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    // 动画时长（单位ms），滑动到居中位置用
    val slideAnimSpec = tween<Dp>(durationMillis = slideAnimMs, easing = FastOutSlowInEasing)

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        // 整个可视区高度（已受 imePadding 影响，自动等于"状态栏下到键盘顶"）
        val availableHeight = this@BoxWithConstraints.maxHeight

        // 内容各部分固定高度（单位 dp，手动对齐下方真实组件，保证居中计算一致）
        val indicatorH: Dp = 10.dp // StepIndicator 小圆点实际高度
        // 头部区域已按用户要求删除（图标+标题+副标题的红框）
        val headAreaH: Dp = 0.dp
        // 输入卡片及内部 padding 高度估算（性别+4个字段）
        val profileCardH: Dp = 560.dp
        // 完成按钮区高度（+ 上下 padding）
        val buttonsAreaH: Dp = 48.dp + buttonsTopPadding + buttonsBottomPadding

        // 可视内容总高（不含顶部 spacer）：指示器 + 指示后间隔 + 卡片 + 按钮区
        val contentH = indicatorH + spacerAfterIndicator + profileCardH + buttonsAreaH

        // 目标顶部 spacer：把内容居中到可视区；内容比屏幕高就贴顶(0)
        val targetTopSpacer: Dp = ((availableHeight - contentH) / 2).coerceAtLeast(0.dp)

        // 顶部 spacer 高度通过 animateDpAsState 做 250ms 插值 → 内容区"慢慢滑到中间"
        val topSpacer: Dp by animateDpAsState(
            targetValue = targetTopSpacer,
            animationSpec = slideAnimSpec,
            label = "guide_top_spacer"
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 24.dp)
                .imePadding()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 动态顶部间距：250ms 插值驱动整个内容块上下滑动
            Spacer(modifier = Modifier.height(topSpacer))

            StepIndicator(currentStep = uiState.currentStep, totalSteps = 1)
            Spacer(modifier = Modifier.height(spacerAfterIndicator))

            AnimatedContent(
                targetState = uiState.currentStep,
                transitionSpec = {
                    if (targetState > initialState) {
                        (slideInHorizontally { it }).togetherWith(slideOutHorizontally { -it })
                    } else {
                        (slideInHorizontally { -it }).togetherWith(slideOutHorizontally { it })
                    }
                },
                label = "guide_step"
            ) { step ->
                when (step) {
                    0 -> ProfileStep(
                        gender = uiState.gender,
                        age = uiState.age,
                        height = uiState.height,
                        currentWeight = uiState.currentWeight,
                        targetWeight = uiState.targetWeight,
                        onFieldChange = viewModel::updateField
                    )
                    else -> Box {}
                }
            }

            if (uiState.currentStep == 0) {
                // 强制校验：所有字段非空且合理，按钮才允许点击
                val heightV = uiState.height.toDoubleOrNull()
                val weightV = uiState.currentWeight.toDoubleOrNull()
                val targetV = uiState.targetWeight.toDoubleOrNull()
                val ageV = uiState.age.toIntOrNull()
                val canSubmit =
                    heightV != null && heightV in 100.0..250.0 &&
                    weightV != null && weightV in 20.0..300.0 &&
                    targetV != null && targetV in 20.0..300.0 &&
                    ageV != null && ageV in 5..120

                Spacer(modifier = Modifier.height(buttonsTopPadding))
                Button(
                    onClick = viewModel::submitProfileAndComplete,
                    enabled = canSubmit && !uiState.isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = CoralPrimary,
                        contentColor = Color.White,
                        disabledContainerColor = CoralPrimary.copy(alpha = 0.55f),
                        disabledContentColor = Color.White.copy(alpha = 0.9f)
                    )
                ) {
                    if (uiState.isLoading) {
                        CircularProgressIndicator(
                            color = Color.White,
                            modifier = Modifier.size(22.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text(
                            text = "完成，进入首页",
                            color = Color.White,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                Spacer(modifier = Modifier.height(buttonsBottomPadding))
            }
        }
    }
}

@Composable
private fun StepIndicator(currentStep: Int, totalSteps: Int) {
    Row(
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        repeat(totalSteps) { index ->
            Box(
                modifier = Modifier
                    .size(if (index == currentStep) 10.dp else 8.dp)
                    .clip(CircleShape)
                    .background(
                        if (index <= currentStep) CoralPrimary else CoralLight
                    )
            )
        }
    }
}

@Composable
private fun ProfileStep(
    gender: String,
    age: String,
    height: String,
    currentWeight: String,
    targetWeight: String,
    onFieldChange: (String, String) -> Unit
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // 用户红框（📊图标 + 标题 + 副标题）已按要求整体删除
        // 键盘弹起时头部隐藏，输入卡片（下方红框）直接紧贴指示器上方，位置明显提高
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                // 性别选择
                Text("性别", style = MaterialTheme.typography.titleMedium, color = TextSecondary)
                Spacer(modifier = Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    FilterChip(
                        selected = gender == "male",
                        onClick = { onFieldChange("gender", "male") },
                        label = { Text("男") },
                        modifier = Modifier.weight(1f),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = CoralPrimary.copy(alpha = 0.1f),
                            selectedLabelColor = CoralPrimary
                        )
                    )
                    FilterChip(
                        selected = gender == "female",
                        onClick = { onFieldChange("gender", "female") },
                        label = { Text("女") },
                        modifier = Modifier.weight(1f),
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = CoralPrimary.copy(alpha = 0.1f),
                            selectedLabelColor = CoralPrimary
                        )
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))

                LabeledField("年龄", age, "岁", "请输入年龄") { onFieldChange("age", it) }
                Spacer(modifier = Modifier.height(12.dp))
                LabeledField("身高", height, "cm", "请输入身高") { onFieldChange("height", it) }
                Spacer(modifier = Modifier.height(12.dp))
                LabeledField("当前体重", currentWeight, "kg", "请输入当前体重") { onFieldChange("currentWeight", it) }
                Spacer(modifier = Modifier.height(12.dp))
                LabeledField("目标体重", targetWeight, "kg", "请输入目标体重") { onFieldChange("targetWeight", it) }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LabeledField(
    label: String,
    value: String,
    unit: String,
    placeholder: String,
    onValueChange: (String) -> Unit
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.width(80.dp)
        )
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.weight(1f),
            placeholder = {
                Text(
                    text = placeholder,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextTertiary
                )
            },
            trailingIcon = { Text(unit, color = TextTertiary, style = MaterialTheme.typography.bodySmall) },
            singleLine = true,
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


