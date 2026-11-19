package app.space.car

/**
 * DEKU 小助理不碰 Android 的部分（有单元测试）：
 *  - 听到的话 → 关键词 → 要哪一类（不用 AI，不花钱）
 *  - 从审过的句库挑一句（一轮里不重复，「再来一个」= 同一类）
 *  - 要念出来的字
 * 句库来自 assets/deku.json（tools/make_deku.py 产生，只有用户审过的句子）。
 */
class DekuLogic(private val lines: List<Line>, seed: Long = System.nanoTime()) {
    enum class Kind(val key: String, val who: String) {
        JOKE("joke", ""), INAMORI("inamori", "稻盛和夫"), KUOK("kuok", "郭鹤年"), MUSK("musk", "马斯克");

        companion object {
            fun of(key: String) = entries.firstOrNull { it.key == key }
        }
    }

    data class Line(val id: String, val kind: Kind, val zh: String, val en: String? = null)

    /** 听到的话想要什么 */
    enum class Want { JOKE, INAMORI, KUOK, MUSK, ANY_PERSON, AGAIN }

    private val rnd = java.util.Random(seed)
    private val used = mutableMapOf<Kind, MutableSet<String>>()
    private var lastKind: Kind? = null
    private var nextPerson = 0
    var lastLine: Line? = null
        private set

    val size get() = lines.size

    fun byId(id: String) = lines.firstOrNull { it.id == id }

    /** 挑一句；这一类没有审过的句子回 null */
    fun pick(kind: Kind): Line? {
        val pool = lines.filter { it.kind == kind }
        if (pool.isEmpty()) return null
        val seen = used.getOrPut(kind) { mutableSetOf() }
        var free = pool.filter { it.id !in seen }
        if (free.isEmpty()) {   // 一轮抽完：重来，但不要马上又是刚刚那句
            seen.clear()
            free = pool.filter { pool.size == 1 || it.id != lastLine?.id }
        }
        val line = free[rnd.nextInt(free.size)]
        seen += line.id
        lastKind = kind
        lastLine = line
        return line
    }

    /** 名人轮流（没审过的人跳过） */
    fun pickPerson(): Line? {
        val people = listOf(Kind.INAMORI, Kind.KUOK, Kind.MUSK)
        repeat(people.size) {
            val k = people[nextPerson % people.size]
            nextPerson++
            pick(k)?.let { return it }
        }
        return null
    }

    /** 听到的几个候选句子（手机语音转文字给的）→ 一句；都没听懂回 null */
    fun answer(heard: List<String>): Line? {
        for (h in heard) {
            val w = want(h) ?: continue
            return when (w) {
                Want.JOKE -> pick(Kind.JOKE)
                Want.INAMORI -> pick(Kind.INAMORI)
                Want.KUOK -> pick(Kind.KUOK)
                Want.MUSK -> pick(Kind.MUSK)
                Want.ANY_PERSON -> pickPerson()
                Want.AGAIN -> lastKind?.let { pick(it) } ?: pick(Kind.JOKE)
            } ?: continue
        }
        return null
    }

    companion object {
        /** 关键词（简体 / 繁体 / 英文都收；先认人名，再认「笑话」「再来」） */
        fun want(text: String): Want? {
            val t = text.lowercase().replace(" ", "")
            return when {
                listOf("稻盛", "稲盛", "inamori", "京瓷").any { it in t } -> Want.INAMORI
                listOf("郭鹤年", "郭鶴年", "郭老", "kuok", "鹤年").any { it in t } -> Want.KUOK
                listOf("马斯克", "馬斯克", "musk", "埃隆", "伊隆", "elon", "特斯拉", "tesla").any { it in t } -> Want.MUSK
                listOf("名人", "名言", "鸡汤", "雞湯", "励志", "勵志", "金句", "语录", "語錄").any { it in t } -> Want.ANY_PERSON
                listOf("再来", "再來", "再一个", "再一個", "还要", "還要", "另一个", "另一個", "again", "more").any { it in t } -> Want.AGAIN
                listOf("笑话", "笑話", "好笑", "搞笑", "幽默", "joke", "funny", "讲个", "講個").any { it in t } -> Want.JOKE
                else -> null
            }
        }

        /** 手机要念的字：笑话照念；名人先说是谁；Musk 念完中文再念英文原句 */
        fun speech(line: Line): String = when (line.kind) {
            Kind.JOKE -> line.zh
            Kind.MUSK -> "马斯克说：${line.zh}" + (line.en?.let { " 原句是：$it" } ?: "")
            else -> "${line.kind.who}说：${line.zh}"
        }

        const val HELP = "没听清楚。你可以说：讲个笑话、稻盛和夫、郭鹤年、马斯克，或者再来一个。"
        const val EMPTY = "我的句库还在审，审好就可以讲给你听了。"
    }
}
