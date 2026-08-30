package com.xlover.app.ui.screens.profile

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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.ui.components.AppStyleDialog
import com.xlover.app.ui.components.ServerUrlDialog
import com.xlover.app.ui.theme.*
import com.xlover.app.util.ServerUrlManager
import com.xlover.app.util.SetStatusBarColor
import com.xlover.app.util.TokenManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onLogout: () -> Unit = {},
    onNavigateToRewardExchange: () -> Unit = {},
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showEditProfile by remember { mutableStateOf(false) }
    var showPointsHistory by remember { mutableStateOf(false) }
    var showServerSettings by remember { mutableStateOf(false) }
    var currentServerDisplay by remember { mutableStateOf(ServerUrlManager.display()) }
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        if (TokenManager.isLoggedIn) {
            viewModel.loadProfile()
            viewModel.loadPointsHistory()
        }
    }
    // 每次 ServerSettingsDialog 关闭后刷新显示
    LaunchedEffect(showServerSettings) {
        currentServerDisplay = ServerUrlManager.display()
    }

    SetStatusBarColor(CreamBackground)

    val nickname = uiState.user?.nickname ?: "用户"
    val currentWeight = uiState.profile?.current_weight ?: 65.0
    val targetWeight = uiState.profile?.target_weight ?: 55.0
    val height = uiState.profile?.height ?: 170.0
    // 起始体重 = profile.start_weight（DB），无值则兜底 current_weight；资料编辑弹窗用
    val startWeight = (uiState.profile?.start_weight?.takeIf { it > 0 }) ?: currentWeight
    // 喝水目标 = profile.water_goal（DB），默认 8 杯
    val waterGoal = uiState.profile?.water_goal?.takeIf { it in 1..20 } ?: 8
    val bmi = uiState.profile?.bmi ?: 22.5
    val points = uiState.points

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground),
        contentPadding = PaddingValues(bottom = 24.dp)
    ) {
        // 顶部错误条：消费 uiState.error，避免 loadProfile 失败被静默吞掉
        uiState.error?.takeIf { it.isNotBlank() }?.let { errMsg ->
            item {
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
        }

        // 头像 + 昵称 + 角色徽章
        item {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 24.dp, bottom = 16.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // 80.dp 圆形头像
                Box(
                    modifier = Modifier
                        .size(80.dp)
                        .clip(RoundedCornerShape(40.dp))
                        .background(CoralPrimary.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.Person,
                        contentDescription = null,
                        tint = CoralPrimary,
                        modifier = Modifier.size(40.dp)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    nickname,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(6.dp))
            }
        }

        // 积分卡：CoralPrimary 蓝底白字，displayMedium 大数字，16.dp 圆角
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
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
                            "我的积分",
                            style = MaterialTheme.typography.titleMedium,
                            color = Color.White.copy(alpha = 0.85f)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                "$points",
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
                    }
                    Box(
                        modifier = Modifier
                            .size(56.dp)
                            .clip(RoundedCornerShape(16.dp))
                            .background(Color.White.copy(alpha = 0.15f))
                            .clickable(onClick = onNavigateToRewardExchange),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            Icons.Default.CardGiftcard,
                            contentDescription = "积分兑换",
                            tint = Color.White,
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            }
        }

        // 身体数据统计卡
        item {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CreamSurface),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    ProfileStat("当前体重", "$currentWeight", "kg")
                    ProfileStat("目标体重", "$targetWeight", "kg")
                    ProfileStat("BMI", String.format("%.1f", bmi), "")
                }
            }
            Spacer(modifier = Modifier.height(4.dp))
        }

        // 个人资料组
        item { SectionTitle("个人资料") }
        item {
            MenuGroup {
                ProfileMenuItem(Icons.Default.Person, "编辑资料", "昵称/身高/目标", CoralPrimary) { showEditProfile = true }
                HorizontalDivider(color = DividerColor, thickness = 1.dp)
                ProfileMenuItem(Icons.Default.EmojiEvents, "我的成就", "", MintSecondary) {
                    android.widget.Toast.makeText(context, "成就功能开发中", android.widget.Toast.LENGTH_SHORT).show()
                }
                HorizontalDivider(color = DividerColor, thickness = 1.dp)
                ProfileMenuItem(Icons.Default.CardGiftcard, "积分流水", "$points 积分", SkyTertiary) { showPointsHistory = true }
            }
        }

        // 设置组
        item { SectionTitle("设置") }
        item {
            MenuGroup {
                ProfileMenuItem(Icons.Default.Notifications, "消息提醒", "已开启", MintSecondary) {
                    android.widget.Toast.makeText(context, "提醒设置开发中", android.widget.Toast.LENGTH_SHORT).show()
                }
                HorizontalDivider(color = DividerColor, thickness = 1.dp)
                ProfileMenuItem(Icons.Default.Dns, "服务器地址", currentServerDisplay, SkyTertiary) {
                    showServerSettings = true
                }
                HorizontalDivider(color = DividerColor, thickness = 1.dp)
                ProfileMenuItem(Icons.Default.PrivacyTip, "隐私与安全", "", TextSecondary) {
                    android.widget.Toast.makeText(context, "隐私设置开发中", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        // 其他组
        item { SectionTitle("其他") }
        item {
            MenuGroup {
                ProfileMenuItem(Icons.Default.HelpOutline, "帮助与反馈", "", TextSecondary) {
                    android.widget.Toast.makeText(context, "帮助中心开发中", android.widget.Toast.LENGTH_SHORT).show()
                }
                HorizontalDivider(color = DividerColor, thickness = 1.dp)
                ProfileMenuItem(Icons.Default.Info, "关于 Xlover", "v1.0.0", TextSecondary) {
                    android.widget.Toast.makeText(context, "Xlover v1.0.0\n情侣减肥打卡助手", android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        }

        // 退出登录
        item {
            var loggingOut by remember { mutableStateOf(false) }
            Spacer(modifier = Modifier.height(20.dp))
            OutlinedButton(
                onClick = {
                    if (loggingOut) return@OutlinedButton
                    loggingOut = true
                    viewModel.logout {
                        android.widget.Toast.makeText(context, "已退出登录", android.widget.Toast.LENGTH_SHORT).show()
                        onLogout()
                    }
                },
                enabled = !loggingOut,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp)
                    .padding(horizontal = 32.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = CoralPrimary)
            ) {
                Text(
                    if (loggingOut) "退出中…" else "退出登录",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Medium
                )
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }

    if (showEditProfile) {
        EditProfileDialog(
            currentNickname = nickname,
            currentHeight = height,
            currentStart = startWeight,
            currentWeight = currentWeight,
            currentTarget = targetWeight,
            currentWaterGoal = waterGoal,
            onDismiss = { showEditProfile = false },
            onConfirm = { request ->
                viewModel.updateProfile(request) { success, msg ->
                    showEditProfile = false
                    android.widget.Toast.makeText(context, if (success) "资料更新成功" else (msg ?: "更新失败"), android.widget.Toast.LENGTH_SHORT).show()
                }
            }
        )
    }

    if (showPointsHistory) {
        PointsHistoryDialog(
            points = points,
            history = uiState.pointsHistory,
            onDismiss = { showPointsHistory = false }
        )
    }

    if (showServerSettings) {
        ServerUrlDialog(
            onDismiss = {
                showServerSettings = false
                currentServerDisplay = ServerUrlManager.display()
            },
            onChanged = { currentServerDisplay = it },
            introMessage = "设置后端 Node.js 服务的 IP 和端口。\n格式示例：http://192.168.1.10:3000"
        )
    }
}

@Composable
fun ProfileStat(label: String, value: String, unit: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Row(verticalAlignment = Alignment.Bottom) {
            Text(value, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = TextPrimary)
            if (unit.isNotEmpty()) {
                Text(unit, style = MaterialTheme.typography.labelMedium, color = TextSecondary, modifier = Modifier.padding(bottom = 3.dp, start = 1.dp))
            }
        }
        Text(label, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
    }
}

@Composable
fun SectionTitle(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.labelMedium,
        fontWeight = FontWeight.Medium,
        color = TextSecondary,
        modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 6.dp)
    )
}

@Composable
fun MenuGroup(content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = CreamSurface),
        elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
    ) {
        Column { content() }
    }
}

@Composable
fun ProfileMenuItem(icon: ImageVector, title: String, subtitle: String, iconColor: Color, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 20.dp 图标
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(iconColor.copy(alpha = 0.12f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
        }
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = TextPrimary,
            modifier = Modifier.weight(1f)
        )
        if (subtitle.isNotEmpty()) {
            Text(subtitle, style = MaterialTheme.typography.bodySmall, color = TextSecondary)
            Spacer(modifier = Modifier.width(4.dp))
        }
        Icon(
            Icons.Default.ChevronRight,
            contentDescription = null,
            tint = TextSecondary.copy(alpha = 0.5f),
            modifier = Modifier.size(20.dp)
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EditProfileDialog(
    currentNickname: String,
    currentHeight: Double,
    /** 起始体重（首次建档时填入的 current_weight；用户现在可以修改以纠正首次填错） */
    currentStart: Double,
    currentWeight: Double,
    currentTarget: Double,
    /** 每日喝水目标杯数（齿轮 & 资料页可改） */
    currentWaterGoal: Int,
    onDismiss: () -> Unit,
    onConfirm: (com.xlover.app.data.remote.dto.ProfileUpdateRequest) -> Unit
) {
    var nickname by remember { mutableStateOf(currentNickname) }
    var height by remember { mutableStateOf(currentHeight.toString()) }
    var startWeight by remember { mutableStateOf(currentStart.toString()) }
    var weight by remember { mutableStateOf(currentWeight.toString()) }
    var target by remember { mutableStateOf(currentTarget.toString()) }
    var waterGoal by remember { mutableStateOf(currentWaterGoal.toString()) }

    // 基础校验
    val h = height.toDoubleOrNull()
    val w = weight.toDoubleOrNull()
    val sw = startWeight.toDoubleOrNull()?.takeIf { it > 0 }
    val tg = target.toDoubleOrNull()?.takeIf { it > 0 }
    val wg = waterGoal.toIntOrNull()?.coerceIn(1, 20)
    val canSave = h != null && h in 100.0..250.0 &&
                  w != null && w in 20.0..300.0 &&
                  sw != null && tg != null && wg != null

    val submit = {
        val bmi: Double? = if (h != null && w != null && h > 0) {
            val heightM = h / 100.0
            kotlin.math.round(w / (heightM * heightM) * 100) / 100.0
        } else null
        onConfirm(
            com.xlover.app.data.remote.dto.ProfileUpdateRequest(
                nickname = nickname.ifEmpty { null },
                height = h,
                start_weight = sw,
                current_weight = w,
                target_weight = tg,
                water_goal = wg,
                bmi = bmi
            )
        )
    }

    AppStyleDialog(
        title = "编辑资料",
        onDismiss = onDismiss,
        onConfirm = submit,
        confirmText = "保存",
        confirmEnabled = canSave
    ) {
        OutlinedTextField(
            value = nickname,
            onValueChange = { nickname = it },
            label = { Text("昵称") },
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
        Row {
            OutlinedTextField(
                value = height,
                onValueChange = { height = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("身高(cm)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextBlack,
                    unfocusedTextColor = TextBlack,
                    focusedBorderColor = CoralPrimary,
                    unfocusedBorderColor = DividerColor
                )
            )
            Spacer(modifier = Modifier.width(8.dp))
            OutlinedTextField(
                value = startWeight,
                onValueChange = { startWeight = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("起始体重(kg)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
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
        Row {
            OutlinedTextField(
                value = weight,
                onValueChange = { weight = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("当前体重(kg)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextBlack,
                    unfocusedTextColor = TextBlack,
                    focusedBorderColor = CoralPrimary,
                    unfocusedBorderColor = DividerColor
                )
            )
            Spacer(modifier = Modifier.width(8.dp))
            OutlinedTextField(
                value = target,
                onValueChange = { target = it.filter { c -> c.isDigit() || c == '.' } },
                label = { Text("目标体重(kg)") },
                singleLine = true,
                modifier = Modifier.weight(1f),
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
        OutlinedTextField(
            value = waterGoal,
            onValueChange = { waterGoal = it.filter { c -> c.isDigit() } },
            label = { Text("每日喝水目标(杯)") },
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PointsHistoryDialog(
    points: Int,
    history: List<com.xlover.app.data.remote.dto.PointRecord>,
    onDismiss: () -> Unit
) {
    AppStyleDialog(
        title = "积分明细",
        onDismiss = onDismiss,
        onConfirm = onDismiss,
        confirmText = "关闭",
        showCancel = false,
        confirmEnabled = true
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text("当前余额", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
            Spacer(modifier = Modifier.weight(1f))
            Text(
                "$points 积分",
                color = CoralPrimary,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium
            )
        }
        Spacer(modifier = Modifier.height(12.dp))
        if (history.isEmpty()) {
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 24.dp), contentAlignment = Alignment.Center) {
                Text("暂无积分记录", style = MaterialTheme.typography.bodyMedium, color = TextSecondary)
            }
        } else {
            LazyColumn(modifier = Modifier.fillMaxWidth().heightIn(max = 360.dp)) {
                items(history) { record ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                record.reason,
                                style = MaterialTheme.typography.titleMedium,
                                color = TextPrimary,
                                maxLines = 1
                            )
                            Text(
                                record.created_at.take(16).replace("T", " "),
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary
                            )
                        }
                        Text(
                            if (record.change > 0) "+${record.change}" else "${record.change}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (record.change > 0) MintSecondary else CoralPrimary
                        )
                    }
                    HorizontalDivider(color = DividerColor, thickness = 1.dp)
                }
            }
        }
    }
}

