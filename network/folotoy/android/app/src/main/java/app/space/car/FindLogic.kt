package app.space.car

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone

/**
 * 「手机找 FoloToy」不碰 Android 的部分（有单元测试）：
 *  - 信号强弱（RSSI）→ 几格、越来越近 / 越来越远
 *  - 「忘了带提醒」：断线后等一下，还没连回来才提醒（FoloToy 换模式会重开机，几秒就连回来，不该吵）
 *  - 「最后在哪里」的时间怎么写
 */
object FindLogic {
    /** 信号格数 0..5（RSSI 单位 dBm，越接近 0 越强；手机贴着 FoloToy 约 -45） */
    fun bars(rssi: Int): Int = when {
        rssi >= -55 -> 5
        rssi >= -65 -> 4
        rssi >= -75 -> 3
        rssi >= -85 -> 2
        rssi >= -95 -> 1
        else -> 0
    }

    fun barsText(bars: Int): String = "▮".repeat(bars.coerceIn(0, 5)) + "▯".repeat(5 - bars.coerceIn(0, 5))

    enum class Trend { CLOSER, FARTHER, SAME, UNKNOWN }

    /**
     * 越来越近还是越来越远：RSSI 跳得很厉害（人走动、手挡住都会差 10 dB），
     * 所以拿最近 3 次的平均跟再前面 3 次比，差 4 dB 以上才算。
     */
    class Proximity(private val keep: Int = 6) {
        private val history = ArrayDeque<Int>()

        fun add(rssi: Int) {
            history.addLast(rssi)
            while (history.size > keep) history.removeFirst()
        }

        fun reset() = history.clear()

        fun latest(): Int? = history.lastOrNull()

        fun trend(): Trend {
            if (history.size < 6) return Trend.UNKNOWN
            val list = history.toList()
            val old = list.subList(list.size - 6, list.size - 3).average()
            val now = list.subList(list.size - 3, list.size).average()
            return when {
                now - old >= 4 -> Trend.CLOSER
                old - now >= 4 -> Trend.FARTHER
                else -> Trend.SAME
            }
        }
    }

    fun trendText(t: Trend): String = when (t) {
        Trend.CLOSER -> "越来越近"
        Trend.FARTHER -> "越来越远"
        Trend.SAME -> "差不多"
        Trend.UNKNOWN -> ""
    }

    /**
     * 忘了带提醒：断线 [delayMs] 毫秒后还没连回来 → 提醒一次。
     * 只算「本来连着、后来断了」；手机蓝牙关掉、提醒关掉都不提醒。
     */
    class LeftBehind(val delayMs: Long = 45_000) {
        private var lostAt: Long? = null

        fun onConnected() {
            lostAt = null
        }

        fun onLost(now: Long) {
            lostAt = now
        }

        /** 定时问：现在要不要提醒？要的话只回 true 一次 */
        fun due(now: Long, enabled: Boolean, bluetoothOn: Boolean): Boolean {
            val t = lostAt ?: return false
            if (!enabled || !bluetoothOn) {
                lostAt = null
                return false
            }
            if (now - t < delayMs) return false
            lostAt = null
            return true
        }

        fun pending(): Boolean = lostAt != null
    }

    /** 「刚刚」「3 分钟前」「2 小时前」「昨天 21:12」「11/16 21:12」 */
    fun ago(nowMs: Long, thenMs: Long, tz: TimeZone = TimeZone.getDefault()): String {
        val diff = nowMs - thenMs
        if (diff < 60_000) return "刚刚"
        if (diff < 3_600_000) return "${diff / 60_000} 分钟前"
        val now = Calendar.getInstance(tz).apply { timeInMillis = nowMs }
        val then = Calendar.getInstance(tz).apply { timeInMillis = thenMs }
        val hm = String.format(Locale.US, "%d:%02d", then.get(Calendar.HOUR_OF_DAY), then.get(Calendar.MINUTE))
        val sameDay = now.get(Calendar.YEAR) == then.get(Calendar.YEAR) && now.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)
        if (sameDay) return if (diff < 6 * 3_600_000) "${diff / 3_600_000} 小时前（$hm）" else "今天 $hm"
        val yesterday = (now.clone() as Calendar).apply { add(Calendar.DAY_OF_YEAR, -1) }
        if (yesterday.get(Calendar.YEAR) == then.get(Calendar.YEAR) && yesterday.get(Calendar.DAY_OF_YEAR) == then.get(Calendar.DAY_OF_YEAR)) {
            return "昨天 $hm"
        }
        return "${then.get(Calendar.MONTH) + 1}/${then.get(Calendar.DAY_OF_MONTH)} $hm"
    }

    /** Google Maps 打开这个点（geo: 网址；没装地图 app 时用网页） */
    fun mapUri(lat: Double, lng: Double): String = String.format(Locale.US, "geo:%.6f,%.6f?q=%.6f,%.6f(FoloToy)", lat, lng, lat, lng)

    fun mapWebUrl(lat: Double, lng: Double): String = String.format(Locale.US, "https://maps.google.com/?q=%.6f,%.6f", lat, lng)
}
