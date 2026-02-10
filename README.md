# 🚗 L100 - Gestão Inteligente de Veículos

> Aplicação web progressiva (PWA) para gestão completa do seu veículo com integração OBD-II em tempo real.

[![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![PWA](https://img.shields.io/badge/PWA-Ready-5A0FC8?style=flat&logo=pwa)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 📋 Índice

- [Funcionalidades](#-funcionalidades)
- [Integração OBD-II](#-integração-obd-ii-torque-pro)
- [Instalação](#-instalação)
- [Configuração](#-configuração)
- [Utilização](#-utilização)
- [Arquitetura](#-arquitetura)
- [Troubleshooting](#-troubleshooting)

---

## ✨ Funcionalidades

### 🚙 Gestão de Veículos

- **Multi-veículo**: Gerir múltiplos veículos numa única conta
- **Perfil Completo**: Marca, modelo, matrícula, ano, combustível
- **Odómetro em Tempo Real**: Atualização automática via OBD-II
- **Nível de Combustível**: Monitorização em tempo real
- **Favoritos**: Marcar veículos favoritos para acesso rápido

### ⛽ Gestão de Abastecimentos

- **Registo Manual**: Adicionar abastecimentos com data, km, litros e custo
- **Cálculo Automático de Consumo**: L/100km baseado em dados reais
- **Histórico Completo**: Visualizar todos os abastecimentos por veículo
- **Estatísticas**: Consumo médio, custo por km, tendências

### 🔧 Gestão de Manutenções

- **Planos de Manutenção**: Criar planos personalizados (ex: revisão a cada 15.000 km)
- **Alertas Automáticos**: Notificações quando a manutenção está próxima
- **Histórico de Reparações**: Registar todas as intervenções
- **Categorias**: Organizar por tipo (motor, travões, pneus, etc.)
- **Anexos**: Adicionar documentos e faturas

### 📊 Integração OBD-II (Torque Pro)

- **Dados em Tempo Real**: RPM, velocidade, temperatura, carga do motor
- **Viagens Automáticas**: Deteção e criação automática de viagens
- **Consumo Instantâneo**: L/100km em tempo real
- **Consumo Médio por Viagem**: Cálculo automático
- **Histórico de Leituras**: Todas as métricas OBD guardadas
- **Sincronização Automática**: Odómetro e combustível atualizados automaticamente

### 📱 PWA (Progressive Web App)

- **Instalável**: Adicionar ao ecrã inicial (Android/iOS)
- **Offline**: Funciona sem internet (dados em cache)
- **Notificações Push**: Alertas de manutenção e lembretes
- **Responsivo**: Otimizado para telemóvel, tablet e desktop

---

## 🔌 Integração OBD-II (Torque Pro)

### Requisitos

- **Torque Pro** (Android) - [Download](https://play.google.com/store/apps/details?id=org.prowl.torque)
- **Adaptador OBD-II Bluetooth/WiFi** compatível
- **Veículo com porta OBD-II** (carros fabricados após 2001)

### Configuração do Torque Pro

#### 1. Configurar URL do Servidor

1. Abrir **Torque Pro**
2. Ir a **Settings → Data Logging & Upload**
3. Configurar:
   - **Upload to webserver**: ✅ Ativo
   - **Webserver URL**:
     ```
     https://us-central1-omeucarro-d3889.cloudfunctions.net/uploadTorqueData?vehicleId=SEU_VEHICLE_ID&key=79051526
     ```
   - **Web Logging Interval**: `5 Seconds` (recomendado)
   - **Send https: Bearer Token**: ❌ Desativado

#### 2. Obter o Vehicle ID

1. Abrir a **L100** no browser
2. Ir à página do veículo
3. O `vehicleId` está no URL: `https://omeucarro-d3889.web.app/veiculo.html?id=ESTE_É_O_ID`
4. Copiar o ID e substituir `SEU_VEHICLE_ID` no URL do Torque Pro

#### 3. Configurar PIDs Essenciais

Para máxima compatibilidade, configurar estes PIDs no Torque Pro:

| PID      | Nome                       | Descrição                      |
| -------- | -------------------------- | ------------------------------ |
| `0d`     | Speed (OBD)                | Velocidade                     |
| `0c`     | Engine RPM                 | Rotações do motor              |
| `05`     | Engine Coolant Temperature | Temperatura do motor           |
| `04`     | Engine Load                | Carga do motor                 |
| `2f`     | Fuel Level                 | Nível de combustível           |
| `a6`     | Odometer (from ECU)        | Odómetro                       |
| `ff1204` | Trip Distance              | **Distância da viagem** ⭐     |
| `ff1208` | Trip average L/100 KM      | **Consumo médio da viagem** ⭐ |
| `ff12a5` | Boost Pressure             | Pressão do Turbo               |
| `ff1271` | Fuel used (trip)           | Combustível gasto na viagem    |
| `ff1226` | Horsepower (At the wheels) | Potência                       |
| `ff1225` | Torque                     | Binário                        |

**⭐ PIDs Essenciais** para deteção automática de viagens e cálculo de consumo.

### Funcionalidades OBD

#### 📊 Modal OBD → Tab "Ao Vivo"

Mostra métricas em **tempo real** (atualiza a cada 5 segundos):

- **RPM** - Rotações do motor
- **Velocidade** - km/h
- **Temperatura Motor** - °C (com alertas se > 105°C)
- **Carga Motor** - %
- **Bateria** - Volts (com alerta se < 11.8V)
- **Pressão do Turbo** - bar/psi
- **Gasto na Viagem** - Litros
- **MAF** - Mass Air Flow (g/s)
- **Binário** - Nm
- **Potência** - HP

#### 🚗 Modal OBD → Tab "Última"

Resumo da **última viagem completada**:

- **Distância** - Km percorridos
- **Consumo Médio** - L/100km
- **Duração** - Minutos
- **Velocidade Média** - km/h
- **Temperatura Máxima** - °C

#### 📈 Modal OBD → Tab "Histórico"

Lista de todas as **viagens anteriores** com:

- Data e hora
- Distância percorrida
- Consumo médio
- Duração
- Filtros e ordenação

#### 🎯 Hero Section (Atualização Automática)

No topo da página do veículo:

- **Odómetro** - Atualiza automaticamente com base no Trip Distance
- **Nível de Combustível** - Percentagem em tempo real

### Como Funciona

```
Torque Pro (telemóvel)
    ↓ HTTP POST (cada 5 segundos)
Cloud Function: uploadTorqueData
    ↓ Guarda em Firestore
Subcoleção: leiturasObd
    ↓ Trigger onCreate
Cloud Function: processOBDReading
    ↓ Processa e agrega dados
Coleção: viagens
    ↓ Listener onSnapshot
L100 Frontend
    ↓ Atualiza UI em tempo real
```

### Deteção Automática de Viagens

O sistema cria viagens automaticamente quando:

1. **Motor ligado** (RPM > 0)
2. **Veículo em movimento** (Speed > 0)
3. **Trip Distance > 0**

**Deteção e Agrupamento (Nível Pro):**

- **Âncora de Sessão**: O sistema usa o `sessionId` do Torque Pro como identificador único da viagem.
- **Continuidade Pro**: Pausas longas (ex: 20-30 min) com motor desligado **não** dividem a viagem se a sessão for a mesma.
- **Resiliência a Resets**: Se o contador de distância do Torque for reiniciado (reset para 0), o sistema acumula automaticamente a nova distância sobre o total anterior da sessão.
- **Fallback**: Se o `sessionId` for nulo, as leituras são agrupadas por Dispositivo + Dia + Hora.

**Finalização de Viagem:**

- Uma viagem é considerada concluída quando o Torque Pro inicia uma **nova sessão** (novo `sessionId`).
- No modo de fallback (sem sessão), a viagem fecha após 15 minutos sem novas leituras.

### 💡 Boas Práticas de Utilização

Para obter os melhores resultados com a L100 e o Torque Pro:

1. **Arranque Automático**: Configure o Torque Pro para iniciar o logging automaticamente assim que a app abrir (**Settings → Data Logging & Upload → Automatically start logging**).
2. **Logging Contínuo**: O sistema L100 foi desenhado para consolidar toda a viagem numa única entrada. **Não pare e recomece o logging manualmente** durante paragens curtas; deixe a app gerir a sessão.
3. **Sensores em Segundo Plano**: Garanta que o Torque Pro tem permissão para funcionar em segundo plano e que a otimização de bateria não interrompe o GPS/Logging.
4. **Fim da Viagem**: Para garantir que a viagem aparece imediatamente como concluída, pode fechar a app Torque Pro (o que encerra a sessão) ou esperar pelo timeout automático se não usar Session IDs.

---
 
 ## 🔕 Notificações
 
 A L100 suporta notificações push para mantê-lo informado sem precisar de abrir a app constantemente.
 
 ### Como Ativar
 
 1. Abrir a **L100** no telemóvel (preferencialmente instalada como PWA).
 2. Ir ao **Perfil** ou procurar o botão **"Ativar Notificações"** no dashboard.
 3. Aceitar o pedido de permissão do browser.
 4. No Windows/Android, garantir que as notificações do Chrome/Edge não estão bloqueadas nas definições do sistema.
 
 ### Tipos de Alertas
 
 - **🏁 Fim de Viagem**: Recebe um resumo (KM e L/100) assim que termina uma viagem.
 - **⚠️ Alertas de Saúde**: Notificação imediata se a temperatura do motor subir excessivamente (>105°C) ou se a bateria estiver fraca (<11.8V).
 - **📅 Manutenção**: Lembretes de revisões, seguro e IUC a expirar.
 
 ---
 
 ## 🚀 Instalação

### Pré-requisitos

- **Node.js** 18+ e npm
- **Firebase CLI**: `npm install -g firebase-tools`
- **Conta Firebase** com projeto criado

### Setup Local

```bash
# 1. Clonar repositório
git clone https://github.com/seu-usuario/oMeuCarro.git
cd oMeuCarro

# 2. Instalar dependências das Cloud Functions
cd functions
npm install
cd ..

# 3. Login no Firebase
firebase login

# 4. Selecionar projeto
firebase use --add

# 5. Configurar segredos (chave de autenticação do Torque Pro)
firebase functions:secrets:set TORQUE_UPLOAD_KEY
# Quando solicitado, inserir: 79051526

# 6. Deploy
firebase deploy
```

### Estrutura do Projeto

```
oMeuCarro/
├── public/                 # Frontend (HTML, CSS, JS)
│   ├── index.html         # Página inicial
│   ├── veiculos.html      # Lista de veículos
│   ├── veiculo.html       # Detalhes do veículo
│   ├── css/
│   │   └── styles.css     # Estilos globais
│   └── js/
│       ├── auth.js        # Autenticação Firebase
│       ├── veiculos.js    # Gestão de veículos
│       └── veiculo.js     # Detalhes e OBD
├── functions/             # Cloud Functions (Backend)
│   ├── index.js          # Entry point
│   ├── torque.js         # Receção de dados OBD
│   ├── tripDetector.js   # Deteção de viagens
│   └── package.json
├── firestore.rules       # Regras de segurança
├── firestore.indexes.json # Índices do Firestore
└── firebase.json         # Configuração Firebase
```

---

## ⚙️ Configuração

### Firebase

1. **Firestore Database**
   - Modo: Production
   - Localização: `europe-west1` (recomendado para Portugal)

2. **Authentication**
   - Ativar **Email/Password**
   - Configurar domínio autorizado

3. **Hosting**
   - Deploy automático via `firebase deploy`

4. **Cloud Functions**
   - Região: `us-central1`
   - Runtime: Node.js 22

### Variáveis de Ambiente

Criar ficheiro `.env` na pasta `functions/`:

```env
TORQUE_UPLOAD_KEY=79051526
```

---

## 📖 Utilização

### Adicionar Veículo

1. Login na aplicação
2. Clicar em **"+ Adicionar Veículo"**
3. Preencher dados:
   - Marca, modelo, matrícula
   - Ano, combustível
   - Odómetro inicial
4. Guardar

### Registar Abastecimento

1. Abrir página do veículo
2. Clicar em **"Abastecimentos"** → **"+"**
3. Preencher:
   - Data
   - Km atuais
   - Litros
   - Custo total
4. O consumo é calculado automaticamente

### Criar Plano de Manutenção

1. Abrir página do veículo
2. Clicar em **"Manutenções"** → **"Planos"** → **"+"**
3. Configurar:
   - Nome (ex: "Revisão")
   - Intervalo em km (ex: 15000)
   - Ou intervalo em meses (ex: 12)
4. Sistema cria alertas automaticamente

### Ativar Integração OBD

1. Obter `vehicleId` do URL da página do veículo
2. Configurar Torque Pro (ver [Integração OBD-II](#-integração-obd-ii-torque-pro))
3. Ligar ao OBD-II
4. Abrir Torque Pro
5. Dados aparecem automaticamente na L100!

---

## 🏗️ Arquitetura

### Frontend

- **Vanilla JavaScript** (sem frameworks)
- **Firebase SDK** para autenticação e Firestore
- **Service Worker** para PWA e cache offline
- **Responsive Design** com CSS Grid e Flexbox

### Backend (Cloud Functions)

#### `uploadTorqueData`

- **Trigger**: HTTP POST
- **Função**: Receber dados do Torque Pro
- **Ações**:
  1. Validar autenticação (`key`)
  2. Validar `vehicleId`
  3. Parsear PIDs do Torque Pro
  4. Criar documento em `leiturasObd`
  5. Atualizar documento do veículo (odómetro, combustível)

#### `processOBDReading`

- **Trigger**: Firestore onCreate (`leiturasObd/{id}`)
- **Função**: Processar leitura e criar/atualizar viagem
- **Ações**:
  1. Extrair métricas (speed, rpm, tripDistance, tripL100)
  2. Procurar viagem ativa (por `sessionId` ou temporal)
  3. Criar nova viagem ou atualizar existente
  4. Calcular agregações (distância total, consumo médio, etc.)
  5. Sincronizar `ultimasMetricas` ao documento do veículo

### Base de Dados (Firestore)

```
veiculos/
  {vehicleId}/
    - marca, modelo, matricula
    - odometroAtual
    - nivelCombustivel
    - ultimasMetricas: { distancia, consumoMedio, sessionId }

    abastecimentos/
      {id}/
        - data, km, litros, custo

    manutencoes/
      {id}/
        - tipo, descricao, km, custo

    leiturasObd/
      {id}/
        - timestamp, sessionId
        - parsed: { speed, rpm, odometer, tripDistance, tripL100, ... }

    viagens/
      {id}/
        - inicio, fim
        - distancia, duracao
        - consumoMedio, velocidadeMedia
        - sessionId
```

---

## 🔧 Troubleshooting

### Torque Pro não envia dados

**Sintomas:** Sem leituras OBD na L100

**Soluções:**

1. Verificar se "Upload to webserver" está ativo
2. Confirmar URL correto (com `vehicleId` e `key`)
3. Verificar ligação OBD-II (Torque Pro deve mostrar dados)
4. Desativar "Send https: Bearer Token"
5. Verificar logs: `firebase functions:log`

### Viagens não são criadas

**Sintomas:** Leituras OBD aparecem mas sem viagens

**Causa:** Motor desligado (RPM = 0, Speed = 0)

**Solução:**

- Viagens só são criadas quando o motor está ligado e o carro em movimento
- Verificar logs: `[TripDetector] Ignorado: Nova viagem sem motor ligado`

### Odómetro não atualiza

**Sintomas:** Odómetro não muda na L100

**Verificações:**

1. Torque Pro está a enviar `Trip Distance` (PID `ff1204`)?
2. Verificar logs: `[Torque] UPDATE: ... | Odo: ...`
3. Confirmar que `setupVehicleListener` está ativo no frontend

### Consumo médio incorreto

**Sintomas:** L/100km não corresponde à realidade

**Verificações:**

1. Torque Pro está a enviar `Trip average L/100` (PID `ff1208`)?
2. Verificar se o Torque Pro está calibrado corretamente
3. Confirmar que o veículo tem sensor de consumo (alguns não têm)

### Limpeza de Dados de Teste

Para apagar todas as leituras OBD de teste:

```bash
# Opção 1: Via Cloud Function
curl -X POST "https://deepcleanuptrips-5jojqy2jpa-uc.a.run.app?vehicleId=SEU_VEHICLE_ID&deleteReadings=true&batchSize=500"

# Opção 2: Firebase Console
# 1. Ir a Firestore
# 2. veiculos/{vehicleId}/leiturasObd
# 3. Clicar nos 3 pontinhos → "Delete collection"
```

---

## 📝 Notas de Desenvolvimento


### Próximas Funcionalidades

- [ ] Adicionar consumo instantâneo no tab "Ao Vivo"
- [ ] Gráficos de consumo ao longo do tempo
- [ ] Exportar dados para CSV/PDF
- [ ] Comparação de viagens
- [ ] Suporte para múltiplos utilizadores por veículo

---

## 📄 Licença

MIT License - ver [LICENSE](LICENSE)

---

## 👨‍💻 Autor

**António Appleton**

- GitHub: [@antoniorappleton](https://github.com/antoniorappleton)

---

## 🙏 Agradecimentos

- [Firebase](https://firebase.google.com/) - Backend as a Service
- [Torque Pro](https://torque-bhp.com/) - App OBD-II
- Comunidade open-source

---

**Versão:** 1.0.1  
**Última Atualização:** 10/02/2026 (Manual e Alertas Push)
