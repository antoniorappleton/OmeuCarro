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

## Estrutura
- `obd/RfcommTransport.kt` — ligação Bluetooth clássica (3 métodos, para clones).
- `obd/Elm327Client.kt` — comandos AT, leitura até `>`, PIDs suportados, `ATRV`.
- `obd/Pids.kt` — PIDs e fórmulas.
- `MainViewModel.kt` / `MainActivity.kt` — ecrã único de teste.
- `CsvLogger.kt` — gravação `;` em `Android/data/pt.appleton.l100companion/files/logs/`.
