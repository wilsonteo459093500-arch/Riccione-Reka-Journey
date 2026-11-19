package app.space.car

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

class FindLogicTest {
    @Test
    fun protocol() {
        assertEquals(listOf<Byte>(0x03, 1), Protocol.findCommand(true).toList())
        assertEquals(listOf<Byte>(0x03, 0), Protocol.findCommand(false).toList())
        assertEquals(Protocol.FindState.RINGING, Protocol.decodeFindState(byteArrayOf(0x80.toByte(), 1)))
        assertEquals(Protocol.FindState.FOUND, Protocol.decodeFindState(byteArrayOf(0x80.toByte(), 2)))
        assertEquals(Protocol.FindState.TIMEOUT, Protocol.decodeFindState(byteArrayOf(0x80.toByte(), 3)))
        assertEquals(Protocol.FindState.STOPPED, Protocol.decodeFindState(byteArrayOf(0x80.toByte(), 0)))
        assertNull(Protocol.decodeFindState(byteArrayOf(0x80.toByte(), 9)))
        assertNull(Protocol.decodeFindState(byteArrayOf(2, 0)))          // 是按键（确定 单击）
        // 找 FoloToy 的通知不会被当成按键
        assertNull(Protocol.decodeKey(byteArrayOf(0x80.toByte(), 1)))
    }

    @Test
    fun bars() {
        assertEquals(5, FindLogic.bars(-45))
        assertEquals(4, FindLogic.bars(-60))
        assertEquals(3, FindLogic.bars(-75))
        assertEquals(2, FindLogic.bars(-80))
        assertEquals(1, FindLogic.bars(-95))
        assertEquals(0, FindLogic.bars(-100))
        assertEquals("▮▮▮▯▯", FindLogic.barsText(3))
    }

    @Test
    fun proximity() {
        val p = FindLogic.Proximity()
        listOf(-85, -84, -86, -80).forEach { p.add(it) }
        assertEquals(FindLogic.Trend.UNKNOWN, p.trend())          // 还不够 6 次
        listOf(-74, -72).forEach { p.add(it) }
        assertEquals(FindLogic.Trend.CLOSER, p.trend())
        listOf(-73, -74, -72).forEach { p.add(it) }
        assertEquals(FindLogic.Trend.SAME, p.trend())
        listOf(-85, -88, -86).forEach { p.add(it) }
        assertEquals(FindLogic.Trend.FARTHER, p.trend())
        assertEquals(-86, p.latest())
        p.reset()
        assertNull(p.latest())
    }

    @Test
    fun leftBehind() {
        val lb = FindLogic.LeftBehind(delayMs = 45_000)
        assertFalse(lb.due(0, enabled = true, bluetoothOn = true))   // 没断过
        // 断线 → 45 秒内连回来（FoloToy 换模式重开机）：不提醒
        lb.onLost(1_000)
        assertFalse(lb.due(30_000, enabled = true, bluetoothOn = true))
        lb.onConnected()
        assertFalse(lb.due(60_000, enabled = true, bluetoothOn = true))
        // 断线 45 秒还没回来：提醒一次
        lb.onLost(100_000)
        assertTrue(lb.pending())
        assertFalse(lb.due(144_999, enabled = true, bluetoothOn = true))
        assertTrue(lb.due(145_000, enabled = true, bluetoothOn = true))
        assertFalse(lb.due(200_000, enabled = true, bluetoothOn = true))
        // 手机蓝牙关了 / 提醒关了：不提醒
        lb.onLost(300_000)
        assertFalse(lb.due(400_000, enabled = true, bluetoothOn = false))
        assertFalse(lb.pending())
        lb.onLost(500_000)
        assertFalse(lb.due(600_000, enabled = false, bluetoothOn = true))
    }

    @Test
    fun ago() {
        val tz = TimeZone.getTimeZone("Asia/Kuala_Lumpur")
        fun at(y: Int, mo: Int, d: Int, h: Int, mi: Int) = Calendar.getInstance(tz).apply {
            clear(); set(y, mo - 1, d, h, mi)
        }.timeInMillis
        val now = at(2026, 11, 18, 22, 0)
        assertEquals("刚刚", FindLogic.ago(now, now - 30_000, tz))
        assertEquals("3 分钟前", FindLogic.ago(now, now - 3 * 60_000, tz))
        assertEquals("2 小时前（19:45）", FindLogic.ago(now, at(2026, 11, 18, 19, 45), tz))
        assertEquals("今天 9:05", FindLogic.ago(now, at(2026, 11, 18, 9, 5), tz))
        assertEquals("昨天 21:12", FindLogic.ago(now, at(2026, 11, 17, 21, 12), tz))
        assertEquals("11/16 21:12", FindLogic.ago(now, at(2026, 11, 16, 21, 12), tz))
    }

    @Test
    fun map() {
        assertEquals("geo:3.149000,101.712000?q=3.149000,101.712000(FoloToy)", FindLogic.mapUri(3.149, 101.712))
        assertEquals("https://maps.google.com/?q=3.149000,101.712000", FindLogic.mapWebUrl(3.149, 101.712))
    }
}
