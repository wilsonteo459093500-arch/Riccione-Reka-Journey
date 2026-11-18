package app.space.car

import java.util.UUID

/**
 * SPACE 车控通道（FoloToy ⇄ 手机）的封包。跟韧体 main/car_remote_model.h 同一份规格：
 *   按键通知（FoloToy → 手机，notify）：[按键 0 上 / 1 下 / 2 确定, 事件 0 单击 / 1 长按 / 2 按下 / 3 放开]
 *   指令（手机 → FoloToy，write）：
 *     [0x01, 模式]           0 = 一般（媒体键）、1 = 选择模式（按键只给 app）
 *     [0x02, 行 0/1, 文字…]  选择模式画面的两行字（FoloToy 只有英文字型：只送 ASCII，最多 28 字）
 */
object Protocol {
    val SERVICE: UUID = UUID.fromString("8d6f0001-6b3a-4c2e-9a51-535041434552")
    val EVENTS: UUID = UUID.fromString("8d6f0002-6b3a-4c2e-9a51-535041434552")
    val COMMANDS: UUID = UUID.fromString("8d6f0003-6b3a-4c2e-9a51-535041434552")
    val CCCD: UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

    /** FoloToy 在手机蓝牙清单上的名字（韧体 Kconfig 的 SPACE_REMOTE_NAME） */
    const val DEVICE_NAME = "SPACE Remote"
    const val TEXT_MAX = 28

    enum class Btn { UP, DOWN, OK }
    enum class Ev { CLICK, LONG, PRESS, RELEASE }
    data class Key(val btn: Btn, val ev: Ev)

    fun decodeKey(data: ByteArray?): Key? {
        if (data == null || data.size != 2) return null
        val b = data[0].toInt() and 0xFF
        val e = data[1].toInt() and 0xFF
        if (b > 2 || e > 3) return null
        return Key(Btn.entries[b], Ev.entries[e])
    }

    fun modeCommand(select: Boolean): ByteArray = byteArrayOf(0x01, if (select) 1 else 0)

    fun textCommand(line: Int, text: String): ByteArray {
        require(line == 0 || line == 1)
        val ascii = toAscii(text).take(TEXT_MAX)
        return byteArrayOf(0x02, line.toByte()) + ascii.toByteArray(Charsets.US_ASCII)
    }

    /** FoloToy 画面只有英文字型：非 ASCII 换掉（连续的合成一个 ?），头尾空白去掉 */
    fun toAscii(text: String): String {
        val sb = StringBuilder()
        var lastWasQ = false
        for (ch in text) {
            if (ch.code in 0x20..0x7E) {
                sb.append(ch)
                lastWasQ = false
            } else if (!lastWasQ) {
                sb.append('?')
                lastWasQ = true
            }
        }
        return sb.toString().trim()
    }
}
