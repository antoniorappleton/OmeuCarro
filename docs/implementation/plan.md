# Implementation Plan: Diagnóstico por viagem, alertas e relatório PDF

**Date**: 2026-11-27 | **Spec**: pedido colado pelo utilizador (“Pasted text #1”)

## Summary

Adicionar captura OBD aditiva, avaliação de qualidade por viagem, regras de saúde explicáveis, alertas críticos em tempo real, baseline robusta e exportação de relatório. Preservar `TripMetrics.toTripFields`, os documentos atuais de `leiturasObd` e as notificações FCM. O PDF (fase 5) só começa depois da aprovação da revisão da fase 4.

## Technical Context

**Language/Version**: JavaScript; Cloud Functions Node.js 22; PWA HTML/CSS/JavaScript
**Primary Dependencies**: Firebase Admin/Functions v2, Chart.js; jsPDF e jspdf-autotable para exportação, sujeitos a compatibilidade verificada
**Storage**: Firestore (`veiculos`, `leiturasObd`, `viagens`, `baselines`, `diagnosticos`)
**Testing**: `node:test` em `functions/test/`; Firebase Emulator Suite para validar regras quando disponível
**Target Platform**: PWA mobile-first e Cloud Functions Firebase
**Performance Goals**: não carregar leituras OBD brutas em relatórios históricos; evitar novas leituras desnecessárias por viagem
**Constraints**: alterações aditivas; falhas OBD >120 s continuam a interromper integração; diesel nunca usa fuel trims/lambda; valores sem dados não são simulados; linguagem indicativa; preservar dados e fluxos atuais.

## Constitution Check

Não existe uma constituição separada no repositório. Aplicam-se os princípios explícitos da especificação:
- Compatibilidade retroativa dos campos de viagem e FCM: PASS
- Apenas dados OBD disponíveis; sem estimativas de PIDs ausentes: PASS
- Diagnóstico indicativo, sem afirmar avaria confirmada: PASS
- Mudanças no esquema Firestore aditivas: PASS
- Nenhuma recomendação da revisão é implementada sem aprovação, exceto correções triviais diretamente ligadas: PASS

## Applied Guidelines

- Manter os padrões existentes de Cloud Functions v2, Firestore, módulos JavaScript vanilla e CSS do tema.
- Partilhar as mesmas funções de métricas entre browser e Functions; adicionar teste de igualdade para as duas cópias.
- Não introduzir dependências para a interface fora da geração de PDF no cliente.

## Implementation Steps

### Step 1: [Cross-cutting] Captura OBD, perfil e qualidade de dados
- **Requirements**: REQ-001, REQ-002, REQ-003, REQ-014
- **Design inputs**: `functions/torque.js`, `functions/tripMetrics.js`, `js/utils/tripMetrics.js`, `functions/test/`
- **Description**: Normalizar timestamp uma só vez; extrair PIDs/aliases explicitamente configurados; guardar perfil de campos observados e métricas de qualidade por viagem. Preservar os campos existentes e os limites de integração.

### Step 2: [Cross-cutting] Regras de saúde, baseline e notificações
- **Requirements**: REQ-004, REQ-005, REQ-006, REQ-007, REQ-008, REQ-015
- **Design inputs**: `functions/tripDetector.js`, `functions/alerts.js`, `functions/notify_utils.js`, `firestore.rules`
- **Description**: Implementar regras declarativas, persistência/histerese/gating, cooldown separado por regra, resultados explicáveis e baseline mediana/MAD. Dados insuficientes não geram alertas nem atualizam baselines. Usar outbox/estado persistido para separar transações Firestore de envio FCM. DTCs permanecem manuais se o formato Torque não os fornecer.

### Step 3: [Cross-cutting] Resumo de saúde e experiência durante a viagem
- **Requirements**: REQ-009, REQ-010, REQ-014, REQ-015
- **Design inputs**: `js/modules/veiculo.js`, `js/modules/tripLive.js`, `pages/veiculo.html`, `pages/viagem-ao-vivo.html`, `css/trip-summary.css`
- **Description**: Mostrar estado e até três achados por viagem, qualidade compacta e detalhes técnicos a pedido. Manter o visor ao vivo simples e sem interação obrigatória.

### Step 4: [Cross-cutting] Revisão crítica documentada
- **Requirements**: REQ-013, REQ-015
- **Design inputs**: código e dependências atuais, incluindo `functions/`, `js/modules/veiculo.js` e `firestore.rules`
- **Description**: Criar `docs/REVISAO.md` com evidências por ficheiro/linha, severidade, riscos de segurança e custos Firestore, recomendações ordenadas e validações pendentes. Não implementar recomendações independentes sem aprovação. A revisão tem de ser aprovada antes da fase 5.

### Step 5: [Cross-cutting] Relatório PDF no cliente (bloqueado até aprovação)
- **Requirements**: REQ-011, REQ-012, REQ-014
- **Design inputs**: `pages/estatisticas.html`, `js/modules/estatisticas.js`, modelos existentes de viagens/abastecimentos/manutenção
- **Description**: Painel de exportação com veículo/período/secções/pré-visualização; PDF A4 paginado com fontes de dados, gráficos, estado de saúde e metodologia; operar offline quando os dados resumidos já estiverem disponíveis. Iniciar apenas após aprovação de `docs/REVISAO.md`.

### Step 6: [Cross-cutting] Verificação final e release
- **Requirements**: REQ-016, REQ-017
- **Design inputs**: `service-worker.js`, `README.md`, projeto PWA e Firebase
- **Description**: Rever todos os critérios, atualizar versão PWA e caches do Service Worker de forma coerente, executar testes/builds disponíveis, fazer commit e push para GitHub e, por último, deploy das superfícies alteradas no Firebase. Não incluir alterações não relacionadas do Companion.

## Project Structure

```text
functions/
  torque.js
  tripDetector.js
  tripMetrics.js
  diagnostics.js                 (novo: regras, qualidade e baseline)
  test/
js/
  utils/tripMetrics.js
  modules/veiculo.js
  modules/tripLive.js
  modules/estatisticas.js
  modules/tripReport.js          (novo: apresentação/exportação PDF)
pages/
  veiculo.html
  estatisticas.html
css/
  trip-summary.css
docs/
  REVISAO.md
  implementation/plan.md
  implementation/checkpoints/
```

## Testing Strategy

- **appType**: mixed (PWA estática + funções Cloud Functions)
- **Critical user journeys**:
  1. Ler payload Torque com PID disponível/ausente e persistir uma leitura sem alterar o formato existente.
  2. Uma viagem com amostras adequadas produz qualidade e resultados; uma viagem com baixa cobertura não alerta nem atualiza a baseline.
  3. Alertas críticos respeitam persistência, histerese e cooldown por regra.
  4. Resumo da viagem omite indicadores sem dados e mantém compatibilidade das métricas antigas.
  5. PDF tem preview correto, intervalos vazios tratados e paginação/cabeçalhos válidos.
- **primaryValidationStack**: Node.js `node:test`; Firebase Emulator Suite para Firestore Rules e Functions; browser manual/Playwright se já configurado
- **fallbackMatrix**:
  - `infra-tier`: Firebase Emulator Suite → testes unitários puros. Prerequisite: Firebase CLI e Java para o emulador.
  - `browser-tier`: browser/Playwright disponível → revisão estática e testes de funções PDF puros. Prerequisite: ambiente browser.
- **Environment requirements**: Node.js 22, dependências em `functions/node_modules`, Firebase CLI; emuladores/browser quando disponíveis.
- **knownGaps**: sem dados reais do Logan/Torque não se certificam PIDs de fabricante, qualidade de sinal ou validade clínica dos limiares.
- **Test data strategy**: séries OBD sintéticas com timestamps determinísticos; nenhum envio FCM real em testes.
- **Acceptance criteria**: suite passa; teste de igualdade `tripMetrics.js`; casos de fronteira, diesel/gasolina, ausência de PID, persistência/cooldown e dados insuficientes cobertos.
- **Validation review expectations**: confirmar compatibilidade do formato Firestore/FCM, ausência de dados simulados e cumprimento do bloqueio de aprovação da fase 5.

## Implementation Tasks

### Phase 1 — Setup
- [ ] T001 [Plan:1.1] Registar requisitos, confirmar testes existentes e preservar alterações locais em `firestore.rules`.

### Phase 2 — Fundacional: dados e regras
- [ ] T002 [Plan:1.1] Corrigir normalização única de `timestamp` e validar payload em `functions/torque.js`.
- [ ] T003 [Plan:1.1] Acrescentar campos OBD suportados e perfil de disponibilidade em `functions/torque.js`.
- [ ] T004 [Plan:1.1] Acrescentar qualidade de dados e métricas aditivas nas duas cópias `tripMetrics.js`.
- [ ] T005 [Plan:1.1] Testar parsing, fronteiras de amostragem, qualidade e igualdade das cópias em `functions/test/`.
- [ ] T006 [Plan:2.1] Implementar motor de regras declarativo, baseline e estado persistido em `functions/diagnostics.js`.
- [ ] T007 [Plan:2.1] Integrar avaliação por viagem, cooldown por regra e envio FCM seguro em `functions/tripDetector.js` e `functions/torque.js`.
- [ ] T008 [Plan:2.1] Testar persistência, histerese, regras críticas, dados insuficientes e baseline em `functions/test/`.
- [ ] T009 [Plan:2.1] Validar e completar as regras de propriedade Firestore necessárias em `firestore.rules`.

### Phase 3 — Resumo e interface
- [ ] T010 [Plan:3.1] Guardar e apresentar diagnóstico/qualidade no resumo de viagem em `functions/tripDetector.js` e `js/modules/veiculo.js`.
- [ ] T011 [Plan:3.1] Adaptar HTML/CSS do resumo para estado, achados limitados e detalhes técnicos em `pages/veiculo.html` e `css/trip-summary.css`.
- [ ] T012 [Plan:3.1] Simplificar os valores de destaque e estados de alerta em `js/modules/tripLive.js` e `pages/viagem-ao-vivo.html`.
- [ ] T013 [Plan:3.1] Adicionar entrada manual segura de DTC e testes de compatibilidade em `pages/veiculo.html` e `js/modules/veiculo.js`.

### Phase 4 — Revisão, aprovação obrigatória antes do PDF
- [x] T014 [Plan:4.1] Produzir `docs/REVISAO.md` com evidência, severidade, segurança, custos e recomendações.
- [x] T015 [Plan:4.1] Rever todos os requisitos das fases 1–4 e pedir aprovação explícita da revisão; não iniciar T016 sem aprovação.

### Phase 5 — Exportação PDF (bloqueado até aprovação)
- [x] T016 [Plan:5.1] Implementar seletor, filtros, preview e seleção de secções em `pages/estatisticas.html`.
- [x] T017 [Plan:5.1] Gerar PDF A4 offline-capable com jsPDF/autotable e gráficos em `js/modules/tripReport.js`.
- [x] T018 [Plan:5.1] Testar cálculo de intervalo, secções, tabelas, gráficos e paginação em `functions/test/` ou testes JS existentes.

### Phase 6 — Release final (após fases aprovadas)
- [x] T019 [Plan:6.1] Atualizar versão PWA, Service Worker e referências de cache em `service-worker.js`, HTML e `README.md`.
- [x] T020 [Plan:6.1] Executar testes, verificar checklist requisito-a-requisito, confirmar diff e validar ficheiros publicados.
- [ ] T021 [Plan:6.1] Criar commit com trailer de coautoria, fazer push e só depois executar deploy Firebase autorizado.

## Requirement Mapping

| REQ ID | Description | Plan Items | Implementation Evidence |
|--------|-------------|------------|------------------------|
| REQ-001 | Extrair PIDs OBD adicionais, respeitar ausência de dados e normalizar timestamp uma vez | 1.1 | `functions/torque.js`, testes de parsing |
| REQ-002 | Guardar perfil de disponibilidade por veículo sem inventar capacidades | 1.1 | `functions/torque.js`, perfil Firestore |
| REQ-003 | Calcular qualidade por viagem e excluir dados insuficientes | 1.1, 2.1 | `functions/tripMetrics.js`, `functions/diagnostics.js` |
| REQ-004 | Regras declarativas com gating, persistência, histerese e cooldown independente | 2.1 | `functions/diagnostics.js`, testes sintéticos |
| REQ-005 | Alertas críticos em tempo real com critérios definidos e FCM | 2.1 | `functions/torque.js`, `functions/tripDetector.js` |
| REQ-006 | Check-up indicativo no fim da viagem, no máximo três achados | 2.1, 3.1 | `functions/diagnostics.js`, `js/modules/veiculo.js` |
| REQ-007 | Baseline por veículo com mediana/MAD e recalculação | 2.1 | `functions/diagnostics.js`, subcoleção `baselines` |
| REQ-008 | Verificar DTCs do Torque e oferecer registo manual quando não enviados | 2.1, 3.1 | parser, formulário em `pages/veiculo.html` |
| REQ-009 | Resumo de saúde e detalhes técnicos progressivos | 3.1 | `js/modules/veiculo.js`, `pages/veiculo.html`, CSS |
| REQ-010 | Visor ao vivo com poucos valores e sem distrações | 3.1 | `js/modules/tripLive.js`, `pages/viagem-ao-vivo.html` |
| REQ-011 | Painel PDF, filtros, preview e conteúdo executivo | 5.1 | `pages/estatisticas.html`, `js/modules/tripReport.js` |
| REQ-012 | PDF A4, paginado, offline quando possível e com metodologia | 5.1 | `js/modules/tripReport.js`, testes |
| REQ-013 | Revisão crítica com evidência, riscos e recomendações | 4.1 | `docs/REVISAO.md` |
| REQ-014 | Testes de fronteira, compatibilidade e igualdade das cópias | 1.1, 2.1, 3.1, 5.1 | `functions/test/` |
| REQ-015 | Compatibilidade aditiva, diesel/gasolina e lacunas de dados documentadas | 1.1, 2.1, 3.1, 4.1 | documentos de viagem, regras e revisão |
| REQ-016 | Atualizar versão da aplicação e cache/service worker | 6.1 | `README.md`, `service-worker.js`, HTML |
| REQ-017 | Verificação final, commit, push e deploy na ordem autorizada | 6.1 | commit Git e deploy Firebase |

## Dependencies and Gates

- T002–T005 precedem o motor de regras; T006–T009 precedem a UI de saúde.
- Fase 4 depende da conclusão e testes das fases 1–3.
- T016–T018 ficam bloqueadas até aprovação explícita de `docs/REVISAO.md`.
- Commit/push/deploy ocorrem apenas após a conclusão das fases autorizadas; preservar mudanças locais não relacionadas.
