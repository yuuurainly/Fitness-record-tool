---
name: "unify-dialog-style"
description: "Refactors Jetpack Compose AlertDialog usages into the unified AppStyleDialog look (cream card + rounded buttons + TextField colors + disabled contrast). Invoke when user says 'fix this popup/dialog style' or a screenshot still shows the dark native AlertDialog card."
---

# Unify Dialog Style

This workspace has **one canonical dialog design** called `AppStyleDialog` (CreamSurface, 20dp rounded card, 8dp elevation, title top-left with titleLarge/Bold, dismiss TextButton on bottom-left and a filled confirm Button on bottom-right with `RoundedCornerShape(12.dp)` and disabled colors with enough contrast (`CoralPrimary.copy(alpha=0.55f)` container + `White.copy(alpha=0.9f)` content).

Invoke this skill whenever:
1. User sends a screenshot and says "这个弹出也改一下" / "把这个弹窗也改改" / "this popup still looks wrong".
2. You spot a dialog rendered with stock `AlertDialog(title =, text =, confirmButton =, dismissButton =)` instead of `AppStyleDialog(...)`.
3. Any input inside a dialog has light gray user-typed text, missing border focus color, missing leading-zero cleanup in numeric fields, or remember() without a key so stale state returns after the source data changed.

---

## Step 1 — Scan: find every dialog still not migrated

Run these **search targets** inside the Android app source folder `Xlover-Android/app/src/main/java/`:

1. `AlertDialog\(` — direct calls to Material 3 `AlertDialog(...)` API with `title= / text= / confirmButton= / dismissButton=`.
2. `androidx.compose.ui.window.Dialog` followed by a hand-written `Card(...)` that does NOT use `AppStyleDialog`.
3. Any Composable named `*Dialog` (pattern `fun \w+Dialog\(`) that is NOT imported from `com.xlover.app.ui.components.AppStyleDialogKt`.

**Always list the findings FIRST before editing**, so the user can confirm scope (e.g. "I found these 3 remaining dialogs: WeightRecordDelete, CancelTask, ShareAchievement. Want all 3 converted?") — unless the user already pointed at a specific single dialog in which case just go ahead.

---

## Step 2 — For the target dialog, rewrite the wrapper to AppStyleDialog

### Before (native AlertDialog pattern, DO NOT keep):

```kotlin
AlertDialog(
    onDismissRequest = { showX = false },
    title = { Text("标题", fontWeight = FontWeight.Bold) },
    text = {
        Column {
            Text("说明文字…")
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(...)
        }
    },
    confirmButton = {
        TextButton(onClick = { submit() ; showX = false },
            colors = ButtonDefaults.textButtonColors(contentColor = CoralPrimary)) { Text("确定") }
    },
    dismissButton = {
        TextButton(onClick = { showX = false }) { Text("取消") }
    }
)
```

### After (AppStyleDialog wrapper — REQUIRED):

```kotlin
AppStyleDialog(
    title = "设置每日喝水目标",
    onDismiss = { showX = false },
    onConfirm = {
        parsed?.let { submit(it) }
        showX = false
    },
    confirmText = "确定",
    confirmEnabled = parsed != null && parsed in 1..20   // ← bind validity, never leave "always true"
) {
    Text("说明文字…", style = MaterialTheme.typography.bodySmall, color = TextSecondary)
    Spacer(Modifier.height(12.dp))
    OutlinedTextField(...)   // ← see Step 3 for TextField mandatory rules
}
```

### Important imports to add when missing:

```kotlin
import com.xlover.app.ui.components.AppStyleDialog          // the shared component
import androidx.compose.foundation.layout.Spacer             // if "Unresolved reference: Spacer" appears
import com.xlover.app.ui.theme.TextBlack                    // TextField text color
import com.xlover.app.ui.theme.CoralPrimary / DividerColor  // TextField focused/unfocused border color
```

⚠️ Do **NOT** re-bundle `Card` + `Dialog` + `Column` manually in each file — that's the job of `AppStyleDialog`. The entire point of this skill is to make every dialog go through that ONE component, so future color or shadow tweaks affect all dialogs at once.

---

## Step 3 — Fix TextField rules (apply inside every AppStyleDialog content block)

Every `OutlinedTextField` rendered inside a dialog **MUST** have this exact block or it violates the workspace design:

```kotlin
OutlinedTextField(
    value = input,
    onValueChange = { newVal -> input = sanitize(newVal) /* see sanitize rules below */ },
    label = { Text("杯数 (1-20)") },
    placeholder = { /* optional */ },
    singleLine = true,
    modifier = Modifier.fillMaxWidth(),
    shape = RoundedCornerShape(12.dp),
    colors = OutlinedTextFieldDefaults.colors(
        focusedTextColor = TextBlack,
        unfocusedTextColor = TextBlack,
        focusedBorderColor = CoralPrimary,
        unfocusedBorderColor = DividerColor,
        focusedLabelColor = CoralPrimary,
        unfocusedLabelColor = TextSecondary
    )
)
```

### Numeric field sanitize rules (in `onValueChange`):

- `val digits = raw.filter { it.isDigit() }` — drop any non-numeric char.
- `.trimStart('0').ifEmpty { "0" }` — remove leading zeros (but keep single `0` if user wants to start typing 08).
- `if (digits.length > MAX_DIGITS) digits.take(MAX_DIGITS) else digits` — clamp length. MAX_DIGITS is typically **2** for water goal (max 20), **3** for weight (max 300kg), **4** for calories (max 9999), etc. Derive from the range bound the backend accepts.

### String / name field sanitize:

- Trim only; don't mutate content unless there is a hard backend length limit (then take).

### remember with the right key:

```kotlin
// ❌ wrong — dialog reopened after external change shows stale value
var input by remember { mutableStateOf(currentWaterGoal.toString()) }

// ✅ correct
var input by remember(currentWaterGoal) { mutableStateOf(currentWaterGoal.toString()) }
```

The dependency key must be the same **single source of truth** the dialog would modify. E.g. for profile edit dialog use `profile`, for water goal use `waterGoal`, for task recurrence count use `habitDays`.

---

## Step 4 — Confirm button: tie enabled state to validation

AppStyleDialog already accepts a `confirmEnabled: Boolean` parameter. You **must not** leave it as `true`. Calculate once per recompose:

```kotlin
val cups = input.filter { it.isDigit() }.toIntOrNull()
val canConfirm = cups != null && cups in 1..20   // exact backend range

AppStyleDialog(
    ...,
    confirmEnabled = canConfirm,
    onConfirm = {
        cups!!.let { onSetWaterGoal(it) }   // safe to !! because enabled gates the click
        showX = false
    }
)
```

Why this is enforced: before this rule, users could type "0" then click OK and **nothing happened** with no feedback. That silent failure was confusing. Disabling the button until valid removes the ambiguity.

For async operations (network save) also propagate `isSubmitting` state to keep button disabled + change `confirmText = if (isSubmitting) "保存中…" else "确定"`. See `ServerUrlDialog.kt` for the canonical loading-state example.

---

## Step 5 (optional but included per skill options) — Batch report of remaining unmigrated dialogs

After the current dialog is fixed, run one full-project grep to build a report:

> Files with pattern `AlertDialog\(` that are NOT components/AppStyleDialog.kt itself:
> 1. `src/main/java/.../FooScreen.kt:123 — AlertDialog(onDismissRequest = { showDeleteDialog = false })`
> 2. `src/main/java/.../BarScreen.kt:456 — AlertDialog(title = { Text("取消任务?") })`
> 3. ...

Present as a numbered list to the user **without auto-applying the migration** unless they reply "都改了" / "apply all". This prevents accidental large-scale edits without review.

---

## Step 6 — Verify

End with `gradlew.bat assembleDebug --no-daemon | Select-Object -Last 30` to make sure no imports or named arguments break. Don't mark the skill's job done if the build doesn't pass.

---

## Known pitfalls already hit in this workspace — never repeat them:

1. **"Unresolved reference: Spacer"** — fix: add `import androidx.compose.foundation.layout.Spacer`. Happens because hand-written AlertDialog.text didn't use Spacer before, AppStyleDialog content does.
2. **"Cannot find a parameter with this name: textColor"** — fix: `textColor` isn't a root parameter of `OutlinedTextFieldDefaults.colors()`, use `focusedTextColor` / `unfocusedTextColor` inside `colors = OutlinedTextFieldDefaults.colors(...)`.
3. **`Modifier.width(someVariable)` where variable is `Int` / `null`** — `Modifier.width()` only accepts `Dp`. If sizing an Icon, use `Modifier.size(16.dp)` instead.
4. **`remember { mutableStateOf(x) }` without a key + cross-tab navigation causing the dialog state to reset back to an old value when returning.** Always pass `x` as the remember key.
5. **Global event `AppState.requestOpenXxxDialog` with `remember` local counter → event re-fires every re-entry** (the FailureTracker bug from last week): instead use `takeXxxEvent()` pattern on the AppState singleton, never rely on `remember` lasting longer than the Composable's lifetime.
