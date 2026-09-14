package com.autocall.gateway

import android.Manifest
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.IBinder
import android.provider.Settings
import android.telecom.TelecomManager
import androidx.core.app.ActivityCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * MVP reference implementation.
 * - Pairing/token persistence should use EncryptedSharedPreferences in production.
 * - CALL_PHONE permission must be granted by the device owner/operator.
 * - Audio injection/capture is intentionally NOT implemented here because Android public APIs
 *   do not guarantee routing arbitrary media into the remote call path.
 */
class GatewayAgentService : Service() {
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private lateinit var telecom: TelecomManager
    private var deviceId: String? = null
    private var token: String? = null
    private var currentQueueId: String? = null
    private val baseUrl = "https://ai-autocall-crm.vercel.app"

    override fun onCreate() {
        super.onCreate()
        telecom = getSystemService(TelecomManager::class.java)
        val prefs = getSharedPreferences("gateway", MODE_PRIVATE)
        deviceId = prefs.getString("device_id", null)
        token = prefs.getString("token", null)

        executor.scheduleWithFixedDelay({ safeTick() }, 0, 8, TimeUnit.SECONDS)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun safeTick() {
        try {
            val id = deviceId ?: return
            val tk = token ?: return
            heartbeat(id, tk)
            if (currentQueueId == null) claimAndDial(id, tk)
        } catch (_: Throwable) {
            // Next heartbeat retries automatically.
        }
    }

    fun pair(pairingCode: String) {
        executor.execute {
            val body = JSONObject()
                .put("pairingCode", pairingCode)
                .put("agentVersion", "0.1.0")
                .put("model", android.os.Build.MODEL)
                .put("androidVersion", android.os.Build.VERSION.RELEASE)
            val result = post("/api/gateway/pair", body)
            if (result.optBoolean("ok")) {
                deviceId = result.getString("device_id")
                token = result.getString("token")
                getSharedPreferences("gateway", MODE_PRIVATE).edit()
                    .putString("device_id", deviceId)
                    .putString("token", token)
                    .apply()
            }
        }
    }

    private fun heartbeat(id: String, tk: String) {
        val body = JSONObject()
            .put("deviceId", id)
            .put("token", tk)
            .put("status", if (currentQueueId == null) "ONLINE" else "CALLING")
            .put("meta", JSONObject()
                .put("androidId", Settings.Secure.getString(contentResolver, Settings.Secure.ANDROID_ID))
                .put("audioInjection", false)
                .put("remoteAudioCapture", false))
        post("/api/gateway/heartbeat", body)
    }

    private fun claimAndDial(id: String, tk: String) {
        val result = post("/api/gateway/next-job", JSONObject().put("deviceId", id).put("token", tk))
        val job = result.optJSONObject("job") ?: return
        val queueId = job.getString("queue_id")
        val phone = job.getString("phone")
        currentQueueId = queueId

        report(id, tk, queueId, "DIALING", JSONObject().put("phoneLast4", phone.takeLast(4)))

        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            report(id, tk, queueId, "FAILED", JSONObject().put("error", "CALL_PHONE_PERMISSION_MISSING"))
            currentQueueId = null
            return
        }

        try {
            telecom.placeCall(Uri.parse("tel:$phone"), android.os.Bundle())
            // Phone/call-state integration reports CONNECTED/COMPLETED in the full agent.
        } catch (t: Throwable) {
            report(id, tk, queueId, "FAILED", JSONObject().put("error", t.message ?: "PLACE_CALL_FAILED"))
            currentQueueId = null
        }
    }

    fun onCallConnected() {
        val id = deviceId ?: return
        val tk = token ?: return
        val q = currentQueueId ?: return
        executor.execute { report(id, tk, q, "CONNECTED", JSONObject()) }
    }

    fun onCallEnded(success: Boolean) {
        val id = deviceId ?: return
        val tk = token ?: return
        val q = currentQueueId ?: return
        executor.execute {
            report(id, tk, q, if (success) "COMPLETED" else "FAILED", JSONObject())
            currentQueueId = null
        }
    }

    fun reportResult(result: String) {
        val allowed = setOf("CONSENTED", "DECLINED", "DNC", "NO_ANSWER", "BUSY")
        val normalized = result.uppercase()
        if (normalized !in allowed) return
        val id = deviceId ?: return
        val tk = token ?: return
        val q = currentQueueId ?: return
        executor.execute {
            report(id, tk, q, normalized, JSONObject())
            currentQueueId = null
        }
    }

    private fun report(id: String, tk: String, queueId: String, event: String, payload: JSONObject) {
        post("/api/gateway/report", JSONObject()
            .put("deviceId", id)
            .put("token", tk)
            .put("queueId", queueId)
            .put("event", event)
            .put("payload", payload))
    }

    private fun post(path: String, json: JSONObject): JSONObject {
        val connection = (URL(baseUrl + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 10_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
        }
        connection.outputStream.use { it.write(json.toString().toByteArray()) }
        val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
        val text = stream.bufferedReader().use { it.readText() }
        if (connection.responseCode !in 200..299) throw IllegalStateException(text)
        return JSONObject(text)
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
