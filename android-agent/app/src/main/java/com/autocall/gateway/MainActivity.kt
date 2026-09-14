package com.autocall.gateway

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private lateinit var status: TextView
    private lateinit var server: EditText
    private lateinit var pairing: EditText
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestRuntimePermissions()

        val prefs = getSharedPreferences("gateway", MODE_PRIVATE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 32)
        }
        root.addView(TextView(this).apply { text = "AutoCall Gateway Agent"; textSize = 24f })
        root.addView(TextView(this).apply { text = "실제 SIM 자동발신 테스트용 Agent"; textSize = 14f })

        server = EditText(this).apply {
            hint = "서버 URL"
            setText(prefs.getString("base_url", "https://ai-autocall-crm.vercel.app"))
        }
        pairing = EditText(this).apply { hint = "웹 발신관리의 페어링 코드" }
        status = TextView(this).apply { textSize = 14f; setPadding(0,24,0,24) }

        val pairButton = Button(this).apply {
            text = "페어링"
            setOnClickListener {
                prefs.edit().putString("base_url", server.text.toString().trim().trimEnd('/')).apply()
                startGateway("PAIR", pairing.text.toString().trim().uppercase())
            }
        }
        val startButton = Button(this).apply {
            text = "자동 발신 시작"
            setOnClickListener { startGateway("START", null) }
        }
        val stopButton = Button(this).apply {
            text = "자동 발신 중지"
            setOnClickListener { startGateway("STOP", null) }
        }

        root.addView(server)
        root.addView(pairing)
        root.addView(pairButton)
        root.addView(startButton)
        root.addView(stopButton)
        root.addView(status)
        setContentView(root)
        refreshStatus()
    }

    private fun startGateway(action: String, code: String?) {
        val intent = Intent(this, GatewayService::class.java).apply {
            this.action = action
            if (code != null) putExtra("pairing_code", code)
        }
        startForegroundService(intent)
    }

    private fun refreshStatus() {
        val prefs = getSharedPreferences("gateway", MODE_PRIVATE)
        status.text = buildString {
            appendLine("상태: ${prefs.getString("status", "미페어링")}")
            appendLine("단말 ID: ${prefs.getString("device_id", "-")}")
            appendLine("현재 Queue: ${prefs.getString("current_queue", "-")}")
            appendLine("마지막 오류: ${prefs.getString("last_error", "-")}")
        }
        handler.postDelayed({ refreshStatus() }, 1000)
    }

    private fun requestRuntimePermissions() {
        val perms = mutableListOf(Manifest.permission.CALL_PHONE, Manifest.permission.READ_PHONE_STATE)
        if (Build.VERSION.SDK_INT >= 33) perms += Manifest.permission.POST_NOTIFICATIONS
        val missing = perms.filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (missing.isNotEmpty()) requestPermissions(missing.toTypedArray(), 100)
    }
}
