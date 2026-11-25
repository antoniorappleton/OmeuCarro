package pt.appleton.l100companion.obd

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothSocket
import kotlinx.coroutines.Dispatchers
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
) : ObdTransport {

    private var socket: BluetoothSocket? = null

    override val input: InputStream
        get() = socket?.inputStream ?: throw IOException("Não ligado")

    override val output: OutputStream
        get() = socket?.outputStream ?: throw IOException("Não ligado")

    @SuppressLint("MissingPermission")
    override suspend fun connect(): String = withContext(Dispatchers.IO) {
        adapter?.cancelDiscovery()

        val attempts: List<Pair<String, () -> BluetoothSocket>> = listOf(
            "RFCOMM seguro (SPP)" to { device.createRfcommSocketToServiceRecord(SPP_UUID) },
            "RFCOMM inseguro (SPP)" to { device.createInsecureRfcommSocketToServiceRecord(SPP_UUID) },
            "RFCOMM canal 1 (reflexão)" to {
                device.javaClass
                    .getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
                    .invoke(device, 1) as BluetoothSocket
            },
        )

        var lastError: Exception? = null
        for ((name, make) in attempts) {
            var candidate: BluetoothSocket? = null
            try {
                candidate = make()
                candidate.connect()
                socket = candidate
                return@withContext name
            } catch (e: Exception) {
                lastError = e
                runCatching { candidate?.close() }
            }
        }
        throw IOException("Não foi possível ligar a ${device.address}", lastError)
    }

    override fun close() {
        runCatching { socket?.close() }
        socket = null
    }

    companion object {
        val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }
}
