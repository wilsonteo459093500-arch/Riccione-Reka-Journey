package app.space.car

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.Base64
import java.util.Calendar
import java.util.Date

class BriefTest {
    private fun sample(): String = javaClass.classLoader!!.getResource("brief-2026-11-18.html")!!.readText()
    private fun chars(): Set<Int> = BriefCodec.loadChars(File("src/main/assets/news_chars.txt").readText())

    @Test
    fun parseRealBrief() {
        val b = BriefParser.parse(sample())!!
        assertEquals("2026-11-18 星期三", b.date)
        val names = b.sections.map { it.name }
        assertEquals(
            listOf(
                "今日三件事", "一 今日必读", "二 大马热议", "三 政治", "四 行业·房地产", "五 AI要闻",
                "六 深度观点", "七 大马股市", "八 全球家具", "九 家具AI·中国", "对你的生意",
            ),
            names,
        )
        assertEquals(listOf(3, 8, 10, 11, 12, 12, 8, 15, 10, 11, 5), b.sections.map { it.items.size })
        assertEquals(97 + 3 + 5, b.itemCount)

        val three = b.sections[0].items
        assertEquals("英伟达董事会：无意让黄仁勋重返CEO职位", three[0].title)
        assertTrue(three[0].summary.startsWith("英伟达董事长哈维·琼斯周二表示"))   // 借第一栏同一条的摘要
        assertEquals("大马前九月批准投资3504亿令吉", three[2].title)

        val first = b.sections[1].items[0]
        assertEquals("英伟达董事会：无意让黄仁勋重返CEO职位", first.title)   // 「1. 」拿掉
        assertTrue(first.summary.endsWith("此前黄仁勋公开表示若获准愿意回归。"))

        // 标题里的【标签】：span 徽章 + 编号，不重复
        assertEquals("【谷歌热搜1000+】Bermaz Auto停止在马分销小鹏汽车", b.sections[2].items[0].title)
        assertEquals("【家具】美国10月零售仅增0.2%，汽车与家具需求转冷", b.sections[8].items[0].title)
        assertEquals("【家具】大马家具总会加入MIFF 2027，业界组织合力办展", b.sections[4].items[7].title)
        assertEquals("【家具】新加坡家具商HomesToLife新交所主板首日平收1.15元", b.sections[8].items[3].title)

        // 「对你的生意意味着什么」没被算进第四栏；内容是一句话、没有摘要
        val biz = b.sections.last().items
        assertTrue(biz[0].title.startsWith("数据中心投资前九月暴增44.5%"))
        assertTrue(biz.all { it.summary.isEmpty() })
        assertTrue(b.sections.flatMap { it.items }.none { it.title.contains("编辑说明") || it.title.contains("条数") })
        // 没有残留的标签、实体
        assertTrue(b.sections.flatMap { it.items }.all { !it.title.contains('<') && !it.summary.contains('<') && !it.summary.contains("&nbsp;") })
    }

    @Test
    fun encodeGolden() {
        val b = BriefParser.parse(sample())!!
        val data = BriefCodec.encode(b, chars())
        File("build").mkdirs()
        File("build/brief-sample.txt").writeBytes(data)   // 改了格式：把它复制到 src/test/resources/brief-sample.txt
        val golden = File("src/test/resources/brief-sample.txt")
        assertTrue("没有 brief-sample.txt：复制 build/brief-sample.txt 过去", golden.exists())
        // 韧体的模拟器、host 测试读同一个档：app 送什么，FoloToy 就显示什么
        assertEquals(golden.readText(), String(data, Charsets.UTF_8))

        val text = String(data, Charsets.UTF_8)
        assertTrue(text.startsWith("BRIEF1\nD\t2026-11-18 星期三\nS\t今日三件事\nI\t英伟达董事会"))
        assertTrue(data.size < BriefCodec.MAX_BYTES)
        val items = BriefCodec.items(data)
        assertEquals(105, items.size)
        assertEquals("2026-11-18 星期三", BriefCodec.date(data))
        assertEquals("英伟达董事会：无意让黄仁勋重返CEO职位。英伟达董事长哈维·琼斯周二表示，黄仁勋因个人行为不符公司行为准则而自愿辞职，董事会不打算恢复其CEO职务。此前黄仁勋公开表示若获准愿意回归。", BriefCodec.speech(items[0]))
        assertEquals("美国10月零售仅增0.2%，汽车与家具需求转冷。", BriefCodec.speech(items[0 + 3 + 8 + 10 + 11 + 12 + 12 + 8 + 15]).substringBefore("美国10月零售额"))
        // 每个字 FoloToy 都画得出来
        val cs = chars()
        text.codePoints().forEach { cp -> assertTrue("FoloToy 没有这个字：${String(Character.toChars(cp))}", cp == '\n'.code || cp == '\t'.code || cp in 0x20..0x7E || cp in cs) }
    }

    @Test
    fun cleanAndLimits() {
        val cs = setOf('中'.code, '□'.code, '“'.code)
        assertEquals("中 a b", BriefCodec.clean("中\t a\n\nb", cs, 100))
        assertEquals("中□'\"-", BriefCodec.clean("中龘‘”−", cs, 100))       // “ 有、” 没有 → "
        assertEquals("中中", BriefCodec.clean("中中中", cs, 2))
        assertEquals("a□b", BriefCodec.clean("a😀b", cs, 100))   // emoji
        assertEquals("a?b", BriefCodec.clean("a龘b", setOf('a'.code), 100)) // 连 □ 都没有就用 ?
        assertEquals("ab", BriefCodec.clean("a​b", cs, 100))
        assertEquals("龘", BriefCodec.clean("龘", null, 100))               // 不检查

        // 很多条：最多 200 条、16 栏，不超过 120KB
        val big = Brief("d", (1..20).map { s -> Brief.Section("栏$s", (1..30).map { Brief.Item("标题$it", "摘".repeat(300)) }) })
        val data = BriefCodec.encode(big, null)
        assertTrue(data.size <= BriefCodec.MAX_BYTES)
        val items = BriefCodec.items(data)
        assertTrue(items.size in 100..200)
        assertTrue(String(data, Charsets.UTF_8).lineSequence().count { it.startsWith("S\t") } <= 16)
    }

    @Test
    fun parseEdgeCases() {
        assertNull(BriefParser.parse("<html><body>别的信</body></html>"))
        assertEquals("a & b < c 中 é", BriefParser.text("<b>a &amp; b</b> &lt; c&nbsp;&#20013; &#xe9;"))
        // 没有栏目头（旧格式）但有条目：放一栏「全部」
        val old = """<div>2026年11月10日（星期二）</div><b style="display:block">1. 标题一</b><div>摘要一</div><b style="display:block">2. 标题二</b>"""
        val b = BriefParser.parse(old)!!
        assertEquals("2026-11-10 星期二", b.date)
        assertEquals(listOf("全部"), b.sections.map { it.name })
        assertEquals(listOf("标题一", "标题二"), b.sections[0].items.map { it.title })
        assertEquals("摘要一", b.sections[0].items[0].summary)
    }

    // ---------------- 信件（MIME）----------------
    private fun qp(s: String): String {
        val sb = StringBuilder()
        var col = 0
        for (b in s.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xFF
            val piece = if (c in 33..126 && c != '='.code) c.toChar().toString() else "=%02X".format(c)
            if (col + piece.length > 75) { sb.append("=\r\n"); col = 0 }
            sb.append(piece)
            col += piece.length
        }
        return sb.toString()
    }

    @Test
    fun mimeQuotedPrintable() {
        val html = sample()
        val raw = ("From: me@example.com\r\nSubject: =?UTF-8?B?5q+P5pel5pmo5oql?= DAILY MORNING BRIEF\r\n" +
            "Content-Type: multipart/alternative;\r\n boundary=\"b1\"\r\nMIME-Version: 1.0\r\n\r\n" +
            "--b1\r\nContent-Type: text/plain; charset=\"UTF-8\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
            qp("今日三件事") + "\r\n" +
            "--b1\r\nContent-Type: text/html; charset=\"UTF-8\"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n" +
            qp(html) + "\r\n--b1--\r\n").toByteArray(Charsets.US_ASCII)
        assertEquals(html, Mime.html(raw))
    }

    @Test
    fun mimeBase64Nested() {
        val html = "<p>晨报</p>"
        val b64 = Base64.getMimeEncoder().encodeToString(html.toByteArray(Charsets.UTF_8))
        val raw = ("Content-Type: multipart/mixed; boundary=outer\n\n" +
            "--outer\nContent-Type: multipart/alternative; boundary=\"inner\"\n\n" +
            "--inner\nContent-Type: text/plain\n\nhi\n" +
            "--inner\nContent-Type: text/html; charset=utf-8\nContent-Transfer-Encoding: base64\n\n$b64\n--inner--\n" +
            "--outer--\n").toByteArray(Charsets.US_ASCII)
        assertEquals(html, Mime.html(raw))
        assertNull(Mime.html("Content-Type: text/plain\r\n\r\nhi".toByteArray()))
        assertEquals("abc", Mime.param("text/html; charset=\"abc\"", "charset"))
        assertEquals("x-y", Mime.param("multipart/alternative; BOUNDARY=x-y", "boundary"))
    }

    // ---------------- IMAP ----------------
    @Test
    fun imapSession() {
        val body = "Subject: x\r\n\r\n晨报".toByteArray(Charsets.UTF_8)
        val server = ByteArrayOutputStream().apply {
            write("* OK Gimap ready\r\n".toByteArray())
            write("a1 OK me@example.com authenticated (Success)\r\n".toByteArray())
            write("* FLAGS (\\Seen)\r\n* 12 EXISTS\r\na2 OK [READ-ONLY] INBOX selected. (Success)\r\n".toByteArray())
            write("* SEARCH 31 40 35\r\na3 OK SEARCH completed (Success)\r\n".toByteArray())
            write("* 9 FETCH (UID 40 BODY[] {${body.size}}\r\n".toByteArray())
            write(body)
            write(")\r\na4 OK Success\r\n".toByteArray())
            write("* BYE LOGOUT Requested\r\na5 OK 73 good day (Success)\r\n".toByteArray())
        }.toByteArray()
        val sent = ByteArrayOutputStream()
        val s = ImapSession(ByteArrayInputStream(server), sent)
        s.greeting()
        s.login("me@example.com", "pa\"ss")
        s.examine("INBOX")
        assertEquals(listOf(31L, 35L, 40L), s.search("SUBJECT \"DAILY MORNING BRIEF\""))
        assertArrayEquals(body, s.fetch(40))
        s.logout()
        assertEquals(
            "a1 LOGIN \"me@example.com\" \"pa\\\"ss\"\r\na2 EXAMINE \"INBOX\"\r\na3 UID SEARCH SUBJECT \"DAILY MORNING BRIEF\"\r\n" +
                "a4 UID FETCH 40 (BODY.PEEK[])\r\na5 LOGOUT\r\n",
            sent.toString("UTF-8"),
        )
    }

    @Test
    fun imapLoginRejectedAndEmptySearch() {
        val server = "* OK hi\r\na1 NO [AUTHENTICATIONFAILED] Invalid credentials (Failure)\r\n".toByteArray()
        val s = ImapSession(ByteArrayInputStream(server), ByteArrayOutputStream())
        s.greeting()
        try {
            s.login("me@example.com", "wrong")
            throw AssertionError("应该登入失败")
        } catch (e: ImapSession.ImapException) {
            assertEquals(ImapSession.Kind.LOGIN, e.kind)
        }
        val s2 = ImapSession(ByteArrayInputStream("* SEARCH\r\na1 OK done\r\n".toByteArray()), ByteArrayOutputStream())
        assertEquals(emptyList<Long>(), s2.search("ALL"))
        val s3 = ImapSession(ByteArrayInputStream("a1 BAD Could not parse command\r\n".toByteArray()), ByteArrayOutputStream())
        try {
            s3.examine("INBOX")
            throw AssertionError("应该失败")
        } catch (e: ImapSession.ImapException) {
            assertEquals(ImapSession.Kind.PROTOCOL, e.kind)
        }
    }

    @Test
    fun gmailCriteriaAndPassword() {
        val c = Calendar.getInstance(NewsLogic.ZONE).apply { set(2026, Calendar.NOVEMBER, 19, 7, 5, 0) }
        assertEquals("SINCE 16-Nov-2026 SUBJECT \"DAILY MORNING BRIEF\"", Gmail.criteria(Date(c.timeInMillis)))
        assertEquals("abcdefghijklmnop", Gmail.normalizePassword(" abcd efgh ijkl mnop "))
    }

    // ---------------- 什么时候查、要不要传 ----------------
    private fun at(h: Int, m: Int, day: Int = 19): Long =
        Calendar.getInstance(NewsLogic.ZONE).apply { clear(); set(2026, Calendar.NOVEMBER, day, h, m, 0) }.timeInMillis

    @Test
    fun whenToFetch() {
        assertEquals("2026-11-19", NewsLogic.today(at(7, 0)))
        assertEquals("2026-11-19", NewsLogic.today(at(0, 5)))
        assertFalse(NewsLogic.shouldFetch(at(8, 0), false, "", 0))                          // 没填帐号
        assertFalse(NewsLogic.shouldFetch(at(6, 59), true, "", 0))                          // 7 点前
        assertTrue(NewsLogic.shouldFetch(at(7, 0), true, "2026-11-18 星期三", 0))
        assertFalse(NewsLogic.shouldFetch(at(7, 20), true, "2026-11-18 星期三", at(7, 0)))  // 30 分钟内查过
        assertTrue(NewsLogic.shouldFetch(at(7, 30), true, "2026-11-18 星期三", at(7, 0)))
        assertFalse(NewsLogic.shouldFetch(at(9, 0), true, "2026-11-19 星期四", at(7, 0)))   // 已经是今天的
        assertTrue(NewsLogic.shouldFetch(at(7, 1, 20), true, "2026-11-19 星期四", at(9, 0))) // 隔天
        assertTrue(NewsLogic.shouldFetch(at(8, 0), true, "", at(9, 0)))                     // 手机时间被调过

        assertTrue(NewsLogic.needSend(Protocol.NEWS_NONE, 0, 5))
        assertTrue(NewsLogic.needSend(Protocol.NEWS_OK, 4, 5))
        assertFalse(NewsLogic.needSend(Protocol.NEWS_OK, 5, 5))
        assertFalse(NewsLogic.needSend(Protocol.NEWS_NONE, 0, null))
        assertFalse(NewsLogic.needSend(Protocol.NEWS_BAD, 0, 5))
    }

    @Test
    fun packets() {
        val data = ByteArray(500) { it.toByte() }
        val crc = BriefCodec.crc32(data)
        val p = Protocol.newsPackets(data, crc, 238)
        assertEquals(5, p.size)   // 开始 + 3 段 + 传完
        assertEquals(listOf<Byte>(0x06, 0x01, 0xF4.toByte(), 0x01, 0, 0), p[0].take(6))
        assertEquals(crc, (p[0][6].toLong() and 0xFF) or ((p[0][7].toLong() and 0xFF) shl 8) or ((p[0][8].toLong() and 0xFF) shl 16) or ((p[0][9].toLong() and 0xFF) shl 24))
        assertEquals(244, p[1].size)
        assertEquals(listOf<Byte>(0x06, 0x02, 238.toByte(), 0, 0, 0), p[2].take(6))
        assertEquals(6 + 24, p[3].size)
        assertArrayEquals(byteArrayOf(0x06, 0x03), p[4])
        val joined = p.subList(1, 4).flatMap { it.drop(6) }.toByteArray()
        assertArrayEquals(data, joined)
        assertEquals(listOf<Byte>(0x07), Protocol.newsAsk().toList())

        val st = Protocol.decodeNewsStatus(byteArrayOf(0x83.toByte(), 0, 0x78, 0x56, 0x34, 0x12))!!
        assertEquals(0, st.status)
        assertEquals(0x12345678L, st.crc)
        assertEquals(0xFFFFFFFFL, Protocol.decodeNewsStatus(byteArrayOf(0x83.toByte(), 1, -1, -1, -1, -1))!!.crc)
        val say = Protocol.decodeNewsSay(byteArrayOf(0x84.toByte(), 0x2C, 0x01, 1, 0, 0, 0))!!
        assertEquals(300, say.index)
        assertEquals(1L, say.crc)
        assertNull(Protocol.decodeNewsSay(byteArrayOf(0x84.toByte(), 1)))
        assertNull(Protocol.decodeNewsStatus(byteArrayOf(0x82.toByte(), 1, 0, 0, 0, 0)))
        // 不会被当成按键 / DEKU / 找
        assertNull(Protocol.decodeKey(byteArrayOf(0x83.toByte(), 0, 0, 0, 0, 0)))
        assertNull(Protocol.decodeDeku(byteArrayOf(0x84.toByte(), 0, 0, 0, 0, 0, 0)))
        assertNotNull(Protocol.decodeDeku(byteArrayOf(0x82.toByte(), 'J'.code.toByte())))
    }
}
