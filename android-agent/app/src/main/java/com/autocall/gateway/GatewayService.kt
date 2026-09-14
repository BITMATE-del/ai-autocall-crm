package com.autocall.gateway

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.telecom.TelecomManager
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class GatewayService : Service() {
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private lateinit var telecom: TelecomManager
    private lateinit var telephony: TelephonyManager
    private var callState = TelephonyManager.CALL_STATE_IDLE
    private var connectedReported = false

    override fun onCreate() {
        super.onCreate()
        telecom = getSystemService(TelecomManager::class.java)
        telephony = getSystemService(TelephonyManager::class.java)
        startForeground(77, notification("Gateway 대기중"))
        registerCallState()
        executor.scheduleWithFixedDelay({ safeTick() }, 1, 5, TimeUnit.SECONDS)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "PAIR" -> executor.execute { pair(intent.getStringExtra("pairing_code") ?: "") }
            "START" -> prefs().edit().putBoolean("enabled", true).putString("status", "자동발신 실행중").apply()
            "STOP" -> prefs().edit().putBoolean("enabled", false).putString("status", "중지됨").apply()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun registerCallState() {
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) return
        telephony.registerTelephonyCallback(mainExecutor, object : TelephonyCallback(), TelephonyCallback.CallStateListener {
            override fun onCallStateChanged(state: Int) {
                val previous = callState
                callState = state
                if (state == TelephonyManager.CALL_STATE_OFFHOOK && !connectedReported) {
                    connectedReported = true
                    executor.execute { reportCurrent("CONNECTED") }
                }
                if (state == TelephonyManager.CALL_STATE_IDLE && previous != TelephonyManager.CALL_STATE_IDLE) {
                    executor.execute {
                        reportCurrent("COMPLETED")
                        clearCurrent()
                    }
                }
            }
        })
    }

    private fun safeTick() {
        try {
            val p = prefs()
            val id = p.getString("device_id", null) ?: return
            val token = p.getString("token", null) ?: return
            heartbeat(id, token)
            if (!p.getBoolean("enabled", false)) return
            if (p.getString("current_queue", null) == null && callState == TelephonyManager.CALL_STATE_IDLE) {
                claimAndDial(id, token)
            }
        } catch (t: Throwable) {
            prefs().edit().putString("last_error", t.message ?: t.javaClass.simpleName).apply()
        }
    }

    private fun pair(code: String) {
        if (code.isBlank()) return
        try {
            val body = JSONObject()
                .put("pairingCode", code)
                .put("agentVersion", "0.1.0")
                .put("model", Build.MODEL)
                .put("androidVersion", Build.VERSION.RELEASE)
            val result = post("/api/gateway/pair", body)
            if (!result.optBoolean("ok")) error("PAIR_FAILED")
            prefs().edit()
                .putString("device_id", result.getString("device_id"))
                .putString("token", result.getString("token"))
                .putString("status", "페어링 완료")
                .putString("last_error", "-")
                .apply()
        } catch (t: Throwable) {
            prefs().edit().putString("status", "페어링 실패").putString("last_error", t.message).apply()
        }
    }

    private fun heartbeat(id: String, token: String) {
        val battery = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        val level = battery?.getIntExtra(BatteryManager.EXTRA_LEVEL, -1) ?: -1
        val scale = battery?.getIntExtra(BatteryManager.EXTRA_SCALE, 100) ?: 100
        val pct = if (level >= 0) (level * 100 / scale.coerceAtLeast(1)) else JSONObject.NULL
        val charging = when (battery?.getIntExtra(BatteryManager.EXTRA_STATUS, -1)) {
            BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
            else -> false
        }
        val current = prefs().getString("current_queue", null)
        post("/api/gateway/heartbeat", JSONObject()
            .put("deviceId", id)
            .put("token", token)
            .put("status", if (current == null) "ONLINE" else "BUSY")
            .put("batteryPct", pct)
            .put("charging", charging)
            .put("meta", JSONObject()
                .put("model", Build.MODEL)
                .put("androidVersion", Build.VERSION.RELEASE)
                .put("audioInjection", false)
                .put("remoteAudioCapture", false)))
    }

    private fun claimAndDial(id: String, token: String) {
        val result = post("/api/gateway/next-job", JSONObject().put("deviceId", id).put("token", token))
        val job = result.optJSONObject("job") ?: return
        val queueId = job.getString("queue_id")
        val phone = job.getString("phone")
        prefs().edit().putString("current_queue", queueId).putString("status", "발신 요청 $phone").apply()
        connectedReported = false
        report(id, token, queueId, "DIALING", JSONObject().put("phoneLast4", phone.takeLast(4)))

        if (checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            report(id, token, queueId, "FAILED", JSONObject().put("error", "CALL_PHONE_PERMISSION_MISSING"))
            clearCurrent(); return
        }

        try {
            telecom.placeCall(Uri.parse("tel:$phone"), Bundle())
            updateNotification("발신중 · ****${phone.takeLast(4)}")
        } catch (t: Throwable) {
            report(id, token, queueId, "FAILED", JSONObject().put("error", t.message ?: "PLACE_CALL_FAILED"))
            clearCurrent()
        }
    }

    private fun reportCurrent(event: String) {
        val p = prefs()
        val id = p.getString("device_id", null) ?: return
        val token = p.getString("token", null) ?: return
        val queueId = p.getString("current_queue", null) ?: return
        report(id, token, queueId, event, JSONObject())
    }

    private fun report(id: String, token: String, queueId: String, event: String, payload: JSONObject) {
        post("/api/gateway/report", JSONObject()
            .put("deviceId", id)
            .put("token", token)
            .put("queueId", queueId)
            .put("event", event)
            .put("payload", payload))
    }

    private fun clearCurrent() {
        connectedReported = false
        prefs().edit().remove("current_queue").putString("status", "자동발신 실행중").apply()
        updateNotification("Gateway 대기중")
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val base = prefs().getString("base_url", "https://ai-autocall-crm.vercel.app")!!.trimEnd('/')
        val c = URL(base + path).openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 10000
        c.readTimeout = 10000
        c.doOutput = true
        c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = c.responseCode
        val stream = if (code in 200..299) c.inputStream else c.errorStream
        val text = stream?.bufferedReader()?.use { it.readText() } ?: "{}"
        if (code !in 200..299) error("HTTP $code $text")
        return JSONObject(text)
    }

    private fun prefs() = getSharedPreferences("gateway", MODE_PRIVATE)

    private fun notification(text: String): Notification {
        val channelId = "gateway"
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(channelId, "AutoCall Gateway", NotificationManager.IMPORTANCE_LOW))
        val pi = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, channelId)
            .setContentTitle("AutoCall Gateway")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.sym_action_call)
            .setContentIntent(pi)
            .setOngoing(true)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java).notify(77, notification(text))
    }
}
