package com.multi.encription.sms.database

import androidx.lifecycle.LiveData
import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface SmsDao {
    
    @Query("SELECT * FROM sms_history ORDER BY timestamp DESC")
    fun getAllSms(): Flow<List<SmsEntity>>
    
    @Query("SELECT * FROM sms_history ORDER BY timestamp DESC")
    fun getAllSmsLiveData(): LiveData<List<SmsEntity>>
    
    @Query("SELECT * FROM sms_history WHERE id = :id")
    suspend fun getSmsById(id: Long): SmsEntity?
    
    @Query("SELECT * FROM sms_history WHERE requestId = :requestId")
    suspend fun getSmsByRequestId(requestId: String): SmsEntity?

    @Query("SELECT * FROM sms_history WHERE globalJobId = :globalJobId LIMIT 1")
    suspend fun getSmsByGlobalJobId(globalJobId: String): SmsEntity?

    @Query("SELECT EXISTS(SELECT 1 FROM sms_history WHERE globalJobId = :globalJobId AND status IN ('SENT', 'DELIVERED'))")
    suspend fun isJobAlreadyProcessed(globalJobId: String): Boolean
    
    @Query("SELECT * FROM sms_history WHERE phoneNumber = :phoneNumber ORDER BY timestamp DESC")
    fun getSmsByPhoneNumber(phoneNumber: String): Flow<List<SmsEntity>>
    
    @Query("SELECT * FROM sms_history WHERE status = :status ORDER BY timestamp DESC")
    fun getSmsByStatus(status: SmsStatus): Flow<List<SmsEntity>>
    
    @Query("SELECT * FROM sms_history WHERE apiKey = :apiKey ORDER BY timestamp DESC")
    fun getSmsByApiKey(apiKey: String): Flow<List<SmsEntity>>
    
    @Query("SELECT * FROM sms_history WHERE timestamp BETWEEN :startTime AND :endTime ORDER BY timestamp DESC")
    fun getSmsByTimeRange(startTime: Long, endTime: Long): Flow<List<SmsEntity>>
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSms(sms: SmsEntity): Long
    
    @Update
    suspend fun updateSms(sms: SmsEntity)
    
    @Delete
    suspend fun deleteSms(sms: SmsEntity)
    
    @Query("DELETE FROM sms_history WHERE id = :id")
    suspend fun deleteSmsById(id: Long)
    
    @Query("DELETE FROM sms_history")
    suspend fun deleteAllSms()
    
    @Query("DELETE FROM sms_history WHERE timestamp < :timestamp")
    suspend fun deleteOldSms(timestamp: Long)
    
    @Query("SELECT COUNT(*) FROM sms_history")
    suspend fun getSmsCount(): Int
    
    @Query("SELECT COUNT(*) FROM sms_history WHERE status = :status")
    suspend fun getSmsCountByStatus(status: SmsStatus): Int
    
    @Query("SELECT COUNT(*) FROM sms_history WHERE timestamp >= :timestamp")
    suspend fun getSmsCountSince(timestamp: Long): Int
}
