package app.space.car

import java.util.UUID

/**
 * SPACE 车控通道（FoloToy ⇄ 手机）的封包。跟韧体 main/car_remote_model.h 同一份规格：
 *   按键通知（FoloToy → 手机，notify）：[按键 0 上 / 1 下 / 2 确定, 事件 0 单击 / 1 长按 / 2 按下 / 3 放开]
 *   指令（手机 → FoloToy，write）：
 *     [0x01, 模式]           0 = 一般（媒体键）、1 = 选择模式（按键只给 app）
 *     [0x02, 行 0/1, 文字…]  选择模式画面的两行字（FoloToy 只有英文字型：只送 ASCII，最多 28 字）
 *     [0x03, 1 / 0]          找 FoloToy：开始响 / 停（任何模式都收；韧体 main/find_model.h）
 *   找 FoloToy 的状态（FoloToy → 手机，跟按键同一个 notify）：[0x80, 状态]
 *     0 = 手机叫停、1 = 正在响、2 = 有人按键（找到了）、3 = 响了 30 秒没人按
 *   DEKU 小助理（韧体 main/deku_model.h）：
 *     FoloToy → 手机：[0x81, 1 / 0] 开始听 / 放开了；[0x82, id…] 请念这句（FoloToy 上按键挑的）
 *     手机 → FoloToy：[0x04, id…] 显示这句；[0x05] 没听懂
 *   每日晨报（韧体 main/news_model.h；数字都是 little-endian）：
 *     手机 → FoloToy：[0x06, 0x01, 长度 u32, crc32 u32] 开始传；[0x06, 0x02, 位置 u32, 资料…] 一段；[0x06, 0x03] 传完
 *                     [0x07] 你有哪一份？
 *     FoloToy → 手机：[0x83, 状态, crc32 u32] 现在有的那份（0 有、1 没有、2 收坏了、3 太大、4 写入失败）
 *                     [0x84, 第几条 u16, crc32 u32] 请念这条
 *   书摘（开机封面轮播）：同一套，手机 → FoloToy 用 0x08（资料）、0x09（问）；FoloToy → 手机 [0x85, 状态, crc32 u32]
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

    sealed class Deku {
        data class Listen(val on: Boolean) : Deku()
        data class Say(val id: String) : Deku()
    }

    fun decodeDeku(data: ByteArray?): Deku? {
        if (data == null || data.isEmpty()) return null
        return when (data[0].toInt() and 0xFF) {
            0x81 -> if (data.size == 2) Deku.Listen(data[1].toInt() != 0) else null
            0x82 -> if (data.size in 2..9) Deku.Say(String(data, 1, data.size - 1, Charsets.US_ASCII)) else null
            else -> null
        }
    }

    fun dekuShow(id: String): ByteArray = byteArrayOf(0x04) + id.toByteArray(Charsets.US_ASCII)

    fun dekuUnknown(): ByteArray = byteArrayOf(0x05)

    enum class FindState { STOPPED, RINGING, FOUND, TIMEOUT }

    fun findCommand(ring: Boolean): ByteArray = byteArrayOf(0x03, if (ring) 1 else 0)

    /** [0x80, 状态]；不是找 FoloToy 的通知回 null */
    fun decodeFindState(data: ByteArray?): FindState? {
        if (data == null || data.size != 2 || (data[0].toInt() and 0xFF) != 0x80) return null
        return FindState.entries.getOrNull(data[1].toInt() and 0xFF)
    }

    const val NEWS_OK = 0
    const val NEWS_NONE = 1
    const val NEWS_BAD = 2
    const val NEWS_TOO_BIG = 3
    const val NEWS_FLASH = 4

    data class NewsStatus(val status: Int, val crc: Long)
    data class NewsSay(val index: Int, val crc: Long)

    const val NEWS_DATA: Byte = 0x06
    const val NEWS_ASK: Byte = 0x07
    const val QUOTES_DATA: Byte = 0x08
    const val QUOTES_ASK: Byte = 0x09

    fun newsAsk(): ByteArray = byteArrayOf(NEWS_ASK)
    fun quotesAsk(): ByteArray = byteArrayOf(QUOTES_ASK)

    /** 整份拆成封包：开始、一段段（每段最多 chunk 字节）、传完。cmd：晨报 0x06、书摘 0x08 */
    fun newsPackets(data: ByteArray, crc: Long, chunk: Int, cmd: Byte = NEWS_DATA): List<ByteArray> {
        require(chunk > 0)
        val out = ArrayList<ByteArray>()
        out.add(byteArrayOf(cmd, 0x01) + le32(data.size.toLong()) + le32(crc))
        var off = 0
        while (off < data.size) {
            val n = minOf(chunk, data.size - off)
            out.add(byteArrayOf(cmd, 0x02) + le32(off.toLong()) + data.copyOfRange(off, off + n))
            off += n
        }
        out.add(byteArrayOf(cmd, 0x03))
        return out
    }

    fun decodeNewsStatus(data: ByteArray?): NewsStatus? = decodeStatus(data, 0x83)
    fun decodeQuotesStatus(data: ByteArray?): NewsStatus? = decodeStatus(data, 0x85)

    private fun decodeStatus(data: ByteArray?, evt: Int): NewsStatus? {
        if (data == null || data.size != 6 || (data[0].toInt() and 0xFF) != evt) return null
        return NewsStatus(data[1].toInt() and 0xFF, rd32(data, 2))
    }

    fun decodeNewsSay(data: ByteArray?): NewsSay? {
        if (data == null || data.size != 7 || (data[0].toInt() and 0xFF) != 0x84) return null
        return NewsSay((data[1].toInt() and 0xFF) or ((data[2].toInt() and 0xFF) shl 8), rd32(data, 3))
    }

    private fun le32(v: Long) = byteArrayOf(v.toByte(), (v shr 8).toByte(), (v shr 16).toByte(), (v shr 24).toByte())

    private fun rd32(b: ByteArray, at: Int): Long =
        (b[at].toLong() and 0xFF) or ((b[at + 1].toLong() and 0xFF) shl 8) or
            ((b[at + 2].toLong() and 0xFF) shl 16) or ((b[at + 3].toLong() and 0xFF) shl 24)

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
