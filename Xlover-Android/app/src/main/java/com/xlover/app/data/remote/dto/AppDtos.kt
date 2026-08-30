package com.xlover.app.data.remote.dto

import com.squareup.moshi.JsonClass

// ==================== 记录 DTO ====================

@JsonClass(generateAdapter = true)
data class FoodRecordDto(
    val id: Int,
    val user_id: Int,
    val food_name: String,
    val calories: Double,
    val protein: Double,
    val carbs: Double,
    val fat: Double,
    val serving_size: Double,
    val meal_type: String,
    val record_date: String,
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class FoodListResponse(
    val date: String,
    val foods: List<FoodRecordDto>,
    val summary: FoodSummary
)

@JsonClass(generateAdapter = true)
data class FoodSummary(
    val totalCalories: Int,
    val totalProtein: Double,
    val totalCarbs: Double,
    val totalFat: Double
)

@JsonClass(generateAdapter = true)
data class FoodRequest(
    val food_name: String,
    val calories: Double? = null,
    val protein: Double? = null,
    val carbs: Double? = null,
    val fat: Double? = null,
    val serving_size: Double? = null,
    val meal_type: String? = null,
    val record_date: String? = null
)

@JsonClass(generateAdapter = true)
data class ExerciseRecordDto(
    val id: Int,
    val user_id: Int,
    val exercise_type: String,
    val duration: Int,
    val calories_burned: Double,
    /** 运动强度MET值；老数据/未选运动库时为null，兜底用0.0（后端同时会用COALESCE兜底） */
    val met_value: Double? = 0.0,
    val record_date: String,
    /** 运动备注；老数据/未填写时为null，兜底用""（后端同时会用COALESCE兜底） */
    val note: String? = "",
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class ExerciseListResponse(
    val date: String,
    val exercises: List<ExerciseRecordDto>,
    val summary: ExerciseSummary
)

@JsonClass(generateAdapter = true)
data class ExerciseSummary(
    val totalCalories: Int,
    val totalDuration: Int
)

@JsonClass(generateAdapter = true)
data class ExerciseRequest(
    val exercise_type: String,
    val duration: Int,
    val calories_burned: Double? = null,
    val met_value: Double? = null,
    val note: String? = null,
    val record_date: String? = null
)

@JsonClass(generateAdapter = true)
data class WeightRecordDto(
    val id: Int,
    val user_id: Int,
    val weight: Double,
    /** BMI计算值；老数据/身高缺失时为null，兜底用0.0（后端同时会用COALESCE兜底） */
    val bmi: Double? = 0.0,
    val record_date: String,
    /** 体重备注；老数据/未填写时为null，兜底用""（后端同时会用COALESCE兜底） */
    val note: String? = "",
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class WeightListResponse(
    val records: List<WeightRecordDto>
)

@JsonClass(generateAdapter = true)
data class WeightRequest(
    val weight: Double,
    val note: String? = null,
    val record_date: String? = null
)

// ==================== 任务 DTO ====================

@JsonClass(generateAdapter = true)
data class TaskDto(
    val id: Int,
    val creator_id: Int,
    /** 任务执行人ID；自建任务通常等于creator_id；老数据为null时兜底=creator_id（后端normalizeTask也会兜底） */
    val assignee_id: Int? = 0,
    val title: String,
    /** 任务描述；未填写/老数据为null时兜底=""（后端normalizeTask也会兜底） */
    val description: String? = "",
    /** 任务类型：once/habit/cycle；老数据为null时兜底="once"（后端normalizeTask也会兜底） */
    val type: String? = "once",
    /** 积分奖励；老数据为null时兜底=0（后端normalizeTask也会兜底） */
    val points: Int? = 0,
    /** 任务状态：pending/active/completed/rejected；老数据为null时兜底="pending"（后端normalizeTask也会兜底） */
    val status: String? = "pending",
    val recurrence_rule: String,
    val target_days: Int,
    val current_streak: Int,
    val due_date: String?,
    val completed_date: String?,
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class TaskListResponse(
    val tasks: List<TaskDto>
)

@JsonClass(generateAdapter = true)
data class TaskRequest(
    val title: String,
    val description: String? = null,
    val type: String? = null,
    val points: Int? = null,
    val recurrence_rule: String? = null,
    val target_days: Int? = null,
    val due_date: String? = null
)

@JsonClass(generateAdapter = true)
data class TaskCompleteResponse(
    val task: TaskDto,
    val pointsEarned: Int
)

// ==================== 互动 DTO ====================

// ==================== 进度 DTO ====================

@JsonClass(generateAdapter = true)
data class WeightProgressResponse(
    val records: List<WeightTrendRecord>,
    val currentWeight: Double,
    val targetWeight: Double,
    val height: Double
)

@JsonClass(generateAdapter = true)
data class WeightTrendRecord(
    val weight: Double,
    /** BMI值；老数据/身高缺失时为null，兜底用0.0（后端同时会用COALESCE兜底） */
    val bmi: Double? = 0.0,
    val record_date: String
)

@JsonClass(generateAdapter = true)
data class AchievementDto(
    val id: Int,
    val achievement_type: String,
    val title: String,
    val description: String,
    val icon: String,
    val unlocked: Boolean,
    val unlocked_at: String? = null
)

@JsonClass(generateAdapter = true)
data class AchievementListResponse(
    val achievements: List<AchievementDto>,
    val stats: StatsData
)

@JsonClass(generateAdapter = true)
data class StatsResponse(
    val data: StatsData
)

@JsonClass(generateAdapter = true)
data class StatsData(
    val totalCheckins: Int,
    val maxStreak: Int,
    val totalExerciseMinutes: Int,
    val totalExerciseCalories: Int,
    val totalWeightLost: Double,
    val completedTasks: Int,
    val totalPoints: Int,
    val week: WeekStats
)

@JsonClass(generateAdapter = true)
data class WeekStats(
    val caloriesConsumed: Int,
    val caloriesBurned: Int,
    val exerciseMinutes: Int
)

// ==================== 消息 DTO ====================

@JsonClass(generateAdapter = true)
data class MessageDto(
    val id: Int,
    val sender_id: Int,
    val receiver_id: Int,
    val content: String,
    val is_read: Int,
    val created_at: String,
    val sender_nickname: String? = null,
    val sender_avatar: String? = null
)

@JsonClass(generateAdapter = true)
data class MessageListResponse(
    val messages: List<MessageDto>
)

@JsonClass(generateAdapter = true)
data class MessageRequest(
    val content: String
)

@JsonClass(generateAdapter = true)
data class UnreadCountResponse(
    val count: Int
)

// ==================== 奖励 DTO ====================

@JsonClass(generateAdapter = true)
data class RewardDto(
    val id: Int,
    val creator_id: Int,
    val name: String,
    val description: String,
    val points_cost: Int,
    val icon: String,
    val is_active: Int,
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class RewardListResponse(
    val rewards: List<RewardDto>,
    val userPoints: Int
)

@JsonClass(generateAdapter = true)
data class RewardRequest(
    val name: String,
    val description: String? = null,
    val points_cost: Int,
    val icon: String? = null
)

@JsonClass(generateAdapter = true)
data class RewardClaimResponse(
    val reward: RewardDto? = null,
    val remainingPoints: Int? = null,
    // 后端实际返回 { newBalance }，与 DTO 不一致时兼容读取
    val newBalance: Int? = null
)

// ==================== 个人资料 DTO ====================

@JsonClass(generateAdapter = true)
data class ProfileResponse(
    val user: ProfileUser,
    val profile: ProfileData,
    val points: Int
)

@JsonClass(generateAdapter = true)
data class ProfileUser(
    val id: Int,
    val username: String,
    val nickname: String,
    val avatar: String? = null
)

@JsonClass(generateAdapter = true)
data class ProfileData(
    val id: Int,
    val user_id: Int,
    val gender: String,
    val age: Int,
    val height: Double,
    /** 起始体重（减重起始基准值，可编辑） */
    val start_weight: Double? = null,
    val current_weight: Double,
    val target_weight: Double,
    val activity_level: String? = null,
    /** 活动系数（1.2 / 1.375 / 1.55 / 1.725 / 1.9）；未选则 null */
    val activity_factor: Double? = null,
    /** 用户自定义每日喝水目标杯数（默认 8） */
    val water_goal: Int? = null,
    /** TDEE（BMR×活动系数）；未选活动水平时为 null */
    val daily_calorie_goal: Int? = null,
    val bmi: Double?,
    val updated_at: String
)

@JsonClass(generateAdapter = true)
data class ProfileUpdateRequest(
    val nickname: String? = null,
    val avatar: String? = null,
    val gender: String? = null,
    val age: Int? = null,
    val height: Double? = null,
    /** 起始体重：注册引导填写的 current_weight；资料编辑页可修改以修复首次填写错误 */
    val start_weight: Double? = null,
    val current_weight: Double? = null,
    val target_weight: Double? = null,
    val activity_level: String? = null,
    /** 活动系数数值，如 1.55；首页弹框用户选活动水平后提交，彻底替换旧硬编码 */
    val activity_factor: Double? = null,
    /** 用户每日喝水目标杯数（齿轮修改 / 资料页修改），持久化存储 */
    val water_goal: Int? = null,
    val bmi: Double? = null
)

@JsonClass(generateAdapter = true)
data class ProfileUpdateResponse(
    val user: ProfileUser,
    val profile: ProfileData
)

@JsonClass(generateAdapter = true)
data class PointsHistoryResponse(
    val records: List<PointRecord>,
    val currentBalance: Int
)

@JsonClass(generateAdapter = true)
data class PointRecord(
    val id: Int,
    val user_id: Int,
    val change: Int,
    val reason: String,
    val reference_id: Int?,
    val balance: Int,
    val created_at: String
)

// ========== 阶段9新增 DTO ==========

// ==================== 食物库 ====================
@JsonClass(generateAdapter = true)
data class FoodLibraryItem(
    val id: Int,
    val name: String,
    val calories_per_100g: Double,
    val protein: Double? = 0.0,
    val carbs: Double? = 0.0,
    val fat: Double? = 0.0,
    val category: String? = null,
    val icon: String? = null,
    val is_custom: Int? = 0,
    val user_id: Int? = null
)

@JsonClass(generateAdapter = true)
data class FoodPagination(
    val total: Int,
    val page: Int,
    val pageSize: Int
)

@JsonClass(generateAdapter = true)
data class FoodLibraryResponse(
    val list: List<FoodLibraryItem>,
    val pagination: FoodPagination? = null
)

// ==================== 运动库 ====================
@JsonClass(generateAdapter = true)
data class ExerciseLibraryItem(
    val id: Int,
    val type_key: String? = null,
    val exercise_type: String? = null,
    val name: String? = null,
    val type_name: String? = null,
    val icon: String? = null,
    val met_value: Double,
    val category: String? = null
)

@JsonClass(generateAdapter = true)
data class ExerciseLibraryResponse(
    val list: List<ExerciseLibraryItem>
)

// ==================== 打卡（喝水/睡觉）====================
@JsonClass(generateAdapter = true)
data class CheckInItem(
    val id: Int? = null,
    val user_id: Int? = null,
    val type: String,
    val count: Int? = 0,
    val date: String? = null
)

@JsonClass(generateAdapter = true)
data class CheckInRequest(
    val type: String,        // "water"/"sleep"/"exercise"/"diet"
    val count: Int? = null,  // water 杯数
    val note: String? = null,
    val date: String? = null
)

@JsonClass(generateAdapter = true)
data class CheckInResponse(
    val type: String,
    val count: Int
)

@JsonClass(generateAdapter = true)
data class CheckInSummary(
    val water: Int,
    val exercise: Int,
    val sleep: Int,
    val diet: Int
)

@JsonClass(generateAdapter = true)
data class RecordSummaryResponse(
    val date: String? = null,
    val list: List<CheckInItem>? = null,
    val summary: CheckInSummary
)

// ==================== 互动 - 记录点赞 / 评论 / 每日点赞 ====================
@JsonClass(generateAdapter = true)
data class RecordLikeDto(
    val id: Int,
    val from_user_id: Int,
    val target_user_id: Int,
    val record_id: String
)

@JsonClass(generateAdapter = true)
data class LikeRequest(
    val record_id: String  // 格式：food_XX / exercise_XX
)

@JsonClass(generateAdapter = true)
data class LikeResponse(
    val like: RecordLikeDto? = null
)

@JsonClass(generateAdapter = true)
data class RecordCommentDto(
    val id: Int,
    val from_user_id: Int,
    val from_nickname: String,
    val record_type: String,
    val record_id: String,
    val content: String,
    val created_at: String,
    val from_avatar: String? = null
)

@JsonClass(generateAdapter = true)
data class CommentRequest(
    val record_type: String,
    val record_id: String,
    val content: String
)

@JsonClass(generateAdapter = true)
data class CommentResponse(
    val comment: RecordCommentDto? = null,
    val comments: List<RecordCommentDto>? = null
)

@JsonClass(generateAdapter = true)
data class DailyLikeDto(
    val id: Int,
    val from_user_id: Int,
    val target_user_id: Int,
    val record_date: String,
    val created_at: String
)

@JsonClass(generateAdapter = true)
data class DailyLikeRequest(
    val target_user_id: Int,
    val record_date: String? = null
)

@JsonClass(generateAdapter = true)
data class DailyLikeResponse(
    val like: DailyLikeDto? = null,
    val liked: Boolean? = null
)

// ==================== 积分申请 ====================
@JsonClass(generateAdapter = true)
data class PointRequestDto(
    val id: Int,
    val user_id: Int,
    val type: String,           // sleep / exercise / custom
    val title: String,
    val description: String? = null,
    val points: Int,
    val exercise_id: Int? = null,
    val status: String,         // pending / approved / rejected / cancelled
    val reviewer_id: Int? = null,
    val record_date: String? = null,
    val created_at: String? = null,
    val updated_at: String? = null,
    val user_nickname: String? = null,
    val user_avatar: String? = null
)

@JsonClass(generateAdapter = true)
data class PointRequestListResponse(
    val requests: List<PointRequestDto>,
    val list: List<PointRequestDto>? = null
)

@JsonClass(generateAdapter = true)
data class PointRequestRequest(
    val type: String? = "custom",
    val title: String,
    val description: String? = "",
    val points: Int,
    val exercise_id: Int? = null,
    val record_date: String? = null
)

@JsonClass(generateAdapter = true)
data class PointRequestReviewResponse(
    val newBalance: Int? = null
)

@JsonClass(generateAdapter = true)
data class ReviewRequest(
    val status: String,          // "approved"/"rejected"
    val reviewer_comment: String? = null,
    val reason: String? = null   // reject 专用
)

// ==================== 提醒 ====================
@JsonClass(generateAdapter = true)
data class ReminderDto(
    val id: Int,
    val creator_id: Int,
    val target_user_id: Int,
    val title: String,
    val icon: String? = "⏰",
    val description: String? = "",
    val reminder_time: String,       // "HH:mm"
    val repeat_days: List<Int>? = null,  // 注意：后端序列化为数组形式
    val is_active: Int? = 1,
    val source_tag: String? = "self",
    val created_at: String? = null
)

@JsonClass(generateAdapter = true)
data class ReminderListResponse(
    val list: List<ReminderDto>,
    val reminders: List<ReminderDto>? = null
)

@JsonClass(generateAdapter = true)
data class ReminderRequest(
    val target_user_id: Int? = null,
    val title: String,
    val icon: String? = "⏰",
    val description: String? = "",
    val reminder_time: String,
    val repeat_days: List<Int>? = null,
    val source_tag: String? = null
)

@JsonClass(generateAdapter = true)
data class ReminderUpdateRequest(
    val target_user_id: Int? = null,
    val title: String? = null,
    val icon: String? = null,
    val description: String? = null,
    val reminder_time: String? = null,
    val repeat_days: List<Int>? = null,
    val is_active: Int? = null,
    val source_tag: String? = null
)
