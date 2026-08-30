package com.xlover.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.xlover.app.ui.theme.CoralDark
import com.xlover.app.ui.theme.CoralPrimary
import com.xlover.app.ui.theme.CreamSurface
import com.xlover.app.ui.theme.SuccessGreen
import com.xlover.app.ui.theme.TextPrimary
import com.xlover.app.ui.theme.TextSecondary
import com.xlover.app.ui.theme.TextTertiary

/**
 * 活动水平选项
 */
data class ActivityLevelOption(
    val key: String,
    val title: String,
    val factor: Double,
    val description: String
)

val ACTIVITY_LEVEL_OPTIONS = listOf(
    ActivityLevelOption(
        key = "sedentary",
        title = "久坐",
        factor = 1.2,
        description = "几乎不运动，办公室工作、日常久坐为主"
    ),
    ActivityLevelOption(
        key = "light",
        title = "轻度活动",
        factor = 1.375,
        description = "每周轻度运动 1-3 天，如散步、简单家务"
    ),
    ActivityLevelOption(
        key = "moderate",
        title = "中度活动",
        factor = 1.55,
        description = "每周中等强度运动 3-5 天，如慢跑、瑜伽、骑行"
    ),
    ActivityLevelOption(
        key = "high",
        title = "高度活动",
        factor = 1.725,
        description = "每周高强度运动 6-7 天，如跑步、游泳、力量训练"
    ),
    ActivityLevelOption(
        key = "extreme",
        title = "极高活动",
        factor = 1.9,
        description = "体力劳动或每天高强度训练 + 额外运动，如专业运动员"
    )
)

/**
 * 活动水平选择对话框 - 使用 AppStyleDialog 风格
 * 5 档活动水平单选，选择后持久化到后端并重新计算 TDEE
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActivityLevelDialog(
    currentLevelKey: String?,
    onDismiss: () -> Unit,
    onConfirm: (String, Double) -> Unit,
    isSubmitting: Boolean = false
) {
    var selectedKey by remember(currentLevelKey) {
        mutableStateOf(currentLevelKey ?: ACTIVITY_LEVEL_OPTIONS[1].key)
    }
    var submittingLocal by remember { mutableStateOf(false) }

    Dialog(
        onDismissRequest = { if (!isSubmitting && !submittingLocal) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !isSubmitting && !submittingLocal, dismissOnClickOutside = !isSubmitting && !submittingLocal)
    ) {
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = CreamSurface),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(24.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                Text(
                    "选择活动水平",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = TextPrimary
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "活动水平用于科学计算每日推荐热量（TDEE），建议每周一重新评估本周情况",
                    style = MaterialTheme.typography.bodySmall,
                    color = TextTertiary
                )
                Spacer(modifier = Modifier.height(16.dp))

                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    ACTIVITY_LEVEL_OPTIONS.forEach { option ->
                        val selected = selectedKey == option.key
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !isSubmitting && !submittingLocal) {
                                    selectedKey = option.key
                                },
                            shape = RoundedCornerShape(12.dp),
                            colors = CardDefaults.cardColors(
                                containerColor = if (selected) CoralPrimary.copy(alpha = 0.08f) else Color.Transparent
                            ),
                            border = if (selected) androidx.compose.foundation.BorderStroke(
                                1.5.dp,
                                CoralPrimary
                            ) else null
                        ) {
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp, vertical = 12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(
                                    imageVector = if (selected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                                    contentDescription = null,
                                    tint = if (selected) SuccessGreen else CoralDark,
                                    modifier = Modifier.size(22.dp)
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text(
                                            option.title,
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.SemiBold,
                                            color = TextPrimary
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(
                                            "×${option.factor}",
                                            style = MaterialTheme.typography.bodySmall,
                                            fontWeight = FontWeight.SemiBold,
                                            color = CoralPrimary
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(2.dp))
                                    Text(
                                        option.description,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = TextSecondary
                                    )
                                }
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    TextButton(
                        onClick = onDismiss,
                        enabled = !isSubmitting && !submittingLocal
                    ) {
                        Text("取消", color = TextSecondary)
                    }
                    Spacer(modifier = Modifier.width(12.dp))
                    Button(
                        onClick = {
                            submittingLocal = true
                            val selected = ACTIVITY_LEVEL_OPTIONS.first { it.key == selectedKey }
                            onConfirm(selected.key, selected.factor)
                        },
                        enabled = !isSubmitting && !submittingLocal,
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = CoralPrimary,
                            contentColor = Color.White,
                            disabledContainerColor = CoralPrimary.copy(alpha = 0.55f),
                            disabledContentColor = Color.White.copy(alpha = 0.9f)
                        )
                    ) {
                        Text(
                            if (isSubmitting || submittingLocal) "保存中..." else "确定",
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }
    }
}
