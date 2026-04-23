package com.yourorg.buildingdrone.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle

class UsbAttachActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_NEW_TASK
                )
                action = intent?.action
                intent?.extras?.let(::putExtras)
            }
        )
        finish()
    }
}
