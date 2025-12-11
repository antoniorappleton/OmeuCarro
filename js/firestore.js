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
    nome: data.nome,
    marca: data.marca,
    modelo: data.modelo,
    matricula: data.matricula || "",
    combustivelPadrao: data.combustivelPadrao || "",
    odometroInicial: Number(data.odometroInicial) || 0,
    ativo: data.ativo !== false,
    criadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  const ref = await db.collection("veiculos").add(veiculo);
  return ref;
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

  const ref = db.collection("veiculos").doc(id);

  const payload = {
    nome: data.nome,
    marca: data.marca,
    modelo: data.modelo,
    matricula: data.matricula || "",
    combustivelPadrao: data.combustivelPadrao || "",
    odometroInicial: Number(data.odometroInicial) || 0,
    ativo: data.ativo !== false,
    atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await ref.update(payload);
  return ref;
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

async function createAbastecimento(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  if (!data.veiculoId) throw new Error("veiculoId é obrigatório");

  // validar odómetro (não pode voltar atrás)
  const ultimoSnap = await db
    .collection("abastecimentos")
    .where("userId", "==", user.uid)
    .where("veiculoId", "==", data.veiculoId)
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
    veiculoId: data.veiculoId,
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

  const ref = await db.collection("abastecimentos").add(abastecimento);
  return ref;
}

async function getAbastecimentosDoUtilizador({
  veiculoId = null,
  limite = 50,
} = {}) {
  const user = auth.currentUser;
  if (!user) return [];

  let query = db.collection("abastecimentos").where("userId", "==", user.uid);

  if (veiculoId) {
    query = query.where("veiculoId", "==", veiculoId);
  }

  query = query.limit(limite);

  const snap = await query.get();
  const docs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  // ordenamos por data DESC do lado do cliente
  docs.sort((a, b) => {
    const da = a.data || "";
    const db_ = b.data || "";
    return db_.localeCompare(da);
  });

  return docs;
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
async function updateAbastecimento(id, data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const ref = db.collection("abastecimentos").doc(id);

  const payload = {
    veiculoId: data.veiculoId,
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
async function deleteAbastecimento(id) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");
  await db.collection("abastecimentos").doc(id).delete();
}
