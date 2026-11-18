package app.space.car

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
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
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.io.File

/**
 * SPACE 车控的设定画面：开权限、加常联络的朋友、诊断。
 * 真正做事的是 CarService（无障碍服务），这个画面关掉也照样运作。
 */
class MainActivity : Activity() {
    private val ui = Handler(Looper.getMainLooper())
    private lateinit var status: TextView
    private lateinit var friendsBox: LinearLayout

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

        col.addView(title("第一次设定（照顺序做一次就好）", 18f))
        col.addView(button("① 开权限（附近的装置、通讯录）") { askPermissions() })
        col.addView(button("② 开「SPACE 车控」无障碍服务") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            toast("设定 → 协助工具 → 已安装的应用程式 → SPACE 车控 → 开启")
        })
        col.addView(button("③ 不要让手机把它关掉（电池）") { askBattery() })
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
            ui.postDelayed(this, 1000)
        }
    }

    // ---------------- 权限 ----------------
    private fun askPermissions() {
        val want = mutableListOf(Manifest.permission.READ_CONTACTS)
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
