package app.space.car

import android.content.Context
import android.location.Location

/**
 * 「最后在哪里」存在手机里（只在这支手机，不上网）：
 *   FoloToy 跟手机断线的时间、那时手机的位置（有给位置权限才有）。
 * 还有「忘了带提醒」开 / 关。
 */
object FindStore {
    private const val PREFS = "find"

    data class LastSeen(val lostAt: Long, val lat: Double?, val lng: Double?, val accuracyM: Float?, val locAt: Long?)

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun lostNow(c: Context, now: Long = System.currentTimeMillis()) {
        prefs(c).edit().putLong("lostAt", now).remove("lat").remove("lng").remove("acc").remove("locAt").apply()
    }

    /** 位置要是断线前 2 分钟以后的才存（太旧的位置不代表 FoloToy 在那里） */
    fun saveLocation(c: Context, loc: Location) {
        val p = prefs(c)
        val lostAt = p.getLong("lostAt", 0)
        if (lostAt == 0L || loc.time < lostAt - 120_000) return
        val oldAcc = p.getFloat("acc", Float.MAX_VALUE)
        if (p.contains("lat") && loc.accuracy > oldAcc) return   // 已经有更准的
        p.edit()
            .putString("lat", loc.latitude.toString())
            .putString("lng", loc.longitude.toString())
            .putFloat("acc", loc.accuracy)
            .putLong("locAt", loc.time)
            .apply()
    }

    fun read(c: Context): LastSeen? {
        val p = prefs(c)
        val lostAt = p.getLong("lostAt", 0)
        if (lostAt == 0L) return null
        return LastSeen(
            lostAt = lostAt,
            lat = p.getString("lat", null)?.toDoubleOrNull(),
            lng = p.getString("lng", null)?.toDoubleOrNull(),
            accuracyM = if (p.contains("acc")) p.getFloat("acc", 0f) else null,
            locAt = if (p.contains("locAt")) p.getLong("locAt", 0) else null,
        )
    }

    fun alertEnabled(c: Context) = prefs(c).getBoolean("alert", true)

    fun setAlert(c: Context, on: Boolean) = prefs(c).edit().putBoolean("alert", on).apply()
}
