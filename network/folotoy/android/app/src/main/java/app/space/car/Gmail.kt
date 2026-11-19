package app.space.car

import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.text.SimpleDateFormat
import java.util.Base64
import java.util.Date
import java.util.Locale
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * 用 Gmail「应用程序密码」只读拿最新一封每日晨报（IMAP，imap.gmail.com:993，TLS）。
 *   - EXAMINE INBOX（唯读打开，不会改任何东西）→ 找主题有「DAILY MORNING BRIEF」、最近 3 天的信 → 拿最新那封（BODY.PEEK：不会标成已读）
 *   - 不改、不删、不寄；密码只存在这支手机（app 自己的设定档）
 * 只写了用到的那一小部分 IMAP（LOGIN / EXAMINE / UID SEARCH / UID FETCH / LOGOUT），有单元测试。
 */
class ImapSession(input: InputStream, private val out: OutputStream) {
    private val inp = BufferedInputStream(input)
    private var tag = 0

    class ImapException(val kind: Kind, msg: String) : IOException(msg)
    enum class Kind { LOGIN, PROTOCOL }

    /** 一行回应；行里的 {n} 字面量（例如信的内容）收在 literals */
    class Line(val text: String, val literals: List<ByteArray>)

    fun greeting() {
        val l = readLine()
        if (!l.startsWith("* OK")) throw ImapException(Kind.PROTOCOL, "伺服器打招呼不对：$l")
    }

    fun login(user: String, password: String) {
        val r = command("LOGIN ${quote(user)} ${quote(password)}", allowNo = true)
        if (r == null) throw ImapException(Kind.LOGIN, "Gmail 不让登入（帐号或应用程序密码不对，或没开 IMAP）")
    }

    fun examine(box: String) {
        command("EXAMINE ${quote(box)}")
    }

    /** UID SEARCH，回 UID 由小到大 */
    fun search(criteria: String): List<Long> {
        val lines = command("UID SEARCH $criteria")!!
        return lines.filter { it.text.startsWith("* SEARCH") }
            .flatMap { it.text.removePrefix("* SEARCH").trim().split(' ').mapNotNull { n -> n.toLongOrNull() } }
            .sorted()
    }

    /** 整封信的原始内容（BODY.PEEK[]：不会标成已读） */
    fun fetch(uid: Long): ByteArray {
        val lines = command("UID FETCH $uid (BODY.PEEK[])")!!
        return lines.firstOrNull { it.text.startsWith("*") && it.text.contains("FETCH") && it.literals.isNotEmpty() }?.literals?.first()
            ?: throw ImapException(Kind.PROTOCOL, "拿不到信的内容")
    }

    fun logout() {
        runCatching { command("LOGOUT") }
    }

    /** 送一个指令，收到这个指令的 OK 为止。NO / BAD：allowNo 就回 null，否则丢例外 */
    private fun command(cmd: String, allowNo: Boolean = false): List<Line>? {
        val t = "a${++tag}"
        out.write("$t $cmd\r\n".toByteArray(Charsets.UTF_8))
        out.flush()
        val lines = ArrayList<Line>()
        while (true) {
            val l = readResponse()
            if (l.text.startsWith("$t ")) {
                val st = l.text.substring(t.length + 1)
                if (st.startsWith("OK")) return lines
                if (allowNo && st.startsWith("NO")) return null
                throw ImapException(Kind.PROTOCOL, "${cmd.substringBefore(' ')} 失败：$st")
            }
            lines.add(l)
        }
    }

    /** 读一个回应（行尾 {n} 就接着读 n 字节，再读这行剩下的） */
    private fun readResponse(): Line {
        val sb = StringBuilder()
        val lits = ArrayList<ByteArray>()
        var line = readLine()
        while (true) {
            sb.append(line)
            val m = LITERAL.find(line) ?: break
            val n = m.groupValues[1].toInt()
            val buf = ByteArray(n)
            var got = 0
            while (got < n) {
                val k = inp.read(buf, got, n - got)
                if (k < 0) throw ImapException(Kind.PROTOCOL, "连线断了")
                got += k
            }
            lits.add(buf)
            line = readLine()
        }
        return Line(sb.toString(), lits)
    }

    private fun readLine(): String {
        val bo = ByteArrayOutputStream()
        while (true) {
            val c = inp.read()
            if (c < 0) throw ImapException(Kind.PROTOCOL, "连线断了")
            if (c == '\n'.code) break
            bo.write(c)
        }
        val b = bo.toByteArray()
        val n = if (b.isNotEmpty() && b.last() == '\r'.code.toByte()) b.size - 1 else b.size
        return String(b, 0, n, Charsets.UTF_8)
    }

    companion object {
        private val LITERAL = Regex("""\{(\d+)\}$""")
        fun quote(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
    }
}

object Gmail {
    const val HOST = "imap.gmail.com"
    const val PORT = 993

    /** 搜寻条件：主题有 DAILY MORNING BRIEF（新格式的主题都有）、最近 3 天 */
    fun criteria(now: Date): String {
        val since = Date(now.time - 3L * 24 * 3600 * 1000)
        val d = SimpleDateFormat("d-MMM-yyyy", Locale.US).apply { timeZone = NewsLogic.ZONE }.format(since)
        return "SINCE $d SUBJECT \"DAILY MORNING BRIEF\""
    }

    /** 应用程序密码 Google 显示成「abcd efgh ijkl mnop」：空白拿掉 */
    fun normalizePassword(p: String) = p.replace(Regex("""\s+"""), "")

    /** 拿最新一封晨报的原始内容；没有回 null。会连网，不要在主执行绪呼叫 */
    fun fetchLatestBrief(user: String, password: String, now: Date = Date()): ByteArray? {
        val sock = SSLSocketFactory.getDefault().createSocket(HOST, PORT) as SSLSocket
        sock.soTimeout = 30_000
        return sock.use { s ->
            val imap = ImapSession(s.inputStream, s.outputStream)
            imap.greeting()
            imap.login(user.trim(), normalizePassword(password))
            imap.examine("INBOX")
            val uid = imap.search(criteria(now)).lastOrNull()
            val raw = uid?.let { imap.fetch(it) }
            imap.logout()
            raw
        }
    }
}

/** 信件（RFC 822 / MIME）→ HTML 那一份。只处理用得到的：multipart、quoted-printable、base64、charset */
object Mime {
    data class Part(val headers: Map<String, String>, val body: ByteArray)

    fun html(raw: ByteArray): String? = find(parse(raw), "text/html")

    private fun find(p: Part, want: String): String? {
        val ct = p.headers["content-type"] ?: "text/plain"
        val type = ct.substringBefore(';').trim().lowercase()
        if (type.startsWith("multipart/")) {
            val boundary = param(ct, "boundary") ?: return null
            for (sub in split(p.body, boundary)) find(parse(sub), want)?.let { return it }
            return null
        }
        if (type != want) return null
        val data = decode(p.body, p.headers["content-transfer-encoding"]?.trim()?.lowercase())
        val cs = param(ct, "charset")?.let { runCatching { charset(it) }.getOrNull() } ?: Charsets.UTF_8
        return String(data, cs)
    }

    fun parse(raw: ByteArray): Part {
        val sep = indexOf(raw, "\r\n\r\n".toByteArray()).let { if (it >= 0) it to 4 else indexOf(raw, "\n\n".toByteArray()) to 2 }
        val (at, skip) = sep
        val head = if (at >= 0) String(raw, 0, at, Charsets.ISO_8859_1) else String(raw, Charsets.ISO_8859_1)
        val body = if (at >= 0) raw.copyOfRange(at + skip, raw.size) else ByteArray(0)
        val headers = HashMap<String, String>()
        var name: String? = null
        for (line in head.split(Regex("\r?\n"))) {
            if ((line.startsWith(" ") || line.startsWith("\t")) && name != null) {   // 折行接回去
                headers[name] = headers[name] + " " + line.trim()
            } else {
                val i = line.indexOf(':')
                if (i <= 0) continue
                name = line.substring(0, i).trim().lowercase()
                headers.putIfAbsent(name, line.substring(i + 1).trim())
            }
        }
        return Part(headers, body)
    }

    fun param(header: String, key: String): String? {
        val m = Regex("""(?i)(?:^|;)\s*$key\s*=\s*("([^"]*)"|[^;\s]+)""").find(header) ?: return null
        return m.groupValues[2].ifEmpty { m.groupValues[1] }
    }

    private fun split(body: ByteArray, boundary: String): List<ByteArray> {
        val text = String(body, Charsets.ISO_8859_1)   // 一个字节一个字，切完再还原，不会弄坏 UTF-8
        val parts = ArrayList<ByteArray>()
        val marker = "--$boundary"
        var i = text.indexOf(marker)
        while (i >= 0) {
            var start = i + marker.length
            if (text.startsWith("--", start)) break   // 结尾
            start = text.indexOf('\n', start).let { if (it < 0) return parts else it + 1 }
            val next = text.indexOf("\n$marker", start)
            if (next < 0) break
            var end = next
            if (end > start && text[end - 1] == '\r') end--
            parts.add(text.substring(start, end).toByteArray(Charsets.ISO_8859_1))
            i = next + 1
        }
        return parts
    }

    fun decode(body: ByteArray, enc: String?): ByteArray = when (enc) {
        "base64" -> Base64.getMimeDecoder().decode(String(body, Charsets.ISO_8859_1).replace(Regex("""[^A-Za-z0-9+/=]"""), ""))
        "quoted-printable" -> quotedPrintable(body)
        else -> body
    }

    private fun quotedPrintable(b: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        var i = 0
        while (i < b.size) {
            val c = b[i].toInt() and 0xFF
            if (c == '='.code) {
                if (i + 1 < b.size && b[i + 1] == '\n'.code.toByte()) { i += 2; continue }                   // 软换行
                if (i + 2 < b.size && b[i + 1] == '\r'.code.toByte() && b[i + 2] == '\n'.code.toByte()) { i += 3; continue }
                if (i + 2 < b.size) {
                    val h = hex(b[i + 1]); val l = hex(b[i + 2])
                    if (h >= 0 && l >= 0) { out.write(h * 16 + l); i += 3; continue }
                }
            }
            out.write(c)
            i++
        }
        return out.toByteArray()
    }

    private fun hex(b: Byte): Int = when (val c = b.toInt().toChar()) {
        in '0'..'9' -> c - '0'
        in 'A'..'F' -> c - 'A' + 10
        in 'a'..'f' -> c - 'a' + 10
        else -> -1
    }

    private fun indexOf(h: ByteArray, n: ByteArray): Int {
        outer@ for (i in 0..h.size - n.size) {
            for (j in n.indices) if (h[i + j] != n[j]) continue@outer
            return i
        }
        return -1
    }
}
