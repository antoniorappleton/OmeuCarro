const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Função agendada para correr todos os dias às 09:00 AM.
 * Verifica Seguros, IUCs e Inspeções a expirar.
 */
exports.checkVehicleAlertsV2 = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Europe/Lisbon",
    region: "us-central1", // Garantir consistência de região
  },
  async (event) => {
    console.log("A iniciar verificação diária de alertas (v2)...");

    const hoje = new Date();
    // Normalizar hoje para o início do dia (00:00:00) na timezone de execução
    const hojeNormalizado = new Date(
      hoje.getFullYear(),
      hoje.getMonth(),
      hoje.getDate(),
    );

    const prazosAviso = [30, 15, 7, 3, 1];

    try {
      const veiculosSnapshot = await db.collection("veiculos").get();

      if (veiculosSnapshot.empty) {
        console.log("Nenhum veículo encontrado.");
        return;
      }

      for (const doc of veiculosSnapshot.docs) {
        const veiculo = doc.data();
        const userId = veiculo.userId;
        const veiculoNome = veiculo.nome || veiculo.marca || "veículo";

        if (!userId) continue;

        const userRef = db.collection("users").doc(userId);
        const alertas = [];

        const check = (val, name) => {
          if (!val) return;
          let d;
          try {
            d = val.toDate ? val.toDate() : new Date(val);
          } catch (e) {
            console.warn(
              `Erro ao converter data para ${name} no veículo ${doc.id}:`,
              e,
            );
            return;
          }

          if (isNaN(d.getTime())) return;

          // Normalizar a data de expiração para o início do dia
          const dataNormalizada = new Date(
            d.getFullYear(),
            d.getMonth(),
            d.getDate(),
          );

          const diffTime =
            dataNormalizada.getTime() - hojeNormalizado.getTime();
          const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

          console.log(
            `[DEBUG] Veículo: ${veiculoNome} | Campo: ${name} | Data: ${d.toISOString()} | DiffDays: ${diffDays}`,
          );

          if (prazosAviso.includes(diffDays)) {
            alertas.push({
              titulo: `⚠️ ${name} a expirar!`,
              corpo: `O ${name} de ${veiculoNome} vence em ${diffDays} dias (${d.toLocaleDateString("pt-PT")}).`,
            });
          } else if (diffDays === 0) {
            alertas.push({
              titulo: `🚨 ${name} vence HOJE!`,
              corpo: `Regulariza o ${name} do ${veiculoNome} hoje!`,
            });
          }
        };

        check(veiculo.seguro ? veiculo.seguro.validade : null, "Seguro");
        check(veiculo.iuc ? veiculo.iuc.dataLimite : null, "IUC");
        check(
          veiculo.inspecao ? veiculo.inspecao.proximaData : null,
          "Inspeção",
        );

        // 🛠️ NOVO: Verificar Plano de Manutenção (Revisões/Serviços)
        try {
          const manutSnap = await doc.ref
            .collection("manutencoesPlaneadas")
            .get();
          const currentOdo =
            veiculo.odometroAtual || veiculo.odometroInicial || 0;

          for (const mDoc of manutSnap.docs) {
            const p = mDoc.data();
            const titulo = p.titulo || p.tipo || "Manutenção";

            // 1. Verificar por Quilómetros
            if (p.intervaloKm && p.ultimoKm !== undefined) {
              const nextKm = Number(p.ultimoKm) + Number(p.intervaloKm);
              const diffKm = nextKm - currentOdo;

              if (diffKm <= 0) {
                alertas.push({
                  titulo: `🚨 Manutenção ATRASADA: ${titulo}`,
                  corpo: `O ${veiculoNome} passou o limite de ${nextKm} km (${Math.abs(diffKm)} km a mais).`,
                });
              } else if (diffKm <= 1000) {
                alertas.push({
                  titulo: `🛠️ Manutenção Próxima: ${titulo}`,
                  corpo: `O ${veiculoNome} deve fazer ${titulo} em ${diffKm} km (aos ${nextKm} km).`,
                });
              }
            }

            // 2. Verificar por Data
            if (p.intervaloMeses && p.ultimaData) {
              const lastD = new Date(p.ultimaData);
              const nextD = new Date(
                lastD.getFullYear(),
                lastD.getMonth() + Number(p.intervaloMeses),
                lastD.getDate(),
              );

              // Normalizar nextD para midnight
              const nextDNormalizada = new Date(
                nextD.getFullYear(),
                nextD.getMonth(),
                nextD.getDate(),
              );
              const diffTimeM =
                nextDNormalizada.getTime() - hojeNormalizado.getTime();
              const diffDaysM = Math.round(diffTimeM / (1000 * 60 * 60 * 24));

              if (diffDaysM === 0) {
                alertas.push({
                  titulo: `🚨 ${titulo} vence HOJE!`,
                  corpo: `Dia de ${titulo} para o ${veiculoNome}!`,
                });
              } else if (diffDaysM > 0 && diffDaysM <= 30) {
                alertas.push({
                  titulo: `🛠️ ${titulo} a chegar`,
                  corpo: `Faltam ${diffDaysM} dias para a próxima ${titulo} do ${veiculoNome}.`,
                });
              } else if (diffDaysM < 0) {
                alertas.push({
                  titulo: `🚨 ${titulo} em ATRASO!`,
                  corpo: `A data de ${titulo} do ${veiculoNome} passou há ${Math.abs(diffDaysM)} dias.`,
                });
              }
            }
          }
        } catch (e) {
          console.error(
            `Erro ao verificar manutenções para veículo ${doc.id}:`,
            e,
          );
        }

        if (alertas.length > 0) {
          console.log(
            `User ${userId} tem ${alertas.length} alertas pendentes.`,
          );
          const tokensSnap = await userRef.collection("fcmTokens").get();
          if (tokensSnap.empty) {
            console.log(
              `User ${userId} tem alertas mas sem tokens registados.`,
            );
            continue;
          }

          const tokens = tokensSnap.docs.map((t) => t.data().token);
          console.log(
            `Enviando para ${tokens.length} tokens do utilizador ${userId}`,
          );

          for (const alerta of alertas) {
            const message = {
              notification: {
                title: alerta.titulo,
                body: alerta.corpo,
              },
              data: {
                url: "/veiculos.html",
                veiculoId: doc.id,
              },
              webpush: {
                notification: {
                  icon: "https://omeucarro-d3889.web.app/images/logo-icon192.png",
                  click_action: "https://omeucarro-d3889.web.app/veiculos.html",
                },
              },
            };

            try {
              const response = await admin.messaging().sendEachForMulticast({
                ...message,
                tokens,
              });
              console.log(
                `Alert enviado para ${userId} (${alerta.titulo}): Sucesso=${response.successCount}, Falhas=${response.failureCount}`,
              );

              if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                  if (!resp.success) {
                    const errorInfo = resp.error;
                    console.warn(
                      `Falha no token ${tokens[idx]}:`,
                      errorInfo.code,
                    );
                    if (
                      errorInfo.code ===
                        "messaging/registration-token-not-registered" ||
                      errorInfo.code === "messaging/invalid-argument"
                    ) {
                      userRef
                        .collection("fcmTokens")
                        .doc(tokens[idx])
                        .delete()
                        .catch((err) =>
                          console.error("Erro ao apagar token inválido:", err),
                        );
                    }
                  }
                });
              }
            } catch (e) {
              console.error("Erro envio FCM:", e);
            }
          }
        }
      }
      console.log("Verificação concluída com sucesso.");
    } catch (error) {
      console.error("Erro CRÍTICO na execução do checkVehicleAlerts:", error);
    }
  },
);
