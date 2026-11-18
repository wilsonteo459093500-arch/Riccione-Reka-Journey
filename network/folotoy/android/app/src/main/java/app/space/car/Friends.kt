package app.space.car

import android.content.ContentUris
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import org.json.JSONArray
import org.json.JSONObject

/**
 * 常联络的朋友（存在手机里，不上网）。打 WhatsApp 用通讯录里 WhatsApp 自己建的资料列：
 *   vnd.com.whatsapp.voip.call  → 直接拨 WhatsApp 语音通话（跟在通讯录里点「WhatsApp 语音通话」一样）
 *   vnd.com.whatsapp.profile    → 打开跟他的对话（录语音讯息用）
 */
object Friends {
    data class Friend(val contactId: Long, val name: String, val label: String)

    private const val PREFS = "space_car"
    private const val KEY = "friends"
    const val MIME_CALL = "vnd.android.cursor.item/vnd.com.whatsapp.voip.call"
    const val MIME_CHAT = "vnd.android.cursor.item/vnd.com.whatsapp.profile"

    fun load(ctx: Context): List<Friend> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]") ?: "[]"
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map {
                val o = arr.getJSONObject(it)
                Friend(o.getLong("id"), o.getString("name"), o.optString("label"))
            }
        } catch (e: Exception) {
            emptyList()
        }
    }

    fun save(ctx: Context, list: List<Friend>) {
        val arr = JSONArray()
        list.forEach { arr.put(JSONObject().put("id", it.contactId).put("name", it.name).put("label", it.label)) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }

    /** 这个人在通讯录里的 WhatsApp 资料列（mime = MIME_CALL / MIME_CHAT）→ 可以直接开的 Intent；没有回 null */
    fun whatsAppIntent(ctx: Context, contactId: Long, mime: String): Intent? {
        val cr = ctx.contentResolver
        cr.query(
            ContactsContract.Data.CONTENT_URI,
            arrayOf(ContactsContract.Data._ID),
            "${ContactsContract.Data.CONTACT_ID} = ? AND ${ContactsContract.Data.MIMETYPE} = ?",
            arrayOf(contactId.toString(), mime),
            null,
        )?.use { c ->
            if (c.moveToFirst()) {
                val uri = ContentUris.withAppendedId(ContactsContract.Data.CONTENT_URI, c.getLong(0))
                return Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).setPackage("com.whatsapp")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        return null
    }

    /** 备用：用电话号码开 wa.me 对话（马来西亚 0 开头的号码补成 60） */
    fun chatByNumber(ctx: Context, contactId: Long): Intent? {
        ctx.contentResolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            arrayOf(ContactsContract.CommonDataKinds.Phone.NUMBER),
            "${ContactsContract.CommonDataKinds.Phone.CONTACT_ID} = ?",
            arrayOf(contactId.toString()),
            null,
        )?.use { c ->
            if (c.moveToFirst()) {
                val digits = normalizeMy(c.getString(0) ?: return null) ?: return null
                return Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$digits")).setPackage("com.whatsapp")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
        return null
    }

    /** "012-345 6789" → "60123456789"；"+65 9123 4567" → "6591234567" */
    fun normalizeMy(number: String): String? {
        val d = number.filter { it.isDigit() }
        if (d.length < 8) return null
        return when {
            number.trim().startsWith("+") -> d
            d.startsWith("0") -> "6$d"
            else -> d
        }
    }
}
