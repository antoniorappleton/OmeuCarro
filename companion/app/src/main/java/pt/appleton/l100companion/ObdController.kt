package pt.appleton.l100companion

import android.annotation.SuppressLint
import android.app.Application
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlin.coroutines.coroutineContext
import kotlinx.coroutines.launch
import pt.appleton.l100companion.net.L100UploadPrefs
import pt.appleton.l100companion.net.L100Uploader
import pt.appleton.l100companion.obd.Elm327Client
import pt.appleton.l100companion.obd.ElmTimeoutException
import pt.appleton.l100companion.obd.PidDef
import pt.appleton.l100companion.obd.Pids
import pt.appleton.l100companion.obd.RfcommTransport
import java.io.File
import java.io.IOException
import java.util.Locale
import java.util.UUID

data class DeviceItem(val name: String, val address: String)

data class LiveValue(val label: String, val value: String)

data class UiState(
    val devices: List<DeviceItem> = emptyList(),
    val selectedAddress: String? = null,
    val status: String = "Desligado",
    val busy: Boolean = false,
    /** O utilizador carregou em "Ligar" e ainda não em "Desligar" (inclui as religações). */
    val active: Boolean = false,
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

/**
 * Motor da app: ligação ao ELM327, leitura em ciclo, CSV e envio para a L100.
 *
 * É um singleton ao nível da aplicação (não um ViewModel) para sobreviver ao ecrã:
 * com o ecrã desligado ou a Activity fechada continua a ler, e o [ObdService] em
 * primeiro plano impede o Android de matar o processo ou adormecer o CPU.
 */
class ObdController private constructor(private val app: Application) {

    companion object {
        @Volatile private var instance: ObdController? = null
        fun get(app: Application): ObdController =
            instance ?: synchronized(this) { instance ?: ObdController(app).also { instance = it } }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

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
    @Volatile private var csv: CsvLogger? = null
    private var rawLog: File? = null
    private var livePids: List<PidDef> = emptyList()
    private var uploadSessionId: String = ""
    private var lastUploadAt: Long = 0L

    private val logDir: File
        get() = File(app.getExternalFilesDir(null), "logs")

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

    /** true enquanto o utilizador quer estar ligado (entre "Ligar" e "Desligar"). */
    @Volatile private var wantConnected = false
    private var sessionJob: Job? = null

    /** Método RFCOMM que funcionou da última vez, por endereço — tentado primeiro. */
    private val btPrefs = app.getSharedPreferences("bt", Context.MODE_PRIVATE)

    @SuppressLint("MissingPermission")
    fun connect() {
        val address = _state.value.selectedAddress ?: return
        val device = btAdapter?.getRemoteDevice(address) ?: return
        if (sessionJob?.isActive == true) return
        wantConnected = true
        uploadSessionId = UUID.randomUUID().toString()
        logDir.mkdirs()
        rawLog = File(logDir, "p0_raw_%tY%<tm%<td_%<tH%<tM%<tS.txt".format(System.currentTimeMillis()))
        _state.update { it.copy(active = true) }
        ObdService.start(app)

        // Ciclo de (re)ligação: o clone ELM327 larga o Bluetooth com frequência — ao dar à
        // chave (a tensão cai para ~11V), quando outro dispositivo BT disputa o rádio, ou
        // sem razão aparente. Em vez de desistir, volta a tentar até o utilizador carregar em
        // "Desligar", com espera crescente (2s, 4s, … até 10s).
        sessionJob = scope.launch(Dispatchers.IO) {
            var attempt = 0
            while (isActive && wantConnected) {
                attempt++
                _state.update {
                    it.copy(busy = true, status = if (attempt == 1) "A ligar a ${device.name}…"
                        else "A religar a ${device.name}… (tentativa $attempt)")
                }
                try {
                    runSession(device) { attempt = 0 }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    log("ERRO: ${e.message} ${e.cause?.message ?: ""}".trim())
                }
                cleanup()
                if (!wantConnected) break
                val waitMs = minOf(2000L * maxOf(attempt, 1), 10_000L)
                _state.update {
                    it.copy(busy = false, connected = false, live = emptyList(),
                        status = "Sem ligação ao OBDII — nova tentativa em ${waitMs / 1000}s")
                }
                log("Nova tentativa de ligação em ${waitMs / 1000}s")
                delay(waitMs)
            }
        }
    }

    /**
     * Uma sessão: liga, inicia o ELM, lê os PIDs suportados e fica a ler em ciclo.
     * Só sai com exceção (ligação perdida / adaptador mudo) ou cancelamento.
     * [onEstablished] é chamado quando a ligação fica operacional (para repor o backoff).
     */
    @SuppressLint("MissingPermission")
    private suspend fun runSession(device: BluetoothDevice, onEstablished: () -> Unit) {
        val prefKey = "method_${device.address}"
        val t = RfcommTransport(device, btAdapter, preferred = btPrefs.getString(prefKey, null))
        transport = t
        val method = t.connect()
        btPrefs.edit().putString(prefKey, method).apply()
        log("Ligação: $method")
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
        onEstablished()
        poll(c)
    }

    /** Ciclo de leitura. Lança exceção quando a ligação se perde, para o ciclo de religação tratar. */
    private suspend fun poll(c: Elm327Client) {
        var failures = 0
        while (coroutineContext.isActive) {
            val started = SystemClock.elapsedRealtime()
            val values = linkedMapOf<String, Double?>()
            val shown = mutableListOf<LiveValue>()

            for (def in livePids) {
                val v = try {
                    c.readPid(def.pid)?.takeIf { it.size >= def.bytes }?.let(def.decode)
                        .also { failures = 0 }
                } catch (e: ElmTimeoutException) {
                    failures++; null
                } catch (e: IOException) {
                    log("Ligação perdida: ${e.message}")
                    throw e
                }
                values[def.key] = v
                shown += LiveValue(def.label, v?.let { "%.1f %s".format(Locale.ROOT, it, def.unit) } ?: "—")
            }

            val volts = try {
                c.readVoltage()
            } catch (e: ElmTimeoutException) {
                null
            } catch (e: IOException) {
                log("Ligação perdida: ${e.message}")
                throw e
            }
            values["voltage"] = volts
            shown += LiveValue("Tensão", volts?.let { "%.1f V".format(Locale.ROOT, it) } ?: "—")

            if (failures >= 3) {
                log("3 falhas seguidas → reiniciar o ELM327 (ATWS)")
                // Se nem o reinício responde, o link BT está morto: a exceção sobe e religamos.
                c.initialize(warm = true)
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

    /**
     * Envia as leituras mais recentes para a L100 (mesma Cloud Function que o Torque Pro usa),
     * no máximo a cada 2s — o backend não precisa de leituras a cada 500ms, e isto evita
     * esgotar os pedidos simultâneos / escritas no Firestore. Corre em Dispatchers.IO,
     * chamado a partir de [poll].
     */
    private fun maybeUploadToL100(values: Map<String, Double?>, voltage: Double?) {
        if (!_state.value.uploadEnabled) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastUploadAt < 2000) return
        lastUploadAt = now

        // Pedido de rede num coroutine próprio: não atrasa o ciclo de 500ms de leitura de PIDs
        // mesmo que a ligação esteja lenta (timeout interno de 5s no L100Uploader).
        scope.launch(Dispatchers.IO) {
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
        wantConnected = false
        sessionJob?.cancel()
        sessionJob = null
        stopRecording()
        cleanup()
        _state.update {
            it.copy(connected = false, busy = false, active = false, live = emptyList(), status = "Desligado")
        }
        ObdService.stop(app)
    }

    private fun cleanup() {
        transport?.close()
        transport = null
        client = null
    }

    fun filesToShare(): List<File> =
        _state.value.lastFiles.ifEmpty { listOfNotNull(rawLog) }.filter { it.exists() }
}
