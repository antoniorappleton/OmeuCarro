const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.firestore();

/**
 * Função agendada para correr todos os dias às 09:00 AM (fuso horário Lisboa).
 * Verifica Seguros, IUCs e Inspeções a expirar.
 */
exports.checkVehicleAlerts = functions.pubsub
  .schedule("every day 09:00")
  .timeZone("Europe/Lisbon")
  .onRun(async (context) => {
    console.log("A iniciar verificação diária de alertas...");
    const hoje = new Date();
    const avisos = [];

    // Definição de prazos para aviso (ex: avisar com 30 dias e com 3 dias de antecedência)
    const prazosAviso = [30, 7, 3, 1];

    try {
        // 1. Obter todos os veículos (idealmente, isto seria otimizado para não ler tudo, 
        // mas para uma app pessoal/pequena escala, ler tudo é aceitável e mais simples)
        // Se a escala crescer, deve-se usar "Collection Group Queries" ou guardar datas num documento separado.
        
        // Como 'veiculos' é uma subcoleção de 'users', usamos collectionGroup para apanhar todos
        const veiculosSnapshot = await db.collectionGroup('veiculos').get();

        if (veiculosSnapshot.empty) {
            console.log("Nenhum veículo encontrado.");
            return null;
        }

        const promises = veiculosSnapshot.docs.map(async (doc) => {
            const veiculo = doc.data();
            const parentUserRef = doc.ref.parent.parent; // user reference
            if (!parentUserRef) return;

            const alertas = [];

            // Helper para verificar datas
            const verificarData = (dataStr, nomeCampo, nomeAmigavel) => {
                if (!dataStr) return;
                
                const dataAlvo = new Date(dataStr);
                const diffTime = dataAlvo - hoje;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (prazosAviso.includes(diffDays)) {
                    alertas.push({
                        titulo: `⚠️ ${nomeAmigavel} a expirar!`,
                        corpo: `O ${nomeAmigavel} do ${veiculo.nome || 'veículo'} vence em ${diffDays} dias (${dataStr}).`,
                        docId: doc.id
                    });
                } else if (diffDays === 0) {
                     alertas.push({
                        titulo: `🚨 ${nomeAmigavel} vence HOJE!`,
                        corpo: `Regulariza o ${nomeAmigavel} do ${veiculo.nome} hoje!`,
                        docId: doc.id
                    });
                }
            };

            // Verificar os 3 campos principais
            verificarData(veiculo.seguroValidade, 'Seguro', 'Seguro');
            verificarData(veiculo.iucValidade, 'IUC', 'IUC');
            verificarData(veiculo.inspecaoValidade, 'Inspeção', 'Inspeção');

            // Se houver alertas, enviar notificação ao dono
            if (alertas.length > 0) {
                // Obter tokens do utilizador
                const tokensSnap = await parentUserRef.collection('fcmTokens').get();
                if (tokensSnap.empty) {
                    console.log(`Sem tokens para o user ${parentUserRef.id}`);
                    return;
                }

                const tokens = tokensSnap.docs.map(t => t.data().token);

                for (const alerta of alertas) {
                    const payload = {
                        notification: {
                            title: alerta.titulo,
                            body: alerta.corpo,
                            icon: 'https://omeucarro-d3889.web.app/images/logo-icon192.png' // URL absoluta é melhor
                        },
                        data: {
                            url: '/veiculos.html',
                            veiculoId: doc.id
                        }
                    };

                    console.log(`A enviar para ${parentUserRef.id}:`, alerta.titulo);
                    
                    // Enviar para todos os tokens do user
                    await admin.messaging().sendToDevice(tokens, payload);
                }
            }
        });

        await Promise.all(promises);
        console.log("Verificação concluída.");
        return null;

    } catch (error) {
        console.error("Erro na verificação de alertas:", error);
        return null;
    }
  });
