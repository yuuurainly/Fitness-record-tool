package com.xlover.app.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import com.squareup.moshi.Moshi
import com.squareup.moshi.kotlin.reflect.KotlinJsonAdapterFactory
import com.xlover.app.data.remote.ApiService
import com.xlover.app.data.repository.*
import com.xlover.app.util.Constants
import com.xlover.app.util.DataStoreHolder
import com.xlover.app.util.ServerUrlManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.moshi.MoshiConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

/**
 * 动态 BaseUrl 拦截器：
 * Retrofit 的 baseUrl 在创建时就固定了，这里通过拦截器在每次请求时把 host/port/scheme
 * 替换为 ServerUrlManager 当前保存的地址。这样用户可在 App 内动态切换后端 IP，无需重建 Retrofit。
 */
private class DynamicBaseUrlInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): okhttp3.Response {
        val original = chain.request()
        val dynamic = ServerUrlManager.getUrl()
        val dynamicBase = dynamic.toHttpUrlOrNull()
            ?: return chain.proceed(original)

        val originalUrl = original.url
        val newUrl = originalUrl.newBuilder()
            .scheme(dynamicBase.scheme)
            .host(dynamicBase.host)
            .port(dynamicBase.port)
            .build()

        val newRequest = original.newBuilder()
            .url(newUrl)
            .build()
        return chain.proceed(newRequest)
    }
}

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideDataStore(@ApplicationContext context: Context): DataStore<Preferences> {
        // 服务器地址缓存初始化已在 XloverApp.onCreate 中异步完成，避免在 Hilt 注入时阻塞主线程
        return DataStoreHolder.get(context)
    }

    @Provides
    @Singleton
    fun provideMoshi(): Moshi {
        return Moshi.Builder()
            .add(KotlinJsonAdapterFactory())
            .build()
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }
        return OkHttpClient.Builder()
            .addInterceptor(DynamicBaseUrlInterceptor())
            .addInterceptor(loggingInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(okHttpClient: OkHttpClient, moshi: Moshi): Retrofit {
        return Retrofit.Builder()
            .baseUrl(Constants.DEFAULT_BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(MoshiConverterFactory.create(moshi))
            .build()
    }

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService {
        return retrofit.create(ApiService::class.java)
    }

    @Provides
    @Singleton
    fun provideAuthRepository(apiService: ApiService, dataStore: DataStore<Preferences>): AuthRepository {
        return AuthRepository(apiService, dataStore)
    }

    @Provides
    @Singleton
    fun provideDashboardRepository(apiService: ApiService, dataStore: DataStore<Preferences>): DashboardRepository {
        return DashboardRepository(apiService, dataStore)
    }

    @Provides @Singleton fun provideRecordsRepository(api: ApiService) = RecordsRepository(api)
    @Provides @Singleton fun provideTasksRepository(api: ApiService) = TasksRepository(api)
    @Provides @Singleton fun provideProgressRepository(api: ApiService) = ProgressRepository(api)
    @Provides @Singleton fun provideMessagesRepository(api: ApiService) = MessagesRepository(api)
    @Provides @Singleton fun provideRewardsRepository(api: ApiService) = RewardsRepository(api)
    @Provides @Singleton fun provideProfileRepository(api: ApiService) = ProfileRepository(api)
    @Provides @Singleton fun provideInteractionsRepository(api: ApiService) = InteractionsRepository(api)
    @Provides @Singleton fun providePointRequestsRepository(api: ApiService) = PointRequestsRepository(api)
    @Provides @Singleton fun provideRemindersRepository(api: ApiService) = RemindersRepository(api)
}
