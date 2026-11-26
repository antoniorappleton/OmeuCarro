package pt.appleton.l100companion.net

import android.content.Context
import android.net.Uri
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Envia leituras OBD diretamente para a Cloud Function `uploadTorqueData` da L100 —
 * o mesmo endpoint e os mesmos códigos curtos de PID que o Torque Pro usa no seu
 * "Upload to webserver" (ver functions/torque.js -> DEFAULT_PIDS). Isto permite à
 * companion app substituir o Torque Pro sem qualquer alteração ao backend ou à
 * página "Viagem ao Vivo" da L100.
 */
class L100Uploader(private val prefs: L100UploadPrefs) {

    sealed class Result {
        data class Ok(val body: String) : Result()
        data class Failed(val reason: String) : Result()
        data class Skipped(val reason: String) : Result()
    }

    /**
     * @param values chave local (ver [pt.appleton.l100companion.obd.Pids]) -> valor decodificado.
     * @param voltage tensão lida via `ATRV` (não é um PID do modo 01, por isso vem à parte).
     * @param sessionId identificador estável desta ligação; o backend usa-o para deduplicar
     *   leituras e para a lógica de odómetro incremental.
     *
     * Chamar sempre em background (IO) — faz uma ligação de rede bloqueante.
     */
    fun upload(
        values: Map<String, Double?>,
        voltage: Double?,
        sessionId: String,
    ): Result {
        val vehicleId = prefs.vehicleId.trim()
        val key = prefs.uploadKey.trim()
        val endpoint = prefs.endpoint.trim()
        if (vehicleId.isEmpty() || key.isEmpty() || endpoint.isEmpty()) {
            return Result.Skipped("Vehicle ID / chave / endpoint em falta")
        }

        val params = linkedMapOf<String, String>()
        params["vehicleId"] = vehicleId
        params["key"] = key
        params["session"] = sessionId
        params["id"] = "l100companion"
        params["time"] = System.currentTimeMillis().toString()

        // Mapeia a chave local (Pids.kt) para o código curto que functions/torque.js
        // já sabe interpretar (DEFAULT_PIDS). Sem isto o backend não reconhece o valor.
        fun put(localKey: String, pidCode: String) {
            values[localKey]?.let { params[pidCode] = it.toString() }
        }
        put("rpm", "kc")
        put("speed", "kd")
        put("coolant", "k5")
        put("load", "k4")
        put("maf", "k10")
        put("intake", "kf")
        put("fuel", "k2f")
        put("odometer", "a6")
        voltage?.let { params["k42"] = it.toString() }

        if (params.keys.none { it !in setOf("vehicleId", "key", "session", "id", "time") }) {
            return Result.Skipped("Sem valores para enviar")
        }

        val query = params.entries.joinToString("&") { (k, v) ->
            "${Uri.encode(k)}=${Uri.encode(v)}"
        }

        return try {
            val url = URL("$endpoint?$query")
            val conn = url.openConnection() as HttpURLConnection
            conn.requestMethod = "GET"
            conn.connectTimeout = TimeUnit.SECONDS.toMillis(5).toInt()
            conn.readTimeout = TimeUnit.SECONDS.toMillis(5).toInt()
            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()
            if (code == 200) Result.Ok(body) else Result.Failed("HTTP $code: $body")
        } catch (e: IOException) {
            Result.Failed(e.message ?: "Erro de rede")
        }
    }
}

/** Configuração persistida (SharedPreferences) do upload direto para a L100. */
class L100UploadPrefs(context: Context) {
    private val sp = context.getSharedPreferences("l100_upload", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = sp.getBoolean("enabled", false)
        set(value) = sp.edit().putBoolean("enabled", value).apply()

    var vehicleId: String
        get() = sp.getString("vehicleId", "") ?: ""
        set(value) = sp.edit().putString("vehicleId", value).apply()

    var uploadKey: String
        get() = sp.getString("uploadKey", "") ?: ""
        set(value) = sp.edit().putString("uploadKey", value).apply()

    var endpoint: String
        get() = sp.getString("endpoint", DEFAULT_ENDPOINT) ?: DEFAULT_ENDPOINT
        set(value) = sp.edit().putString("endpoint", value).apply()

    companion object {
        // Mesma Cloud Function (2ª geração, região us-central1 por omissão) que já
        // recebe os uploads do Torque Pro. Confirma/ajusta no ecrã se a tua já for
        // diferente (por exemplo se o projeto tiver sido migrado de região).
        const val DEFAULT_ENDPOINT =
            "https://us-central1-omeucarro-d3889.cloudfunctions.net/uploadTorqueData"
    }
}
