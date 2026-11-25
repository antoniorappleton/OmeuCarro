package pt.appleton.l100companion.obd

data class PidDef(
    val pid: Int,
    val key: String,
    val label: String,
    val unit: String,
    val bytes: Int,
    val decode: (IntArray) -> Double,
)

object Pids {

    /** PIDs lidos em tempo real (só os que o carro disser que suporta). */
    val LIVE: List<PidDef> = listOf(
        PidDef(0x0C, "rpm", "RPM", "rpm", 2) { (it[0] * 256 + it[1]) / 4.0 },
        PidDef(0x0D, "speed", "Velocidade", "km/h", 1) { it[0].toDouble() },
        PidDef(0x05, "coolant", "Temp. motor", "°C", 1) { it[0] - 40.0 },
        PidDef(0x04, "load", "Carga do motor", "%", 1) { it[0] * 100 / 255.0 },
        PidDef(0x10, "maf", "Caudal de ar (MAF)", "g/s", 2) { (it[0] * 256 + it[1]) / 100.0 },
        PidDef(0x0B, "map", "Pressão admissão (MAP)", "kPa", 1) { it[0].toDouble() },
        PidDef(0x0F, "intake", "Temp. admissão", "°C", 1) { it[0] - 40.0 },
        PidDef(0x2F, "fuel", "Nível combustível", "%", 1) { it[0] * 100 / 255.0 },
        PidDef(0x5E, "fuelRate", "Caudal combustível", "L/h", 2) { (it[0] * 256 + it[1]) / 20.0 },
        PidDef(0x46, "ambient", "Temp. exterior", "°C", 1) { it[0] - 40.0 },
        PidDef(0x31, "distClear", "Dist. desde apagar DTC", "km", 2) { (it[0] * 256 + it[1]).toDouble() },
        PidDef(0xA6, "odometer", "Odómetro", "km", 4) {
            ((it[0].toLong() shl 24) or (it[1].toLong() shl 16) or
                (it[2].toLong() shl 8) or it[3].toLong()) / 10.0
        },
    )

    private val NAMES = mapOf(
        0x01 to "Estado do monitor / MIL",
        0x03 to "Estado do sistema de combustível",
        0x04 to "Carga do motor",
        0x05 to "Temp. motor",
        0x0A to "Pressão de combustível",
        0x0B to "Pressão admissão (MAP)",
        0x0C to "RPM",
        0x0D to "Velocidade",
        0x0F to "Temp. admissão",
        0x10 to "Caudal de ar (MAF)",
        0x11 to "Posição do acelerador",
        0x1C to "Norma OBD",
        0x1F to "Tempo desde o arranque",
        0x21 to "Dist. com luz de avaria",
        0x23 to "Pressão rampa de injeção",
        0x2F to "Nível combustível",
        0x31 to "Dist. desde apagar DTC",
        0x33 to "Pressão atmosférica",
        0x42 to "Tensão do módulo",
        0x46 to "Temp. exterior",
        0x49 to "Posição pedal acelerador",
        0x5E to "Caudal combustível",
        0xA6 to "Odómetro",
    )

    fun name(pid: Int): String = NAMES[pid] ?: "—"

    fun isBlockMarker(pid: Int) = pid % 0x20 == 0
}
