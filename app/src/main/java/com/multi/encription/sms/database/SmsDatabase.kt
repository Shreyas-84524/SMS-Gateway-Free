package com.multi.encription.sms.database

import android.content.Context
import androidx.room.*

@Database(
    entities = [SmsEntity::class],
    version = 3,
    exportSchema = false
)
@TypeConverters(Converters::class)
abstract class SmsDatabase : RoomDatabase() {
    
    abstract fun smsDao(): SmsDao
    
    companion object {
        @Volatile
        private var INSTANCE: SmsDatabase? = null
        
        fun getDatabase(context: Context): SmsDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    SmsDatabase::class.java,
                    "sms_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}

class Converters {
    @TypeConverter
    fun fromSmsStatus(status: SmsStatus): String {
        return status.name
    }
    
    @TypeConverter
    fun toSmsStatus(status: String): SmsStatus {
        return try {
            SmsStatus.valueOf(status)
        } catch (e: IllegalArgumentException) {
            SmsStatus.UNKNOWN
        }
    }
}
