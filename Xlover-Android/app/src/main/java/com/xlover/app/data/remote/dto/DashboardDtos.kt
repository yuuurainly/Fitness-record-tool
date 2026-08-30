package com.xlover.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class DashboardResponse(
    val user: DashboardUser,
    val profile: DashboardProfile,
    val todayCalories: TodayCalories,
    val todayFoods: List<FoodItemDto>,
    val todayExercises: List<ExerciseItemDto>,
    val weightProgress: WeightProgress,
    val weightTrend: List<WeightTrendItem>,
    val pendingTasks: Int,
    /** 新增：今日未完成任务数（status != completed 且非 rejected），用于首页"任务"卡片展示 */
    val pendingTaskCount: Int = 0,
    val pendingPointRequests: Int = 0,
    val pendingReviews: Int = 0,
    val waterToday: Int = 0,
    val sleepToday: Int = 0
)

@JsonClass(generateAdapter = true)
data class DashboardUser(
    val id: Int,
    val username: String,
    val nickname: String,
    val avatar: String? = null,
    val streakDays: Int,
    val checkedInToday: Boolean? = null
)

@JsonClass(generateAdapter = true)
data class DashboardProfile(
    val height: Double,
    /** 今日最新体重记录；若当日未记录则为 null（首页显示"今日体重待记录"） */
    val currentWeight: Double?,
    val targetWeight: Double,
    /** 首次引导页填写的 current_weight（减重起始基准），资料编辑页可修改 */
    val startWeight: Double,
    val bmi: Double,
    /** BMR：基础代谢率（Mifflin-St Jeor 公式计算） */
    val bmr: Int = 0,
    /** TDEE：维持体重所需每日总热量 = BMR × 用户选的活动系数；未选活动水平时为 null，前端应显示"选择活动水平" */
    val dailyCalorieGoal: Int? = null,
    /** 每日最高摄入热量 = TDEE；未选活动水平时为 null，前端隐藏卡路里进度条 */
    val dailyMaxCalories: Int? = dailyCalorieGoal,
    /** 用户自定义每日喝水目标杯数（默认 8），齿轮修改后持久化到 DB */
    val waterGoal: Int = 8,
    /** 活动水平档位：sedentary / light / moderate / active / very_active；未选则 null */
    val activityLevel: String? = null,
    /** 活动系数（1.2 / 1.375 / 1.55 / 1.725 / 1.9）；未选则 null */
    val activityFactor: Double? = null,
    /** 用户是否已经手动选过活动水平；未选时前端引导选 + 隐藏进度条 */
    val activityFactorSelected: Boolean = false
)

@JsonClass(generateAdapter = true)
data class TodayCalories(
    val consumed: Int = 0,
    val burned: Int = 0,
    /** goal = dailyMaxCalories（每日最高红线）；未选活动水平时为 null */
    val goal: Int? = null,
    val net: Int = 0,
    val progress: Int = 0
)

@JsonClass(generateAdapter = true)
data class FoodItemDto(
    val id: Int,
    val name: String,
    val calories: Int,
    val mealType: String,
    val time: String,
    val protein: Double,
    val carbs: Double,
    val fat: Double
)

@JsonClass(generateAdapter = true)
data class ExerciseItemDto(
    val id: Int,
    val name: String,
    val duration: Int,
    val calories: Int,
    val icon: String,
    val metValue: Double
)

@JsonClass(generateAdapter = true)
data class WeightProgress(
    val current: Double,
    val target: Double,
    val start: Double,
    val lost: Double,
    val percentage: Int,
    /** 今日是否已记录体重（首页"当前"体重为 null 判断用，提供单独字段更直观） */
    val todayWeightRecorded: Boolean = false,
    /** 今日记录到的体重（未记录时为 null） */
    val todayWeightValue: Double? = null
)

@JsonClass(generateAdapter = true)
data class WeightTrendItem(
    val weight: Double,
    /** BMI值；老数据/身高缺失时为null，兜底用0.0（后端同时会用COALESCE兜底） */
    val bmi: Double? = 0.0,
    val date: String
)
