package com.xlover.app.ui.screens.main

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import com.xlover.app.ui.screens.home.HomeScreen
import com.xlover.app.ui.screens.profile.ProfileScreen
import com.xlover.app.ui.screens.progress.ProgressScreen
import com.xlover.app.ui.screens.record.RecordScreen
import com.xlover.app.ui.screens.task.TaskScreen
import com.xlover.app.ui.theme.*

sealed class BottomNavItem(
    val route: String,
    val title: String,
    val icon: ImageVector
) {
    data object Home : BottomNavItem("home", "首页", Icons.Default.Home)
    data object Record : BottomNavItem("record", "记录", Icons.Default.Restaurant)
    data object Task : BottomNavItem("task", "任务", Icons.Default.Assignment)
    data object Progress : BottomNavItem("progress", "进度", Icons.Default.TrendingUp)
    data object Profile : BottomNavItem("profile", "我的", Icons.Default.Person)
}

@Composable
fun MainScreen(
    initialTab: Int = 0,
    onLogout: () -> Unit = {},
    onNavigateToRewardExchange: () -> Unit = {}
) {
    var selectedTab by remember { mutableStateOf(initialTab) }
    // 记录页的子 tab（饮食=0, 运动=1, 体重=2），由首页快捷记录按钮控制
    var recordTab by remember { mutableStateOf(0) }
    // 任务页的子 tab（0=进行中,1=已完成,2=待处理,3=全部），由首页点击任务数量控制
    var taskTab by remember { mutableStateOf(0) }

    // 固定底部 Tab：首页/记录/任务/进度/我的
    val bottomItems = listOf(
        BottomNavItem.Home,
        BottomNavItem.Record,
        BottomNavItem.Task,
        BottomNavItem.Progress,
        BottomNavItem.Profile
    )

    Scaffold(
        containerColor = CreamBackground,
        bottomBar = {
            NavigationBar(
                containerColor = CreamSurface,
                tonalElevation = 0.dp
            ) {
                bottomItems.forEachIndexed { index, item ->
                    NavigationBarItem(
                        icon = {
                            Icon(
                                item.icon,
                                contentDescription = item.title,
                                modifier = Modifier.size(24.dp)
                            )
                        },
                        label = {
                            Text(
                                item.title,
                                style = MaterialTheme.typography.labelSmall
                            )
                        },
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = CoralPrimary,
                            selectedTextColor = CoralPrimary,
                            unselectedIconColor = TextSecondary,
                            unselectedTextColor = TextSecondary,
                            indicatorColor = CoralPrimary.copy(alpha = 0.08f)
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        Crossfade(
            targetState = selectedTab,
            animationSpec = tween(250, easing = FastOutSlowInEasing),
            label = "tab_switch",
            modifier = Modifier.padding(innerPadding)
        ) { tab ->
            when (tab) {
                0 -> HomeScreen(
                    onNavigateToRecord = { tabToOpen ->
                        recordTab = tabToOpen
                        selectedTab = 1
                    },
                    onNavigateToProgress = {
                        selectedTab = 3
                    },
                    onNavigateToTask = {
                        taskTab = 0   // 进入任务页 → 进行中
                        selectedTab = 2
                    }
                )
                1 -> RecordScreen(initialTab = recordTab)
                2 -> TaskScreen(initialTab = taskTab)
                3 -> ProgressScreen()
                4 -> ProfileScreen(
                    onLogout = onLogout,
                    onNavigateToRewardExchange = onNavigateToRewardExchange
                )
            }
        }
    }
}
