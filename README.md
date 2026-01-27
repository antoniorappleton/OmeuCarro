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

### 📱 Experiência PWA Premium

- **Modo Offline**: Funciona sem internet para consulta de dados críticos.
- **Sincronização em Nuvem**: Dados seguros e sincronizados entre múltiplos dispositivos via Firestore.
- **Dark Mode Nativo**: Interface otimizada para visibilidade em qualquer condição de luz.

---

## 🛠️ Stack Tecnológica

- **Frontend**: HTML5 Semantic, CSS3 Custom Properties (Vanilla), JS Puro (ES6+).
- **Frameworks Visuais**: Charts.js para visualização, Leaflet para mapas.
- **Backend / BaaS**:
  - **Firebase Auth**: Gestão de identidade segura.
  - **Firestore**: Base de dados NoSQL em tempo real.
  - **Cloud Functions (V2)**: Lógica de servidor agendada para alertas diários.
  - **Firebase Messaging (FCM)**: Infraestrutura de notificações push.
- **PWA**: Service Workers com estratégias de cache dinâmicas (v14).

---

## 📦 Estrutura do Projeto

```text
├── css/                # Temas e folhas de estilo modulares
├── js/                 # Lógica de negócio e integrações Firebase
│   ├── notifications.js # Sistema central de notificações e permissões
│   ├── analytics.js     # Motores de cálculo de eficiência
│   └── mapa.js         # Integração Leaflet e Geocoding
├── functions/          # Backend (Node.js) para processamento de alertas
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
