package com.xlover.app.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.xlover.app.ui.theme.CoralPrimary
import com.xlover.app.ui.theme.DividerColor
import com.xlover.app.ui.theme.SkyTertiary
import com.xlover.app.ui.theme.TextBlack
import com.xlover.app.ui.theme.TextSecondary
import com.xlover.app.util.Constants
import com.xlover.app.util.DataStoreHolder
import com.xlover.app.util.FailureTracker
import com.xlover.app.util.ServerUrlManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * 服务器地址修改对话框（独立组件）：
 *  - 登录页、首页、我的页面、连接失败自动弹出时共用。
 *  - 保存后立即：更新 ServerUrlManager、清空 FailureTracker 的失败计数、Toast 提示。
 *  - [introMessage] 可用于弹出时显示额外说明（例如"已连续多次无法连接，可能是后端地址不对"）。
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServerUrlDialog(
    onDismiss: () -> Unit,
    onChanged: (String) -> Unit = {},
    introMessage: String? = "后端服务无法连接，请确认电脑/手机在同一 WiFi，然后填入电脑的局域网 IP 和端口 3000。\n示例：http://192.168.1.10:3000"
) {
    val ctx = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var input by remember { mutableStateOf(ServerUrlManager.getUrl().removeSuffix("/")) }
    var saving by remember { mutableStateOf(false) }

    AppStyleDialog(
        title = "修改后端服务地址",
        onDismiss = { if (!saving) onDismiss() },
        onConfirm = {
            saving = true
            val ds = DataStoreHolder.get(ctx.applicationContext)
            coroutineScope.launch(Dispatchers.IO) {
                runCatching {
                    ServerUrlManager.setUrl(ds, input)
                }.onSuccess {
                    // 用户手动改过地址了：重置失败计数，避免马上又弹一次
                    FailureTracker.reset()
                    withContext(Dispatchers.Main) {
                        saving = false
                        android.widget.Toast.makeText(
                            ctx,
                            "已保存：${ServerUrlManager.display()}\n下次请求会使用新地址",
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                        onChanged(ServerUrlManager.display())
                        onDismiss()
                    }
                }.onFailure { t ->
                    withContext(Dispatchers.Main) {
                        saving = false
                        android.widget.Toast.makeText(
                            ctx,
                            "保存失败：${t.message ?: t.javaClass.simpleName}",
                            android.widget.Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            }
        },
        confirmText = if (saving) "保存中…" else "保存",
        confirmEnabled = input.isNotBlank() && !saving
    ) {
        if (!introMessage.isNullOrBlank()) {
            Text(
                introMessage,
                style = MaterialTheme.typography.bodySmall,
                color = TextSecondary
            )
            Spacer(modifier = Modifier.height(12.dp))
        }
        OutlinedTextField(
            value = input,
            onValueChange = { input = it },
            label = { Text("后端服务地址") },
            placeholder = { Text("http://局域网IP:3000") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = TextBlack,
                unfocusedTextColor = TextBlack,
                focusedBorderColor = CoralPrimary,
                unfocusedBorderColor = DividerColor
            )
        )
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.End
        ) {
            TextButton(
                onClick = { input = Constants.DEFAULT_BASE_URL.removeSuffix("/") },
                colors = ButtonDefaults.textButtonColors(contentColor = SkyTertiary)
            ) {
                Icon(
                        Icons.Default.Refresh,
                        contentDescription = null,
                        modifier = Modifier.size(16.dp)
                    )
                Spacer(modifier = Modifier.width(4.dp))
                Text("恢复默认", fontWeight = FontWeight.Medium)
            }
        }
    }
}
