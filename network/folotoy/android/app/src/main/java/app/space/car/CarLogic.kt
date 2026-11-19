package app.space.car

import app.space.car.Protocol.Btn
import app.space.car.Protocol.Ev

/**
 * 车控的按键状态机（纯逻辑，不碰 Android，有单元测试）。
 *
 * FoloToy 只把「app 要处理的键」送过来（见韧体 car_remote_model.c）：
 *   一般模式：下 长按（微信读书）、确定 长按（WhatsApp 选人）、所有键的 按下 / 放开
 *   选择模式：所有键
 *
 * 微信读书：下 长按 → 清单（第一项「继续上次那本」）→ 3 秒没按就自动继续；上下选、确定播
 * WhatsApp：确定 长按 → 常联络清单（手机念名字）→ 确定 = 语音通话、按住确定 = 录语音讯息（放开送出）
 * 任何清单：上 长按 = 取消；15 秒没动作 = 自动取消
 */
class CarLogic(
    /** 常联络（显示名字、FoloToy 上的英文名）；每次用到才读，设定改了马上生效 */
    private val contacts: () -> List<Friend>,
    /** 微信读书清单（第一项一定是「继续上次那本」） */
    private val books: () -> List<String> = { emptyList() },
) {
    data class Friend(val name: String, val label: String)

    sealed class Effect {
        data class Mode(val select: Boolean) : Effect()
        data class Text(val line: Int, val text: String) : Effect()
        data class Speak(val text: String) : Effect()
        /** bookIndex = -1：继续上次那本；其他：清单里第几本 */
        data class OpenWeRead(val bookIndex: Int) : Effect()
        data class Call(val index: Int) : Effect()
        data class VoiceStart(val index: Int) : Effect()
        object VoiceStop : Effect()
        object VoiceCancel : Effect()
    }

    private enum class Screen { IDLE, WEREAD, CONTACTS, RECORDING }

    private var screen = Screen.IDLE
    private var cursor = 0
    private var deadline = 0L        // 微信读书：几时自动继续；其他：几时自动取消
    private var recordingIndex = -1

    val busy: Boolean get() = screen != Screen.IDLE

    fun onKey(btn: Btn, ev: Ev, nowMs: Long): List<Effect> = when (screen) {
        Screen.IDLE -> idleKey(btn, ev, nowMs)
        Screen.WEREAD -> listKey(btn, ev, nowMs, weRead = true)
        Screen.CONTACTS -> listKey(btn, ev, nowMs, weRead = false)
        Screen.RECORDING -> recordingKey(btn, ev, nowMs)
    }

    fun onTick(nowMs: Long): List<Effect> {
        if (screen == Screen.IDLE || nowMs < deadline) return emptyList()
        return when (screen) {
            Screen.WEREAD -> finish(Effect.OpenWeRead(bookIndex(cursor)))
            Screen.RECORDING -> finish(Effect.VoiceStop)   // 最长 60 秒
            else -> finish(Effect.Speak("取消"))
        }
    }

    /** FoloToy 断线：放弃进行中的东西（录到一半就取消，不要送出半截） */
    fun onDisconnected(): List<Effect> {
        val wasRecording = screen == Screen.RECORDING
        reset()
        return if (wasRecording) listOf(Effect.VoiceCancel) else emptyList()
    }

    // ---------- 一般 ----------
    private fun idleKey(btn: Btn, ev: Ev, now: Long): List<Effect> {
        if (ev != Ev.LONG) return emptyList()
        return when (btn) {
            Btn.DOWN -> openList(Screen.WEREAD, now)
            Btn.OK -> {
                if (contacts().isEmpty()) listOf(Effect.Speak("还没有设定常联络的朋友，请在手机的 SPACE 车控里加"))
                else openList(Screen.CONTACTS, now)
            }
            Btn.UP -> emptyList()
        }
    }

    private fun openList(s: Screen, now: Long): List<Effect> {
        screen = s
        cursor = 0
        deadline = now + if (s == Screen.WEREAD) WEREAD_AUTO_MS else LIST_TIMEOUT_MS
        val title = if (s == Screen.WEREAD) "WeRead" else "WhatsApp"
        return listOf(Effect.Mode(true), Effect.Text(0, title)) + showItem(intro = true)
    }

    // ---------- 清单 ----------
    private fun listKey(btn: Btn, ev: Ev, now: Long, weRead: Boolean): List<Effect> {
        if (btn == Btn.UP && ev == Ev.LONG) return finish(Effect.Speak("取消"))
        val size = itemCount()
        if (ev == Ev.CLICK && (btn == Btn.UP || btn == Btn.DOWN)) {
            val next = (cursor + if (btn == Btn.DOWN) 1 else -1).coerceIn(0, size - 1)
            deadline = now + LIST_TIMEOUT_MS   // 动过就不自动继续了，改成 15 秒没动作才取消
            if (next == cursor) return emptyList()   // 到两端就停
            cursor = next
            return showItem(intro = false)
        }
        if (btn != Btn.OK) return emptyList()
        if (weRead) {
            return if (ev == Ev.CLICK) finish(Effect.OpenWeRead(bookIndex(cursor))) else emptyList()
        }
        return when (ev) {
            Ev.CLICK -> finish(Effect.Speak("打给 ${contacts()[cursor].name}"), Effect.Call(cursor))
            Ev.LONG -> {   // 按住确定：开始录，放开就送
                screen = Screen.RECORDING
                recordingIndex = cursor
                deadline = now + RECORD_MAX_MS
                listOf(Effect.Mode(false), Effect.VoiceStart(cursor))
            }
            else -> emptyList()
        }
    }

    private fun recordingKey(btn: Btn, ev: Ev, now: Long): List<Effect> {
        if (btn == Btn.OK && ev == Ev.RELEASE) return finish(Effect.VoiceStop)
        return emptyList()
    }

    // ---------- 小工具 ----------
    private fun itemCount() = if (screen == Screen.WEREAD) 1 + books().size else contacts().size

    /** 微信读书清单：第 0 项 = 继续上次那本（-1），之后是书单 */
    private fun bookIndex(cursor: Int) = cursor - 1

    private fun showItem(intro: Boolean): List<Effect> {
        val n = itemCount()
        val pos = "${cursor + 1} / $n"
        return if (screen == Screen.WEREAD) {
            val spoken = if (cursor == 0) "继续上次那本" else books()[cursor - 1]
            val label = if (cursor == 0) "Continue last book" else "Book ${cursor}"
            listOf(Effect.Text(1, "$pos  $label"), Effect.Speak(if (intro) "微信读书，$spoken" else spoken))
        } else {
            val f = contacts()[cursor]
            val label = Protocol.toAscii(f.label).ifEmpty { "Friend ${cursor + 1}" }
            listOf(Effect.Text(1, "$pos  $label"), Effect.Speak(if (intro) "WhatsApp，${f.name}" else f.name))
        }
    }

    private fun finish(vararg last: Effect): List<Effect> {
        reset()
        return listOf<Effect>(Effect.Mode(false)) + last
    }

    private fun reset() {
        screen = Screen.IDLE
        cursor = 0
        recordingIndex = -1
    }

    companion object {
        const val WEREAD_AUTO_MS = 3_000L
        const val LIST_TIMEOUT_MS = 15_000L
        const val RECORD_MAX_MS = 60_000L
    }
}
