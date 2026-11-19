package app.space.car

import java.util.zip.CRC32

/**
 * 每日晨报（DAILY MORNING BRIEF）：用户每天早上 7 点左右自己寄给自己的 HTML 信。
 * 这里只做「HTML → 栏目 + 条目」和「条目 → 传给 FoloToy 的文字档」，不连网、不碰蓝牙（有单元测试）。
 *
 * 信的格式（2026-11-18 那封，样本 app/src/test/resources/brief-2026-11-18.html）：
 *   - 纯文字那层只有一句话，全文只在 HTML
 *   - 「今日三件事」：`<td valign="top" …>标题</td>` 三个
 *   - 目录：`<b>一</b> 今日必读 <span>8</span>`（短名字，FoloToy 用这个）
 *   - 栏目头：`<td …>一、今日必读</td><td align="right" …>8条</td>`（长名字；用中文数字跟目录对）
 *   - 每条：`<b style="display:block…">[<span>【家具】</span> ]1. 标题</b><div …>摘要</div><a …>来源 →</a>`
 *   - 「对你的生意意味着什么」：一个框里 5 点（`<td valign="top" …>一句话</td>`），夹在第四、第五栏中间
 *   - 最后「编辑说明」不要
 *
 * 传给 FoloToy 的格式见韧体 main/news_model.h：
 *   BRIEF1 / D<TAB>日期 / S<TAB>栏名 / I<TAB>标题<TAB>摘要（UTF-8，一行一笔）
 */
data class Brief(val date: String, val sections: List<Section>) {
    data class Section(val name: String, val items: List<Item>)
    data class Item(val title: String, val summary: String)

    val itemCount: Int get() = sections.sumOf { it.items.size }
}

object BriefParser {
    private const val NUM = "一二三四五六七八九十"
    private val DATE_CN = Regex("""(\d{4})年(\d{1,2})月(\d{1,2})日\s*[·（(]?\s*(星期[一二三四五六日天])""")
    private val DATE_ISO = Regex("""(\d{4})-(\d{2})-(\d{2})""")
    private val TOC = Regex("""<b[^>]*>\s*([$NUM]+)\s*</b>\s*([^<]+?)\s*<span[^>]*>\s*\d+\s*</span>""")
    private val SECTION_HEAD = Regex("""<td[^>]*>\s*([$NUM]+)、([^<]+?)\s*</td>\s*<td[^>]*align="right"[^>]*>\s*(\d+)\s*条\s*</td>""")
    private val CARD = Regex("""<b[^>]*display:\s*block[^>]*>(.*?)</b>\s*(?:<div[^>]*>(.*?)</div>)?""", RegexOption.DOT_MATCHES_ALL)
    private val TOP_CELL = Regex("""<td valign="top"[^>]*>(.*?)</td>""", RegexOption.DOT_MATCHES_ALL)
    private val NUMBERED = Regex("""^((?:【[^】]*】\s*)*)\d+\s*[.、．]\s*(.*)$""", RegexOption.DOT_MATCHES_ALL)

    const val THREE = "今日三件事"
    const val BUSINESS = "对你的生意"

    fun parse(html: String): Brief? {
        val date = DATE_CN.find(html)?.let { m ->
            "%s-%02d-%02d %s".format(m.groupValues[1], m.groupValues[2].toInt(), m.groupValues[3].toInt(), m.groupValues[4])
        } ?: DATE_ISO.find(html)?.value ?: ""

        // 目录：中文数字 → 短名字
        val toc = TOC.findAll(html).associate { it.groupValues[1] to text(it.groupValues[2]) }

        // 「对你的生意意味着什么」那个框的范围（别算进第四栏）
        val bizAt = html.indexOf("对你的生意意味着什么")
        val bizEnd = if (bizAt >= 0) html.indexOf("</table>", bizAt).let { if (it < 0) html.length else it } else -1
        val business = if (bizAt >= 0) cells(html.substring(bizAt, bizEnd)) else emptyList()

        // 九栏
        val heads = SECTION_HEAD.findAll(html).toList()
        val sections = ArrayList<Brief.Section>()
        for ((i, h) in heads.withIndex()) {
            var end = if (i + 1 < heads.size) heads[i + 1].range.first else footerAt(html, h.range.last)
            if (bizAt > h.range.last && bizAt < end) end = bizAt
            val items = CARD.findAll(html.substring(h.range.last + 1, end)).map { card(it) }.filter { it.title.isNotEmpty() }.toList()
            val num = h.groupValues[1]
            val name = toc[num] ?: text(h.groupValues[2])
            if (items.isNotEmpty()) sections.add(Brief.Section("$num $name", items))
        }
        if (sections.isEmpty()) {   // 没有栏目头（旧格式？）：有条目就全部放一栏
            val items = CARD.findAll(html).map { card(it) }.filter { it.title.isNotEmpty() }.toList()
            if (items.isNotEmpty()) sections.add(Brief.Section("全部", items))
        }

        // 今日三件事：标题跟哪一条一样，就借那一条的摘要
        val threeAt = html.indexOf(THREE)
        val three = if (threeAt >= 0) {
            val end = html.indexOf("</table>", threeAt).let { if (it < 0) html.length else it }
            cells(html.substring(threeAt, end))
        } else emptyList()
        val all = sections.flatMap { it.items }
        val threeItems = three.map { t ->
            val same = all.firstOrNull { plain(it.title) == plain(t) }
            Brief.Item(t, same?.summary ?: "")
        }

        val out = ArrayList<Brief.Section>()
        if (threeItems.isNotEmpty()) out.add(Brief.Section(THREE, threeItems))
        out.addAll(sections)
        if (business.isNotEmpty()) out.add(Brief.Section(BUSINESS, business.map { Brief.Item(it, "") }))
        if (sections.isEmpty() && threeItems.isEmpty()) return null
        return Brief(date, out)
    }

    /** 最后一栏的结束：「编辑说明」之前（没有就到底） */
    private fun footerAt(html: String, from: Int): Int {
        val f = html.indexOf("编辑说明", from)
        return if (f < 0) html.length else f
    }

    /** `<td valign="top">` 里的字（拿掉只有数字的那些圆圈编号） */
    private fun cells(seg: String): List<String> =
        TOP_CELL.findAll(seg).map { text(it.groupValues[1]) }.filter { it.isNotEmpty() && !it.all { c -> c.isDigit() } }.toList()

    private fun card(m: MatchResult): Brief.Item {
        var title = text(m.groupValues[1])
        NUMBERED.matchEntire(title)?.let { n ->
            val badges = n.groupValues[1].replace(Regex("""\s+"""), "")
            val rest = n.groupValues[2].trim()
            title = if (badges.isEmpty() || rest.startsWith(badges)) rest else badges + rest
        }
        return Brief.Item(title, text(m.groupValues[2]))
    }

    /** 比对用：拿掉【标签】和空白 */
    private fun plain(s: String) = s.replace(Regex("""【[^】]*】"""), "").replace(Regex("""\s+"""), "")

    /** HTML 片段 → 纯文字：拿掉标签、解开 &amp; 之类、空白合成一个 */
    fun text(html: String): String {
        val noTags = html.replace(Regex("""<br\s*/?>""", RegexOption.IGNORE_CASE), " ").replace(Regex("""<[^>]*>"""), "")
        return entities(noTags).replace(Regex("""[\s ]+"""), " ").trim()
    }

    private fun entities(s: String): String = Regex("""&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);""").replace(s) { m ->
        val e = m.groupValues[1]
        when {
            e.startsWith("#x") || e.startsWith("#X") -> e.substring(2).toIntOrNull(16)?.let { String(Character.toChars(it)) } ?: m.value
            e.startsWith("#") -> e.substring(1).toIntOrNull()?.let { String(Character.toChars(it)) } ?: m.value
            else -> when (e) {
                "amp" -> "&"; "lt" -> "<"; "gt" -> ">"; "quot" -> "\""; "apos" -> "'"; "nbsp" -> " "
                "middot" -> "·"; "mdash" -> "—"; "ndash" -> "–"; "hellip" -> "…"
                "ldquo" -> "“"; "rdquo" -> "”"; "lsquo" -> "‘"; "rsquo" -> "’"
                else -> m.value
            }
        }
    }
}

object BriefCodec {
    const val MAX_BYTES = 120_000      // FoloToy 一格 128KB
    const val MAX_SECTIONS = 16        // 韧体 NEWS_MAX_SECTIONS
    const val MAX_ITEMS = 200          // 韧体 NEWS_MAX_ITEMS
    private const val TITLE_MAX = 120
    private const val SUMMARY_MAX = 300
    private const val MISSING = '□'

    /** FoloToy 字型有的字（assets/news_chars.txt，跟韧体同一份字表）；null = 不检查 */
    fun loadChars(text: String): Set<Int> {
        val set = HashSet<Int>()
        for (line in text.lineSequence()) {
            if (line.startsWith("#")) continue
            var i = 0
            while (i < line.length) {
                val cp = line.codePointAt(i)
                set.add(cp)
                i += Character.charCount(cp)
            }
        }
        return set
    }

    /** 传给 FoloToy 的文字档（UTF-8） */
    fun encode(b: Brief, chars: Set<Int>?): ByteArray {
        val sb = StringBuilder("BRIEF1\n")
        sb.append("D\t").append(clean(b.date, chars, 40)).append('\n')
        var items = 0
        for (s in b.sections.take(MAX_SECTIONS)) {
            if (items >= MAX_ITEMS) break
            val line = StringBuilder("S\t").append(clean(s.name, chars, 40)).append('\n')
            for (it in s.items) {
                if (items >= MAX_ITEMS) break
                val entry = "I\t" + clean(it.title, chars, TITLE_MAX) + "\t" + clean(it.summary, chars, SUMMARY_MAX) + "\n"
                if ((sb.length + line.length + entry.length) * 3 > MAX_BYTES) break   // 保守估：一个字最多 3 字节
                line.append(entry)
                items++
            }
            sb.append(line)
        }
        return sb.toString().toByteArray(Charsets.UTF_8)
    }

    fun crc32(data: ByteArray): Long = CRC32().apply { update(data) }.value

    /** 读回传过的文字档（念的时候用）：整份的条目照顺序（第几条 = FoloToy 送来的序号） */
    fun items(encoded: ByteArray): List<Brief.Item> =
        String(encoded, Charsets.UTF_8).lineSequence().filter { it.startsWith("I\t") }.map { line ->
            val f = line.split('\t')
            Brief.Item(f.getOrElse(1) { "" }, f.getOrElse(2) { "" })
        }.toList()

    fun date(encoded: ByteArray): String =
        String(encoded, Charsets.UTF_8).lineSequence().firstOrNull { it.startsWith("D\t") }?.substring(2) ?: ""

    /** 一条要念的话：标题。摘要 */
    fun speech(it: Brief.Item): String {
        val t = it.title.replace(Regex("""【[^】]*】"""), "")
        return if (it.summary.isEmpty()) t else "$t。${it.summary}"
    }

    /** 拿掉 TAB / 换行、字型没有的字换成 □（常见的几个换成相近的）、太长截掉 */
    fun clean(s: String, chars: Set<Int>?, max: Int): String {
        val out = StringBuilder()
        var i = 0
        var n = 0
        while (i < s.length && n < max) {
            var cp = s.codePointAt(i)
            i += Character.charCount(cp)
            if (cp == '\t'.code || cp == '\n'.code || cp == '\r'.code) cp = ' '.code
            if (chars != null && cp !in 0x20..0x7E && cp !in chars) {
                cp = when (cp) {
                    0x2018, 0x2019 -> '\''.code
                    0x201C, 0x201D -> '"'.code
                    0x2212, 0x2010, 0x2011 -> '-'.code
                    0x00A0, 0x2009, 0x200A, 0x3000 -> ' '.code
                    0x200B, 0xFE0F -> -1
                    else -> MISSING.code
                }
                if (cp == MISSING.code && MISSING.code !in chars) cp = '?'.code
            }
            if (cp < 0) continue
            if (cp == ' '.code && (out.isEmpty() || out.last() == ' ')) continue
            out.appendCodePoint(cp)
            n++
        }
        return out.toString().trim()
    }
}
