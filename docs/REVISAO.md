# Revisão crítica — Diagnóstico OBD por viagem

**Estado:** revisão aprovada pelo utilizador; PDF implementado e release em validação.

## Conclusão executiva

As fases de captura, análise e interface estão implementadas em grande parte e a validação automatizada passou. A revisão encontrou, e corrigiu antes desta entrega, quatro problemas: valores `null` eram convertidos em zero ao calcular baselines; o listener de alertas do visor ao vivo estava fora do âmbito correto; o pedido HTTP podia terminar antes de a tentativa de envio FCM concluir; e a viagem mais recente não era diagnosticada até começar outra.

Para fechar a lacuna da viagem mais recente, foi escolhida a finalização explícita pelo utilizador: o botão “Terminar viagem” pede confirmação de que o veículo está estacionado e chama uma callable autenticada que valida a propriedade, processa o check-up e marca a viagem como finalizada. As leituras seguintes são encaminhadas para um segmento novo. O teste de integração no Emulator cobre autorização, finalização e segmentação posterior. Esta solução depende de o utilizador terminar a viagem na interface; não finaliza automaticamente uma viagem abandonada sem essa ação.

O PDF foi implementado com pré-visualização, filtros de período, seleção de secções, tabelas, gráfico mensal, paginação A4 e fallback de impressão para guardar como PDF sem a biblioteca disponível. Não houve deploy nem validação visual com uma conta de produção.

## Achados e recomendações

| ID | Severidade | Evidência e impacto | Recomendação |
|---|---|---|---|
| F-01 | Resolvido com ressalva — funcional | A callable `finalizeCurrentVehicleTrip` valida autenticação e propriedade do veículo, processa a viagem OBD atual e grava `diagnosticoProcessadoEm`/`tripFinalizadaEm` ([tripDetector.js#L297](../functions/tripDetector.js#L297), [tripDetector.js#L270](../functions/tripDetector.js#L270)). O visor apresenta “Terminar viagem” com confirmação de veículo estacionado ([tripLive.js#L286](../js/modules/tripLive.js#L286)). O teste Emulator verifica também que leituras posteriores iniciam um segmento ([tripFinalization.emulator.test.js](../functions/test/tripFinalization.emulator.test.js)). | A finalização é explícita, não automática: se o utilizador não carregar no botão, a viagem pode continuar sem check-up final. A interface indica a ação necessária; monitorizar utilização antes de considerar automatização por inatividade. |
| F-02 | Média — fiabilidade | O estado de alerta e `lastSentAt` são persistidos durante a transação ([diagnostics.js#L131](../functions/diagnostics.js#L131), [diagnostics.js#L140](../functions/diagnostics.js#L140)); o envio FCM ocorre depois. O pedido agora aguarda as tentativas ([torque.js#L269](../functions/torque.js#L269)), mas uma falha de envio é apenas registada e o cooldown pode impedir nova tentativa durante 30 minutos. | Considerar uma outbox durável com retentativas e chave de idempotência, especialmente para alertas críticos. |
| F-03 | Média — custo/escala | A leitura da sessão OBD é feita sem limite nem paginação ([tripDetector.js#L141](../functions/tripDetector.js#L141), [tripDetector.js#L147](../functions/tripDetector.js#L147)). Uma sessão longa pode consumir muitas leituras, memória e tempo de execução. | Medir sessões reais; depois, paginar ou agregar as leituras sem perder a janela temporal e os critérios de qualidade. Definir também uma política de retenção para leituras brutas. |
| F-04 | Média — segurança operacional | O endpoint aceita a chave de upload em parâmetros HTTP, incluindo query string ([torque.js#L19](../functions/torque.js#L19), [torque.js#L47](../functions/torque.js#L47)). A chave é removida antes da persistência dos parâmetros ([torque.js#L62](../functions/torque.js#L62), [torque.js#L124](../functions/torque.js#L124)), mas URLs podem ser registados por clientes, proxies ou ferramentas externas. Não foi observada fuga concreta. | Preferir Basic Auth se compatível com a configuração Torque, evitar URLs com segredo e planear rotação. Não remover a compatibilidade atual sem confirmar os dispositivos configurados. |
| F-05 | Média — privacidade/custo | As leituras guardam parâmetros OBD brutos e valores interpretados ([torque.js#L115](../functions/torque.js#L115)); não foi encontrada política de expiração/eliminação de histórico. O volume e o custo crescem com a frequência de amostragem e o tempo de retenção. | Definir retenção e consentimento para dados de localização/OBD antes de ativar purga automática; estimar custos com volume real e região Firebase. |
| F-06 | Resolvido — release | A aplicação usa cache e referências versionadas `v36`; o Service Worker pré-carrega os módulos do relatório e as bibliotecas PDF, e serve estas duas bibliotecas do cache offline quando necessário ([service-worker.js](../service-worker.js), [estatisticas.html](../pages/estatisticas.html)). | Validar a instalação do novo Service Worker após o deploy e confirmar que os recursos são atualizados nos clientes existentes. |
| F-07 | Baixa — manutenção | O Emulator Suite carregou as funções, mas a CLI reportou que a dependência local `firebase-functions` está desatualizada. O código carregou com Node 22; a função agendada foi ignorada porque o Pub/Sub Emulator não estava ativo. | Rever a versão suportada e os avisos de segurança/compatibilidade antes da release; não atualizar dependências sem executar os testes e validar o deploy. |

## Segurança e acesso a dados

- As regras permitem acesso às subcoleções do veículo apenas ao utilizador proprietário; `baselines` permite leitura do proprietário e bloqueia escrita direta pelo cliente ([firestore.rules#L104](../firestore.rules#L104)).
- A callable de recálculo exige autenticação e valida `userId` do veículo antes de ler/gravar baselines ([tripDetector.js#L217](../functions/tripDetector.js#L217)).
- O DTC manual é gravado na subcoleção protegida pelas regras do veículo. O conteúdo é apresentado com escape no cliente; a descrição é assumida como indicativa, não como diagnóstico OEM.
- O Emulator Suite foi iniciado com projeto `demo-omeucarro`, sem acesso a serviços de produção. Não existe, contudo, teste automatizado de autorização entre dois utilizadores para estas regras; o arranque do emulador não substitui esse teste.
- A revisão é estática e funcional, não uma auditoria de penetração. Não foram observados dados reais de clientes nem confirmada a configuração de segredos no projeto Firebase de produção.

## Custos Firestore — avaliação qualitativa

- Cada leitura recebida cria/atualiza documentos de leitura e do veículo; o trigger de viagem mantém o acumulado.
- Ao iniciar uma viagem, a aplicação atualiza o perfil consultando até 10 viagens, procura uma viagem por finalizar entre até 6, lê a baseline e pode consultar todas as leituras dessa viagem. A notificação do resumo consulta ainda até 3 viagens, o veículo e tokens FCM.
- O recálculo manual limita a consulta a 50 viagens, lê as baselines existentes e grava o novo conjunto em batch.
- As regras consultam o documento-pai do veículo para autorizar subcoleções. O custo efetivo depende do padrão de cache das regras e do volume de operações.
- Não é responsável estimar um valor monetário sem contagens reais, região, retenção e preços do projeto. Antes da release, medir leituras por viagem, documentos armazenados e invocações de Functions.

## Duplo check dos requisitos

| Requisito | Estado | Evidência / limite da verificação |
|---|---|---|
| REQ-001 — PIDs, ausência de dados e timestamp | Implementado; testes passam | Parser e testes cobrem PIDs disponíveis/ausentes, zero e normalização; as duas cópias de `TripMetrics` são comparadas. |
| REQ-002 — perfil de disponibilidade | Implementado; testes passam | O perfil agrega apenas campos observados nas viagens recentes. |
| REQ-003 — qualidade da viagem | Implementado; testes passam | Cobertura, intervalo e gaps são testados; a limitação de finalização indicada em F-01 aplica-se à viagem ainda aberta. |
| REQ-004 — regras, persistência e cooldown | Parcialmente verificado | Testes unitários cobrem persistência, histerese, cooldown e gaps; não há teste de integração de alertas em Firestore/FCM. |
| REQ-005 — alertas críticos e FCM | Parcialmente verificado | Regras e estado persistido têm testes; tentativa FCM é aguardada, mas não testada com tokens reais nem protegida por outbox. |
| REQ-006 — check-up por viagem | Implementado com finalização explícita | A callable autenticada calcula e persiste o check-up e fecha a viagem; a integração Emulator valida proprietário, viagem finalizada e segmento para leituras posteriores. Depende de o utilizador carregar em “Terminar viagem”. |
| REQ-007 — baseline mediana/MAD | Implementado; testes unitários passam | Inclui mínimo de cinco viagens e callable autenticada; não foi feito teste da callable com dados/autorização no emulador. |
| REQ-008 — DTC/manual | Implementado com ressalva | O fluxo Torque observado não fornece DTC; existe registo manual. A descrição exata continua dependente do fabricante. |
| REQ-009 — resumo de saúde | Implementado; falta verificação visual autenticada | Código apresenta saúde, qualidade e achados; o browser não foi validado contra uma conta/veículo real. |
| REQ-010 — visor ao vivo | Implementado; teste de regressão passa | Visor mantém velocidade, RPM, temperatura e tensão; o teste confirma que o listener de alertas é registado e atualiza o banner. |
| REQ-011 — painel PDF | Implementado; testes focados passam | Filtros de período, seleção de veículo herdada, escolha de secções e pré-visualização; os dados são carregados apenas para veículos do utilizador autenticado. |
| REQ-012 — PDF A4 | Implementado; testes focados passam | jsPDF/AutoTable com paginação, cabeçalho/rodapé, tabelas, gráfico de custos, metodologia e fallback de impressão; os recursos PDF entram no cache do Service Worker. |
| REQ-013 — revisão crítica | Concluído neste documento | Inclui evidências, severidade, riscos, custos e recomendações. |
| REQ-014 — testes | Parcial | 43 testes passaram no Emulator Suite, incluindo finalização/segmentação de viagem e casos de cálculo/intervalo do relatório. Não foram executados testes de regras com utilizadores, browser autenticado ou amostras OBD reais. |
| REQ-015 — compatibilidade e limites | Parcialmente verificado | Testes verificam campos compatíveis, valores ausentes e separação diesel/gasolina; falta validação com dados reais do veículo. |
| REQ-016 — versão da aplicação/Service Worker | Implementado | Release da aplicação atualizada para v3.1; cache e referências do Service Worker atualizadas para v36. |
| REQ-017 — verificação, commit, push e deploy | Em curso | Testes e verificações de código passaram; commit, push e deploy ficam pendentes da execução final desta release. |

## Validações executadas

- `npm --prefix functions test`: **39 testes passaram, 0 falharam, 1 teste de integração foi ignorado** por exigir o Emulator Suite.
- `npm --prefix functions test`: **42 testes passaram, 0 falharam, 1 teste Emulator foi ignorado** por exigir o Emulator Suite.
- `firebase emulators:exec --only functions,firestore --project demo-omeucarro "npm --prefix functions test"`: **43 testes passaram, 0 falharam**, incluindo finalização/segmentação da viagem e cálculos do relatório. O Pub/Sub Emulator não foi iniciado; a função agendada não foi exercitada.
- `node --check` nos ficheiros JavaScript alterados: sem erros. `git diff --check` validado com `core.whitespace=cr-at-eol` devido às terminações CRLF históricas nos ficheiros de autenticação.
- URLs CDN do jsPDF 2.5.1 e AutoTable 3.8.4 verificadas com HTTP 200.
- O Emulator Suite carregou as funções, incluindo `finalizeCurrentVehicleTrip`. A CLI continua a alertar que `firebase-functions` está desatualizada; não foi atualizada nesta fase.
- Não houve deploy, teste com dados de produção, comparação autenticada com as regras publicadas no Firebase Console, nem teste visual numa sessão autenticada.

## Gate de aprovação

**Revisão aprovada. T016–T019 concluídos.** F-01 foi resolvido pela finalização explícita, com a ressalva de que exige ação do utilizador. Commit, push e deploy são o passo final pendente após esta validação.
