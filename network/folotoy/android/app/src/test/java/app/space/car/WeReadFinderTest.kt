package app.space.car

import app.space.car.WeReadFinder.Node
import app.space.car.WeReadFinder.Rect
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** 假的画面树：照用户 2026-11-18 的截图（1080 × 2340 左右的 Samsung，比例照截图 815 × 2000 放大） */
private data class N(
    override val text: String? = null,
    override val desc: String? = null,
    override val bounds: Rect,
    override val clickable: Boolean = false,
    override val children: List<Node> = emptyList(),
) : Node

private const val W = 1080
private const val H = 2400
private fun r(l: Int, t: Int, rr: Int, b: Int) = Rect(l * W / 815, t * H / 2000, rr * W / 815, b * H / 2000)

class WeReadFinderTest {
    private val miniBar = N(
        bounds = r(0, 1650, 815, 1770), clickable = true,
        children = listOf(
            N(bounds = r(40, 1665, 128, 1752)),                                     // 封面
            N(text = "第十章 找到“黑天鹅”", bounds = r(155, 1672, 400, 1708)),
            N(text = "21:04 / 64:02", bounds = r(155, 1715, 290, 1748)),
            N(bounds = r(650, 1680, 705, 1740), clickable = true),                  // ▶
            N(bounds = r(735, 1690, 775, 1730), clickable = true),                  // ×
        ),
    )
    private val home = N(bounds = r(0, 0, 815, 2000), children = listOf(
        N(text = "本周阅读", bounds = r(78, 355, 172, 385)),
        N(text = "为你推荐", bounds = r(46, 610, 212, 655)),
        miniBar,
        N(text = "阅读", bounds = r(78, 1855, 128, 1885), clickable = true),
    ))

    @Test fun miniPlayerPlayButton() {
        val t = WeReadFinder.findPlay(home, W, H)!!
        assertEquals("小播放条的 ▶", t.why)
        assertEquals(r(650, 1680, 705, 1740).cx, t.x)               // 按 ▶，不是 ×
    }

    @Test fun miniPlayerWithoutNamedButtons() {
        val bare = N(bounds = r(0, 0, 815, 2000), children = listOf(
            N(text = "21:04 / 64:02", bounds = r(155, 1715, 290, 1748)),
        ))
        val t = WeReadFinder.findPlay(bare, W, H)!!
        assertEquals(W * 83 / 100, t.x)
        assertTrue(t.why.contains("比例"))
    }

    @Test fun fullPlayer() {
        val player = N(bounds = r(0, 0, 815, 2000), children = listOf(
            N(text = "AI 阅读", bounds = r(270, 130, 355, 160)),
            N(text = "定时关闭", bounds = r(48, 1180, 135, 1210), clickable = true),
            N(text = "语速 1.0x", bounds = r(470, 1180, 560, 1210), clickable = true),
            N(text = "原文", bounds = r(68, 1630, 112, 1660), clickable = true),
            N(bounds = r(215, 1590, 270, 1640), clickable = true),            // ⏪
            N(bounds = r(342, 1550, 472, 1680), clickable = true),            // 大 ▶
            N(bounds = r(545, 1590, 600, 1640), clickable = true),            // ⏩
        ))
        val t = WeReadFinder.findPlay(player, W, H)!!
        assertEquals(r(342, 1550, 472, 1680).cx, t.x)
        assertEquals("播放器中间的大按钮", t.why)
    }

    @Test fun fullPlayerNamedButtonWins() {
        val player = N(bounds = r(0, 0, 815, 2000), children = listOf(
            N(text = "定时关闭", bounds = r(48, 1180, 135, 1210)),
            N(text = "原文", bounds = r(68, 1630, 112, 1660)),
            N(desc = "播放", bounds = r(342, 1550, 472, 1680), clickable = true),
        ))
        assertEquals("播放器的「播放」", WeReadFinder.findPlay(player, W, H)!!.why)
    }

    @Test fun readingPageHasNothing() {
        val page = N(bounds = r(0, 0, 815, 2000), children = listOf(
            N(text = "第十章 找到“黑天鹅”", bounds = r(64, 130, 360, 160)),
            N(text = "但避免名誉受损产生的动力会更大。", bounds = r(64, 230, 750, 360)),
        ))
        assertNull(WeReadFinder.findPlay(page, W, H))
    }

    @Test fun dumpIsReadable() {
        val d = WeReadFinder.dump(home)
        assertTrue(d.contains("text=\"21:04 / 64:02\""))
        assertTrue(d.contains("[可按]"))
    }
}
