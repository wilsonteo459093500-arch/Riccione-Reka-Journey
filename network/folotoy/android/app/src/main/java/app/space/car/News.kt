package app.space.car

import android.content.Context
import java.io.File
import java.util.Calendar
import java.util.TimeZone

/**
 * 每日晨报（2026-11-19 用户选定）：
 *   - 自动：早上 7:00（马来西亚时间）以后，还没拿到今天那份就每 30 分钟查一次 Gmail
 *   - 手动：设定画面「现在更新」
 *   - FoloToy 一连上就问它有哪一份（crc），不一样就整份传过去；FoloToy 记住最后一份，离开手机也能看
 *   - FoloToy 按住确定 → 这里念那一条（标题 + 摘要）
 * 这个档：什么时候查（纯逻辑，有测试）+ 存在手机里的东西（帐号、应用程序密码、最后一份晨报）。
 */
object NewsLogic {
    val ZONE: TimeZone = TimeZone.getTimeZone("Asia/Kuala_Lumpur")
    const val START_HOUR = 7
    const val RETRY_MS = 30 * 60 * 1000L

    /** 今天的日期（马来西亚时间）「2026-11-19」 */
    fun today(now: Long): String {
        val c = Calendar.getInstance(ZONE).apply { timeInMillis = now }
        return "%04d-%02d-%02d".format(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH))
    }

    /** 要不要现在查 Gmail：有填帐号、7 点以后、手上的不是今天的、离上次查超过 30 分钟 */
    fun shouldFetch(now: Long, configured: Boolean, haveDate: String, lastAttempt: Long): Boolean {
        if (!configured) return false
        val c = Calendar.getInstance(ZONE).apply { timeInMillis = now }
        if (c.get(Calendar.HOUR_OF_DAY) < START_HOUR) return false
        if (haveDate.startsWith(today(now))) return false
        return now - lastAttempt >= RETRY_MS || lastAttempt > now
    }

    /** FoloToy 回「我有这份」之后要不要传：没有、或 crc 跟手上的不一样 */
    fun needSend(status: Int, foloCrc: Long, mine: Long?): Boolean =
        mine != null && (status == Protocol.NEWS_NONE || (status == Protocol.NEWS_OK && foloCrc != mine))
}

object NewsStore {
    private const val PREFS = "news"
    private const val FILE = "brief.txt"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun user(c: Context): String = prefs(c).getString("user", "") ?: ""
    fun password(c: Context): String = prefs(c).getString("pass", "") ?: ""
    fun configured(c: Context) = user(c).isNotBlank() && password(c).isNotBlank()

    fun saveAccount(c: Context, user: String, pass: String) {
        prefs(c).edit().putString("user", user.trim()).putString("pass", Gmail.normalizePassword(pass)).apply()
    }

    fun lastAttempt(c: Context) = prefs(c).getLong("attempt", 0)
    fun setAttempt(c: Context, now: Long) = prefs(c).edit().putLong("attempt", now).apply()

    /** 最后一次查的结果（给设定画面看）：「已拿到 2026-11-18 星期三 · 共 103 条」/ 错误 */
    fun note(c: Context): String = prefs(c).getString("note", "") ?: ""
    fun setNote(c: Context, s: String) = prefs(c).edit().putString("note", s).apply()

    /** 传过去的文字档（跟 FoloToy 上的一模一样，念的时候用） */
    fun encoded(c: Context): ByteArray? = File(c.filesDir, FILE).takeIf { it.exists() }?.readBytes()
    fun crc(c: Context): Long? = if (prefs(c).contains("crc")) prefs(c).getLong("crc", 0) else null

    fun save(c: Context, data: ByteArray) {
        File(c.filesDir, FILE).writeBytes(data)
        prefs(c).edit().putLong("crc", BriefCodec.crc32(data)).remove("sentCrc").apply()
    }

    /** FoloToy 确认有了的那份 crc、时间 */
    fun sentCrc(c: Context): Long? = if (prefs(c).contains("sentCrc")) prefs(c).getLong("sentCrc", 0) else null
    fun sentAt(c: Context) = prefs(c).getLong("sentAt", 0)
    fun setSent(c: Context, crc: Long, now: Long) = prefs(c).edit().putLong("sentCrc", crc).putLong("sentAt", now).apply()

    fun haveDate(c: Context): String = encoded(c)?.let { BriefCodec.date(it) } ?: ""

    fun chars(c: Context): Set<Int>? = runCatching {
        c.assets.open("news_chars.txt").use { BriefCodec.loadChars(String(it.readBytes(), Charsets.UTF_8)) }
    }.getOrNull()
}
