// public/js/firestore.js

// ========== USERS ==========

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
    ...extraData,
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

// ========== VEÍCULOS ==========

async function createVeiculo(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  const veiculo = {
    userId: user.uid,
    nome: data.nome,
    marca: data.marca,
    modelo: data.modelo,
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

// ========== ABASTECIMENTOS ==========

async function createAbastecimento(data) {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilizador não autenticado");

  // TODO: garantir que veiculoId vem do select do veículo
  const abastecimento = {
    userId: user.uid,
    veiculoId: data.veiculoId, // obrigatório escolher veículo na UI
    data: data.data, // "YYYY-MM-DD"
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

  let query = db
    .collection("abastecimentos")
    .where("userId", "==", user.uid)
    .orderBy("data", "desc")
    .limit(limite);

  if (veiculoId) {
    query = query.where("veiculoId", "==", veiculoId);
  }

  const snap = await query.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
