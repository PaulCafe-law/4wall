package com.yourorg.buildingdrone.data.auth

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import com.yourorg.buildingdrone.data.network.LoginRequestWire
import com.yourorg.buildingdrone.data.network.LogoutRequestWire
import com.yourorg.buildingdrone.data.network.PlannerTokenProvider
import com.yourorg.buildingdrone.data.network.PlannerTransport
import com.yourorg.buildingdrone.data.network.RefreshRequestWire
import com.yourorg.buildingdrone.data.network.TokenPairWire
import kotlinx.coroutines.flow.first
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import java.io.IOException

data class OperatorSession(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochMillis: Long,
    val operatorId: String,
    val username: String,
    val displayName: String
) {
    fun isNearExpiry(nowEpochMillis: Long = System.currentTimeMillis()): Boolean {
        return expiresAtEpochMillis <= nowEpochMillis + 30_000L
    }
}

sealed interface LogoutResult {
    data object Success : LogoutResult
    data class SuccessWithServerRevokeWarning(val message: String) : LogoutResult
}

class OperatorAuthRepository(
    context: Context,
    private val transport: PlannerTransport,
    private val json: Json = plannerJson
) : PlannerTokenProvider {
    private val store: DataStore<Preferences> = PreferenceDataStoreFactory.create(
        corruptionHandler = null,
        migrations = emptyList(),
        produceFile = { context.preferencesDataStoreFile("operator_session.preferences_pb") }
    )

    suspend fun currentSession(): OperatorSession? = readSession()

    suspend fun login(username: String, password: String): OperatorSession {
        val response = transport.postJson(
            pathOrUrl = "/v1/auth/login",
            body = json.encodeToString(
                LoginRequestWire.serializer(),
                LoginRequestWire(username = username, password = password)
            ),
            authenticated = false
        )
        val session = response.decodeTokenPair()
        writeSession(session)
        return session
    }

    suspend fun logout(): LogoutResult {
        val session = readSession()
        var revokeWarning: String? = null
        if (session != null) {
            revokeWarning = try {
                transport.postJson(
                    pathOrUrl = "/v1/auth/logout",
                    body = json.encodeToString(
                        LogoutRequestWire.serializer(),
                        LogoutRequestWire(refreshToken = session.refreshToken)
                    ),
                    authenticated = false
                )
                null
            } catch (_: IOException) {
                "Signed out locally, but server token revocation could not be confirmed."
            }
        }
        store.edit { it.clear() }
        return revokeWarning?.let(LogoutResult::SuccessWithServerRevokeWarning) ?: LogoutResult.Success
    }

    override suspend fun currentAccessToken(): String? {
        val session = readSession() ?: return null
        return if (session.isNearExpiry()) {
            refreshAccessToken()
        } else {
            session.accessToken
        }
    }

    override suspend fun refreshAccessToken(): String? {
        val session = readSession() ?: return null
        val response = try {
            transport.postJson(
                pathOrUrl = "/v1/auth/refresh",
                body = json.encodeToString(
                    RefreshRequestWire.serializer(),
                    RefreshRequestWire(refreshToken = session.refreshToken)
                ),
                authenticated = false
            )
        } catch (_: IOException) {
            return null
        }
        val refreshed = response.decodeTokenPair()
        writeSession(refreshed)
        return refreshed.accessToken
    }

    private suspend fun readSession(): OperatorSession? {
        val preferences = try {
            store.data.first()
        } catch (_: IOException) {
            emptyPreferences()
        }
        val accessToken = preferences[ACCESS_TOKEN] ?: return null
        val refreshToken = preferences[REFRESH_TOKEN] ?: return null
        return OperatorSession(
            accessToken = accessToken,
            refreshToken = refreshToken,
            expiresAtEpochMillis = preferences[EXPIRES_AT_EPOCH_MILLIS] ?: 0L,
            operatorId = preferences[OPERATOR_ID] ?: "",
            username = preferences[USERNAME] ?: "",
            displayName = preferences[DISPLAY_NAME] ?: ""
        )
    }

    private suspend fun writeSession(session: OperatorSession) {
        store.edit { preferences ->
            preferences[ACCESS_TOKEN] = session.accessToken
            preferences[REFRESH_TOKEN] = session.refreshToken
            preferences[EXPIRES_AT_EPOCH_MILLIS] = session.expiresAtEpochMillis
            preferences[OPERATOR_ID] = session.operatorId
            preferences[USERNAME] = session.username
            preferences[DISPLAY_NAME] = session.displayName
        }
    }

    private fun com.yourorg.buildingdrone.data.network.PlannerHttpResponse.decodeTokenPair(): OperatorSession {
        val tokenPair = try {
            json.decodeFromString(TokenPairWire.serializer(), body.toString(Charsets.UTF_8))
        } catch (error: SerializationException) {
            throw IOException("invalid_auth_payload", error)
        }
        return OperatorSession(
            accessToken = tokenPair.accessToken,
            refreshToken = tokenPair.refreshToken,
            expiresAtEpochMillis = System.currentTimeMillis() + (tokenPair.expiresInSeconds * 1000L),
            operatorId = tokenPair.operator.operatorId,
            username = tokenPair.operator.username,
            displayName = tokenPair.operator.displayName
        )
    }

    private companion object {
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        val EXPIRES_AT_EPOCH_MILLIS = longPreferencesKey("expires_at_epoch_millis")
        val OPERATOR_ID = stringPreferencesKey("operator_id")
        val USERNAME = stringPreferencesKey("username")
        val DISPLAY_NAME = stringPreferencesKey("display_name")
    }
}

val plannerJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = true
}
