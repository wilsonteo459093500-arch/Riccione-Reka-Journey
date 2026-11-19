package app.space.car

import android.content.Context
import java.io.File

/**
 * 书摘（2026-11-19 用户选定）：微信读书「笔记 → 导出」整本复制，贴进 app → 拆成一段段 → 蓝牙传给 FoloToy，
 * 在开机封面下面轮播。可以贴好几本书；同一本再贴一次就换成新的。
 *
 * 微信读书导出的样子（2026-11-19 用户贴的《掌控谈话》）：
 *   《掌控谈话》
 *   （空行）
 *   克里斯·沃斯 塔尔·拉兹
 *   47个笔记
 *   （空行）
 *   第四章 小心“是”——掌控“不”        ← 章节（不要）
 *   （空行）
 *   ◆ 一段划线                        ← 书摘
 *   （空行）
 *   ◆ 一段划线
 *   …
 *   -- 来自微信读书
 *
 * 传给 FoloToy 的格式（韧体 main/news_model.h）：QUOTES1 / B<TAB>书名<TAB>作者 / Q<TAB>一段
 */
object Quotes {
    data class Book(val title: String, val author: String, val quotes: List<String>)

    const val MAX_BYTES = 120_000   // FoloToy 一格 128KB
    private const val QUOTE_MAX = 400
    private val COUNT_LINE = Regex("""^\d+\s*个笔记$""")
    private val CHAPTER = Regex("""^(第[\d一二三四五六七八九十百零〇]+[章节部篇卷回讲]|序|自序|推荐序|前言|引言|导言|附录|后记|尾声|结语|致谢)""")
    private val LEADING_PUNCT = Regex("""^[\s。，、；：！？）」』”’…·,.;:!?)\]]+""")

    /** 微信读书导出的文字 → 一本书；看不出是导出的（没有 ◆）回 null */
    fun parseWeRead(text: String): Book? {
        val lines = text.replace("\r\n", "\n").replace('\r', '\n').split('\n')
        var title = ""
        var author = ""
        val quotes = ArrayList<String>()
        var cur: StringBuilder? = null
        var headerDone = false
        fun flush() {
            cur?.let { q -> clean(q.toString())?.let { quotes.add(it) } }
            cur = null
        }
        for (raw in lines) {
            val line = raw.trim()
            if (line.startsWith("-- 来自微信读书") || line.startsWith("——来自微信读书")) break
            if (line.startsWith("◆")) {
                flush()
                headerDone = true
                cur = StringBuilder(line.removePrefix("◆").trim())
                continue
            }
            if (line.isEmpty()) {
                flush()
                continue
            }
            if (cur != null) {   // 一段划线跨好几行：接起来
                cur!!.append(line)
                continue
            }
            if (headerDone) continue   // 章节名
            when {
                title.isEmpty() && line.startsWith("《") -> title = line.removePrefix("《").substringBefore("》").trim()
                title.isEmpty() -> title = line
                COUNT_LINE.matches(line) || CHAPTER.containsMatchIn(line) -> headerDone = true
                author.isEmpty() -> author = line
                else -> headerDone = true   // 第一个章节名
            }
        }
        flush()
        if (quotes.isEmpty()) return null
        return Book(title.ifEmpty { "书摘" }, author, quotes)
    }

    /** 一段：拿掉开头的标点（划线常从句号后面开始）、空白合成一个；太短的不要 */
    fun clean(q: String): String? {
        val t = q.replace(Regex("""\s+"""), " ").replace(LEADING_PUNCT, "").trim()
        return if (t.length < 4) null else t
    }

    /** 新的一本放最前面；同名的换掉 */
    fun add(library: List<Book>, book: Book): List<Book> = listOf(book) + library.filter { it.title != book.title }

    fun remove(library: List<Book>, title: String): List<Book> = library.filter { it.title != title }

    /** 整个书单 → 传给 FoloToy 的文字档；太大就从最旧的书开始少放 */
    fun encode(library: List<Book>, chars: Set<Int>?): ByteArray {
        val sb = StringBuilder("QUOTES1\n")
        var bytes = sb.length
        outer@ for (b in library) {
            val head = "B\t" + BriefCodec.clean(b.title, chars, 60) + "\t" + BriefCodec.clean(b.author, chars, 60) + "\n"
            val headBytes = head.toByteArray(Charsets.UTF_8).size
            if (bytes + headBytes > MAX_BYTES) break
            sb.append(head)
            bytes += headBytes
            for (q in b.quotes) {
                val line = "Q\t" + BriefCodec.clean(q, chars, QUOTE_MAX) + "\n"
                val n = line.toByteArray(Charsets.UTF_8).size
                if (bytes + n > MAX_BYTES) break@outer
                sb.append(line)
                bytes += n
            }
        }
        return sb.toString().toByteArray(Charsets.UTF_8)
    }

    /** 存起来的书单（不经过 FoloToy 字型的清理，原文）读回来 */
    fun decode(data: ByteArray): List<Book> {
        val books = ArrayList<Book>()
        var title: String? = null
        var author = ""
        var qs = ArrayList<String>()
        for (line in String(data, Charsets.UTF_8).lineSequence()) {
            if (line.startsWith("B\t")) {
                title?.let { books.add(Book(it, author, qs)) }
                val f = line.split('\t')
                title = f.getOrElse(1) { "" }
                author = f.getOrElse(2) { "" }
                qs = ArrayList()
            } else if (line.startsWith("Q\t") && title != null) {
                qs.add(line.substring(2))
            }
        }
        title?.let { books.add(Book(it, author, qs)) }
        return books
    }
}

/** 书单存在手机里（原文，没换字）；传给 FoloToy 的那份（换过字）另外存，crc 跟 FoloToy 对 */
object QuotesStore {
    private const val LIB = "quotes-library.txt"
    private const val SENT = "quotes.txt"
    private const val PREFS = "quotes"

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun library(c: Context): List<Quotes.Book> =
        File(c.filesDir, LIB).takeIf { it.exists() }?.let { Quotes.decode(it.readBytes()) } ?: emptyList()

    fun saveLibrary(c: Context, lib: List<Quotes.Book>) {
        File(c.filesDir, LIB).writeBytes(Quotes.encode(lib, null))
        val data = Quotes.encode(lib, NewsStore.chars(c))
        File(c.filesDir, SENT).writeBytes(data)
        prefs(c).edit().putLong("crc", BriefCodec.crc32(data)).apply()
    }

    fun encoded(c: Context): ByteArray? = File(c.filesDir, SENT).takeIf { it.exists() }?.readBytes()
    fun crc(c: Context): Long? = if (prefs(c).contains("crc")) prefs(c).getLong("crc", 0) else null
    fun sentCrc(c: Context): Long? = if (prefs(c).contains("sentCrc")) prefs(c).getLong("sentCrc", 0) else null
    fun setSent(c: Context, crc: Long) = prefs(c).edit().putLong("sentCrc", crc).apply()
}
