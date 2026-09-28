package com.multi.encription.sms.ui

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.multi.encription.sms.R
import com.multi.encription.sms.database.SmsEntity
import com.multi.encription.sms.database.SmsStatus
import java.text.SimpleDateFormat
import java.util.*

class SmsHistoryAdapter(
    private val onItemClick: (SmsEntity) -> Unit
) : ListAdapter<SmsEntity, SmsHistoryAdapter.SmsViewHolder>(SmsDiffCallback()) {
    
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SmsViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sms_history, parent, false)
        return SmsViewHolder(view, onItemClick)
    }
    
    override fun onBindViewHolder(holder: SmsViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
    
    class SmsViewHolder(
        itemView: View,
        private val onItemClick: (SmsEntity) -> Unit
    ) : RecyclerView.ViewHolder(itemView) {
        
        private val phoneNumberText: TextView = itemView.findViewById(R.id.phoneNumberText)
        private val messageText: TextView = itemView.findViewById(R.id.messageText)
        private val statusText: TextView = itemView.findViewById(R.id.statusText)
        private val timestampText: TextView = itemView.findViewById(R.id.timestampText)
        private val requestIdText: TextView = itemView.findViewById(R.id.requestIdText)
        
        private val dateFormat = SimpleDateFormat("MMM dd, HH:mm", Locale.getDefault())
        
        fun bind(sms: SmsEntity) {
            phoneNumberText.text = sms.phoneNumber
            messageText.text = if (sms.message.length > 50) {
                "${sms.message.take(50)}..."
            } else {
                sms.message
            }
            
            statusText.text = sms.status.name
            statusText.setTextColor(getStatusColor(sms.status))
            
            timestampText.text = dateFormat.format(Date(sms.timestamp))
            
            if (sms.requestId != null) {
                requestIdText.text = "ID: ${sms.requestId.take(8)}..."
                requestIdText.visibility = View.VISIBLE
            } else {
                requestIdText.visibility = View.GONE
            }
            
            itemView.setOnClickListener {
                onItemClick(sms)
            }
        }
        
        private fun getStatusColor(status: SmsStatus): Int {
            return when (status) {
                SmsStatus.PENDING -> Color.parseColor("#FF9800") // Orange
                SmsStatus.SENDING -> Color.parseColor("#00BCD4") // Cyan
                SmsStatus.SENT -> Color.parseColor("#2196F3") // Blue
                SmsStatus.DELIVERED -> Color.parseColor("#4CAF50") // Green
                SmsStatus.FAILED -> Color.parseColor("#F44336") // Red
                SmsStatus.UNKNOWN -> Color.parseColor("#9E9E9E") // Gray
            }
        }
    }
    
    class SmsDiffCallback : DiffUtil.ItemCallback<SmsEntity>() {
        override fun areItemsTheSame(oldItem: SmsEntity, newItem: SmsEntity): Boolean {
            return oldItem.id == newItem.id
        }
        
        override fun areContentsTheSame(oldItem: SmsEntity, newItem: SmsEntity): Boolean {
            return oldItem == newItem
        }
    }
}
