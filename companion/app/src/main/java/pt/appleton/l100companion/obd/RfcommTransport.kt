package pt.appleton.l100companion.obd

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/** Canal de comunicação com o adaptador OBD (clássico hoje; BLE pode implementar a mesma interface). */
interface ObdTransport {
    val input: InputStream
    val output: OutputStream
    /** Liga e devolve uma descrição do método que funcionou. */
    suspend fun connect(): String
    fun close()
}

/**
 * Bluetooth clássico (SPP/RFCOMM), usado pela maioria dos ELM327.
 * Tenta 3 métodos por ordem, porque os clones baratos nem sempre aceitam o método padrão.
 */
class RfcommTransport(
    private val device: BluetoothDevice,
    private val adapter: BluetoothAdapter?,
    /** Nome do método que funcionou da última vez — é tentado primeiro (poupa ~10s por ligação). */
    private val preferred: String? = null,
) : ObdTransport {

    @Volatile private var socket: BluetoothSocket? = null
    /** Socket a meio de connect(); guardado para que [close] consiga abortar a tentativa. */
    @Volatile private var pending: BluetoothSocket? = null
    @Volatile private var closed = false

    override val input: InputStream
        get() = socket?.inputStream ?: throw IOException("Não ligado")

    override val output: OutputStream
        get() = socket?.outputStream ?: throw IOException("Não ligado")

    @SuppressLint("MissingPermission")
    override suspend fun connect(): String = withContext(Dispatchers.IO) {
        runCatching { adapter?.cancelDiscovery() }

        val attempts: List<Pair<String, () -> BluetoothSocket>> = listOf(
            "RFCOMM seguro (SPP)" to { device.createRfcommSocketToServiceRecord(SPP_UUID) },
            "RFCOMM inseguro (SPP)" to { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
            "RFCOMM canal 1 (reflexão)" to {
                device.javaClass
                    .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    .invoke(device, 1) as BluetoothSocket
            },
        ).sortedByDescending { it.first == preferred }

        var lastError: Exception? = null
        for ((name, make) in attempts) {
            if (closed) throw IOException("Cancelado")
            var candidate: BluetoothSocket? = null
            try {
                candidate = make()
                pending = candidate
                candidate.connect()
                pending = null
                if (closed) {
                    runCatching { candidate.close() }
                    throw IOException("Cancelado")
                }
                socket = candidate
                return@withContext name
            } catch (e: Exception) {
                pending = null
                lastError = e
                runCatching { candidate?.close() }
                if (closed) throw IOException("Cancelado")
                // Dá um momento ao adaptador para libertar o canal antes do método seguinte.
                delay(300)
            }
        }
        throw IOException("Não foi possível ligar a ${device.address}", lastError)
    }

    override fun close() {
        closed = true
        runCatching { pending?.close() }
        runCatching { socket?.close() }
        pending = null
        socket = null
    }

    companion object {
        val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }
}
