package com.xlover.app.ui.navigation

import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.xlover.app.ui.screens.guide.GuideScreen
import com.xlover.app.ui.screens.login.LoginScreen
import com.xlover.app.ui.screens.main.MainScreen
import com.xlover.app.ui.screens.rewards.RewardExchangeScreen
import com.xlover.app.util.AppState
import com.xlover.app.util.TokenManager

@Composable
fun XloverNavGraph(
    navController: NavHostController = rememberNavController()
) {
    // 根据登录状态和引导完成状态决定启动页面
    val startDest = when {
        TokenManager.isLoggedIn && AppState.isGuideComplete -> Screen.HomeMain.route
        TokenManager.isLoggedIn -> Screen.Guide.route
        else -> Screen.Login.route
    }

    NavHost(
        navController = navController,
        startDestination = startDest,
        enterTransition = { fadeIn(animationSpec = androidx.compose.animation.core.tween(200)) },
        exitTransition = { fadeOut(animationSpec = androidx.compose.animation.core.tween(200)) }
    ) {
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    // 登录成功：引导已完成 → 直接进首页，否则走引导
                    if (AppState.isGuideComplete) {
                        navController.navigate(Screen.HomeMain.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    } else {
                        navController.navigate(Screen.Guide.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    }
                },
                onNavigateToRegister = {
                    navController.navigate(Screen.Register.route)
                }
            )
        }

        composable(Screen.Register.route) {
            LoginScreen(
                isRegisterMode = true,
                onLoginSuccess = {
                    // 新注册用户必定走引导流程
                    navController.navigate(Screen.Guide.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                },
                onNavigateToRegister = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.Guide.route) {
            GuideScreen(
                onGuideComplete = {
                    AppState.isGuideComplete = true
                    navController.navigate(Screen.HomeMain.route) {
                        popUpTo(Screen.Guide.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.HomeMain.route) {
            MainScreen(
                initialTab = 0,
                onLogout = {
                    navController.navigate(Screen.Login.route) {
                        popUpTo(navController.graph.startDestinationId) { inclusive = true }
                        launchSingleTop = true
                    }
                },
                onNavigateToRewardExchange = {
                    navController.navigate(Screen.RewardExchange.route)
                }
            )
        }

        composable(Screen.RewardExchange.route) {
            RewardExchangeScreen(
                onBack = { navController.popBackStack() }
            )
        }
    }
}
