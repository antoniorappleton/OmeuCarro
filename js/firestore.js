// public/js/firestore.js
// ======================================================================
//  Este ficheiro assume que firebase-config.js já correu e definiu:
//    const auth = firebase.auth();
//    const db   = firebase.firestore();
// ======================================================================

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
    idioma: extraData.idioma || "pt",
    moeda: extraData.moeda || "EUR",
    unidadeConsumo: extraData.unidadeConsumo || "L/100km",
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    ...extraData, // junta qualquer outro campo extra
  };

  await userRef.set(data, { merge: true });
  return userRef;
}

// lê o perfil do utilizador autenticado
async function getCurrentUserProfile() {
  const user = auth.currentUser;
  if (!user) return null;

  const snap = await db.collection("users").doc(user.uid).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

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

    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
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

  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
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

    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

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
        `O odómetro (${data.odometro}) não pode ser inferior ao último registo (${ultimo.odometro}).`
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

  const snap = await db
    .collection("veiculos")
    .doc(veiculoId)
    .collection("documentos")
    .orderBy("criadoEm", "desc")
    .limit(limite)
    .get();

  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
