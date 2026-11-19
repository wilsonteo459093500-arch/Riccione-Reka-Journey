package app.space.car

import app.space.car.CarLogic.Effect
import app.space.car.Protocol.Btn
import app.space.car.Protocol.Ev
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProtocolTest {
    @Test fun decodeKey() {
        assertEquals(Protocol.Key(Btn.DOWN, Ev.LONG), Protocol.decodeKey(byteArrayOf(1, 1)))
        assertEquals(Protocol.Key(Btn.OK, Ev.RELEASE), Protocol.decodeKey(byteArrayOf(2, 3)))
        assertNull(Protocol.decodeKey(byteArrayOf(3, 0)))
        assertNull(Protocol.decodeKey(byteArrayOf(0, 4)))
        assertNull(Protocol.decodeKey(byteArrayOf(0)))
        assertNull(Protocol.decodeKey(null))
    }

    @Test fun commands() {
        assertArrayEquals(byteArrayOf(1, 1), Protocol.modeCommand(true))
        assertArrayEquals(byteArrayOf(1, 0), Protocol.modeCommand(false))
        assertArrayEquals(byteArrayOf(2, 0, 'H'.code.toByte(), 'i'.code.toByte()), Protocol.textCommand(0, "Hi"))
        // 中文换成一个 ?、最多 28 字
        assertEquals("Ah Meng ?", Protocol.toAscii("Ah Meng 阿明"))
        assertEquals(2 + 28, Protocol.textCommand(1, "x".repeat(50)).size)
    }
}

class CarLogicTest {
    private val friends = mutableListOf(CarLogic.Friend("阿明", "Ah Meng"), CarLogic.Friend("老婆", ""))
    private val logic = CarLogic({ friends })

    private fun key(b: Btn, e: Ev, t: Long = 0) = logic.onKey(b, e, t)

    @Test fun weReadAutoContinues() {
        val fx = key(Btn.DOWN, Ev.LONG, 1000)
        assertTrue(fx.contains(Effect.Mode(true)))
        assertTrue(fx.contains(Effect.Text(0, "WeRead")))
        assertTrue(fx.any { it is Effect.Speak && it.text.contains("继续上次那本") })
        assertTrue(logic.onTick(3999).isEmpty())
        assertEquals(listOf(Effect.Mode(false), Effect.OpenWeRead(-1)), logic.onTick(4000))
        assertFalse(logic.busy)
    }

    @Test fun weReadOkNowAndCancel() {
        key(Btn.DOWN, Ev.LONG)
        assertEquals(listOf(Effect.Mode(false), Effect.OpenWeRead(-1)), key(Btn.OK, Ev.CLICK))
        key(Btn.DOWN, Ev.LONG)
        assertEquals(listOf(Effect.Mode(false), Effect.Speak("取消")), key(Btn.UP, Ev.LONG))
        assertTrue(logic.onTick(99_999).isEmpty())
    }

    @Test fun weReadBookList() {
        val l = CarLogic({ friends }, { listOf("掌控谈话", "人类简史") })
        l.onKey(Btn.DOWN, Ev.LONG, 0)
        val fx = l.onKey(Btn.DOWN, Ev.CLICK, 500)
        assertTrue(fx.contains(Effect.Text(1, "2 / 3  Book 1")))
        assertTrue(fx.contains(Effect.Speak("掌控谈话")))
        assertTrue(l.onTick(3500).isEmpty())   // 动过就不自动继续
        assertEquals(listOf(Effect.Mode(false), Effect.OpenWeRead(0)), l.onKey(Btn.OK, Ev.CLICK, 4000))
    }

    @Test fun contactsCall() {
        val fx = key(Btn.OK, Ev.LONG)
        assertTrue(fx.contains(Effect.Text(1, "1 / 2  Ah Meng")))
        assertTrue(fx.contains(Effect.Speak("WhatsApp，阿明")))
        assertTrue(key(Btn.UP, Ev.CLICK).isEmpty())          // 到顶就停
        val down = key(Btn.DOWN, Ev.CLICK)
        assertTrue(down.contains(Effect.Text(1, "2 / 2  Friend 2")))   // 没设英文名
        assertTrue(down.contains(Effect.Speak("老婆")))
        assertTrue(key(Btn.DOWN, Ev.CLICK).isEmpty())        // 到底就停
        assertTrue(key(Btn.OK, Ev.PRESS).isEmpty())
        assertTrue(key(Btn.OK, Ev.RELEASE).isEmpty())
        assertEquals(listOf(Effect.Mode(false), Effect.Speak("打给 老婆"), Effect.Call(1)), key(Btn.OK, Ev.CLICK))
    }

    @Test fun contactsVoiceMessage() {
        key(Btn.OK, Ev.LONG)
        key(Btn.OK, Ev.RELEASE)                                 // 开清单那一下的放开：不算
        assertTrue(logic.busy)
        key(Btn.OK, Ev.PRESS)
        assertEquals(listOf(Effect.Mode(false), Effect.VoiceStart(0)), key(Btn.OK, Ev.LONG, 1000))
        assertTrue(key(Btn.DOWN, Ev.CLICK).isEmpty())          // 录音中其他键不理
        assertEquals(listOf(Effect.Mode(false), Effect.VoiceStop), key(Btn.OK, Ev.RELEASE, 5000))
        assertFalse(logic.busy)
    }

    @Test fun recordingLimitAndDisconnect() {
        key(Btn.OK, Ev.LONG)
        key(Btn.OK, Ev.LONG, 0)
        assertEquals(listOf(Effect.Mode(false), Effect.VoiceStop), logic.onTick(CarLogic.RECORD_MAX_MS))
        key(Btn.OK, Ev.LONG)
        key(Btn.OK, Ev.LONG, 0)
        assertEquals(listOf(Effect.VoiceCancel), logic.onDisconnected())   // 断线：不要送出半截
        assertTrue(logic.onDisconnected().isEmpty())
    }

    @Test fun listTimesOut() {
        key(Btn.OK, Ev.LONG, 0)
        assertTrue(logic.onTick(CarLogic.LIST_TIMEOUT_MS - 1).isEmpty())
        assertEquals(listOf(Effect.Mode(false), Effect.Speak("取消")), logic.onTick(CarLogic.LIST_TIMEOUT_MS))
    }

    @Test fun noContactsYet() {
        friends.clear()
        val fx = key(Btn.OK, Ev.LONG)
        assertEquals(1, fx.size)
        assertTrue(fx[0] is Effect.Speak)
        assertFalse(logic.busy)
    }

    @Test fun idleIgnoresOtherKeys() {
        assertTrue(key(Btn.OK, Ev.CLICK).isEmpty())
        assertTrue(key(Btn.UP, Ev.LONG).isEmpty())
        assertTrue(key(Btn.OK, Ev.PRESS).isEmpty())
    }
}
