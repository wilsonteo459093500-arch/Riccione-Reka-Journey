package app.space.car

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class QuotesTest {
    private fun sample(): String = javaClass.classLoader!!.getResource("weread-sample.txt")!!.readText()
    private fun chars(): Set<Int> = BriefCodec.loadChars(File("src/main/assets/news_chars.txt").readText())

    @Test
    fun parseWeReadExport() {
        val b = Quotes.parseWeRead(sample())!!
        assertEquals("掌控谈话", b.title)
        assertEquals("克里斯·沃斯 塔尔·拉兹", b.author)
        assertEquals(47, b.quotes.size)   // 跟导出写的「47个笔记」一样
        assertTrue(b.quotes[0].startsWith("这个负面反应能提供巨大的机会"))
        assertEquals("没有协议也好过一个坏协议。", b.quotes[2])
        assertTrue(b.quotes.none { it.startsWith("第") && it.contains("章") })      // 章节名不算
        assertTrue(b.quotes.none { it.contains("来自微信读书") })
        assertTrue(b.quotes.any { it.startsWith("事实上，人们经常会因为") })        // 开头的「。」拿掉
    }

    @Test
    fun parseVariants() {
        // Windows 换行、一段跨两行、没有作者、没有「几个笔记」
        val b = Quotes.parseWeRead("《原则》\r\n\r\n第一章\r\n\r\n◆ 痛苦 + 反思\r\n= 进步\r\n\r\n◆ 极度求真\r\n")!!
        assertEquals("原则", b.title)
        assertEquals("", b.author)
        assertEquals(listOf("痛苦 + 反思= 进步", "极度求真"), b.quotes)
        assertNull(Quotes.parseWeRead("随便一段文字，没有划线"))
        assertNull(Quotes.parseWeRead(""))
        assertNull(Quotes.clean("。好"))   // 太短
    }

    @Test
    fun libraryAndEncode() {
        val a = Quotes.Book("掌控谈话", "克里斯·沃斯", listOf("没有协议也好过一个坏协议。", "提问，永远是提问"))
        val b = Quotes.Book("原则", "", listOf("痛苦 + 反思 = 进步"))
        var lib = Quotes.add(emptyList(), a)
        lib = Quotes.add(lib, b)
        assertEquals(listOf("原则", "掌控谈话"), lib.map { it.title })       // 新的在前
        lib = Quotes.add(lib, a.copy(quotes = listOf("新的一段书摘")))
        assertEquals(listOf("掌控谈话", "原则"), lib.map { it.title })       // 同名换掉、移到前面
        assertEquals(listOf("新的一段书摘"), lib[0].quotes)
        val data = Quotes.encode(lib, null)
        assertEquals("QUOTES1\nB\t掌控谈话\t克里斯·沃斯\nQ\t新的一段书摘\nB\t原则\t\nQ\t痛苦 + 反思 = 进步\n", String(data, Charsets.UTF_8))
        assertEquals(lib, Quotes.decode(data))
        assertEquals(listOf("掌控谈话"), Quotes.remove(lib, "原则").map { it.title })
        assertEquals("QUOTES1\n", String(Quotes.encode(emptyList(), null), Charsets.UTF_8))

        // 太大：旧的书少放，不超过 FoloToy 一格
        val big = (1..30).map { n -> Quotes.Book("书$n", "", (1..100).map { "很长的书摘".repeat(15) + it }) }
        assertTrue(Quotes.encode(big, null).size <= Quotes.MAX_BYTES)
    }

    @Test
    fun encodeGolden() {
        val lib = listOf(Quotes.parseWeRead(sample())!!)
        val data = Quotes.encode(lib, chars())
        File("build").mkdirs()
        File("build/quotes-sample.txt").writeBytes(data)   // 改了格式：复制到 src/test/resources/quotes-sample.txt
        val golden = File("src/test/resources/quotes-sample.txt")
        assertTrue("没有 quotes-sample.txt：复制 build/quotes-sample.txt 过去", golden.exists())
        assertEquals(golden.readText(), String(data, Charsets.UTF_8))   // 韧体的模拟器读同一份
        val text = String(data, Charsets.UTF_8)
        assertTrue(!text.contains('□'))   // 这本书的字 FoloToy 都有
    }

    @Test
    fun protocol() {
        val p = Protocol.newsPackets(ByteArray(10), 7, 238, Protocol.QUOTES_DATA)
        assertEquals(listOf<Byte>(0x08, 0x01), p[0].take(2))
        assertEquals(listOf<Byte>(0x08, 0x02), p[1].take(2))
        assertEquals(listOf<Byte>(0x08, 0x03), p[2].toList())
        assertEquals(listOf<Byte>(0x09), Protocol.quotesAsk().toList())
        val st = Protocol.decodeQuotesStatus(byteArrayOf(0x85.toByte(), 1, 0, 0, 0, 0))!!
        assertEquals(Protocol.NEWS_NONE, st.status)
        assertNull(Protocol.decodeNewsStatus(byteArrayOf(0x85.toByte(), 1, 0, 0, 0, 0)))
        assertNull(Protocol.decodeQuotesStatus(byteArrayOf(0x83.toByte(), 1, 0, 0, 0, 0)))
    }
}
