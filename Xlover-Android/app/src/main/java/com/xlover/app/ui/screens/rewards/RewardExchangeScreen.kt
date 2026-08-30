package com.xlover.app.ui.screens.rewards

import android.widget.Toast
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.data.remote.dto.RewardDto
import com.xlover.app.ui.theme.*
import com.xlover.app.util.SetStatusBarColor

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun RewardExchangeScreen(
    onBack: () -> Unit,
    viewModel: RewardExchangeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val ctx = LocalContext.current

    // 显示兑换结果 Toast（成功/失败均提示一次）
    val claimMsg = uiState.claimResultMessage
    LaunchedEffect(claimMsg) {
        claimMsg?.let {
            Toast.makeText(ctx, it, Toast.LENGTH_LONG).show()
        }
    }

    SetStatusBarColor(CreamBackground)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        // 独立页面：手动加 statusBarsPadding 避免内容被状态栏遮挡
        // （MainScreen 内部页有外层 Scaffold 自动处理，但 RewardExchangeScreen 是独立路由）
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
        ) {
            // 顶部标题行：左侧返回图标 + 标题 "积分兑换"，padding 对齐进度页 top=8,bottom=4
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 8.dp, top = 8.dp, end = 16.dp, bottom = 4.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        Icons.Default.ArrowBack,
                        contentDescription = "返回",
                        tint = TextPrimary
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    "积分兑换",
                    style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
            }

            // 余额条：和"我的"页积分卡风格一致，CoralPrimary 蓝色卡片，显示当前积分+礼物图标
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CoralPrimary),
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
                            "当前积分",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                "${uiState.userPoints}",
                                style = MaterialTheme.typography.displayMedium,
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                "分",
                                style = MaterialTheme.typography.titleMedium,
                                color = Color.White.copy(alpha = 0.85f),
                                modifier = Modifier.padding(bottom = 8.dp)
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            "完成任务和打卡累计获得积分，在此兑换你想要的小奖励~",
                            style = MaterialTheme.typography.bodySmall,
                            color = Color.White.copy(alpha = 0.8f)
                        )
                    }
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.White.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        androidx.compose.material3.Icon(
                            Icons.Default.CardGiftcard,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }

            // 顶部错误条：复用 Profile/Record 风格
            uiState.errorMessage?.takeIf { it.isNotBlank() }?.let { err ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = ErrorRed.copy(alpha = 0.08f))
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            err,
                            style = MaterialTheme.typography.bodySmall,
                            color = ErrorRed,
                            modifier = Modifier.weight(1f)
                        )
                        TextButton(
                            onClick = { viewModel.load() },
                            enabled = !uiState.isLoading,
                            colors = ButtonDefaults.textButtonColors(contentColor = CoralPrimary)
                        ) {
                            Text("重试", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            if (uiState.isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(
                        color = CoralPrimary,
                        modifier = Modifier.size(28.dp),
                        strokeWidth = 2.dp
                    )
                }
            } else if (uiState.rewards.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 56.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        androidx.compose.material3.Icon(
                            Icons.Default.CardGiftcard,
                            contentDescription = null,
                            modifier = Modifier
                                .size(72.dp)
                                .clip(CircleShape)
                                .background(CreamVariant)
                                .padding(16.dp),
                            tint = TextTertiary
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            "暂时没有可兑换的奖品",
                            style = MaterialTheme.typography.titleMedium,
                            color = TextSecondary,
                            fontWeight = FontWeight.SemiBold
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "稍后再来看看吧~",
                            style = MaterialTheme.typography.bodySmall,
                            color = TextTertiary
                        )
                    }
                }
            } else {
                // 改为单列列表（LazyColumn），每项横向布局：左emoji + 中信息 + 右按钮
                LazyColumn(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                    contentPadding = PaddingValues(top = 4.dp, bottom = 80.dp)
                ) {
                    items(uiState.rewards, key = { it.id }) { reward ->
                        RewardListItem(
                            reward = reward,
                            userPoints = uiState.userPoints,
                            isClaiming = uiState.isClaiming,
                            onClaim = { viewModel.claim(reward) }
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RewardListItem(
    reward: RewardDto,
    userPoints: Int,
    isClaiming: Boolean,
    onClaim: () -> Unit
) {
    val canAfford = userPoints >= reward.points_cost
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // 左侧：emoji 图标，方形小卡片
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(CoralPrimary.copy(alpha = 0.08f)),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = reward.icon.ifBlank { "🎁" },
                    style = MaterialTheme.typography.displaySmall,
                    color = Color.Unspecified
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            // 中间：标题 + 描述 + 积分，weight(1f) 让剩余空间给右边按钮
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    reward.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = TextPrimary
                )
                if (reward.description.isNotBlank()) {
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        reward.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                        maxLines = 2
                    )
                }
                Spacer(modifier = Modifier.height(4.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "${reward.points_cost}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = CoralPrimary
                    )
                    Spacer(modifier = Modifier.width(2.dp))
                    Text(
                        "积分",
                        style = MaterialTheme.typography.bodySmall,
                        color = CoralPrimary,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // 右侧：立即兑换按钮，积分不足时按钮灰掉显示"积分不足"
            Button(
                onClick = onClaim,
                enabled = canAfford && !isClaiming,
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = CoralPrimary,
                    contentColor = Color.White,
                    disabledContainerColor = CoralPrimary.copy(alpha = 0.55f),
                    disabledContentColor = Color.White.copy(alpha = 0.9f)
                )
            ) {
                Text(
                    text = when {
                        isClaiming -> "兑换中…"
                        canAfford -> "立即兑换"
                        else -> "积分不足"
                    },
                    fontWeight = FontWeight.SemiBold
                )
            }
        }
    }
}

// @OptIn 占位：WindowInsets / WindowSizeClass 并未实际使用，保留避免编译器告警
@Suppress("unused")
private object RewardExchangeOptIns
