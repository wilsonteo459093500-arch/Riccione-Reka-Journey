package app.space.car

import android.Manifest
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import app.space.car.CarLogic.Effect
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.Executors

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
 *
 * 找 FoloToy（FoloToy 每个模式都开蓝牙；名片 / 口袋机约每秒广播一次）：
 *  - find(true)：连着就叫它响；没连着先快速连（最多 30 秒），连上马上叫它响；响的时候每秒读一次信号强弱
 *  - 断线时记下时间和手机位置（「最后在哪里」）；断线 45 秒还没连回来 → 通知「FoloToy 没跟着你？」
 *
 * DEKU 小助理（FoloToy 口袋机菜单）：FoloToy 按住确定 → 这里用手机的语音转文字听（Android 内建，免费）→
 *   关键词挑一句（DekuLogic，不用 AI）→ 手机念出来 + 叫 FoloToy 显示同一句。FoloToy 上按键挑的句子也在这里念。
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

    // ---- 找 FoloToy ----
    enum class FindUi { IDLE, CONNECTING, RINGING, FOUND, TIMEOUT, STOPPED, NOT_FOUND, NOT_PAIRED, LOST }

    /** 通道准备好了（订阅完成）：可以送指令 */
    @Volatile var ready = false
        private set
    @Volatile var findUi = FindUi.IDLE
        private set
    private var direct = false        // 这条连线是按「找」时开的快速连线（不是背景自动连）
    private var findUntil = 0L        // 等连上就叫它响，等到这个时间为止
    private var lastRssiAsk = 0L
    val proximity = FindLogic.Proximity()

    // ---- DEKU ----
    lateinit var deku: DekuLogic
        private set
    private var recognizer: SpeechRecognizer? = null
    private var listening = false
    private val leftBehind = FindLogic.LeftBehind()

    // ---- 每日晨报 ----
    private val bg = Executors.newSingleThreadExecutor()   // 连 Gmail（不能在主执行绪）
    @Volatile var newsBusy = false
        private set
    private var mtu = 23
    private var mtuPending = false
    private var lastNewsTick = 0L
    private val newsSync = DocSync(
        "晨报", Protocol.NEWS_DATA, Protocol.NEWS_ASK,
        data = { NewsStore.encoded(this) }, crc = { NewsStore.crc(this) },
        sentCrc = { NewsStore.sentCrc(this) }, setSent = { NewsStore.setSent(this, it, System.currentTimeMillis()) },
        fail = { NewsStore.setNote(this, NewsStore.note(this) + "（传给 FoloToy 失败：$it）") },
    )
    // ---- 书摘（开机封面轮播）----
    val quotesSync = DocSync(
        "书摘", Protocol.QUOTES_DATA, Protocol.QUOTES_ASK,
        data = { QuotesStore.encoded(this) }, crc = { QuotesStore.crc(this) },
        sentCrc = { QuotesStore.sentCrc(this) }, setSent = { QuotesStore.setSent(this, it) },
        fail = { quotesError = "传给 FoloToy 失败：$it" },
    )
    @Volatile var quotesError = ""

    // ---------------- 生命周期 ----------------
    override fun onServiceConnected() {
        instance = this
        logic = CarLogic(
            contacts = { Friends.load(this).map { CarLogic.Friend(it.name, it.label) } },
        )
        tts = TextToSpeech(this) { ok -> if (ok == TextToSpeech.SUCCESS) tts?.language = Locale.SIMPLIFIED_CHINESE }
        deku = DekuLogic(loadDeku(this))
        connect()
        main.post(ticker)
        status = "等 FoloToy 连线"
    }

    override fun onDestroy() {
        instance = null
        main.removeCallbacksAndMessages(null)
        gatt?.close()
        tts?.shutdown()
        recognizer?.destroy()
        bg.shutdownNow()
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
            val now = SystemClock.elapsedRealtime()
            if (::logic.isInitialized) run(logic.onTick(now))
            findTick(now)
            if (now - lastNewsTick >= 60_000 || lastNewsTick == 0L) {
                lastNewsTick = now
                newsTick(System.currentTimeMillis())
            }
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
        val dev = bondedFoloToy()
        if (dev == null) {
            status = "手机还没配对 FoloToy：FoloToy 进车用模式 → 手机蓝牙设定配对「${Protocol.DEVICE_NAME}」"
            main.postDelayed({ connect() }, 15_000)
            return
        }
        gatt?.close()
        direct = false
        gatt = dev.connectGatt(this, true, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    @SuppressLint("MissingPermission")
    private fun bondedFoloToy(): BluetoothDevice? {
        val adapter = (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter ?: return null
        return adapter.bondedDevices?.firstOrNull { it.name == Protocol.DEVICE_NAME }
    }

    private fun bluetoothOn(): Boolean =
        (getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter?.isEnabled == true

    /** 按「找」时还没连上：开一条快速连线（手机积极扫描，FoloToy 每秒广播一次，通常几秒就连上） */
    @SuppressLint("MissingPermission")
    private fun fastConnect() {
        if (!hasBtPermission()) {
            findUi = FindUi.NOT_PAIRED
            return
        }
        val dev = bondedFoloToy()
        if (dev == null) {
            findUi = FindUi.NOT_PAIRED
            return
        }
        gatt?.close()
        direct = true
        gatt = dev.connectGatt(this, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(g: BluetoothGatt, st: Int, newState: Int) {
            if (g !== gatt) return   // 已经换掉的旧连线
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                main.post { status = "连上 FoloToy，准备中…" }
                g.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                main.post {
                    status = "FoloToy 没连上（不在附近、没开机？靠近了会自动连）"
                    cmdChar = null
                    writeQueue.clear()
                    writing = false
                    newsSync.reset()
                    quotesSync.reset()
                    mtuPending = false
                    mtu = 23
                    if (ready) onLost()
                    ready = false
                    if (findUi == FindUi.RINGING) findUi = FindUi.LOST
                    if (direct) connect()   // 快速连线没连上 / 断了：改回背景自动连
                    run(logic.onDisconnected())
                }
            }
        }

        @SuppressLint("MissingPermission")
        override fun onServicesDiscovered(g: BluetoothGatt, st: Int) {
            if (g !== gatt) return
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

        @SuppressLint("MissingPermission")
        override fun onDescriptorWrite(g: BluetoothGatt, d: BluetoothGattDescriptor, st: Int) {
            main.post {
                status = "FoloToy 已连线 ✓"
                ready = true
                newsSync.retries = 0
                quotesSync.retries = 0
                // 先把一次能送的量调大（传晨报用）；调好之前指令先排着
                writing = g.requestMtu(247)
                mtuPending = writing
                if (!writing) askDocs()
                else main.postDelayed({   // 有的手机不回：3 秒后照常（一次送少一点而已）
                    if (mtuPending) {
                        mtuPending = false
                        writing = false
                        pump()
                        askDocs()
                    }
                }, 3000)
                onFound()
                send(Protocol.modeCommand(false))
                if (findUi == FindUi.CONNECTING) {   // 按了「找」才连上：马上叫它响
                    findUi = FindUi.RINGING
                    send(Protocol.findCommand(true))
                }
            }
        }

        override fun onMtuChanged(g: BluetoothGatt, value: Int, st: Int) {
            main.post {
                if (st == BluetoothGatt.GATT_SUCCESS) mtu = value
                if (!mtuPending) return@post
                mtuPending = false
                writing = false
                pump()
                askDocs()
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

        override fun onReadRemoteRssi(g: BluetoothGatt, rssi: Int, st: Int) {
            if (st == BluetoothGatt.GATT_SUCCESS) main.post { proximity.add(rssi) }
        }
    }

    // ---------------- DEKU ----------------
    /** FoloToy 按住确定：开始听 */
    private fun dekuListen() {
        if (deku.size == 0) {
            speak(DekuLogic.EMPTY)
            send(Protocol.dekuUnknown())
            return
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            speak("要先在 SPACE 车控 app 按「开权限」，允许麦克风")
            send(Protocol.dekuUnknown())
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            speak("这支手机没有语音转文字。可以按 FoloToy 的上键听笑话、下键听名人的话")
            send(Protocol.dekuUnknown())
            return
        }
        tts?.stop()   // 别让手机自己的声音被听进去
        val r = recognizer ?: SpeechRecognizer.createSpeechRecognizer(this).also {
            it.setRecognitionListener(dekuListener)
            recognizer = it
        }
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
            .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
        listening = true
        r.startListening(intent)
    }

    /** FoloToy 放开：说完了，等结果 */
    private fun dekuDone() {
        if (listening) recognizer?.stopListening()
    }

    private val dekuListener = object : RecognitionListener {
        override fun onResults(results: Bundle?) {
            listening = false
            val heard = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION).orEmpty()
            Log.i(TAG, "S.T.A.R 听到：$heard")
            val line = deku.answer(heard)
            if (line == null) {
                send(Protocol.dekuUnknown())
                speak(DekuLogic.HELP)
            } else {
                send(Protocol.dekuShow(line.id))
                speak(DekuLogic.speech(line))
            }
        }

        override fun onError(error: Int) {
            if (!listening) return
            listening = false
            Log.i(TAG, "S.T.A.R 没听到：error $error")
            send(Protocol.dekuUnknown())
            speak(DekuLogic.HELP)
        }

        override fun onReadyForSpeech(params: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onPartialResults(partialResults: Bundle?) {}
        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    // ---------------- 找 FoloToy ----------------
    /** 设定画面按「让 FoloToy 响」/「停」 */
    fun find(ring: Boolean) {
        if (!ring) {
            findUntil = 0
            if (ready) send(Protocol.findCommand(false))
            findUi = FindUi.STOPPED
            return
        }
        proximity.reset()
        if (ready) {
            findUi = FindUi.RINGING
            send(Protocol.findCommand(true))
        } else {
            findUi = FindUi.CONNECTING
            findUntil = SystemClock.elapsedRealtime() + FIND_CONNECT_MS
            fastConnect()
        }
    }

    @SuppressLint("MissingPermission")
    private fun findTick(now: Long) {
        if (findUi == FindUi.CONNECTING && now > findUntil) {
            findUi = FindUi.NOT_FOUND
            if (direct) connect()   // 快速连线放弃，改回背景自动连
        }
        if (ready && findUi == FindUi.RINGING && now - lastRssiAsk >= 1000) {
            lastRssiAsk = now
            gatt?.readRemoteRssi()
        }
        if (leftBehind.due(now, FindStore.alertEnabled(this), bluetoothOn())) notifyLeftBehind()
    }

    /** 本来连着，断了：记时间、位置；开始算「忘了带」 */
    private fun onLost() {
        FindStore.lostNow(this)
        recordLocation()
        leftBehind.onLost(SystemClock.elapsedRealtime())
    }

    /** 连上了：不用提醒了，收掉之前的通知 */
    private fun onFound() {
        leftBehind.onConnected()
        getSystemService(NotificationManager::class.java)?.cancel(NOTIFY_LEFT_BEHIND)
    }

    private fun hasLocationPermission() =
        checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    /** 断线时手机在哪里：先存手机已经知道的位置（马上有），再要一次新的（GPS 可能要几十秒） */
    @SuppressLint("MissingPermission")
    private fun recordLocation() {
        if (!hasLocationPermission()) return
        val lm = getSystemService(LocationManager::class.java) ?: return
        try {
            lm.getProviders(true)
                .mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
                .maxByOrNull { it.time }
                ?.let { FindStore.saveLocation(this, it) }
            val provider = when {
                Build.VERSION.SDK_INT >= 31 && lm.hasProvider(LocationManager.FUSED_PROVIDER) -> LocationManager.FUSED_PROVIDER
                lm.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
                lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
                else -> return
            }
            if (Build.VERSION.SDK_INT >= 30) {
                lm.getCurrentLocation(provider, null, mainExecutor) { loc: Location? -> loc?.let { FindStore.saveLocation(this, it) } }
            } else {
                @Suppress("DEPRECATION")
                lm.requestSingleUpdate(provider, LocationListener { loc -> FindStore.saveLocation(this, loc) }, Looper.getMainLooper())
            }
        } catch (e: Exception) {
            Log.w(TAG, "拿不到位置：$e")   // 位置关了 / 没给「一律允许」：只记时间
        }
    }

    private fun notifyLeftBehind() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        val nm = getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_LEFT_BEHIND, "忘了带 FoloToy", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "手机离开 FoloToy（蓝牙断线）一阵子还没连回来时提醒"
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 400, 200, 400, 200, 400)
            },
        )
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val at = FindStore.read(this)?.lostAt?.let { FindLogic.ago(System.currentTimeMillis(), it) } ?: "刚才"
        val n = Notification.Builder(this, CHANNEL_LEFT_BEHIND)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle("FoloToy 没跟着你？")
            .setContentText("$at 跟手机断线了。点开看最后在哪里，或让它响。")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        nm.notify(NOTIFY_LEFT_BEHIND, n)
    }

    private fun onKeyBytes(data: ByteArray?) {
        Protocol.decodeNewsStatus(data)?.let { st ->
            main.post { newsSync.onStatus(st) }
            return
        }
        Protocol.decodeQuotesStatus(data)?.let { st ->
            main.post { quotesSync.onStatus(st) }
            return
        }
        Protocol.decodeNewsSay(data)?.let { say ->
            main.post { onNewsSay(say) }
            return
        }
        Protocol.decodeFindState(data)?.let { fs ->
            main.post {
                findUi = when (fs) {
                    Protocol.FindState.RINGING -> FindUi.RINGING
                    Protocol.FindState.FOUND -> FindUi.FOUND
                    Protocol.FindState.TIMEOUT -> FindUi.TIMEOUT
                    Protocol.FindState.STOPPED -> FindUi.STOPPED
                }
            }
            return
        }
        Protocol.decodeDeku(data)?.let { d ->
            main.post {
                when (d) {
                    is Protocol.Deku.Listen -> if (d.on) dekuListen() else dekuDone()
                    is Protocol.Deku.Say -> deku.byId(d.id)?.let { speak(DekuLogic.speech(it)) }
                }
            }
            return
        }
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
        if (cmd.isNotEmpty() && cmd[0] == Protocol.NEWS_DATA) newsSync.sent++
        if (cmd.isNotEmpty() && cmd[0] == Protocol.QUOTES_DATA) quotesSync.sent++
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

    // ---------------- 每日晨报 ----------------
    /** 设定画面「现在更新」 */
    fun newsUpdateNow() = fetchNews()

    /** 正在传给 FoloToy：0–100；没在传回 null */
    fun newsProgress(): Int? = newsSync.progress()

    /** 书单改了（设定画面加书 / 删书）：问 FoloToy，不一样就传 */
    fun quotesChanged() {
        quotesError = ""
        quotesSync.retries = 0
        quotesSync.ask()
    }

    private fun askDocs() {
        newsSync.ask()
        quotesSync.ask()
    }

    private fun newsTick(now: Long) {
        if (NewsLogic.shouldFetch(now, NewsStore.configured(this), NewsStore.haveDate(this), NewsStore.lastAttempt(this))) fetchNews()
    }

    private fun fetchNews() {
        if (newsBusy) return
        if (!NewsStore.configured(this)) {
            NewsStore.setNote(this, "还没填 Gmail 帐号和应用程序密码")
            return
        }
        newsBusy = true
        NewsStore.setAttempt(this, System.currentTimeMillis())
        val user = NewsStore.user(this)
        val pass = NewsStore.password(this)
        val chars = NewsStore.chars(this)
        bg.execute {
            var data: ByteArray? = null
            val note = try {
                val raw = Gmail.fetchLatestBrief(user, pass)
                val brief = raw?.let { Mime.html(it) }?.let { BriefParser.parse(it) }
                when {
                    raw == null -> "Gmail 收件匣最近 3 天没有「每日晨报 DAILY MORNING BRIEF」"
                    brief == null -> "晨报的格式看不懂（可能是旧格式），没更新"
                    else -> {
                        data = BriefCodec.encode(brief, chars)
                        "已拿到 ${brief.date} 的晨报 · 共 ${brief.itemCount} 条"
                    }
                }
            } catch (e: ImapSession.ImapException) {
                e.message ?: "Gmail 出错"
            } catch (e: Exception) {
                "连不上 Gmail（${e.javaClass.simpleName}）：手机有网路吗？"
            }
            main.post {
                newsBusy = false
                val hhmm = java.text.SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = NewsLogic.ZONE }.format(java.util.Date())
                NewsStore.setNote(this, "$hhmm $note")
                data?.let { d ->
                    if (BriefCodec.crc32(d) != NewsStore.crc(this)) NewsStore.save(this, d)
                    newsSync.retries = 0
                    newsSync.ask()
                }
            }
        }
    }

    /**
     * 一份要跟 FoloToy 同步的资料（晨报 / 书摘）：问 FoloToy 有哪一份（crc）→ 不一样就整份传 →
     * FoloToy 回「有这份」才算好；收坏了等 3 秒重来，最多 2 次。两份可以同时传（封包排同一条队，FoloToy 分开收）。
     */
    inner class DocSync(
        private val name: String,
        private val dataCmd: Byte,
        private val askCmd: Byte,
        private val data: () -> ByteArray?,
        private val crc: () -> Long?,
        private val sentCrc: () -> Long?,
        private val setSent: (Long) -> Unit,
        private val fail: (String) -> Unit,
    ) {
        var sending = false
            private set
        var total = 0
            private set
        var sent = 0
        var retries = 0

        fun reset() {
            sending = false
        }

        fun progress(): Int? = if (sending && total > 0) minOf(100, sent * 100 / total) else null

        fun ask() {
            if (ready && !sending && crc() != null) send(byteArrayOf(askCmd))
        }

        @SuppressLint("MissingPermission")
        fun onStatus(st: Protocol.NewsStatus) {
            val mine = crc()
            when {
                st.status == Protocol.NEWS_OK && mine != null && st.crc == mine -> {
                    val was = sending
                    sending = false
                    retries = 0
                    if (was) balanced()
                    if (sentCrc() != mine) setSent(mine)
                }
                !sending && NewsLogic.needSend(st.status, st.crc, mine) -> start()
                st.status == Protocol.NEWS_BAD || st.status == Protocol.NEWS_FLASH || st.status == Protocol.NEWS_TOO_BIG -> {
                    sending = false
                    writeQueue.removeAll { it.isNotEmpty() && it[0] == dataCmd }   // 剩下的段不用送了
                    balanced()
                    if (st.status != Protocol.NEWS_TOO_BIG && retries < 2) {
                        retries++
                        main.postDelayed({ ask() }, 3000)
                    } else {
                        fail(if (st.status == Protocol.NEWS_TOO_BIG) "太大" else "收坏了")
                    }
                }
            }
        }

        @SuppressLint("MissingPermission")
        private fun start() {
            val d = data() ?: return
            val c = crc() ?: return
            val packets = Protocol.newsPackets(d, c, (mtu - 3 - 6).coerceIn(14, 238), dataCmd)
            sending = true
            total = packets.size
            sent = 0
            Log.i("SpaceCar", "传$name 给 FoloToy：${d.size} 字节、${packets.size} 个封包")
            gatt?.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_HIGH)
            packets.forEach { send(it) }
        }

        @SuppressLint("MissingPermission")
        private fun balanced() {
            if (!newsSync.sending && !quotesSync.sending) gatt?.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_BALANCED)
        }
    }

    /** FoloToy 按住确定：念那一条（用同一份晨报，crc 对得上才念） */
    private fun onNewsSay(say: Protocol.NewsSay) {
        val data = NewsStore.encoded(this)
        if (data == null || BriefCodec.crc32(data) != say.crc) {
            speak("手机上的晨报跟 FoloToy 的不一样，等一下会自动同步")
            newsSync.ask()
            return
        }
        BriefCodec.items(data).getOrNull(say.index)?.let { speak(BriefCodec.speech(it)) }
    }

    /** 设定画面「先听一句」 */
    fun sayNow(text: String) = speak(text)

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
        /** assets/deku.json（tools/make_deku.py 产生，只有审过的句子）；读不到就是空的 */
        fun loadDeku(c: Context): List<DekuLogic.Line> = try {
            val arr = JSONObject(c.assets.open("deku.json").bufferedReader().use { it.readText() }).getJSONArray("lines")
            (0 until arr.length()).mapNotNull { i ->
                val o = arr.getJSONObject(i)
                val kind = DekuLogic.Kind.of(o.getString("kind")) ?: return@mapNotNull null
                DekuLogic.Line(o.getString("id"), kind, o.getString("zh"), o.optString("en").ifEmpty { null })
            }
        } catch (e: Exception) {
            emptyList()
        }

        private const val TAG = "SpaceCar"
        private const val SEGMENT_MS = 250L
        private const val FIND_CONNECT_MS = 30_000L
        private const val CHANNEL_LEFT_BEHIND = "left_behind"
        private const val NOTIFY_LEFT_BEHIND = 81
        val NAV_PACKAGES = setOf("com.waze", "com.google.android.apps.maps")

        /** 设定画面读得到（同一个 process） */
        @Volatile var instance: CarService? = null
        @Volatile var status: String = "无障碍服务还没开"
    }
}
