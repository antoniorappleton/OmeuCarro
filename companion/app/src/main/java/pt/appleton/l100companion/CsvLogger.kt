package pt.appleton.l100companion

import java.io.BufferedWriter
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Grava as leituras em CSV (separador ';') para comparar com o Torque e afinar o consumo. */
class CsvLogger(dir: File, private val columns: List<String>) {

    val file: File
    private val writer: BufferedWriter

    init {
        dir.mkdirs()
        val stamp = SimpleDateFormat("yyyyMMdd_HHmmss", Locale.ROOT).format(Date())
        file = File(dir, "p0_$stamp.csv")
        writer = file.bufferedWriter()
        writer.write((listOf("timestamp") + columns).joinToString(";"))
        writer.newLine()
    }

    fun row(timestamp: Long, values: Map<String, Double?>) {
        val cells = columns.map { c -> values[c]?.let { "%.2f".format(Locale.ROOT, it) } ?: "" }
        writer.write((listOf(timestamp.toString()) + cells).joinToString(";"))
        writer.newLine()
        // Em segundo plano o processo pode ser morto sem aviso: não perder o que já foi lido.
        writer.flush()
    }

    fun close() {
        runCatching { writer.flush(); writer.close() }
    }
}
