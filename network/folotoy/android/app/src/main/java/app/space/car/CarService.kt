package app.space.car

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Path
import android.graphics.Rect
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import app.space.car.CarLogic.Effect
import java.io.File
import java.util.Locale

/**
 * SPACE 车控：整个 app 的工作都在这个「无障碍服务」里。
 *
 * 为什么用无障碍服务：
 *  - 系统会让它一直在背景跑（不用另外开常驻通知）
 *  - Android 10 起，背景的 app 不能自己打开别的 app；无障碍服务是官方允许的例外
 *  - 要帮你按微信读书的 ▶、按住 WhatsApp 的录音键
 *
 * 它做的事：连 FoloToy（蓝牙 SPACE 车控通道）→ 收按键 → CarLogic 决定做什么 → 这里执行。
 * 只在 FoloToy 按键时动作；不读讯息内容、不上网。
 */
class CarService : AccessibilityService() {
    private val main = Handler(Looper.getMainLooper())
    private lateinit var logic: CarLogic
    private var tts: TextToSpeech? = null
    private var gatt: BluetoothGatt? = null
    private var cmdChar: BluetoothGattCharacteristic? = null
    private val writeQueue = ArrayDeque<ByteArray>()
    private var writing = false
    private var lastNavPackage: String? = null
    private var voice: VoiceNote? = null

    // ---------------- 生命周期 ----------------
    override fun onServiceConnected() {
        instance = this
        logic = CarLogic(
            contacts = { Friends.load(this).map { CarLogic.Friend(it.name, it.label) } },
        )
        tts = TextToSpeech(this) { ok -> if (ok == TextToSpeech.SUCCESS) tts?.language = Locale.SIMPLIFIED_CHINESE }
        connect()
        main.post(ticker)
        status = "等 FoloToy 连线"
    }

    override fun onDestroy() {
        instance = null
        main.removeCallbacksAndMessages(null)
        gatt?.close()
        tts?.shutdown()
        super.onDestroy()
    }

    override fun onInterrupt() {}

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // 记住最后在前台的导航（开完微信读书要切回去）
        val pkg = event?.packageName?.toString() ?: return
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && pkg in NAV_PACKAGES) lastNavPackage = pkg
    }

    private val ticker = object : Runnable {
        override fun run() {
            if (::logic.isInitialized) run(logic.onTick(SystemClock.elapsedRealtime()))
            main.postDelayed(this, 250)
        }
    }

    // ---------------- 蓝牙 ----------------
    private fun hasBtPermission() =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED

    /** 找手机里已经配对的 FoloToy（名字「SPACE Remote」）→ autoConnect：FoloToy 一进车用模式就自动连上 */
    @SuppressLint("MissingPermission")
    fun connect() {
        if (!hasBtPermission()) {
            status = "还没给「附近的装置」权限：打开 SPACE 车控 app 按「开权限」"
            return
        }
        val adapter = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return
        val dev = adapter.bondedDevices?.firstOrNull { it.name == Protocol.DEVICE_NAME }
        if (dev == null) {
            status = "手机还没配对 FoloToy：FoloToy 进车用模式 → 手机蓝牙设定配对「${Protocol.DEVICE_NAME}」"
            main.postDelayed({ connect() }, 15_000)
            return
        }
        gatt?.close()
        gatt = dev.connectGatt(this, true, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, st: Int, newState: Int) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                main.post { status = "连上 FoloToy，准备中…" }
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                main.post {
                    status = "FoloToy 没连上（进车用模式会自动连）"
                    cmdChar = null
                    writeQueue.clear()
                    writing = false
                    run(logic.onDisconnected())
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, st: Int) {
            val svc = g.getService(Protocol.SERVICE)
            if (svc == null) {
                main.post { status = "FoloToy 的韧体太旧：请烧最新的 SPACE-card-full.bin" }
                return
            }
            val evt = svc.getCharacteristic(Protocol.EVENTS)
            cmdChar = svc.getCharacteristic(Protocol.COMMANDS)
            g.setCharacteristicNotification(evt, true)
            val cccd = evt.getDescriptor(Protocol.CCCD)
            if (Build.VERSION.SDK_INT >= 33) {
                g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
            } else {
                @Suppress("DEPRECATION")
                cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                @Suppress("DEPRECATION")
                g.writeDescriptor(cccd)
            }
            writing = true   // 等描述写完再送指令
        }

        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, st: Int) {
            main.post {
                status = "FoloToy 已连线 ✓"
                writing = false
                send(Protocol.modeCommand(false))
            }
        }

        override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, st: Int) {
            main.post {
                writing = false
                pump()
            }
        }

        @Deprecated("Android 13 以前走这个")
        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic) {
            @Suppress("DEPRECATION")
            onKeyBytes(c.value)
        }

        override fun onCharacteristicChanged(g: BluetoothGatt, c: BluetoothGattCharacteristic, value: ByteArray) {
            onKeyBytes(value)
        }
    }

    private fun onKeyBytes(data: ByteArray?) {
        val key = Protocol.decodeKey(data) ?: return
        main.post { run(logic.onKey(key.btn, key.ev, SystemClock.elapsedRealtime())) }
    }

    /** 指令一个一个送（BLE 同时只能有一个写入在路上） */
    private fun send(cmd: ByteArray) {
        writeQueue.addLast(cmd)
        pump()
    }

    @SuppressLint("MissingPermission")
    private fun pump() {
        val g = gatt ?: return
        val c = cmdChar ?: return
        if (writing || writeQueue.isEmpty()) return
        val cmd = writeQueue.removeFirst()
        writing = true
        if (Build.VERSION.SDK_INT >= 33) {
            g.writeCharacteristic(c, cmd, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
        } else {
            @Suppress("DEPRECATION")
            c.value = cmd
            @Suppress("DEPRECATION")
            g.writeCharacteristic(c)
        }
    }

    // ---------------- 执行 CarLogic 的决定 ----------------
    private fun run(effects: List<Effect>) {
        for (e in effects) when (e) {
            is Effect.Mode -> send(Protocol.modeCommand(e.select))
            is Effect.Text -> send(Protocol.textCommand(e.line, e.text))
            is Effect.Speak -> speak(e.text)
            is Effect.OpenWeRead -> openWeRead()
            is Effect.Call -> call(e.index)
            is Effect.VoiceStart -> voiceStart(e.index)
            Effect.VoiceStop -> voice?.release(send = true)
            Effect.VoiceCancel -> voice?.release(send = false)
        }
    }

    private fun speak(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "space")
    }

    private fun friend(i: Int) = Friends.load(this).getOrNull(i)

    // ---------------- WhatsApp ----------------
    private fun call(i: Int) {
        val f = friend(i) ?: return
        val intent = Friends.whatsAppIntent(this, f.contactId, Friends.MIME_CALL)
        if (intent == null) {
            speak("${f.name} 在通讯录里没有 WhatsApp 通话，请确认他的号码有存在通讯录")
            return
        }
        main.postDelayed({ startActivity(intent) }, 900)   // 等 TTS 念完「打给…」
    }

    private fun voiceStart(i: Int) {
        val f = friend(i) ?: return
        val chat = Friends.whatsAppIntent(this, f.contactId, Friends.MIME_CHAT) ?: Friends.chatByNumber(this, f.contactId)
        if (chat == null) {
            speak("找不到 ${f.name} 的 WhatsApp")
            return
        }
        startActivity(chat)
        voice = VoiceNote().also { v -> main.postDelayed({ v.press(attempt = 0) }, 1200) }
    }

    /**
     * 按住 WhatsApp 的录音键：用「接着按」的手势一段一段延长（每段 250ms），
     * 放开 FoloToy 的键后，在这一段结束时接最后一段、抬起手指 → WhatsApp 送出。
     * （不在一段的中间插新手势：那样系统会把正在按的手势「取消」，WhatsApp 会当成取消录音）
     * 断线取消：最后一段改成往左滑再放开 = WhatsApp 的「滑动取消」。
     */
    private inner class VoiceNote {
        private var stroke: GestureDescription.StrokeDescription? = null
        private var x = 0f
        private var y = 0f
        private var released = false
        private var sendOnRelease = true
        private var finished = false

        fun press(attempt: Int) {
            if (released) { done(); return }   // 还没按下去就放开了：什么都不做
            val mic = findMic()
            if (mic == null) {
                if (attempt < 6) main.postDelayed({ press(attempt + 1) }, 300) else { speak("找不到 WhatsApp 的录音键"); done() }
                return
            }
            val r = Rect()
            mic.getBoundsInScreen(r)
            x = r.exactCenterX()
            y = r.exactCenterY()
            dispatch(GestureDescription.StrokeDescription(point(x, y), 0, SEGMENT_MS, true))
            speak("开始录音，放开就送出")
        }

        private fun dispatch(s: GestureDescription.StrokeDescription) {
            stroke = s
            val ok = dispatchGesture(GestureDescription.Builder().addStroke(s).build(), object : GestureResultCallback() {
                override fun onCompleted(g: GestureDescription?) = next(s)
                override fun onCancelled(g: GestureDescription?) {
                    if (!finished) speak("录音被打断了")
                    done()
                }
            }, main)
            if (!ok) done()
        }

        /** 一段结束：还按着就延长，放开了就收尾 */
        private fun next(s: GestureDescription.StrokeDescription) {
            if (finished) { done(); return }
            if (!released) {
                dispatch(s.continueStroke(point(x, y), 0, SEGMENT_MS, true))
                return
            }
            finished = true
            val path = if (sendOnRelease) point(x, y) else Path().apply { moveTo(x, y); lineTo(x - 600f, y) }   // 左滑 = 取消
            dispatch(s.continueStroke(path, 0, if (sendOnRelease) 50 else 300, false))
        }

        fun release(send: Boolean) {
            if (released) return
            released = true
            sendOnRelease = send
            if (stroke == null) done()   // 还没开始按：直接结束
        }

        private fun done() {
            if (voice === this) voice = null
        }

        private fun point(px: Float, py: Float) = Path().apply { moveTo(px, py) }
    }

    private fun findMic(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        if (root.packageName?.toString() != "com.whatsapp") return null
        root.findAccessibilityNodeInfosByViewId("com.whatsapp:id/voice_note_btn").firstOrNull()?.let { return it }
        return findNode(root) { n ->
            val d = n.contentDescription?.toString()?.lowercase() ?: ""
            d.contains("voice message") || d.contains("语音") || d.contains("語音") || d.contains("mesej suara")
        }
    }

    // ---------------- 微信读书 ----------------
    private fun openWeRead() {
        val launch = packageManager.getLaunchIntentForPackage(WeReadFinder.PACKAGE)
        if (launch == null) {
            speak("这支手机没有装微信读书")
            return
        }
        val nav = lastNavPackage
        startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        main.postDelayed({ tapPlay(attempt = 0, nav = nav) }, 1800)
    }

    private fun tapPlay(attempt: Int, nav: String?) {
        val root = rootInActiveWindow
        if (root == null || root.packageName?.toString() != WeReadFinder.PACKAGE) {
            if (attempt < 5) main.postDelayed({ tapPlay(attempt + 1, nav) }, 500) else afterPlay(nav, tapped = false)
            return
        }
        saveDump(root, "weread")
        val dm = resources.displayMetrics
        val target = WeReadFinder.findPlay(NodeAdapter(root), dm.widthPixels, dm.heightPixels)
        if (target == null) {
            if (attempt < 3) main.postDelayed({ tapPlay(attempt + 1, nav) }, 700) else afterPlay(nav, tapped = false)
            return
        }
        Log.i(TAG, "微信读书：按 ${target.why} (${target.x}, ${target.y})")
        val path = Path().apply { moveTo(target.x.toFloat(), target.y.toFloat()) }
        dispatchGesture(GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, 60)).build(), null, main)
        afterPlay(nav, tapped = true)
    }

    private fun afterPlay(nav: String?, tapped: Boolean) {
        if (!tapped) {
            // 找不到播放键：送「播放」媒体键（微信读书这次开过听书的话会接着播）
            val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PLAY))
            am.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PLAY))
        }
        // 2 秒后切回导航（刚才最后用的 Waze / Google Maps）
        if (nav != null) {
            main.postDelayed({
                packageManager.getLaunchIntentForPackage(nav)?.let { startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            }, 2000)
        }
    }

    // ---------------- 诊断：存画面结构 ----------------
    fun dumpNow(): File? {
        val root = rootInActiveWindow ?: return null
        return saveDump(root, root.packageName?.toString() ?: "screen")
    }

    private fun saveDump(root: AccessibilityNodeInfo, tag: String): File? = try {
        val dir = File(filesDir, "dumps").apply { mkdirs() }
        val f = File(dir, "$tag-${System.currentTimeMillis()}.txt")
        val dm = resources.displayMetrics
        f.writeText("画面 ${dm.widthPixels}x${dm.heightPixels}  app=${root.packageName}\n" + WeReadFinder.dump(NodeAdapter(root)))
        dir.listFiles()?.sortedByDescending { it.lastModified() }?.drop(20)?.forEach { it.delete() }   // 只留最近 20 份
        f
    } catch (e: Exception) {
        null
    }

    private fun findNode(root: AccessibilityNodeInfo, match: (AccessibilityNodeInfo) -> Boolean): AccessibilityNodeInfo? {
        val stack = ArrayDeque<AccessibilityNodeInfo>()
        stack.add(root)
        while (stack.isNotEmpty()) {
            val n = stack.removeLast()
            if (match(n)) return n
            for (i in 0 until n.childCount) n.getChild(i)?.let { stack.add(it) }
        }
        return null
    }

    /** 把 Android 的画面节点包成 WeReadFinder 用的样子 */
    private class NodeAdapter(private val n: AccessibilityNodeInfo) : WeReadFinder.Node {
        override val text get() = n.text?.toString()
        override val desc get() = n.contentDescription?.toString()
        override val bounds: WeReadFinder.Rect
            get() {
                val r = Rect()
                n.getBoundsInScreen(r)
                return WeReadFinder.Rect(r.left, r.top, r.right, r.bottom)
            }
        override val clickable get() = n.isClickable
        override val children: List<WeReadFinder.Node>
            get() = (0 until n.childCount).mapNotNull { n.getChild(it)?.let { c -> NodeAdapter(c) } }
    }

    companion object {
        private const val TAG = "SpaceCar"
        private const val SEGMENT_MS = 250L
        val NAV_PACKAGES = setOf("com.waze", "com.google.android.apps.maps")

        /** 设定画面读得到（同一个 process） */
        @Volatile var instance: CarService? = null
        @Volatile var status: String = "无障碍服务还没开"
    }
}
