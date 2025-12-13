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
  await db.collection("veiculos").doc(id).delete();
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

// ler um abastecimento
async function getAbastecimentoById(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const snap = await db.collection("abastecimentos").doc(id).get();
  if (!snap.exists) return null;

  const data = snap.data();
  if (data.userId !== user.uid) return null;

  return { id: snap.id, ...data };
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