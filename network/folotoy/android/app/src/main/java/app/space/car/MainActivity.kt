package app.space.car

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.ContactsContract
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File

/**
 * SPACE 车控的设定画面：找 FoloToy、开权限、加常联络的朋友、诊断。
 * 真正做事的是 CarService（无障碍服务），这个画面关掉也照样运作。
 */
class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var friendsBox: LinearLayout
    private lateinit var findStatus: TextView
    private lateinit var findBtn: Button
    private lateinit var findSignal: TextView
    private lateinit var lastSeen: TextView
    private lateinit var mapBtn: Button
    private lateinit var newsStatus: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(40))
        }
        setContentView(ScrollView(this).apply { addView(col) })

        col.addView(title("SPACE 车控", 26f))
        col.addView(text("按 FoloToy：按住「下」开微信读书继续听；按住「确定」选朋友打 WhatsApp。"))
        status = text("").apply { textSize = 17f; setPadding(0, dp(12), 0, dp(12)) }
        col.addView(status)

        // ---- 找 FoloToy ----
        col.addView(title("找 FoloToy", 20f))
        findStatus = text("").apply { textSize = 17f }
        col.addView(findStatus)
        findBtn = button("让 FoloToy 响") {
            val s = CarService.instance
            if (s == null) {
                toast("先做下面的 ②（开无障碍服务）")
                return@button
            }
            val ringing = s.findUi == CarService.FindUi.RINGING || s.findUi == CarService.FindUi.CONNECTING
            s.find(!ringing)
            refreshFind()
        }.apply { textSize = 18f }
        col.addView(findBtn)
        findSignal = text("").apply { textSize = 20f }
        col.addView(findSignal)
        lastSeen = text("")
        col.addView(lastSeen)
        mapBtn = button("在地图上看最后的位置") { openMap() }
        col.addView(mapBtn)
        col.addView(CheckBox(this).apply {
            text = "忘了带提醒：手机离开 FoloToy 约 1 分钟还没连回来，手机震一下"
            textSize = 15f
            isChecked = FindStore.alertEnabled(this@MainActivity)
            setOnCheckedChangeListener { _, on -> FindStore.setAlert(this@MainActivity, on) }
        })

        // ---- DEKU ----
        col.addView(title("S.T.A.R 小助理", 18f))
        val dekuCount = CarService.loadDeku(this).size
        col.addView(text(
            if (dekuCount == 0) "句库还在审（审好的句子才会放进来）。"
            else "句库：审过 $dekuCount 句。FoloToy 菜单选「S.T.A.R 讲笑话」→ 按住确定说「讲个笑话」「稻盛和夫」「郭鹤年」「马斯克」「再来一个」，放开后手机念出来。"
        ))
        if (dekuCount > 0) col.addView(button("在手机上先听一句笑话") {
            val s = CarService.instance
            if (s == null) toast("先做下面的 ②（开无障碍服务）")
            else s.deku.pick(DekuLogic.Kind.JOKE)?.let { s.sayNow(DekuLogic.speech(it)) }
        })

        // ---- 每日晨报 ----
        col.addView(title("每日晨报", 18f))
        col.addView(text("每天早上 7 点后，自动从你的 Gmail 读「每日晨报 DAILY MORNING BRIEF」（只读：不改、不删、不寄），FoloToy 靠近手机就传过去。FoloToy 菜单选「每日晨报」看；按住「确定」手机念那一条。"))
        col.addView(text("要一个 Gmail「应用程序密码」（16 个字母）：Google 帐号先开两步验证，再到下面的网页产生一个，名字填 FoloToy。不是你的 Gmail 密码。"))
        col.addView(button("打开 Google「应用程序密码」网页") {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://myaccount.google.com/apppasswords"))) }
        })
        val newsUser = EditText(this).apply {
            hint = "Gmail 地址"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            setText(NewsStore.user(this@MainActivity))
        }
        col.addView(newsUser)
        val newsPass = EditText(this).apply {
            hint = if (NewsStore.password(this@MainActivity).isEmpty()) "应用程序密码（16 个字母）" else "应用程序密码（已存好；要换才填）"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        col.addView(newsPass)
        col.addView(button("存好，现在更新") {
            val pass = newsPass.text.toString().ifBlank { NewsStore.password(this) }
            if (newsUser.text.isBlank() || pass.isBlank()) {
                toast("Gmail 地址和应用程序密码都要填")
                return@button
            }
            NewsStore.saveAccount(this, newsUser.text.toString(), pass)
            newsPass.setText("")
            newsPass.hint = "应用程序密码（已存好；要换才填）"
            val s = CarService.instance
            if (s == null) toast("先做下面的 ②（开无障碍服务）") else s.newsUpdateNow()
        })
        newsStatus = text("")
        col.addView(newsStatus)

        col.addView(title("第一次设定（照顺序做一次就好）", 18f))
        col.addView(button("① 开权限（附近的装置、通讯录、麦克风）") { askPermissions() })
        col.addView(button("② 开「SPACE 车控」无障碍服务") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            toast("设定 → 协助工具 → 已安装的应用程式 → SPACE 车控 → 开启")
        })
        col.addView(button("③ 不要让手机把它关掉（电池）") { askBattery() })
        col.addView(button("④ 位置、通知（「最后在哪里」「忘了带提醒」用）") { askLocation() })
        col.addView(button("重新连 FoloToy") {
            val s = CarService.instance
            if (s == null) toast("先做 ②") else s.connect()
        })

        col.addView(title("常联络的朋友（按住「确定」时的清单）", 18f))
        col.addView(text("从通讯录选；他的号码要有 WhatsApp。「FoloToy 上显示」填英文（FoloToy 只有英文字型），中文名字手机会念出来。"))
        friendsBox = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        col.addView(friendsBox)
        col.addView(button("＋ 加朋友（从通讯录选）") {
            @Suppress("DEPRECATION")
            startActivityForResult(Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI), PICK)
        })

        col.addView(title("诊断（微信读书按不到时用）", 18f))
        col.addView(text("按下面的按钮后 5 秒内切到微信读书（首页或听书画面），它会把画面结构存起来；再回来按「分享」传给 Claude。只存按钮的位置和上面的字，不存别的。"))
        col.addView(button("5 秒后抓画面结构") {
            toast("5 秒内切到微信读书…")
            ui.postDelayed({
                val f = CarService.instance?.dumpNow()
                toast(if (f != null) "抓好了：回到 SPACE 车控按「分享」" else "没抓到：无障碍服务开了吗？")
            }, 5000)
        })
        col.addView(button("分享最近的画面结构") { shareDump() })

        refreshFriends()
    }

    override fun onResume() {
        super.onResume()
        ui.post(statusTicker)
    }

    override fun onPause() {
        ui.removeCallbacks(statusTicker)
        super.onPause()
    }

    private val statusTicker = object : Runnable {
        override fun run() {
            status.text = if (CarService.instance == null) "状态：无障碍服务还没开（做 ②）" else "状态：${CarService.status}"
            refreshFind()
            refreshNews()
            ui.postDelayed(this, 1000)
        }
    }

    // ---------------- 每日晨报 ----------------
    private fun refreshNews() {
        val s = CarService.instance
        val lines = ArrayList<String>()
        if (s?.newsBusy == true) lines.add("正在读 Gmail…")
        NewsStore.note(this).takeIf { it.isNotEmpty() }?.let { lines.add("最后一次：$it") }
        val mine = NewsStore.crc(this)
        val progress = s?.newsProgress()
        lines.add(when {
            mine == null -> "FoloToy：还没有晨报可以传"
            progress != null -> "FoloToy：正在传 $progress%"
            NewsStore.sentCrc(this) == mine -> "FoloToy：已经有这份 ✓（${FindLogic.ago(System.currentTimeMillis(), NewsStore.sentAt(this))}传好）"
            s?.ready == true -> "FoloToy：等它回话…"
            else -> "FoloToy：还没传（FoloToy 靠近、连上就会传）"
        })
        newsStatus.text = lines.joinToString("\n")
    }

    // ---------------- 找 FoloToy ----------------
    private fun refreshFind() {
        val s = CarService.instance
        val ui = s?.findUi ?: CarService.FindUi.IDLE
        val near = s?.ready == true
        findStatus.text = when (ui) {
            CarService.FindUi.CONNECTING -> "正在连 FoloToy…（最多等 30 秒）"
            CarService.FindUi.RINGING -> "FoloToy 正在响、红白闪 🔔 找到了按它任何一个键就停"
            CarService.FindUi.FOUND -> "找到了 ✓"
            CarService.FindUi.TIMEOUT -> "响了 30 秒没人按，停了。要再响按下面"
            CarService.FindUi.LOST -> "响到一半断线了：FoloToy 可能走远了，靠近一点再按"
            CarService.FindUi.NOT_FOUND -> "30 秒都连不上：FoloToy 不在附近、没开机或没电。看看下面「最后在哪里」"
            CarService.FindUi.NOT_PAIRED -> "这支手机还没配对 FoloToy（FoloToy 进车用模式 → 手机蓝牙设定配对「${Protocol.DEVICE_NAME}」）"
            CarService.FindUi.STOPPED, CarService.FindUi.IDLE ->
                if (s == null) "（要先开无障碍服务）" else if (near) "FoloToy 在附近 ✓" else "FoloToy 现在没连上"
        }
        val busy = ui == CarService.FindUi.RINGING || ui == CarService.FindUi.CONNECTING
        findBtn.text = if (busy) "停" else "让 FoloToy 响"

        val rssi = s?.proximity?.latest()
        findSignal.visibility = if (ui == CarService.FindUi.RINGING && rssi != null) View.VISIBLE else View.GONE
        if (rssi != null && s != null) {
            val trend = FindLogic.trendText(s.proximity.trend())
            findSignal.text = "信号 ${FindLogic.barsText(FindLogic.bars(rssi))}" + if (trend.isNotEmpty()) "  $trend" else ""
        }

        val seen = FindStore.read(this)
        val hasLoc = seen?.lat != null && seen.lng != null
        lastSeen.text = when {
            near -> "最后在哪里：现在就连着（断线时会记下时间和手机位置）"
            seen == null -> "最后在哪里：还没有纪录（断线过一次才有）"
            else -> {
                val at = FindLogic.ago(System.currentTimeMillis(), seen.lostAt)
                "最后在哪里：$at 跟手机断线" + when {
                    hasLoc -> "，那时手机在地图上的位置（误差约 ${seen.accuracyM?.toInt() ?: "?"} 公尺）"
                    else -> "（没记到位置：做 ④ 开位置权限，选「一律允许」）"
                }
            }
        }
        mapBtn.visibility = if (!near && hasLoc) View.VISIBLE else View.GONE
    }

    private fun openMap() {
        val seen = FindStore.read(this) ?: return
        val lat = seen.lat ?: return
        val lng = seen.lng ?: return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(FindLogic.mapUri(lat, lng))))
        } catch (e: Exception) {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(FindLogic.mapWebUrl(lat, lng))))
        }
    }

    /** 先要「使用应用程式时」的位置 + 通知；给了之后再按一次，要「一律允许」（断线常常是在背景） */
    private fun askLocation() {
        val fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine) {
            val want = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (Build.VERSION.SDK_INT >= 33) want += Manifest.permission.POST_NOTIFICATIONS
            requestPermissions(want.toTypedArray(), PERMS)
            toast("给了之后再按一次 ④，选「一律允许」")
            return
        }
        if (Build.VERSION.SDK_INT >= 29 &&
            checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), PERMS)
            toast("位置权限选「一律允许」：FoloToy 断线时手机多半在口袋里")
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), PERMS)
            return
        }
        toast("④ 都开好了 ✓")
    }

    // ---------------- 权限 ----------------
    private fun askPermissions() {
        val want = mutableListOf(Manifest.permission.READ_CONTACTS, Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) want += Manifest.permission.BLUETOOTH_CONNECT
        requestPermissions(want.toTypedArray(), PERMS)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        CarService.instance?.connect()
    }

    @SuppressLint("BatteryLife")
    private fun askBattery() {
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        toast("Samsung 还要：设定 → 电池 → 背景使用限制 → 永不休眠的应用程式 → 加入 SPACE 车控")
    }

    // ---------------- 朋友 ----------------
    @Deprecated("用 startActivityForResult，app 小、不想多拉 AndroidX")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        contentResolver.query(uri, arrayOf(ContactsContract.Contacts._ID, ContactsContract.Contacts.DISPLAY_NAME), null, null, null)?.use { c ->
            if (!c.moveToFirst()) return
            val id = c.getLong(0)
            val name = c.getString(1) ?: "朋友"
            askLabel(name) { label ->
                Friends.save(this, Friends.load(this) + Friends.Friend(id, name, label))
                refreshFriends()
                if (Friends.whatsAppIntent(this, id, Friends.MIME_CALL) == null) {
                    toast("注意：$name 在通讯录里找不到 WhatsApp 通话（号码没有 WhatsApp？或还没给通讯录权限）")
                }
            }
        }
    }

    private fun askLabel(name: String, done: (String) -> Unit) {
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_TEXT
            hint = "例：Ah Meng（可以空白）"
            setText(Protocol.toAscii(name).replace("?", "").trim())
        }
        AlertDialog.Builder(this)
            .setTitle("$name：FoloToy 上显示什么（英文）")
            .setView(input)
            .setPositiveButton("好") { _, _ -> done(input.text.toString().trim()) }
            .setNegativeButton("取消", null)
            .show()
    }

    private fun refreshFriends() {
        friendsBox.removeAllViews()
        val list = Friends.load(this)
        if (list.isEmpty()) friendsBox.addView(text("（还没有）"))
        list.forEachIndexed { i, f ->
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(text("${i + 1}. ${f.name}" + if (f.label.isNotEmpty()) "（${f.label}）" else "").apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            if (i > 0) row.addView(small("↑") {
                val m = list.toMutableList()
                m.add(i - 1, m.removeAt(i))
                Friends.save(this, m)
                refreshFriends()
            })
            row.addView(small("删") {
                Friends.save(this, list.filterIndexed { j, _ -> j != i })
                refreshFriends()
            })
            friendsBox.addView(row)
        }
    }

    // ---------------- 诊断 ----------------
    private fun shareDump() {
        val f = File(filesDir, "dumps").listFiles()?.maxByOrNull { it.lastModified() }
        if (f == null) {
            toast("还没有：先按「5 秒后抓画面结构」")
            return
        }
        val send = Intent(Intent.ACTION_SEND).setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, "SPACE 车控画面结构 ${f.name}")
            .putExtra(Intent.EXTRA_TEXT, f.readText().take(90_000))
        startActivity(Intent.createChooser(send, "分享画面结构"))
    }

    // ---------------- 小工具 ----------------
    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()
    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
    private fun title(s: String, size: Float) = TextView(this).apply {
        text = s
        textSize = size
        setPadding(0, dp(18), 0, dp(6))
        setTypeface(typeface, android.graphics.Typeface.BOLD)
    }
    private fun text(s: String) = TextView(this).apply { text = s; textSize = 15f; setPadding(0, dp(2), 0, dp(6)) }
    private fun button(s: String, onClick: () -> Unit) = Button(this).apply {
        text = s
        isAllCaps = false
        setOnClickListener { onClick() }
    }
    private fun small(s: String, onClick: () -> Unit) = Button(this).apply {
        text = s
        minWidth = 0
        minimumWidth = dp(48)
        setOnClickListener { onClick() }
        visibility = View.VISIBLE
    }

    companion object {
        private const val PICK = 1
        private const val PERMS = 2
    }
}
