package app.space.car

import app.space.car.DekuLogic.Kind
import app.space.car.DekuLogic.Line
import app.space.car.DekuLogic.Want
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DekuLogicTest {
    private val lines = listOf(
        Line("J01", Kind.JOKE, "笑话一"),
        Line("J02", Kind.JOKE, "笑话二"),
        Line("J03", Kind.JOKE, "笑话三"),
        Line("I01", Kind.INAMORI, "敬天爱人。"),
        Line("M01", Kind.MUSK, "最好的零件是没有零件。", "The best part is no part."),
    )

    @Test
    fun keywords() {
        assertEquals(Want.JOKE, DekuLogic.want("讲个笑话"))
        assertEquals(Want.JOKE, DekuLogic.want("講個笑話給我聽"))
        assertEquals(Want.INAMORI, DekuLogic.want("稻盛和夫说过什么"))
        assertEquals(Want.KUOK, DekuLogic.want("郭鹤年"))
        assertEquals(Want.MUSK, DekuLogic.want("马斯克"))
        assertEquals(Want.MUSK, DekuLogic.want("Elon Musk"))
        assertEquals(Want.ANY_PERSON, DekuLogic.want("来一句名言"))
        assertEquals(Want.AGAIN, DekuLogic.want("再来一个"))
        assertNull(DekuLogic.want("今天天气怎样"))
        // 「再来一个马斯克」：人名优先
        assertEquals(Want.MUSK, DekuLogic.want("再来一个马斯克"))
    }

    @Test
    fun pickNoRepeatAndAgain() {
        val d = DekuLogic(lines, seed = 1)
        val got = (1..3).map { d.pick(Kind.JOKE)!!.id }.toSet()
        assertEquals(setOf("J01", "J02", "J03"), got)            // 一轮不重复
        val last = d.lastLine!!.id
        assertNotEquals(last, d.pick(Kind.JOKE)!!.id)             // 新一轮第一句不会跟刚刚一样
        assertNull(d.pick(Kind.KUOK))                             // 郭鹤年还没审过
        assertEquals(Kind.JOKE, d.answer(listOf("再来一个"))!!.kind)
        assertEquals("I01", d.answer(listOf("嗯", "稻盛和夫"))!!.id) // 第一个候选听不懂，用第二个
        assertEquals(Kind.INAMORI, d.answer(listOf("再来"))!!.kind)
        assertNull(d.answer(listOf("今天天气怎样")))
        assertNull(d.answer(listOf("郭鹤年")))                      // 没审过的人：当作没听懂
    }

    @Test
    fun personRotationSkipsEmpty() {
        val d = DekuLogic(lines, seed = 2)
        assertEquals(Kind.INAMORI, d.pickPerson()!!.kind)
        assertEquals(Kind.MUSK, d.pickPerson()!!.kind)            // 郭鹤年跳过
        assertEquals(Kind.INAMORI, d.pickPerson()!!.kind)
        assertNull(DekuLogic(emptyList()).pickPerson())
    }

    @Test
    fun speech() {
        assertEquals("笑话一", DekuLogic.speech(lines[0]))
        assertEquals("稻盛和夫说：敬天爱人。", DekuLogic.speech(lines[3]))
        assertTrue(DekuLogic.speech(lines[4]).endsWith("原句是：The best part is no part."))
        assertTrue(DekuLogic.speech(lines[4]).startsWith("马斯克说："))
    }

    @Test
    fun protocol() {
        assertEquals(Protocol.Deku.Listen(true), Protocol.decodeDeku(byteArrayOf(0x81.toByte(), 1)))
        assertEquals(Protocol.Deku.Listen(false), Protocol.decodeDeku(byteArrayOf(0x81.toByte(), 0)))
        assertEquals(Protocol.Deku.Say("J01"), Protocol.decodeDeku(byteArrayOf(0x82.toByte(), 'J'.code.toByte(), '0'.code.toByte(), '1'.code.toByte())))
        assertNull(Protocol.decodeDeku(byteArrayOf(0x80.toByte(), 1)))     // 找 FoloToy 的通知
        assertNull(Protocol.decodeDeku(byteArrayOf(2, 0)))                  // 按键
        assertEquals(listOf<Byte>(0x04, 'M'.code.toByte(), '0'.code.toByte(), '1'.code.toByte()), Protocol.dekuShow("M01").toList())
        assertEquals(listOf<Byte>(0x05), Protocol.dekuUnknown().toList())
        assertNull(Protocol.decodeKey(byteArrayOf(0x81.toByte(), 1)))       // 不会被当成按键
    }
}
