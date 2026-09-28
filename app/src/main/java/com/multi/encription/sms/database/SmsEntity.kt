package com.multi.encription.sms.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

@Entity(
    tableName = "sms_history",
    indices = [
        Index(value = ["requestId"]),
        Index(value = ["globalJobId"]),
        Index(value = ["status"]),
        Index(value = ["timestamp"])
    ]
)
data class SmsEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val phoneNumber: String,
    val message: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: SmsStatus = SmsStatus.PENDING,
    val apiKey: String? = null, // For local API requests
    val requestId: String? = null, // For tracking local API requests
    val globalJobId: String? = null, // For mapping cloud SMS queue job IDs
    val errorMessage: String? = null,
    val deliveryTimestamp: Long? = null,
    val subscriptionId: Int? = null,
    val radioErrorCode: Int? = null,
    val diagnosticInfo: String? = null
)

enum class SmsStatus {
    PENDING,
    SENDING,
    SENT,
    DELIVERED,
    FAILED,
    UNKNOWN
}

// Extension functions for easier date handling
fun SmsEntity.getTimestampAsDate(): Date = Date(timestamp)
fun SmsEntity.getDeliveryTimestampAsDate(): Date? = deliveryTimestamp?.let { Date(it) }
