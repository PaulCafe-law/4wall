package com.yourorg.buildingdrone.data.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.HttpUrl.Companion.toHttpUrl
import java.io.IOException

data class PlannerHttpResponse(
    val code: Int,
    val body: ByteArray,
    val headers: Map<String, String>
)

interface PlannerTokenProvider {
    suspend fun currentAccessToken(): String?
    suspend fun refreshAccessToken(): String?
}

class PlannerAuthException(message: String) : IOException(message)

class PlannerHttpException(
    val statusCode: Int,
    val responseBody: String?
) : IOException("Planner request failed with HTTP $statusCode")

class PlannerTransport(
    private val baseUrl: String,
    private val client: OkHttpClient = OkHttpClient(),
    private val tokenProvider: PlannerTokenProvider? = null
) {
    suspend fun get(pathOrUrl: String, authenticated: Boolean = true): PlannerHttpResponse {
        return execute(
            method = "GET",
            pathOrUrl = pathOrUrl,
            authenticated = authenticated
        )
    }

    suspend fun postJson(
        pathOrUrl: String,
        body: String,
        authenticated: Boolean = true
    ): PlannerHttpResponse {
        return execute(
            method = "POST",
            pathOrUrl = pathOrUrl,
            body = body,
            authenticated = authenticated
        )
    }

    private suspend fun execute(
        method: String,
        pathOrUrl: String,
        body: String? = null,
        authenticated: Boolean
    ): PlannerHttpResponse = withContext(Dispatchers.IO) {
        var accessToken = if (authenticated) {
            tokenProvider?.currentAccessToken() ?: throw PlannerAuthException("not_authenticated")
        } else {
            null
        }

        var response = newCall(
            method = method,
            pathOrUrl = pathOrUrl,
            body = body,
            accessToken = accessToken
        ).execute()

        if (authenticated && response.code == 401) {
            response.close()
            accessToken = tokenProvider?.refreshAccessToken() ?: throw PlannerAuthException("session_expired")
            response = newCall(
                method = method,
                pathOrUrl = pathOrUrl,
                body = body,
                accessToken = accessToken
            ).execute()
            if (response.code == 401) {
                response.close()
                throw PlannerAuthException("session_expired")
            }
        }

        response.use { result ->
            val payload = result.body?.bytes() ?: ByteArray(0)
            if (!result.isSuccessful) {
                throw PlannerHttpException(result.code, payload.toString(Charsets.UTF_8))
            }
            PlannerHttpResponse(
                code = result.code,
                body = payload,
                headers = result.headers.toMultimap().mapValues { entry -> entry.value.joinToString(",") }
            )
        }
    }

    private fun newCall(
        method: String,
        pathOrUrl: String,
        body: String?,
        accessToken: String?
    ) = client.newCall(
        Request.Builder()
            .url(resolve(pathOrUrl))
            .method(
                method,
                body?.toRequestBody("application/json; charset=utf-8".toMediaType())
            )
            .apply {
                header("Accept", "application/json")
                if (body != null) {
                    header("Content-Type", "application/json")
                }
                if (accessToken != null) {
                    header("Authorization", "Bearer $accessToken")
                }
            }
            .build()
    )

    private fun resolve(pathOrUrl: String) = if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
        pathOrUrl.toHttpUrl()
    } else {
        val trimmedBase = if (baseUrl.endsWith("/")) baseUrl.dropLast(1) else baseUrl
        val normalizedPath = if (pathOrUrl.startsWith("/")) pathOrUrl else "/$pathOrUrl"
        "$trimmedBase$normalizedPath".toHttpUrl()
    }
}
