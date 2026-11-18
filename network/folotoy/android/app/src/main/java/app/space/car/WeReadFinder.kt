package app.space.car

/**
 * 在微信读书画面上找「播放」要按哪里（纯逻辑，有单元测试）。
 *
 * 照用户 2026-11-18 的截图（Samsung、微信读书深色模式）：
 *  - 首页底部的「正在听」小播放条：封面｜章节名 + 「21:04 / 64:02」｜▶｜×
 *    → 找到「时间 / 时间」那行字，▶ 就在同一条的右边、× 的左边
 *  - 完整播放器：有「定时关闭」「语速」「原文」，大的蓝色 ▶ 在画面中间偏下
 * 找不到就回 null（service 会改送「播放」媒体键）。
 */
object WeReadFinder {
    const val PACKAGE = "com.tencent.weread"

    data class Rect(val left: Int, val top: Int, val right: Int, val bottom: Int) {
        val cx get() = (left + right) / 2
        val cy get() = (top + bottom) / 2
        val width get() = right - left
        val height get() = bottom - top
    }

    interface Node {
        val text: String?
        val desc: String?
        val bounds: Rect
        val clickable: Boolean
        val children: List<Node>
    }

    data class Target(val x: Int, val y: Int, val why: String)

    private val TIME = Regex("""^\s*\d{1,3}:\d{2}\s*/\s*\d{1,3}:\d{2}\s*$""")
    private val FULL_PLAYER_WORDS = listOf("定时关闭", "语速", "原文")

    fun findPlay(root: Node, screenW: Int, screenH: Int): Target? =
        miniPlayer(root, screenW) ?: fullPlayer(root, screenW, screenH)

    /** 首页的小播放条 */
    fun miniPlayer(root: Node, screenW: Int): Target? {
        val time = all(root).firstOrNull { TIME.matches(it.text ?: "") } ?: return null
        val rowTop = time.bounds.top - time.bounds.height
        val rowBottom = time.bounds.bottom + time.bounds.height / 2
        // 同一条、在时间字右边的可按东西：由左到右是 ▶、×；取 × 前面那个
        val right = all(root)
            .filter { it.clickable && it.bounds.cx > time.bounds.right && it.bounds.cy in rowTop..rowBottom && it.bounds.width < screenW / 3 }
            .sortedBy { it.bounds.cx }
        val play = when {
            right.size >= 2 -> right[right.size - 2]
            right.size == 1 && right[0].bounds.cx < screenW * 88 / 100 -> right[0]
            else -> null
        }
        if (play != null) return Target(play.bounds.cx, play.bounds.cy, "小播放条的 ▶")
        // 按钮没有名字也不能按（有些 app 整条才可按）：照截图比例按（▶ 在宽度 83% 的地方）
        return Target(screenW * 83 / 100, time.bounds.cy - time.bounds.height / 2, "小播放条（按比例）")
    }

    /** 完整播放器 */
    fun fullPlayer(root: Node, screenW: Int, screenH: Int): Target? {
        val nodes = all(root)
        if (FULL_PLAYER_WORDS.count { w -> nodes.any { it.text?.contains(w) == true } } < 2) return null
        val named = nodes.firstOrNull { (it.desc ?: "").let { d -> d.contains("播放") || d.contains("暂停") } && it.clickable }
        if (named != null) return Target(named.bounds.cx, named.bounds.cy, "播放器的「${named.desc}」")
        // 画面中间偏下、最大的那颗可按的圆
        val big = nodes
            .filter { it.clickable && it.bounds.cy > screenH / 2 && kotlin.math.abs(it.bounds.cx - screenW / 2) < screenW / 10 && it.bounds.width < screenW / 2 }
            .maxByOrNull { it.bounds.width * it.bounds.height }
        if (big != null) return Target(big.bounds.cx, big.bounds.cy, "播放器中间的大按钮")
        return Target(screenW / 2, screenH * 81 / 100, "播放器（按比例）")
    }

    private fun all(root: Node): List<Node> {
        val out = ArrayList<Node>()
        val stack = ArrayDeque<Node>()
        stack.add(root)
        while (stack.isNotEmpty()) {
            val n = stack.removeLast()
            out.add(n)
            stack.addAll(n.children)
        }
        return out
    }

    /** 画面结构存成文字（诊断用：传给 Claude 看，好对准按钮） */
    fun dump(root: Node): String {
        val sb = StringBuilder()
        fun walk(n: Node, depth: Int) {
            sb.append("  ".repeat(depth))
            if (!n.text.isNullOrEmpty()) sb.append("text=\"").append(n.text).append("\" ")
            if (!n.desc.isNullOrEmpty()) sb.append("desc=\"").append(n.desc).append("\" ")
            if (n.clickable) sb.append("[可按] ")
            sb.append(n.bounds.left).append(',').append(n.bounds.top).append('-').append(n.bounds.right).append(',').append(n.bounds.bottom)
            sb.append('\n')
            n.children.forEach { walk(it, depth + 1) }
        }
        walk(root, 0)
        return sb.toString()
    }
}
