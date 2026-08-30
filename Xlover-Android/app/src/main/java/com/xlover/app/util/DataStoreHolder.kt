package com.xlover.app.util

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.preferencesDataStore

/**
 * 提供与 Hilt AppModule 一致的 DataStore 实例。
 * 由于 AppModule 已经通过 `Context.dataStore` delegate 定义，
 * 这里必须使用相同的 prefs name "xlover_prefs" 才能保证读写同一份数据。
 */
private val Context.appDataStore: DataStore<Preferences> by preferencesDataStore(name = "xlover_prefs")

object DataStoreHolder {
    @Volatile
    private var instance: DataStore<Preferences>? = null

    fun get(context: Context): DataStore<Preferences> {
        return instance ?: synchronized(this) {
            instance ?: context.applicationContext.appDataStore.also { instance = it }
        }
    }
}
