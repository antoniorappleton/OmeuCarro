# 🚗 L100 - Gestão Inteligente de Veículos

O **L100** é uma Progressive Web App (PWA) de alto desempenho desenhada para simplificar a gestão total do seu veículo. Combinando um design premium glassmórfico com funcionalidades avançadas de geolocalização e PWA, o L100 coloca o controlo total do seu carro na palma da sua mão.

---

## ✨ Funcionalidades Principais (v2.8)

- **💎 Design Premium Glassmórfico**: Interface moderna e fluida com suporte total nativo para **Modo Escuro** e **Modo Claro**, focada na facilidade de uso em dispositivos móveis.
- **🗺️ Mapa & Localização Avançada**:
  - Favoritos com geocoding automático (Nominatim API).
  - Sugestões inteligentes de nomes de locais e autocomplete de moradas.
  - Simulador de custos de viagem direto no mapa.
- **📊 Monitorização Real (OBD-II)**: Integração via Torque Pro para leitura de telemetria em tempo real (RPM, velocidade, combustível).
- **🛠️ Gestão de Manutenções**: Controlo de prazos de Seguro, IUC e IPO com notificações inteligentes.
- **⛽ Histórico de Abastecimentos**: Análise detalhada de consumos (L/100km) e gastos acumulados por veículo.
- **📱 PWA de Última Geração**:
  - Instalação como App nativa.
  - Suporte Offline robusto com Service Worker v28.
  - Cache versionado para atualizações instantâneas.

---

## 🏗️ Estrutura do Projeto

O projeto foi recentemente reestruturado para maior escalabilidade e performance:
- `/pages`: Templates HTML organizados.
- `/js`: Lógica modular (Core, Modules, Utils).
- `/css`: Sistema de design baseado em variáveis e utilitários premium.
- `/assets`: Ícones unificados em SVG e recursos estáticos.

---

## 🔌 Integração com Torque Pro

Para monitorização em tempo real, configure o seu **Torque Pro**:
1. Vá a **Settings → Data Logging & Upload**.
2. Ative **Upload to webserver**.
3. Configure o URL da sua instância Firebase com a chave de acesso do veículo.

---

## 👨‍💻 Autor

**António Appleton**  
📧 [antonioappleton@gmail.com](mailto:antonioappleton@gmail.com)  
🔗 GitHub: [@antoniorappleton](https://github.com/antoniorappleton)

---

## 🌐 Aceder à App

Disponível em qualquer dispositivo através do link:

👉 **[Abrir L100 App (Produção)](https://omeucarro-d3889.web.app)**
