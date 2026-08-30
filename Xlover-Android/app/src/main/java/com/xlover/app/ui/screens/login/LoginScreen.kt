package com.xlover.app.ui.screens.login

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.xlover.app.ui.components.ServerUrlDialog
import com.xlover.app.ui.theme.*
import com.xlover.app.util.AppState
import com.xlover.app.util.SetStatusBarColor

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoginScreen(
    isRegisterMode: Boolean = false,
    onLoginSuccess: () -> Unit = {},
    onNavigateToRegister: () -> Unit = {},
    viewModel: LoginViewModel = hiltViewModel()
) {
    SetStatusBarColor(color = CreamBackground, darkIcons = true)
    val uiState by viewModel.uiState.collectAsState()
    var passwordVisible by remember { mutableStateOf(false) }

    // 服务器地址修改弹框：FailureTracker 连续失败 N 次后由 AppState 触发
    var showServerUrlDialog by remember { mutableStateOf(false) }
    LaunchedEffect(AppState.requestOpenServerUrlDialog) {
        if (AppState.takeOpenServerUrlDialogEvent()) {
            showServerUrlDialog = true
        }
    }
    if (showServerUrlDialog) {
        ServerUrlDialog(
            onDismiss = { showServerUrlDialog = false },
            onChanged = {}
        )
    }

    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            onLoginSuccess()
        }
    }

    // 通过 ime 底部 padding 判断键盘可见；adjustNothing + imePadding 手动推起内容避免挤压
    val density = LocalDensity.current
    val imeBottomPaddingValues = WindowInsets.ime.asPaddingValues()
    val imeBottomPx = with(density) { imeBottomPaddingValues.calculateBottomPadding().toPx() }
    val imeVisible = imeBottomPx > 2f
    val slideAnimMs = 300
    val slideAnimSpec = tween<Dp>(durationMillis = slideAnimMs, easing = FastOutSlowInEasing)

    // 登录 vs 注册 卡片高度不同（注册多了昵称输入框+16dp+spacer16）
    // 头部和底部小字已按要求删除
    val loginCardH: Dp = 440.dp
    val registerCardH: Dp = 560.dp
    val cardH: Dp = if (isRegisterMode) registerCardH else loginCardH
    // 卡片下方：24dp 间距 + "还没有账号？立即注册"/"已有账号？去登录" 切换行 + 底部留白
    val afterCardSwitchRowH: Dp = 112.dp

    // 可视内容总高：卡片 + 切换行 + 底部
    val contentH = cardH + afterCardSwitchRowH

    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .background(CreamBackground)
    ) {
        val availableHeight = this@BoxWithConstraints.maxHeight
        val targetTopSpacer: Dp = ((availableHeight - contentH) / 2).coerceAtLeast(0.dp)
        val topSpacer: Dp by animateDpAsState(
            targetValue = targetTopSpacer,
            animationSpec = slideAnimSpec,
            label = "login_top_spacer"
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(horizontal = 28.dp)
                .imePadding()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // 顶部动态间距：300ms 插值，驱动整块内容慢慢滑到中间
            Spacer(modifier = Modifier.height(topSpacer))

            // —— 输入卡片 ——
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = CreamSurface),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = if (isRegisterMode) "创建账号" else "欢迎回来",
                        style = MaterialTheme.typography.titleLarge,
                        color = TextPrimary,
                        fontWeight = FontWeight.SemiBold
                    )

                    Spacer(modifier = Modifier.height(24.dp))

                    // 用户名
                    OutlinedTextField(
                        value = uiState.username,
                        onValueChange = viewModel::onUsernameChange,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("用户名", style = MaterialTheme.typography.bodyMedium) },
                        leadingIcon = {
                            Icon(Icons.Default.Person, contentDescription = null, tint = CoralPrimary, modifier = Modifier.size(20.dp))
                        },
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextBlack,
                            unfocusedTextColor = TextBlack,
                            focusedBorderColor = CoralPrimary,
                            unfocusedBorderColor = DividerColor,
                            focusedLabelColor = CoralPrimary
                        )
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    // 密码
                    OutlinedTextField(
                        value = uiState.password,
                        onValueChange = viewModel::onPasswordChange,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("密码", style = MaterialTheme.typography.bodyMedium) },
                        leadingIcon = {
                            Icon(Icons.Default.Lock, contentDescription = null, tint = CoralPrimary, modifier = Modifier.size(20.dp))
                        },
                        trailingIcon = {
                            IconButton(onClick = { passwordVisible = !passwordVisible }) {
                                Icon(
                                    if (passwordVisible) Icons.Default.Visibility else Icons.Default.VisibilityOff,
                                    contentDescription = null,
                                    tint = TextTertiary,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        },
                        visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedTextColor = TextBlack,
                            unfocusedTextColor = TextBlack,
                            focusedBorderColor = CoralPrimary,
                            unfocusedBorderColor = DividerColor,
                            focusedLabelColor = CoralPrimary
                        )
                    )

                    // 注册模式下的昵称（保留原动画：登录/注册切换时才用，键盘显隐不关它）
                    AnimatedVisibility(
                        visible = isRegisterMode,
                        enter = fadeIn() + slideInVertically(),
                        exit = fadeOut() + slideOutVertically()
                    ) {
                        Column {
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedTextField(
                                value = uiState.nickname,
                                onValueChange = viewModel::onNicknameChange,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("昵称（选填）", style = MaterialTheme.typography.bodyMedium) },
                                leadingIcon = {
                                    Icon(Icons.Default.Favorite, contentDescription = null, tint = CoralPrimary, modifier = Modifier.size(20.dp))
                                },
                                singleLine = true,
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedTextColor = TextBlack,
                                    unfocusedTextColor = TextBlack,
                                    focusedBorderColor = CoralPrimary,
                                    unfocusedBorderColor = DividerColor,
                                    focusedLabelColor = CoralPrimary
                                )
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                        }
                    }

                    // 错误提示
                    AnimatedVisibility(visible = uiState.errorMessage != null) {
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = uiState.errorMessage ?: "",
                            color = ErrorRed,
                            style = MaterialTheme.typography.bodySmall,
                            textAlign = TextAlign.Center
                        )
                    }

                    Spacer(modifier = Modifier.height(24.dp))

                    // 主按钮
                    Button(
                        onClick = {
                            if (isRegisterMode) viewModel.register()
                            else viewModel.login()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = CoralPrimary),
                        enabled = !uiState.isLoading
                    ) {
                        if (uiState.isLoading) {
                            CircularProgressIndicator(
                                color = Color.White,
                                modifier = Modifier.size(24.dp),
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                text = if (isRegisterMode) "注册" else "登录",
                                color = Color.White,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // 底部切换（"还没有账号？立即注册"/"已有账号？去登录"）：保留，始终可见
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (isRegisterMode) "已有账号？" else "还没有账号？",
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextSecondary
                )
                TextButton(onClick = onNavigateToRegister) {
                    Text(
                        text = if (isRegisterMode) "去登录" else "立即注册",
                        color = CoralPrimary,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Spacer(modifier = Modifier.height(40.dp))
        }
    }
}


