# 🏎️ L100 - Gestão Inteligente de Veículos

**L100** é uma Progressive Web App (PWA) de alta performance desenhada para entusiastas e gestores de veículos que procuram controlo total sobre consumos, custos e manutenção.

O projeto combina uma interface premium com um backend reativo (Firebase), oferecendo uma experiência nativa diretamente no browser ou instalada no telemóvel.

---

## 🚀 Funcionalidades Principais

### 📊 Analytics & Insights Avançados

- **Dashboard Multinível**: Visualização instantânea de gastos totais, litros consumidos e eficiência (L/100km, km/L ou MPG).
- **Gráficos Dinâmicos**: Evolução de preços, distribuição por tipo de combustível e ranking de postos mais económicos.
- **Análise de Tendências**: Insights automáticos que comparam o desempenho do veículo mês a mês.

### 🔔 Sistema de Alertas Proativo

- **Notificações Inteligentes**: Alertas automáticos para validade de Seguro, IUC e Inspeção Periodica (IPO).
- **Plano de Manutenção**: Notificações baseadas em quilometragem e tempo para revisões, óleo, travões e outros consumíveis.
- **Push Notifications (PWA)**: Notificações em tempo real tanto em dispositivos desktop como mobile (iOS/Android).

### 📍 Mapa & Localização

- **Gestão de Favoritos**: Guarda os teus postos, garagens ou destinos frequentes.
- **Simulador de Viagens**: Calculadora integrada de custo de viagem baseada no teu consumo médio real e preços atuais.
- **Integração GPS**: Navegação direta para os teus pontos de interesse.

### ❤️ Saúde & Viagens

- **Live Dashboard (OBD-II)**: Monitorização em tempo real de L/100, RPM, Temp. Motor, Carga e Bateria via conexão com Torque Pro.
- **Histórico de Viagens**: Registo automático de cada percurso com estatísticas de consumo, velocidade média e custo estimado.
- **Diagnóstico Inteligente**: Alertas visuais para temperaturas anómalas ou voltagem da bateria abaixo do normal.

### 📱 Experiência PWA Premium

- **Modo Offline**: Funciona sem internet para consulta de dados críticos.
- **Sincronização em Nuvem**: Dados seguros e sincronizados entre múltiplos dispositivos via Firestore.
- **Dark Mode Nativo**: Interface otimizada para visibilidade em qualquer condição de luz.

---

## 🔌 Integração OBD-II (Torque Pro)

O **L100** suporta integração nativa com a app **Torque Pro** (Android) para receber dados da ECU do veículo em tempo real.

### Como Configurar:

1.  No **Torque Pro**, ir a **Settings** > **Data Logging & Upload**.
2.  Ativar **Upload to Webserver**.
3.  Em **Webserver URL**, colocar o endpoint da Cloud Function:
    `https://<region>-<project-id>.cloudfunctions.net/uploadTorqueData?vehicleId=<ID_DO_VEICULO>&key=<SECRET_KEY>`
4.  Certificar que os PIDs de **Speed**, **RPM**, **Fuel Level** e **Intake Temp** estão ativos.

**Resultados:**

- **Ao Vivo**: A app atualiza a cada 2-5 segundos.
- **Viagens**: Ao desligar o carro, uma nova viagem é guardada no histórico.

---

## 🛠️ Stack Tecnológica

- **Frontend**: HTML5 Semantic, CSS3 Custom Properties (Vanilla), JS Puro (ES6+).
- **Frameworks Visuais**: Charts.js para visualização, Leaflet para mapas.
- **Backend / BaaS**:
  - **Firebase Auth**: Gestão de identidade segura.
  - **Firestore**: Base de dados NoSQL em tempo real.
  - **Cloud Functions (V2)**: Processamento de dados OBD e alertas.
  - **Firebase Messaging (FCM)**: Infraestrutura de notificações push.
- **PWA**: Service Workers com estratégias de cache dinâmicas (v14).

---

## 📦 Estrutura do Projeto

```text
├── css/                # Temas e folhas de estilo modulares
├── js/                 # Lógica de negócio e integrações Firebase
│   ├── veiculo.js       # Gestão de dados do veículo, OBD e UI reativa
│   ├── notifications.js # Sistema central de notificações e permissões
│   ├── analytics.js     # Motores de cálculo de eficiência
│   └── mapa.js         # Integração Leaflet e Geocoding
├── functions/          # Backend (Node.js) para processamento OBD e alertas
│   ├── torque.js        # Parser e gravação de dados Torque Pro
│   └── index.js        # Entry point das funções
├── index.html          # Gateway e Loader da aplicação
└── manifest.json       # Configuração da instalação PWA
```

---

## 📈 Potencial de Expansão

O L100 está preparado para integrar:

- **OBD-II Integration**: Leitura de dados reais do motor via Bluetooth.
- **API de Preços**: Sincronização automática com preços de combustível em tempo real.
- **Gestão de Frotas**: Suporte para equipas e partilha de faturas.

---

**L100** - _Porque cada quilómetro conta._
