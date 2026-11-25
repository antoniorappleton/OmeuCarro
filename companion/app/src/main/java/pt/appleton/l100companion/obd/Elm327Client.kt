package pt.appleton.l100companion.obd

import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.io.IOException

class ElmTimeoutException(cmd: String) : IOException("Sem resposta a '$cmd'")

/**
 * Cliente mínimo para o ELM327: envia um comando, lê até ao prompt '>' e devolve as linhas de resposta.
 * Todas as respostas em bruto passam por [log] para diagnóstico.
 */
class Elm327Client(
    private val transport: ObdTransport,
    private val log: (String) -> Unit,
) {
    private val mutex = Mutex()

    suspend fun send(cmd: String, timeoutMs: Long = 1500): String = mutex.withLock {
        withContext(Dispatchers.IO) {
            val input = transport.input
            val output = transport.output

            // Descarta restos de respostas anteriores.
            while (input.available() > 0) input.read(ByteArray(input.available()))

            output.write("$cmd\r".toByteArray(Charsets.US_ASCII))
            output.flush()

            val sb = StringBuilder()
            val buf = ByteArray(256)
            val deadline = SystemClock.elapsedRealtime() + timeoutMs
            while (SystemClock.elapsedRealtime() < deadline) {
                val n = input.available()
                if (n > 0) {
                    val r = input.read(buf, 0, minOf(n, buf.size))
                    if (r > 0) sb.append(String(buf, 0, r, Charsets.US_ASCII))
                    if (sb.contains('>')) break
                } else {
                    delay(10)
                }
            }

            val raw = sb.toString()
            log("$cmd → ${raw.replace("\r", " | ").replace("\n", "").trim()}")
            if (!raw.contains('>')) throw ElmTimeoutException(cmd)

            raw.substringBefore('>')
                .replace("\r", "\n")
                .lines()
                .map { it.trim() }
                .filter { it.isNotEmpty() && !it.equals(cmd, ignoreCase = true) }
                .joinToString("\n")
        }
    }

    /** Reinicia o adaptador e configura-o para respostas compactas. Devolve a versão do ELM. */
    suspend fun initialize(): String {
        send("ATZ", timeoutMs = 4000)
        delay(500)
        val version = send("ATI")
        send("ATE0")   // sem eco
        send("ATL0")   // sem mudanças de linha extra
        send("ATS0")   // sem espaços
        send("ATH0")   // sem cabeçalhos
        send("ATSP0")  // protocolo automático
        return version
    }

    /** Pergunta ao carro que PIDs do modo 01 suporta (blocos 00, 20, 40, ...). */
    suspend fun supportedPids(): Set<Int> {
        val result = sortedSetOf<Int>()
        var base = 0x00
        while (base <= 0xC0) {
            // O primeiro pedido pode demorar (o ELM procura o protocolo: "SEARCHING...").
            val resp = send("01%02X".format(base), timeoutMs = if (base == 0) 10_000 else 3000)
            val bytes = parseMode01(resp, base) ?: break
            if (bytes.size < 4) break
            val mask = (bytes[0].toLong() shl 24) or (bytes[1].toLong() shl 16) or
                (bytes[2].toLong() shl 8) or bytes[3].toLong()
            for (i in 0 until 32) {
                if ((mask shr (31 - i)) and 1L == 1L) result.add(base + i + 1)
            }
            if (!result.contains(base + 0x20)) break
            base += 0x20
        }
        return result
    }

    /** Lê um PID do modo 01 e devolve os bytes de dados, ou null se não houver resposta válida. */
    suspend fun readPid(pid: Int): IntArray? = parseMode01(send("01%02X".format(pid)), pid)

    /** Tensão no conector OBD (≈ bateria), via ATRV. */
    suspend fun readVoltage(): Double? =
        send("ATRV").replace("V", "", ignoreCase = true).trim().toDoubleOrNull()

    companion object {
        /** Procura "41 <pid>" na resposta e devolve os bytes que se seguem. */
        fun parseMode01(resp: String, pid: Int): IntArray? {
            val key = "41%02X".format(pid)
            for (line in resp.uppercase().lines()) {
                val clean = line.replace(" ", "")
                val i = clean.indexOf(key)
                if (i < 0) continue
                val hex = clean.substring(i + key.length).takeWhile { it.isDigit() || it in 'A'..'F' }
                if (hex.length < 2) continue
                return IntArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16) }
            }
            return null
        }
    }
}
