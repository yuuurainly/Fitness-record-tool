package com.xlover.app.util

/**
 * 全局 Token 管理器
 * 登录后设置 token，所有 ViewModel 从这里读取
 */
object TokenManager {
    private var _token: String = ""
    private var _userId: Int = 0
    private var _username: String = ""
    private var _nickname: String = ""
    private var _role: String = "main"
    private var _partnerId: Int = 0
    private var _bindCode: String = ""

    var token: String
        get() = _token
        set(value) { _token = value }

    var userId: Int
        get() = _userId
        set(value) { _userId = value }

    var username: String
        get() = _username
        set(value) { _username = value }

    var nickname: String
        get() = _nickname
        set(value) { _nickname = value }

    var role: String
        get() = _role
        set(value) { _role = value }

    var partnerId: Int
        get() = _partnerId
        set(value) { _partnerId = value }

    var bindCode: String
        get() = _bindCode
        set(value) { _bindCode = value }

    val isLoggedIn: Boolean
        get() = _token.isNotEmpty()

    fun clear() {
        _token = ""
        _userId = 0
        _username = ""
        _nickname = ""
        _role = "main"
        _partnerId = 0
        _bindCode = ""
    }

    fun setFromLogin(data: LoginUserData) {
        _token = data.token
        _userId = data.userId
        _username = data.username
        _nickname = data.nickname
        _role = data.role
        _partnerId = data.partnerId
        _bindCode = data.bindCode
    }
}

data class LoginUserData(
    val token: String,
    val userId: Int,
    val username: String,
    val nickname: String,
    val role: String,
    val partnerId: Int,
    val bindCode: String
)
