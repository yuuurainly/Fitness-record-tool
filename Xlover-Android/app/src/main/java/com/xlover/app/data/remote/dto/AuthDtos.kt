package com.xlover.app.data.remote.dto

import com.squareup.moshi.JsonClass

@JsonClass(generateAdapter = true)
data class ApiResponse<T>(
    val success: Boolean,
    val message: String,
    val data: T?
)

@JsonClass(generateAdapter = true)
data class LoginRequest(
    val username: String,
    val password: String
)

@JsonClass(generateAdapter = true)
data class RegisterRequest(
    val username: String,
    val password: String,
    val nickname: String,
    val role: String = "main"
)

@JsonClass(generateAdapter = true)
data class AuthResponse(
    val token: String,
    val user: UserDto
)

@JsonClass(generateAdapter = true)
data class UserDto(
    val id: Int,
    val username: String,
    val nickname: String,
    val avatar: String? = null,
    val role: String,
    val partner_id: Int?,
    val bind_code: String?
)

@JsonClass(generateAdapter = true)
data class UserProfileDto(
    val id: Int,
    val user_id: Int,
    val gender: String,
    val age: Int,
    val height: Double,
    val current_weight: Double,
    val target_weight: Double,
    val activity_level: String,
    val daily_calorie_goal: Int
)

@JsonClass(generateAdapter = true)
data class MeResponse(
    val user: UserDto,
    val profile: UserProfileDto?,
    val partner: UserDto?
)

@JsonClass(generateAdapter = true)
data class BindRequest(
    val bindCode: String
)

@JsonClass(generateAdapter = true)
data class BindResponse(
    val user: UserDto,
    val partner: UserDto
)
