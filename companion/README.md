# L100 Companion (Android) — P0

Protótipo **descartável** da Fase 3 (ver `l100-companion-fase3.md` no projeto Appleton Labs).
Objetivo: provar que o telemóvel fala com o adaptador ELM327 "OBDII" e descobrir que PIDs o Dacia Logan suporta.

> Esta pasta está excluída do Firebase Hosting (`firebase.json` → `"companion/**"`).

## Compilar e instalar
1. Android Studio → **Open** → escolher a pasta `companion/` (não a raiz do L100).
2. Esperar pelo *Gradle sync* (descarrega Gradle 8.11.1, AGP 8.7.3, Kotlin 2.0.21). Se o Android Studio sugerir atualizar o AGP, pode aceitar.
3. Telemóvel com *Depuração USB* ativa → ▶ Run.

## Teste no carro
1. **Fechar o Torque** (o adaptador só aceita uma app de cada vez).
2. Ligar a ignição (motor ligado ou só ignição).
3. Abrir a app → escolher **OBDII** → **Ligar**.
4. Confirmar: lista de PIDs suportados + valores ao vivo a mudar.
5. **Gravar CSV** durante ~5 min de condução (com outra pessoa a conduzir ou telemóvel no suporte) → **Parar** → **Partilhar** (CSV + registo bruto).

## Critério de conclusão do P0
- Lista de PIDs do Logan obtida.
- RPM, velocidade e temperatura coerentes com o Torque.

## Enviar diretamente para a L100 (sem o Torque Pro)
A app já sabe falar com o mesmo endpoint que o Torque Pro usa no "Upload to
webserver" (`uploadTorqueData`, em `functions/torque.js`) — não é precisa
nenhuma alteração ao backend nem à página "Viagem ao Vivo" da L100.

1. Abrir o ecrã da app → no cartão **"Enviar para a L100 (sem Torque)"**:
   - **Vehicle ID**: o id que aparece no URL quando abres o veículo na L100
     (`veiculo.html?id=XXXXX` → copia o `XXXXX`).
   - **Chave**: a mesma password/key que já tens configurada na URL de
     "Upload to webserver" do Torque Pro (campo `key=` ou `password=` dessa
     URL — é o segredo `TORQUE_UPLOAD_KEY`).
   - **Endpoint**: já vem preenchido (`uploadTorqueData`, região
     `us-central1`); só mudar se o projeto tiver outra região.
2. Ligar o interruptor. Só tem efeito depois de **Ligar** ao adaptador.
3. Ligar ao OBDII como habitualmente. Os valores são enviados no máximo a
   cada 2s (RPM, velocidade, temp. motor, carga do motor, MAF, temp.
   admissão, nível de combustível, odómetro, tensão — os que o carro
   suportar). O estado do envio aparece por baixo do endpoint.
4. Confirmar na L100: Veículo → **Viagem ao Vivo** deve atualizar ao vivo,
   tal como já acontecia com o Torque.

Nota: o adaptador OBD só aceita uma ligação de cada vez — continua a não
poderes ter o Torque Pro aberto ao mesmo tempo.

## Estrutura
- `obd/RfcommTransport.kt` — ligação Bluetooth clássica (3 métodos, para clones).
- `obd/Elm327Client.kt` — comandos AT, leitura até `>`, PIDs suportados, `ATRV`.
- `obd/Pids.kt` — PIDs e fórmulas.
- `net/L100Uploader.kt` — envio HTTP para `uploadTorqueData`, usando os mesmos
  códigos curtos de PID que o Torque Pro (`DEFAULT_PIDS` em `functions/torque.js`).
- `MainViewModel.kt` / `MainActivity.kt` — ecrã único de teste.
- `CsvLogger.kt` — gravação `;` em `Android/data/pt.appleton.l100companion/files/logs/`.

## Ecrã desligado / segundo plano (v0.0.3)
Depois de **Ligar**, a leitura corre num serviço em primeiro plano (notificação
"L100 Companion" com o estado e um botão **Desligar**), com WakeLock parcial —
continua com o ecrã apagado ou com outra app à frente (ex.: GPS).
- No cartão **"Ecrã desligado / segundo plano"**, autorizar notificações e
  **"Permitir correr sem restrições de bateria"** (sem isto alguns fabricantes
  matam o serviço).
- Se o adaptador perder a ligação (ex.: ao dar à chave), a app volta a ligar
  sozinha (2s, 4s… até 10s) até carregar em **Parar/Desligar**.
