// public/js/firestore.js
// ======================================================================
//  Este ficheiro assume que firebase-config.js já correu e definiu:
//    const auth = firebase.auth();
//    const db   = firebase.firestore();
// ======================================================================

// ENABLE OFFLINE PERSISTENCE
db.enablePersistence().catch((err) => {
  if (err.code == "failed-precondition") {
    console.warn("Persistência falhou: Múltiplas abas abertas.");
  } else if (err.code == "unimplemented") {
    console.warn("Persistência não suportada neste browser.");
  }
});

// ======================================================================
//  USERS
// ======================================================================

// cria / atualiza o perfil do utilizador em users/{uid}
async function saveUserProfile(user, extraData = {}) {
  if (!user) return;

  const userRef = db.collection("users").doc(user.uid);

  const data = {
    nome: extraData.nome || user.displayName || "",
    email: user.email,
    fotoUrl: user.photoURL || "",
    // Legacy fields kept for compatibility, but preferences should move to settings
    idioma: extraData.idioma || "pt",
    moeda: extraData.moeda || "EUR",
    unidadeConsumo: extraData.unidadeConsumo || "L/100km",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    ...extraData, // junta qualquer outro campo extra
  };

  await userRef.set(data, { merge: true });
  return userRef;
}

// Guarda definições em users/{uid}/settings/general
async function saveUserSettings(settings) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const settingsRef = db
    .collection("users")
    .doc(user.uid)
    .collection("settings")
    .doc("general");

  await settingsRef.set(
    {
      ...settings,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

// Lê definições de users/{uid}/settings/general
async function getUserSettings() {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await db
    .collection("users")
    .doc(user.uid)
    .collection("settings")
    .doc("general")
    .get();

  // Defaults seguros
  const defaults = {
    idioma: "pt",
    moeda: "EUR",
    unidadeDistancia: "km",
    unidadeConsumo: "L/100km",
    combustivelPadrao: "Gasolina 95",
    abastecimentoCompletoDefault: true,
    validarOdometro: true,
    veiculoPrincipal: "",
    mostrarInativos: false,
    alertasAtivos: { seguro: true, inspecao: true, iuc: true },
    dashboardPeriodo: "mes",
    dashboardKpis: { gastos: true, consumos: true, distancias: true },
    tipoGrafico: "bar", // ou line
    notificacoesAtivas: true,
    alertaAntecedencia: "15", // dias
  };

  return snap.exists ? { ...defaults, ...snap.data() } : defaults;
}

// lê o perfil do utilizador autenticado
async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await db.collection("users").doc(user.uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ======================================================================
//  DEFINIÇÕES DE MAPA (CATEGORIAS)
// ======================================================================
async function getMapCategories() {
    const user = auth.currentUser;
    if (!user) return ["Casa", "Trabalho", "Outro"];

    const snap = await db.collection("users").doc(user.uid).collection("settings").doc("mapa").get();
    if (snap.exists && snap.data().categories) {
        return snap.data().categories;
    }
    return ["Casa", "Trabalho", "Outro"];
}
window.getMapCategories = getMapCategories;

async function addMapCategory(newCategory) {
    const user = auth.currentUser;
    if (!user) throw new Error("User not auth");

    const ref = db.collection("users").doc(user.uid).collection("settings").doc("mapa");
    // Use arrayUnion to add unique
    await ref.set({
        categories: firebase.firestore.FieldValue.arrayUnion(newCategory),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
}
window.addMapCategory = addMapCategory;


// ======================================================================
//  VEÍCULOS
// ======================================================================

async function createVeiculo(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const veiculo = {
    userId: user.uid,

    // básicos
    nome: data.nome,
    marca: data.marca,
    modelo: data.modelo,
    matricula: data.matricula || "",
    combustivelPadrao: data.combustivelPadrao || "",
    odometroInicial: Number(data.odometroInicial) || 0,
    ativo: data.ativo !== false,

    // técnicos
    ano: data.ano ?? null,
    vin: data.vin || "",
    cilindradaCc: data.cilindradaCc ?? null,
    potenciaCv: data.potenciaCv ?? null,
    capacidadeDepositoLitros: data.capacidadeDepositoLitros ?? null,
    dataAquisicao: data.dataAquisicao || null,

    // seguro / inspeção
    seguro: data.seguro || {},
    inspecao: data.inspecao || {},
    iuc: data.iuc || {}, // NOVO

    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),

    // Foto
    fotoUrl: data.fotoUrl || null,
    fotoPath: data.fotoPath || null,

    // 🔹 ODÓMETRO ATUAL (Inicialmente igual ao inicial)
    odometroAtual: Number(data.odometroInicial) || 0,
    odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  return db.collection("veiculos").add(veiculo);
}

async function getVeiculosDoUtilizador() {
  const user = auth.currentUser;
  if (!user) return [];

  const snap = await db
    .collection("veiculos")
    .where("userId", "==", user.uid)
    .where("ativo", "==", true)
    .get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    // 🔹 Runtime Migration: Se não tiver odometroAtual, assume odometroInicial
    if (d.odometroAtual === undefined) {
       d.odometroAtual = d.odometroInicial || 0;
       // Opcional: Persistir a migração (fire-and-forget)
       doc.ref.update({
         odometroAtual: d.odometroAtual,
         odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
       }).catch(console.error);
    }
    return { id: doc.id, ...d };
  });
}

// Upload foto do veículo
async function uploadVehiclePhoto(file, vehicleId) {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");

  // Create unique filename or fixed name per vehicle?
  // Using fixed name "photo.jpg" allows easy overwrite.
  // But browser caching issues. Better unique or metadata check.
  // Let's use "photo_{timestamp}.jpg" and clean up old if needed,
  // or just overwrite "photo.jpg" and rely on getDownloadURL refreshing?
  // Safest for simple app: "photo_<timestamp>.jpg"

  const ext = file.name.split(".").pop();
  const filename = `photo_${Date.now()}.${ext}`;
  const path = `veiculos/${vehicleId}/${filename}`;
  const storageRef = firebase.storage().ref().child(path);

  const snapshot = await storageRef.put(file);
  const downloadURL = await snapshot.ref.getDownloadURL();

  return { downloadURL, path };
}

// atualizar veículo
async function updateVeiculo(id, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const payload = {
    // básicos
    nome: data.nome,
    marca: data.marca,
    modelo: data.modelo,
    matricula: data.matricula,
    combustivelPadrao: data.combustivelPadrao,
    odometroInicial: data.odometroInicial !== undefined ? Number(data.odometroInicial) : undefined,
    
    // Permite atualização direta do odometroAtual (mas deve ser >= inicial em tese, deixamos flexível para correções)
    odometroAtual: data.odometroAtual !== undefined ? Number(data.odometroAtual) : undefined,
    
    ativo: data.ativo,

    // Foto
    fotoUrl: data.fotoUrl,
    fotoPath: data.fotoPath,

    // técnicos
    ano: data.ano,
    vin: data.vin,
    cilindradaCc: data.cilindradaCc,
    potenciaCv: data.potenciaCv,
    capacidadeDepositoLitros: data.capacidadeDepositoLitros,
    dataAquisicao: data.dataAquisicao,

    // seguro / inspeção
    seguro: data.seguro,
    inspecao: data.inspecao,
    iuc: data.iuc,

    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  // 🔹 Se odómetro atual for atualizado, atualizar timestamp
  if (data.odometroAtual !== undefined) {
      payload.odometroAtualizadoEm = firebase.firestore.FieldValue.serverTimestamp();
  }

  // Remove nulls/undefined from payload to avoid overwriting existing photo if not provided?
  // No, the caller should pass existing if not changing.
  // We'll clean undefined keys.
  Object.keys(payload).forEach(
    (key) => payload[key] === undefined && delete payload[key],
  );

  return db.collection("veiculos").doc(id).update(payload);
}

// apagar veículo
async function deleteVeiculo(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const absSnap = await db
    .collection("veiculos")
    .doc(id)
    .collection("abastecimentos")
    .get();

  const batch = db.batch();

  absSnap.forEach((doc) => {
    batch.delete(doc.ref);
  });

  batch.delete(db.collection("veiculos").doc(id));

  await batch.commit();
}

// ======================================================================
//  ABASTECIMENTOS
// ======================================================================

async function createAbastecimento(veiculoId, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId) throw new Error("veiculoId é obrigatório");

  // validar odómetro (não pode voltar atrás)
  const ultimoSnap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .orderBy("odometro", "desc")
    .limit(1)
    .get();

  if (!ultimoSnap.empty) {
    const ultimo = ultimoSnap.docs[0].data();
    if (Number(data.odometro) < Number(ultimo.odometro)) {
      throw new Error(
        `O odómetro (${data.odometro}) não pode ser inferior ao último registo (${ultimo.odometro}).`,
      );
    }
  }

  const abastecimento = {
    userId: user.uid,
    data: data.data,
    tipoCombustivel: data.tipoCombustivel,
    litros: Number(data.litros),
    precoPorLitro: Number(data.precoPorLitro),
    odometro: Number(data.odometro),
    posto: data.posto || "",
    observacoes: data.observacoes || "",
    completo: !!data.completo,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .add(abastecimento);

  // 🔹 AUTO-UPDATE VEÍCULO (Se km for maior)
  // Fazemos fire-and-forget ou await? Await é mais seguro para consistência.
  try {
      const veiculoRef = db.collection("veiculos").doc(veiculoId);
      const vSnap = await veiculoRef.get();
      if (vSnap.exists) {
          const vData = vSnap.data();
          const current = vData.odometroAtual || vData.odometroInicial || 0;
          if (abastecimento.odometro > current) {
              await veiculoRef.update({
                  odometroAtual: abastecimento.odometro,
                  odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
              });
          }
      }
  } catch (err) {
      console.error("Erro ao atualizar odómetro do veículo (auto):", err);
      // Não bloqueia o retorno do abastecimento
  }

  return ref;
}

async function getAbastecimentosDoVeiculo(veiculoId, limite = 50) {
  const user = auth.currentUser;
  if (!user) return [];
  if (!veiculoId) return [];

  const snap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .orderBy("data", "desc")
    .limit(limite)
    .get();

  return snap.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

// atualizar abastecimento
async function updateAbastecimento(veiculoId, id, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const ref = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .doc(id);

  const payload = {
    data: data.data,
    tipoCombustivel: data.tipoCombustivel,
    litros: Number(data.litros),
    precoPorLitro: Number(data.precoPorLitro),
    odometro: Number(data.odometro),
    posto: data.posto || "",
    observacoes: data.observacoes || "",
    completo: !!data.completo,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await ref.update(payload);

  // 🔹 AUTO-UPDATE VEÍCULO (Edit Abastecimento)
  if (payload.odometro) {
      try {
          const veiculoRef = db.collection("veiculos").doc(veiculoId);
          const vSnap = await veiculoRef.get();
          if (vSnap.exists) {
              const vData = vSnap.data();
              const current = vData.odometroAtual || vData.odometroInicial || 0;
              if (payload.odometro > current) {
                  await veiculoRef.update({
                      odometroAtual: payload.odometro,
                      odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
      } catch (err) {
          console.error("Erro ao atualizar odómetro (edit abastecimento):", err);
      }
  }

  return ref;
}

// apagar abastecimento
async function deleteAbastecimento(veiculoId, id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .doc(id)
    .delete();
}
// devolve TODOS os abastecimentos do utilizador (todos os veículos)
async function getTodosAbastecimentosDoUtilizador(limite = 500) {
  const user = auth.currentUser;
  if (!user) return [];

  const veiculosSnap = await db
    .collection("veiculos")
    .where("userId", "==", user.uid)
    .get();

  const resultados = [];

  for (const v of veiculosSnap.docs) {
    const absSnap = await v.ref
      .collection("abastecimentos")
      .limit(limite)
      .get();

    absSnap.forEach((doc) => {
      resultados.push({
        id: doc.id,
        veiculoId: v.id,
        ...doc.data(),
      });
    });
  }

  return resultados;
}

async function getAbastecimentoDoVeiculoById(veiculoId, abastecimentoId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId || !abastecimentoId) return null;

  const snap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("abastecimentos")
    .doc(abastecimentoId)
    .get();

  if (!snap.exists) return null;

  return { id: snap.id, ...snap.data() };
}
// ======================================================================
//  DOCUMENTOS DO VEÍCULO (FOTOS)  -> Firestore + Firebase Storage
//  Estrutura:
//    veiculos/{veiculoId}/documentos/{docId}
//  Storage:
//    users/{uid}/veiculos/{veiculoId}/documentos/{docId}-{filename}
// ======================================================================

async function uploadDocumentoVeiculo(veiculoId, file, meta = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId) throw new Error("veiculoId é obrigatório");
  if (!file) throw new Error("Ficheiro obrigatório");

  const docRef = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("documentos")
    .doc();

  const safeName = (file.name || "foto.jpg").replace(/[^\w.\-]+/g, "_");
  const storagePath = `users/${user.uid}/veiculos/${veiculoId}/documentos/${docRef.id}-${safeName}`;

  const storageRef = firebase.storage().ref().child(storagePath);

  // Upload
  const snap = await storageRef.put(file, {
    contentType: file.type || "image/jpeg",
  });

  // URL download
  const downloadURL = await snap.ref.getDownloadURL();

  const payload = {
    userId: user.uid,

    // NOVO
    categoria: meta.categoria || "Carro", // Carro | Reparacao | Outros
    linkExterno: meta.linkExterno || "", // para compatibilidade (normalmente vazio no upload)

    tipo: meta.tipo || "Documento",
    descricao: meta.descricao || "",
    nomeOriginal: file.name || "",
    mimeType: file.type || "",
    tamanho: file.size || 0,
    storagePath,
    downloadURL,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(payload);
  return { id: docRef.id, ...payload };
}

// ======================================================================
//  DOCUMENTOS DO VEÍCULO (LINK EXTERNO) -> Firestore apenas
//  Estrutura:
//    veiculos/{veiculoId}/documentos/{docId}
// ======================================================================

async function addDocumentoLinkExterno(veiculoId, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId) throw new Error("veiculoId é obrigatório");

  const url = (data.url || data.linkExterno || "").trim();
  if (!url || !/^https?:\/\/.+/i.test(url)) {
    throw new Error("Link inválido. Tem de começar por http:// ou https://");
  }

  const categoria = data.categoria || "Outros"; // Carro | Reparacao | Outros
  const tipo = data.tipo || "Documento";

  const docRef = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("documentos")
    .doc();

  const payload = {
    userId: user.uid,

    // NOVO
    categoria,
    linkExterno: url,

    // campos compatíveis com docs de upload (ficam vazios)
    tipo,
    descricao: data.descricao || "",
    nomeOriginal: data.nomeOriginal || "",
    mimeType: data.mimeType || "",
    tamanho: 0,
    storagePath: "",
    downloadURL: "",

    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await docRef.set(payload);
  return { id: docRef.id, ...payload };
}

async function getDocumentosDoVeiculo(veiculoId, limite = 50) {
  const user = auth.currentUser;
  if (!user) return [];
  if (!veiculoId) return [];

  // Tenta ordenar por criadoEm (ideal)
  try {
    const snap = await db
      .collection("veiculos")
      .doc(veiculoId)
      .collection("documentos")
      .orderBy("criadoEm", "desc")
      .limit(limite)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn(
      "getDocumentosDoVeiculo: erro com orderBy criadoEm. A tentar sem ordem.",
      e,
    );
    // Fallback para documentos antigos sem campo criadoEm
    const snap = await db
      .collection("veiculos")
      .doc(veiculoId)
      .collection("documentos")
      .limit(limite)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

async function deleteDocumentoDoVeiculo(veiculoId, documentoId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId || !documentoId) throw new Error("IDs obrigatórios");

  const ref = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("documentos")
    .doc(documentoId);

  const snap = await ref.get();
  if (!snap.exists) return;

  const data = snap.data();

  // Apaga do Storage (se existir)
  if (data.storagePath) {
    try {
      await firebase.storage().ref().child(data.storagePath).delete();
    } catch (e) {
      // se já não existir, não bloqueia
      console.warn("Storage delete warning:", e);
    }
  }

  // Apaga do Firestore
  await ref.delete();
}

async function updateDocumentoDoVeiculo(veiculoId, docId, data = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!veiculoId || !docId) throw new Error("IDs obrigatórios");

  const ref = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("documentos")
    .doc(docId);

  const payload = {
    categoria: data.categoria ?? undefined,
    tipo: data.tipo ?? undefined,
    titulo: data.titulo ?? undefined,
    nota: data.nota ?? undefined,
    linkExterno: data.linkExterno ?? undefined,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  Object.keys(payload).forEach(
    (k) => payload[k] === undefined && delete payload[k],
  );

  await ref.update(payload);
}

// =========================
// REPARAÇÕES
// =========================

// 🔍 obter UMA reparação por ID
async function getReparacaoById(veiculoId, reparacaoId) {
  const snap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("reparacoes")
    .doc(reparacaoId)
    .get();

  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() };
}

// ✏️ atualizar reparação
// ✏️ atualizar reparação
async function updateReparacaoDoVeiculo(veiculoId, reparacaoId, data) {
  const prom = db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("reparacoes")
    .doc(reparacaoId)
    .update({
      ...data,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

  await prom;

  // 🔹 AUTO-UPDATE VEÍCULO (Edit Reparacao)
  if (data.km) {
      const repKm = Number(data.km);
      try {
          const veiculoRef = db.collection("veiculos").doc(veiculoId);
          const vSnap = await veiculoRef.get();
          if (vSnap.exists) {
              const vData = vSnap.data();
              const current = vData.odometroAtual || vData.odometroInicial || 0;
              if (repKm > current) {
                  await veiculoRef.update({
                      odometroAtual: repKm,
                      odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
      } catch (err) {
          console.error("Erro ao atualizar odómetro (edit reparacao):", err);
      }
  }

  return prom;
}

// 🗑️ apagar reparação
async function deleteReparacaoDoVeiculo(veiculoId, reparacaoId) {
  return db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("reparacoes")
    .doc(reparacaoId)
    .delete();
}

async function getReparacoesDoVeiculo(veiculoId, limite = 100) {
  const user = auth.currentUser;
  if (!user) return [];
  return db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("reparacoes")
    .orderBy("data", "desc")
    .limit(limite)
    .get()
    .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

async function addReparacaoAoVeiculo(veiculoId, data) {
  return db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("reparacoes")
    .add({
      ...data,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

  // 🔹 AUTO-UPDATE VEÍCULO (Repair Logic)
  // Se o km da reparação for superior ao atual, atualiza.
  if (data.km) {
    try {
        const repKm = Number(data.km);
        const veiculoRef = db.collection("veiculos").doc(veiculoId);
        const vSnap = await veiculoRef.get();
        if (vSnap.exists) {
            const vData = vSnap.data();
            const current = vData.odometroAtual || vData.odometroInicial || 0;
            if (repKm > current) {
                await veiculoRef.update({
                    odometroAtual: repKm,
                    odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
    } catch (err) {
        console.error("Erro ao atualizar odómetro via reparação:", err);
    }
  }

  return ref;
}

// ======================================================================
// MANUTEN��ES PLANEADAS
// ======================================================================

async function getManutencoesPlaneadas(veiculoId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador n�o autenticado");

  const snap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("manutencoesPlaneadas")
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addManutencaoPlaneada(veiculoId, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("manutencoesPlaneadas")
    .add({
      ...data,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

  // 🔹 AUTO-UPDATE VEÍCULO (Add Plano)
  // Se indicarem "ultimoKm" superior ao atual
  if (data.ultimoKm) {
      const planKm = Number(data.ultimoKm);
      try {
          const veiculoRef = db.collection("veiculos").doc(veiculoId);
          const vSnap = await veiculoRef.get();
          if (vSnap.exists) {
              const vData = vSnap.data();
              const current = vData.odometroAtual || vData.odometroInicial || 0;
              if (planKm > current) {
                  await veiculoRef.update({
                      odometroAtual: planKm,
                      odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
      } catch (err) {
          console.error("Erro ao atualizar odómetro (add plano):", err);
      }
  }
}

async function updateManutencaoPlaneada(veiculoId, docId, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("manutencoesPlaneadas")
    .doc(docId)
    .update({
      ...data,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });

  // 🔹 AUTO-UPDATE VEÍCULO (Edit Plano)
  if (data.ultimoKm) {
      const planKm = Number(data.ultimoKm);
      try {
          const veiculoRef = db.collection("veiculos").doc(veiculoId);
          const vSnap = await veiculoRef.get();
          if (vSnap.exists) {
              const vData = vSnap.data();
              const current = vData.odometroAtual || vData.odometroInicial || 0;
              if (planKm > current) {
                  await veiculoRef.update({
                      odometroAtual: planKm,
                      odometroAtualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
                  });
              }
          }
      } catch (err) {
          console.error("Erro ao atualizar odómetro (edit plano):", err);
      }
  }
}

async function deleteManutencaoPlaneada(veiculoId, docId) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador n�o autenticado");

  await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("manutencoesPlaneadas")
    .doc(docId)
    .delete();
}
