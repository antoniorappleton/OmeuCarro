package pt.appleton.l100companion

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Serviço em primeiro plano que mantém a leitura OBD viva com o ecrã desligado.
 *
 * Não faz leituras ele próprio — isso é o [ObdController]. Serve para:
 *  - mostrar a notificação persistente (obrigatória para correr em segundo plano);
 *  - impedir que o Android mate o processo;
 *  - segurar um WakeLock parcial para o CPU não adormecer com o ecrã apagado
 *    (sem isto os `delay()` do ciclo de leitura ficam congelados).
 */
class ObdService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val controller = ObdController.get(application)

        if (intent?.action == ACTION_STOP) {
            controller.disconnect()  // chama stop() → stopSelf
            return START_NOT_STICKY
        }

        ensureChannel()
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification("A iniciar…"),
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE else 0,
        )

        if (wakeLock == null) {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "L100Companion:obd").apply {
                setReferenceCounted(false)
                acquire()
            }
            // Atualiza o texto da notificação com o estado da ligação.
            scope.launch {
                controller.state
                    .map { s ->
                        val upload = if (s.uploadEnabled && s.uploadStatus.isNotEmpty()) " · L100: ${s.uploadStatus}" else ""
                        s.status + upload
                    }
                    .distinctUntilChanged()
                    .collect { text ->
                        getSystemService(NotificationManager::class.java)
                            .notify(NOTIFICATION_ID, buildNotification(text))
                    }
            }
        }

        // Se o sistema matar o serviço, não o recria sozinho: sem o utilizador não sabemos
        // se ainda quer estar ligado. O ObdController volta a arrancá-lo em connect().
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        scope.cancel()
        runCatching { wakeLock?.takeIf { it.isHeld }?.release() }
        wakeLock = null
        super.onDestroy()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Ligação OBD", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "Mostra que a L100 Companion está a ler o carro em segundo plano"
                    setShowBadge(false)
                }
            )
        }
    }

    private fun buildNotification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, ObdService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentTitle("L100 Companion")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(open)
            .addAction(0, "Desligar", stop)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "obd"
        private const val NOTIFICATION_ID = 1
        private const val ACTION_STOP = "pt.appleton.l100companion.STOP"

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, ObdService::class.java))
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, ObdService::class.java))
        }
    }
}
