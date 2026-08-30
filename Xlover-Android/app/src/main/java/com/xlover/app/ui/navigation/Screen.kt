package com.xlover.app.ui.navigation

sealed class Screen(val route: String) {
    // 认证流程
    data object Login : Screen("login")
    data object Register : Screen("register")
    data object Guide : Screen("guide")
    data object Bind : Screen("bind")

    // 主导航 - 主角
    data object HomeMain : Screen("home_main")
    data object Record : Screen("record")
    data object Progress : Screen("progress")
    data object Message : Screen("message")
    data object Profile : Screen("profile")

    // 主导航 - 伴侣
    data object Task : Screen("task")

    // 子页面
    data object FoodRecord : Screen("food_record")
    data object ExerciseRecord : Screen("exercise_record")
    data object WeightRecord : Screen("weight_record")
    data object TaskDetail : Screen("task_detail/{taskId}")
    data object RemindSettings : Screen("remind_settings")
    data object RewardSettings : Screen("reward_settings")
    data object RewardExchange : Screen("reward_exchange")
    data object ServerSettings : Screen("server_settings")
}
