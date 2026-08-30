package com.xlover.app.data.remote

import com.xlover.app.data.remote.dto.*
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {

    // ==================== 认证 ====================
    @POST("api/auth/register")
    suspend fun register(@Body request: RegisterRequest): ApiResponse<AuthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): ApiResponse<AuthResponse>

    @GET("api/auth/me")
    suspend fun getMe(@Header("Authorization") token: String): ApiResponse<MeResponse>

    @POST("api/auth/unbind")
    suspend fun unbind(@Header("Authorization") token: String): ApiResponse<Any>

    // ==================== Dashboard ====================
    @GET("api/dashboard")
    suspend fun getDashboard(@Header("Authorization") token: String): ApiResponse<DashboardResponse>

    // ==================== 记录 - 饮食 ====================
    @GET("api/records/food")
    suspend fun getFoods(
        @Header("Authorization") token: String,
        @Query("date") date: String? = null
    ): ApiResponse<FoodListResponse>

    @POST("api/records/food")
    suspend fun addFood(
        @Header("Authorization") token: String,
        @Body request: FoodRequest
    ): ApiResponse<FoodRecordDto>

    @PUT("api/records/food/{id}")
    suspend fun updateFood(
        @Header("Authorization") token: String,
        @Path("id") id: Int,
        @Body request: FoodRequest
    ): ApiResponse<FoodRecordDto>

    @DELETE("api/records/food/{id}")
    suspend fun deleteFood(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    // ==================== 记录 - 运动 ====================
    @GET("api/records/exercise")
    suspend fun getExercises(
        @Header("Authorization") token: String,
        @Query("date") date: String? = null
    ): ApiResponse<ExerciseListResponse>

    @POST("api/records/exercise")
    suspend fun addExercise(
        @Header("Authorization") token: String,
        @Body request: ExerciseRequest
    ): ApiResponse<ExerciseRecordDto>

    @PUT("api/records/exercise/{id}")
    suspend fun updateExercise(
        @Header("Authorization") token: String,
        @Path("id") id: Int,
        @Body request: ExerciseRequest
    ): ApiResponse<ExerciseRecordDto>

    @DELETE("api/records/exercise/{id}")
    suspend fun deleteExercise(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    // ==================== 记录 - 体重 ====================
    @GET("api/records/weight")
    suspend fun getWeights(
        @Header("Authorization") token: String,
        @Query("days") days: Int = 7
    ): ApiResponse<WeightListResponse>

    @POST("api/records/weight")
    suspend fun addWeight(
        @Header("Authorization") token: String,
        @Body request: WeightRequest
    ): ApiResponse<WeightRecordDto>

    @DELETE("api/records/weight/{id}")
    suspend fun deleteWeight(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    // ==================== 任务 ====================
    @GET("api/tasks")
    suspend fun getTasks(
        @Header("Authorization") token: String,
        @Query("status") status: String? = null
    ): ApiResponse<TaskListResponse>

    @POST("api/tasks")
    suspend fun createTask(
        @Header("Authorization") token: String,
        @Body request: TaskRequest
    ): ApiResponse<TaskDto>

    @PUT("api/tasks/{id}/accept")
    suspend fun acceptTask(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<TaskDto>

    @PUT("api/tasks/{id}/reject")
    suspend fun rejectTask(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    @PUT("api/tasks/{id}/complete")
    suspend fun completeTask(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<TaskCompleteResponse>

    @DELETE("api/tasks/{id}")
    suspend fun deleteTask(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    // ==================== 进度 ====================
    @GET("api/progress/weight")
    suspend fun getWeightProgress(
        @Header("Authorization") token: String,
        @Query("days") days: Int = 30
    ): ApiResponse<WeightProgressResponse>

    @GET("api/progress/achievements")
    suspend fun getAchievements(
        @Header("Authorization") token: String
    ): ApiResponse<AchievementListResponse>

    @GET("api/progress/stats")
    suspend fun getStats(
        @Header("Authorization") token: String
    ): ApiResponse<StatsResponse>

    // ==================== 消息 ====================
    @GET("api/messages")
    suspend fun getMessages(
        @Header("Authorization") token: String,
        @Query("limit") limit: Int = 100
    ): ApiResponse<MessageListResponse>

    @POST("api/messages")
    suspend fun sendMessage(
        @Header("Authorization") token: String,
        @Body request: MessageRequest
    ): ApiResponse<MessageDto>

    @GET("api/messages/unread-count")
    suspend fun getUnreadCount(
        @Header("Authorization") token: String
    ): ApiResponse<UnreadCountResponse>

    // ==================== 奖励 ====================
    @GET("api/rewards")
    suspend fun getRewards(
        @Header("Authorization") token: String
    ): ApiResponse<RewardListResponse>

    @POST("api/rewards")
    suspend fun createReward(
        @Header("Authorization") token: String,
        @Body request: RewardRequest
    ): ApiResponse<RewardDto>

    @POST("api/rewards/{id}/claim")
    suspend fun claimReward(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<RewardClaimResponse>

    // ==================== 个人资料 ====================
    @GET("api/profile")
    suspend fun getProfile(
        @Header("Authorization") token: String
    ): ApiResponse<ProfileResponse>

    @PUT("api/profile")
    suspend fun updateProfile(
        @Header("Authorization") token: String,
        @Body request: ProfileUpdateRequest
    ): ApiResponse<ProfileUpdateResponse>

    @GET("api/profile/points")
    suspend fun getPointsHistory(
        @Header("Authorization") token: String,
        @Query("limit") limit: Int = 50
    ): ApiResponse<PointsHistoryResponse>

    // ==================== 食物库 / 运动库 ====================
    @GET("api/records/food-library")
    suspend fun searchFoodLibrary(
        @Header("Authorization") token: String,
        @Query("q") keyword: String? = null,
        @Query("category") category: String? = null,
        @Query("page") page: Int = 1,
        @Query("pageSize") pageSize: Int = 50
    ): ApiResponse<FoodLibraryResponse>

    @GET("api/records/exercise-library")
    suspend fun getExerciseLibrary(
        @Header("Authorization") token: String,
        @Query("keyword") keyword: String? = null,
        @Query("category") category: String? = null
    ): ApiResponse<ExerciseLibraryResponse>

    // ==================== 打卡（喝水/睡觉/运动/饮食）====================
    @POST("api/records/checkins")
    suspend fun checkIn(
        @Header("Authorization") token: String,
        @Body request: CheckInRequest
    ): ApiResponse<CheckInResponse>

    @GET("api/records/checkins")
    suspend fun getRecordSummary(
        @Header("Authorization") token: String,
        @Query("date") date: String? = null
    ): ApiResponse<RecordSummaryResponse>

    // ==================== 互动 - 记录点赞 / 评论 / 日赞 ====================
    @POST("api/interactions/record-likes")
    suspend fun likeRecord(
        @Header("Authorization") token: String,
        @Body request: LikeRequest
    ): ApiResponse<LikeResponse>

    @DELETE("api/interactions/record-likes/{record_id}")
    suspend fun unlikeRecord(
        @Header("Authorization") token: String,
        @Path("record_id") recordId: String
    ): ApiResponse<Any>

    @POST("api/interactions/record-comments")
    suspend fun commentRecord(
        @Header("Authorization") token: String,
        @Body request: CommentRequest
    ): ApiResponse<CommentResponse>

    @GET("api/interactions/record-comments")
    suspend fun getRecordComments(
        @Header("Authorization") token: String,
        @Query("record_type") recordType: String,
        @Query("record_id") recordId: String
    ): ApiResponse<CommentResponse>

    @POST("api/interactions/daily-likes")
    suspend fun dailyLike(
        @Header("Authorization") token: String,
        @Body request: DailyLikeRequest
    ): ApiResponse<DailyLikeResponse>

    // ==================== 积分申请 ====================
    @GET("api/point-requests")
    suspend fun getPointRequests(
        @Header("Authorization") token: String,
        @Query("status") status: String? = null,
        @Query("type") type: String? = null
    ): ApiResponse<PointRequestListResponse>

    @POST("api/point-requests")
    suspend fun createPointRequest(
        @Header("Authorization") token: String,
        @Body request: PointRequestRequest
    ): ApiResponse<PointRequestDto>

    @PUT("api/point-requests/{id}/approve")
    suspend fun approvePointRequest(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<PointRequestReviewResponse>

    @PUT("api/point-requests/{id}/reject")
    suspend fun rejectPointRequest(
        @Header("Authorization") token: String,
        @Path("id") id: Int,
        @Body request: ReviewRequest? = null
    ): ApiResponse<Any>

    @PUT("api/point-requests/{id}/cancel")
    suspend fun cancelPointRequest(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    // ==================== 提醒 ====================
    @GET("api/reminders")
    suspend fun getReminders(
        @Header("Authorization") token: String,
        @Query("is_active") isActive: String? = null
    ): ApiResponse<ReminderListResponse>

    @POST("api/reminders")
    suspend fun createReminder(
        @Header("Authorization") token: String,
        @Body request: ReminderRequest
    ): ApiResponse<ReminderDto>

    @PUT("api/reminders/{id}")
    suspend fun updateReminder(
        @Header("Authorization") token: String,
        @Path("id") id: Int,
        @Body request: ReminderUpdateRequest
    ): ApiResponse<ReminderDto>

    @DELETE("api/reminders/{id}")
    suspend fun deleteReminder(
        @Header("Authorization") token: String,
        @Path("id") id: Int
    ): ApiResponse<Any>

    @PUT("api/reminders/{id}/toggle")
    suspend fun toggleReminder(
        @Header("Authorization") token: String,
        @Path("id") id: Int,
        @Body body: Map<String, Int>
    ): ApiResponse<ReminderDto>
}
