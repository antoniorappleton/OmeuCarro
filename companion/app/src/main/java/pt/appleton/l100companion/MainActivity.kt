package pt.appleton.l100companion

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import pt.appleton.l100companion.obd.Pids

class MainActivity : ComponentActivity() {

    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Surface(Modifier.fillMaxSize()) {
                    PermissionGate { P0Screen(vm, onShare = ::shareFiles) }
                }
            }
        }
    }

    private fun shareFiles() {
        val files = vm.filesToShare()
        if (files.isEmpty()) return
        val uris = ArrayList<Uri>(files.map {
            FileProvider.getUriForFile(this, "$packageName.files", it)
        })
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "text/plain"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(intent, "Partilhar registos P0"))
    }
}

private val BLUETOOTH_RUNTIME_PERMISSIONS = arrayOf(
    Manifest.permission.BLUETOOTH_CONNECT,
    Manifest.permission.BLUETOOTH_SCAN,
)

@Composable
private fun PermissionGate(content: @Composable () -> Unit) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        content(); return
    }
    val ctx = LocalContext.current
    fun allGranted() = BLUETOOTH_RUNTIME_PERMISSIONS.all {
        ContextCompat.checkSelfPermission(ctx, it) == PackageManager.PERMISSION_GRANTED
    }
    var ok by remember { mutableStateOf(allGranted()) }
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        ok = result.values.all { it }
    }

    if (ok) content() else Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("É preciso autorizar o acesso a dispositivos Bluetooth próximos para falar com o adaptador OBD.")
        Button(onClick = { launcher.launch(BLUETOOTH_RUNTIME_PERMISSIONS) }, Modifier.padding(top = 16.dp)) {
            Text("Autorizar")
        }
    }
}

@Composable
private fun P0Screen(vm: MainViewModel, onShare: () -> Unit) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { vm.loadDevices() }

    LazyColumn(
        Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("L100 Companion · P0", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(top = 16.dp))
            Text(s.status, color = MaterialTheme.colorScheme.primary)
            s.elmVersion?.let { Text("Adaptador: $it", style = MaterialTheme.typography.bodySmall) }
        }

        item { L100UploadCard(s, vm) }

        if (!s.connected) {
            item { Text("Dispositivos emparelhados", fontWeight = FontWeight.Bold) }
            items(s.devices, key = { it.address }) { d ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    RadioButton(selected = d.address == s.selectedAddress, onClick = { vm.select(d.address) })
                    Text("${d.name}  ·  ${d.address}")
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = vm::connect, enabled = !s.busy && s.selectedAddress != null) { Text("Ligar") }
                    OutlinedButton(onClick = vm::loadDevices, enabled = !s.busy) { Text("Atualizar lista") }
                    if (s.lastFiles.isNotEmpty()) OutlinedButton(onClick = onShare) { Text("Partilhar") }
                }
            }
        } else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = vm::toggleRecording) {
                        Text(if (s.recording) "Parar (${s.samples})" else "Gravar CSV")
                    }
                    OutlinedButton(onClick = vm::disconnect) { Text("Desligar") }
                    if (s.lastFiles.isNotEmpty()) OutlinedButton(onClick = onShare) { Text("Partilhar") }
                }
            }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Valores ao vivo", fontWeight = FontWeight.Bold)
                        s.live.forEach { v ->
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text(v.label); Text(v.value, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
            }
            item {
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("PIDs suportados (${s.supported.size})", fontWeight = FontWeight.Bold)
                        s.supported.filterNot(Pids::isBlockMarker).forEach { pid ->
                            Text("%02X  %s".format(pid, Pids.name(pid)), fontFamily = FontFamily.Monospace, fontSize = 13.sp)
                        }
                    }
                }
            }
        }

        item { HorizontalDivider(); Text("Registo", fontWeight = FontWeight.Bold) }
        items(s.log.asReversed()) { line ->
            Text(line, fontFamily = FontFamily.Monospace, fontSize = 11.sp)
        }
    }
}

/**
 * Configuração + estado do envio direto para a L100 (substitui o Torque Pro).
 * O Vehicle ID e a chave são os mesmos que já usas na URL de "Upload to webserver"
 * do Torque Pro — copia-os de lá, não precisas de descobrir nada de novo.
 */
@Composable
private fun L100UploadCard(s: UiState, vm: MainViewModel) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Enviar para a L100 (sem Torque)", fontWeight = FontWeight.Bold)
                Switch(checked = s.uploadEnabled, onCheckedChange = vm::setUploadEnabled)
            }
            OutlinedTextField(
                value = s.vehicleId,
                onValueChange = vm::setVehicleId,
                label = { Text("Vehicle ID (da L100)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = s.uploadKey,
                onValueChange = vm::setUploadKey,
                label = { Text("Chave (a mesma do Torque Pro)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = s.endpoint,
                onValueChange = vm::setEndpoint,
                label = { Text("Endpoint (normalmente não precisas de mudar)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            if (s.uploadStatus.isNotEmpty()) {
                Text(s.uploadStatus, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
