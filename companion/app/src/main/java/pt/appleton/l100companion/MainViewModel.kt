package pt.appleton.l100companion

import android.annotation.SuppressLint
import android.app.Application
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.SystemClock
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import pt.appleton.l100companion.net.L100UploadPrefs
import pt.appleton.l100companion.net.L100Uploader
import pt.appleton.l100companion.obd.Elm327Client
import pt.appleton.l100companion.obd.ElmTimeoutException
import pt.appleton.l100companion.obd.PidDef
import pt.appleton.l100companion.obd.Pids
import pt.appleton.l100companion.obd.RfcommTransport
import java.io.File
import java.util.Locale
import java.util.UUID

data class DeviceItem(val name: String, val address: String)

data class LiveValue(val label: String, val value: String)

data class UiState(
    val devices: List<DeviceItem> = emptyList(),
    val selectedAddress: String? = null,
    val status: String = "Desligado",
    val busy: Boolean = false,
    val connected: Boolean = false,
    val elmVersion: String? = null,
    val supported: List<Int> = emptyList(),
    val live: List<LiveValue> = emptyList(),
    val recording: Boolean = false,
    val samples: Int = 0,
    val lastFiles: List<File> = emptyList(),
    val log: List<String> = emptyList(),
    // --- Envio direto para a L100 (substitui o Torque Pro) ---
    val uploadEnabled: Boolean = false,
    val vehicleId: String = "",
    val uploadKey: String = "",
    val endpoint: String = L100UploadPrefs.DEFAULT_ENDPOINT,
    val uploadStatus: String = "",
)

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val uploadPrefs = L100UploadPrefs(app)
    private val uploader = L100Uploader(uploadPrefs)

    private val _state = MutableStateFlow(
        UiState(
            uploadEnabled = uploadPrefs.enabled,
            vehicleId = uploadPrefs.vehicleId,
            uploadKey = uploadPrefs.uploadKey,
            endpoint = uploadPrefs.endpoint,
        )
    )
    val state: StateFlow<UiState> = _state

    private val btAdapter =
        (app.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager).adapter

    private var transport: RfcommTransport? = null
    private var client: Elm327Client? = null
    private var pollJob: Job? = null
    @Volatile private var csv: CsvLogger? = null
    private var rawLog: File? = null
    private var livePids: List<PidDef> = emptyList()
    private var uploadSessionId: String = ""
    private var lastUploadAt: Long = 0L

    private val logDir: File
        get() = File(getApplication<Application>().getExternalFilesDir(null), "logs")

    private fun log(line: String) {
        val stamped = "%tT  %s".format(Locale.ROOT, System.currentTimeMillis(), line)
        rawLog?.appendText(stamped + "\n")
        _state.update { it.copy(log = (it.log + stamped).takeLast(150)) }
    }

    @SuppressLint("MissingPermission")
    fun loadDevices() {
        val bonded = btAdapter?.bondedDevices.orEmpty()
            .map { DeviceItem(it.name ?: "(sem nome)", it.address) }
            .sortedByDescending { it.name.contains("OBD", ignoreCase = true) }
        _state.update { s ->
            s.copy(
                devices = bonded,
                selectedAddress = s.selectedAddress ?: bonded.firstOrNull {
                    it.name.contains("OBD", ignoreCase = true)
                }?.address,
                status = if (btAdapter?.isEnabled == true) s.status else "Bluetooth desligado",
            )
        }
    }

    fun select(address: String) = _state.update { it.copy(selectedAddress = address) }

    // --- Envio direto para a L100 ---

    fun setUploadEnabled(enabled: Boolean) {
        uploadPrefs.enabled = enabled
        _state.update { it.copy(uploadEnabled = enabled, uploadStatus = "") }
    }

    fun setVehicleId(value: String) {
        uploadPrefs.vehicleId = value
        _state.update { it.copy(vehicleId = value) }
    }

    fun setUploadKey(value: String) {
        uploadPrefs.uploadKey = value
        _state.update { it.copy(uploadKey = value) }
    }

    fun setEndpoint(value: String) {
        uploadPrefs.endpoint = value
        _state.update { it.copy(endpoint = value) }
    }

    @SuppressLint("MissingPermission")
    fun connect() {
        val address = _state.value.selectedAddress ?: return
        val device = btAdapter?.getRemoteDevice(address) ?: return
        uploadSessionId = UUID.randomUUID().toString()
        viewModelScope.launch(Dispatchers.IO) {
            logDir.mkdirs()
            rawLog = File(logDir, "p0_raw_%tY%<tm%<td_%<tH%<tM%<tS.txt".format(System.currentTimeMillis()))
            _state.update { it.copy(busy = true, status = "A ligar a ${device.name}…") }
            try {
                val t = RfcommTransport(device, btAdapter)
                transport = t
                log("Ligação: ${t.connect()}")
                val c = Elm327Client(t, ::log)
                client = c

                _state.update { it.copy(status = "A iniciar o ELM327…") }
                val version = c.initialize()

                _state.update { it.copy(status = "A perguntar ao carro que PIDs suporta… (ignição ligada!)") }
                val supported = c.supportedPids()
                livePids = Pids.LIVE.filter { it.pid in supported }
                log("PIDs suportados: " + supported.joinToString(" ") { "%02X".format(it) })

                _state.update {
                    it.copy(
                        busy = false,
                        connected = true,
                        elmVersion = version,
                        supported = supported.toList(),
                        status = if (supported.isEmpty())
                            "Ligado ao adaptador, mas o carro não respondeu. Ignição ligada?"
                        else "Ligado · ${supported.size} PIDs suportados",
                    )
                }
                startPolling()
            } catch (e: Exception) {
                log("ERRO: ${e.message} ${e.cause?.message ?: ""}")
                cleanup()
                _state.update { it.copy(busy = false, connected = false, status = "Falha: ${e.message}") }
            }
        }
    }

    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch(Dispatchers.IO) {
            var failures = 0
            while (isActive) {
                val c = client ?: break
                val started = SystemClock.elapsedRealtime()
                val values = linkedMapOf<String, Double?>()
                val shown = mutableListOf<LiveValue>()

                for (def in livePids) {
                    val v = try {
                        c.readPid(def.pid)?.takeIf { it.size >= def.bytes }?.let(def.decode)
                            .also { failures = 0 }
                    } catch (e: ElmTimeoutException) {
                        failures++; null
                    } catch (e: Exception) {
                        log("Ligação perdida: ${e.message}")
                        disconnect(); return@launch
                    }
                    values[def.key] = v
                    shown += LiveValue(def.label, v?.let { "%.1f %s".format(Locale.ROOT, it, def.unit) } ?: "—")
                }

                val volts = runCatching { c.readVoltage() }.getOrNull()
                values["voltage"] = volts
                shown += LiveValue("Tensão", volts?.let { "%.1f V".format(Locale.ROOT, it) } ?: "—")

                if (failures >= 3) {
                    log("3 falhas seguidas → reiniciar o ELM327")
                    runCatching { c.initialize() }
                    failures = 0
                }

                runCatching { csv?.row(System.currentTimeMillis(), values) }
                _state.update {
                    it.copy(live = shown, samples = if (csv != null) it.samples + 1 else it.samples)
                }

                maybeUploadToL100(values, volts)

                val elapsed = SystemClock.elapsedRealtime() - started
                delay((500 - elapsed).coerceAtLeast(0))
            }
        }
    }

    /**
     * Envia as leituras mais recentes para a L100 (mesma Cloud Function que o Torque Pro usa),
     * no máximo a cada 2s — o backend não precisa de leituras a cada 500ms, e isto evita
     * esgotar os pedidos simultâneos / escritas no Firestore. Corre em Dispatchers.IO,
     * chamado a partir de [startPolling].
     */
    private fun maybeUploadToL100(values: Map<String, Double?>, voltage: Double?) {
        if (!_state.value.uploadEnabled) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastUploadAt < 2000) return
        lastUploadAt = now

        // Pedido de rede num coroutine próprio: não atrasa o ciclo de 500ms de leitura de PIDs
        // mesmo que a ligação esteja lenta (timeout interno de 5s no L100Uploader).
        viewModelScope.launch(Dispatchers.IO) {
            when (val result = uploader.upload(values, voltage, uploadSessionId)) {
                is L100Uploader.Result.Ok -> {
                    _state.update { it.copy(uploadStatus = "Enviado às %tT".format(Locale.ROOT, System.currentTimeMillis())) }
                }
                is L100Uploader.Result.Failed -> {
                    log("L100 upload falhou: ${result.reason}")
                    _state.update { it.copy(uploadStatus = "Erro: ${result.reason}") }
                }
                is L100Uploader.Result.Skipped -> {
                    _state.update { it.copy(uploadStatus = result.reason) }
                }
            }
        }
    }

    fun toggleRecording() {
        if (csv == null) {
            val logger = CsvLogger(logDir, livePids.map { it.key } + "voltage")
            csv = logger
            log("A gravar em ${logger.file.name}")
            _state.update { it.copy(recording = true, samples = 0) }
        } else {
            stopRecording()
        }
    }

    private fun stopRecording() {
        val logger = csv ?: return
        csv = null
        logger.close()
        log("Gravação terminada: ${logger.file.name}")
        _state.update {
            it.copy(recording = false, lastFiles = listOfNotNull(logger.file, rawLog))
        }
    }

    fun disconnect() {
        stopRecording()
        pollJob?.cancel()
        pollJob = null
        cleanup()
        _state.update { it.copy(connected = false, live = emptyList(), status = "Desligado") }
    }

    private fun cleanup() {
        transport?.close()
        transport = null
        client = null
    }

    fun filesToShare(): List<File> =
        _state.value.lastFiles.ifEmpty { listOfNotNull(rawLog) }.filter { it.exists() }

    override fun onCleared() {
        disconnect()
    }
}
