package com.xlover.app.data.repository

import com.xlover.app.data.remote.ApiService
import com.xlover.app.data.remote.dto.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecordsRepository @Inject constructor(
    private val api: ApiService
) {
    // 饮食
    suspend fun getFoods(token: String, date: String? = null) = api.getFoods(token, date)
    suspend fun addFood(token: String, request: FoodRequest) = api.addFood(token, request)
    suspend fun updateFood(token: String, id: Int, request: FoodRequest) = api.updateFood(token, id, request)
    suspend fun deleteFood(token: String, id: Int) = api.deleteFood(token, id)

    // 运动
    suspend fun getExercises(token: String, date: String? = null) = api.getExercises(token, date)
    suspend fun addExercise(token: String, request: ExerciseRequest) = api.addExercise(token, request)
    suspend fun updateExercise(token: String, id: Int, request: ExerciseRequest) = api.updateExercise(token, id, request)
    suspend fun deleteExercise(token: String, id: Int) = api.deleteExercise(token, id)

    // 体重
    suspend fun getWeights(token: String, days: Int = 7) = api.getWeights(token, days)
    suspend fun addWeight(token: String, request: WeightRequest) = api.addWeight(token, request)
    suspend fun deleteWeight(token: String, id: Int) = api.deleteWeight(token, id)

    // 食物库搜索
    suspend fun searchFoodLibrary(
        token: String,
        keyword: String? = null,
        category: String? = null,
        page: Int = 1,
        pageSize: Int = 50
    ) = api.searchFoodLibrary(token, keyword, category, page, pageSize)

    // 运动库列表
    suspend fun getExerciseLibrary(
        token: String,
        keyword: String? = null,
        category: String? = null
    ) = api.getExerciseLibrary(token, keyword, category)

    // 打卡（喝水/睡觉/运动/饮食）
    suspend fun checkIn(token: String, request: CheckInRequest) = api.checkIn(token, request)

    // 今日打卡汇总
    suspend fun getRecordSummary(token: String, date: String? = null) = api.getRecordSummary(token, date)
}

@Singleton
class TasksRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getTasks(token: String, status: String? = null) = api.getTasks(token, status)
    suspend fun createTask(token: String, request: TaskRequest) = api.createTask(token, request)
    suspend fun acceptTask(token: String, id: Int) = api.acceptTask(token, id)
    suspend fun rejectTask(token: String, id: Int) = api.rejectTask(token, id)
    suspend fun completeTask(token: String, id: Int) = api.completeTask(token, id)
    suspend fun deleteTask(token: String, id: Int) = api.deleteTask(token, id)
}

@Singleton
class ProgressRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getWeightProgress(token: String, days: Int = 30) = api.getWeightProgress(token, days)
    suspend fun getAchievements(token: String) = api.getAchievements(token)
    suspend fun getStats(token: String) = api.getStats(token)
}

@Singleton
class MessagesRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getMessages(token: String, limit: Int = 100) = api.getMessages(token, limit)
    suspend fun sendMessage(token: String, content: String) = api.sendMessage(token, MessageRequest(content))
    suspend fun getUnreadCount(token: String) = api.getUnreadCount(token)
}

@Singleton
class RewardsRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getRewards(token: String) = api.getRewards(token)
    suspend fun createReward(token: String, request: RewardRequest) = api.createReward(token, request)
    suspend fun claimReward(token: String, id: Int) = api.claimReward(token, id)
}

@Singleton
class ProfileRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getProfile(token: String) = api.getProfile(token)
    suspend fun updateProfile(token: String, request: ProfileUpdateRequest) = api.updateProfile(token, request)
    suspend fun getPointsHistory(token: String, limit: Int = 50) = api.getPointsHistory(token, limit)
}

@Singleton
class InteractionsRepository @Inject constructor(
    private val api: ApiService
) {
    // 记录点赞 (record_id 格式 food_XX / exercise_XX)
    suspend fun likeRecord(token: String, recordId: String) =
        api.likeRecord(token, LikeRequest(record_id = recordId))

    suspend fun unlikeRecord(token: String, recordId: String) =
        api.unlikeRecord(token, recordId)

    // 记录评论
    suspend fun commentRecord(token: String, recordType: String, recordId: String, content: String) =
        api.commentRecord(token, CommentRequest(recordType, recordId, content))

    suspend fun getRecordComments(token: String, recordType: String, recordId: String) =
        api.getRecordComments(token, recordType, recordId)

    // 每日点赞
    suspend fun dailyLike(token: String, targetUserId: Int, recordDate: String? = null) =
        api.dailyLike(token, DailyLikeRequest(target_user_id = targetUserId, record_date = recordDate))
}

@Singleton
class PointRequestsRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getPointRequests(
        token: String,
        status: String? = null,
        type: String? = null
    ) = api.getPointRequests(token, status, type)

    suspend fun createPointRequest(token: String, request: PointRequestRequest) =
        api.createPointRequest(token, request)

    suspend fun approvePointRequest(token: String, id: Int) =
        api.approvePointRequest(token, id)

    suspend fun rejectPointRequest(token: String, id: Int, reason: String? = null) =
        api.rejectPointRequest(token, id, reason?.let { ReviewRequest(status = "rejected", reason = it) })

    suspend fun cancelPointRequest(token: String, id: Int) =
        api.cancelPointRequest(token, id)
}

@Singleton
class RemindersRepository @Inject constructor(
    private val api: ApiService
) {
    suspend fun getReminders(token: String, isActive: String? = null) =
        api.getReminders(token, isActive)

    suspend fun createReminder(token: String, request: ReminderRequest) =
        api.createReminder(token, request)

    suspend fun updateReminder(token: String, id: Int, request: ReminderUpdateRequest) =
        api.updateReminder(token, id, request)

    suspend fun deleteReminder(token: String, id: Int) =
        api.deleteReminder(token, id)

    suspend fun toggleReminder(token: String, id: Int, isActive: Int) =
        api.toggleReminder(token, id, mapOf("is_active" to isActive))
}
