package com.multi.encription.sms.utils

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object PermissionHelper {
    
    const val SMS_PERMISSION_REQUEST_CODE = 1001
    const val CONTACTS_PERMISSION_REQUEST_CODE = 1002
    const val NOTIFICATION_PERMISSION_REQUEST_CODE = 1003
    
    val SMS_PERMISSIONS = arrayOf(
        Manifest.permission.SEND_SMS,
        Manifest.permission.READ_SMS,
        Manifest.permission.RECEIVE_SMS,
        Manifest.permission.READ_PHONE_STATE
    )
    
    val CONTACTS_PERMISSIONS = arrayOf(
        Manifest.permission.READ_CONTACTS
    )
    
    fun hasSmsPermissions(context: Context): Boolean {
        return SMS_PERMISSIONS.all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }
    
    fun hasContactsPermissions(context: Context): Boolean {
        return CONTACTS_PERMISSIONS.all { permission ->
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
        }
    }

    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }
    
    fun requestSmsPermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            SMS_PERMISSIONS,
            SMS_PERMISSION_REQUEST_CODE
        )
    }

    fun requestNotificationPermission(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                NOTIFICATION_PERMISSION_REQUEST_CODE
            )
        }
    }
    
    fun requestContactsPermissions(activity: Activity) {
        ActivityCompat.requestPermissions(
            activity,
            CONTACTS_PERMISSIONS,
            CONTACTS_PERMISSION_REQUEST_CODE
        )
    }
    
    fun shouldShowSmsPermissionRationale(activity: Activity): Boolean {
        return SMS_PERMISSIONS.any { permission ->
            ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
        }
    }
    
    fun shouldShowContactsPermissionRationale(activity: Activity): Boolean {
        return CONTACTS_PERMISSIONS.any { permission ->
            ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
        }
    }

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            pm?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        } else {
            true
        }
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            } catch (e: Exception) {
                // Fallback to battery settings page
                val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                context.startActivity(intent)
            }
        }
    }
    
    fun handlePermissionResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
        onSmsPermissionGranted: () -> Unit = {},
        onSmsPermissionDenied: () -> Unit = {},
        onContactsPermissionGranted: () -> Unit = {},
        onContactsPermissionDenied: () -> Unit = {},
        onNotificationPermissionGranted: () -> Unit = {},
        onNotificationPermissionDenied: () -> Unit = {}
    ) {
        when (requestCode) {
            SMS_PERMISSION_REQUEST_CODE -> {
                if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                    onSmsPermissionGranted()
                } else {
                    onSmsPermissionDenied()
                }
            }
            CONTACTS_PERMISSION_REQUEST_CODE -> {
                if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                    onContactsPermissionGranted()
                } else {
                    onContactsPermissionDenied()
                }
            }
            NOTIFICATION_PERMISSION_REQUEST_CODE -> {
                if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
                    onNotificationPermissionGranted()
                } else {
                    onNotificationPermissionDenied()
                }
            }
        }
    }
}
