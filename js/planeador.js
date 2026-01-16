// js/planeador.js
// L100 Trip Planner Logic
// Handles simulation, navigation, and persistence of destinations.

document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // ELEMENTS
  // =========================
  const inputs = {
    consumo: document.getElementById("simp-consumption"),
    preco: document.getElementById("simp-price"),
    distancia: document.getElementById("simp-distance"),
    viagens: document.getElementById("simp-trips"),
    portagens: document.getElementById("simp-tolls"),
    pessoas: document.getElementById("simp-people"),
  };

  const results = {
    total: document.getElementById("res-total"),
    combustivel: document.getElementById("res-fuel-cost"),
    portagens: document.getElementById("res-tolls"),
    porPessoa: document.getElementById("res-per-person"),
    kmTotal: document.getElementById("res-km-total"),
    litros: document.getElementById("res-liters"),
  };

  const btns = {
    useAverages: document.getElementById("btn-use-averages"),
    openDestinations: document.getElementById("btn-open-destinations"),
    addDestination: document.getElementById("btn-add-destination"),
    openRoute: document.getElementById("btn-open-route"),
    closeDest: document.getElementById("close-panel-dest"),
    closeAdd: document.getElementById("close-panel-add"),
    saveDest: document.getElementById("btn-save-dest"),
    mapsAction: document.getElementById("btn-maps-action"),
    updateLoc: document.getElementById("btn-update-loc"),
  };

  const panels = {
    dest: document.getElementById("panel-destinations"),
    add: document.getElementById("panel-add-dest"),
  };

  // =========================
  // HELPERS
  // =========================
  function parseNum(val) {
    if (!val) return 0;
    // Replace comma with dot if user types standard generic PT format, but input[type=number] usually handles this.
    // However, safely parsing is good.
    return Number(val) || 0;
  }

  function formatCurrency(val) {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(val);
  }

  // =========================
  // CALCULATION LOGIC
  // =========================
  function calculate() {
    const c = parseNum(inputs.consumo.value);
    const p = parseNum(inputs.preco.value);
    const d = parseNum(inputs.distancia.value);
    const v = parseNum(inputs.viagens.value) || 1; // min 1
    const t = parseNum(inputs.portagens.value);
    const ppl = parseNum(inputs.pessoas.value) || 1; // min 1

    const totalKm = d * v;
    const totalLiters = (c * totalKm) / 100;
    const costFuel = totalLiters * p;
    const costTolls = t * v;

    const grandTotal = costFuel + costTolls;
    const perPerson = grandTotal / ppl;

    // Render
    results.total.textContent = formatCurrency(grandTotal);
    results.combustivel.textContent = formatCurrency(costFuel);
    results.portagens.textContent = formatCurrency(costTolls);
    results.porPessoa.textContent = ppl > 1 ? formatCurrency(perPerson) : "—";

    results.kmTotal.textContent = totalKm.toFixed(0);
    results.litros.textContent = totalLiters.toFixed(1);
  }

  // Listeners for inputs
  Object.values(inputs).forEach((el) => {
    el.addEventListener("input", calculate);
  });

  // =========================
  // AVERAGES (From Firestore)
  // =========================
  async function loadAverages() {
    if (!auth.currentUser) return;

    btns.useAverages.disabled = true;
    btns.useAverages.textContent = "A carregar...";

    let consumoMedio = 6.0; // fallback
    let precoMedio = 1.7; // fallback

    // Try getting from first vehicle (simplification)
    try {
      const snap = await db
        .collection("users")
        .doc(auth.currentUser.uid)
        .collection("veiculos")
        .limit(1)
        .get();
      if (!snap.empty) {
        const v = snap.docs[0].data();
        // Simple logic: if vehicle has 'consumoMedio' field saved, use it.
        // Or calculate from last few fillups?
        // Let's stick to simple "if exists" or generic fallback for V1.
        // Assuming standard generic fallback for now as calculating real average requires querying subcollection.
        // Let's query subcollection 'abastecimentos' limit 5

        const absSnap = await db
          .collection("users")
          .doc(auth.currentUser.uid)
          .collection("veiculos")
          .doc(snap.docs[0].id)
          .collection("abastecimentos")
          .orderBy("data", "desc")
          .limit(5)
          .get();

        if (!absSnap.empty) {
          let sumPrice = 0;
          let count = 0;
          absSnap.forEach((doc) => {
            const d = doc.data();
            if (d.precoPorLitro) {
              sumPrice += Number(d.precoPorLitro);
              count++;
            }
          });
          if (count > 0) precoMedio = sumPrice / count;
        }
      }
    } catch (e) {
      console.error("Error loading averages", e);
    }

    inputs.consumo.value = consumoMedio.toFixed(1);
    inputs.preco.value = precoMedio.toFixed(3);
    calculate();

    btns.useAverages.disabled = false;
    btns.useAverages.textContent = "Usar Médias";
  }

  btns.useAverages.addEventListener("click", loadAverages);

  // =========================
  // PANELS & MODALS
  // =========================
  function openPanel(name) {
    document
      .querySelectorAll(".modal")
      .forEach((m) => m.classList.add("hidden"));
    if (panels[name]) panels[name].classList.remove("hidden");
  }
  function closePanels() {
    document
      .querySelectorAll(".modal")
      .forEach((m) => m.classList.add("hidden"));
  }

  btns.openDestinations.addEventListener("click", () => {
    openPanel("dest");
    loadDestinations();
  });
  btns.addDestination.addEventListener("click", () => openPanel("add"));
  btns.closeDest.addEventListener("click", closePanels);
  btns.closeAdd.addEventListener("click", closePanels);
  document
    .querySelectorAll(".modal-overlay")
    .forEach((el) => el.addEventListener("click", closePanels));

  // =========================
  // DESTINATIONS (Load/Save)
  // =========================
  const destSelect = document.getElementById("sel-destination");
  const destAddress = document.getElementById("dest-address-display");
  let currentDestinations = [];

  async function loadDestinations() {
    if (!auth.currentUser) return;

    destSelect.innerHTML = '<option value="">A carregar...</option>';

    try {
      const snap = await db
        .collection("users")
        .doc(auth.currentUser.uid)
        .collection("localizacoes")
        .orderBy("nome")
        .get();

      currentDestinations = [];
      destSelect.innerHTML = '<option value="">-- Selecione --</option>';

      snap.forEach((doc) => {
        const d = doc.data();
        currentDestinations.push(d);
        const opt = document.createElement("option");
        opt.value = d.endereco; // Value is address for easier usage
        opt.textContent = d.nome;
        destSelect.appendChild(opt);
      });
    } catch (e) {
      console.error(e);
      destSelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
  }

  destSelect.addEventListener("change", () => {
    destAddress.textContent = destSelect.value || "Nenhum selecionado";
  });

  // Save New
  btns.saveDest.addEventListener("click", async () => {
    const name = document.getElementById("new-dest-name").value.trim();
    const address = document.getElementById("new-dest-address").value.trim();
    const msg = document.getElementById("msg-add-dest");

    if (!name || !address) {
      msg.textContent = "Preencha nome e endereço.";
      return;
    }

    btns.saveDest.disabled = true;
    btns.saveDest.textContent = "A guardar...";

    try {
      await db
        .collection("users")
        .doc(auth.currentUser.uid)
        .collection("localizacoes")
        .add({
          nome: name,
          endereco: address,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      closePanels();
      // Clear inputs
      document.getElementById("new-dest-name").value = "";
      document.getElementById("new-dest-address").value = "";
      alert("Destino guardado!");
    } catch (e) {
      console.error(e);
      msg.textContent = "Erro ao guardar.";
    } finally {
      btns.saveDest.disabled = false;
      btns.saveDest.textContent = "Guardar";
    }
  });

  // =========================
  // GOOGLE MAPS & GEO
  // =========================
  let currentLoc = null;

  function getGeo() {
    if (!navigator.geolocation) {
      alert("Geolocalização não suportada.");
      return;
    }
    btns.updateLoc.textContent = "A obter localização...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLoc = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        btns.updateLoc.textContent = "Localização Atualizada ✅";
      },
      (err) => {
        console.error(err);
        btns.updateLoc.textContent = "Erro de localização ❌";
        alert(
          "Não foi possível obter a sua localização. A rota abrirá apenas com o destino."
        );
      }
    );
  }

  btns.updateLoc.addEventListener("click", getGeo);

  function openMaps() {
    const dest = destSelect.value;
    if (!dest) {
      alert("Selecione um destino primeiro.");
      return;
    }

    let url = "https://www.google.com/maps/dir/?api=1";

    // Origin
    if (currentLoc) {
      url += `&origin=${currentLoc.lat},${currentLoc.lng}`;
    }

    // Destination
    url += `&destination=${encodeURIComponent(dest)}`;

    window.open(url, "_blank");
  }

  btns.mapsAction.addEventListener("click", openMaps);

  // Also MAIN button in page should open panel if no dest selected, or open maps if fixed logic?
  // Requirement says: "Abrir Rota" (on page) -> opens maps with selected destination.
  // Meaning we probably should have the destination logic available in the main view or linked.
  // Current implementation: "Mapa" button opens panel. "Abrir Rota" button at bottom... should strictly follow spec.
  // Spec: "Painel para escolher destino". And "Botão para abrir percurso".
  // Let's make the bottom button also trigger the maps logic, checking if a dest is selected from the panel?
  // Or better: The bottom button opens the panel IF no destination is selected?
  // Let's assume the user selects destination in the panel.

  btns.openRoute.addEventListener("click", () => {
    // Since the select is inside the panel, we check if it has a value
    if (destSelect.value) {
      // Ensure we have location or try to get it fast?
      if (!currentLoc) {
        // Try one-shot geo then open
        if (!navigator.geolocation) {
          openMaps(); // fallback without origin
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            currentLoc = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            };
            openMaps();
          },
          () => {
            openMaps(); // error fallback
          }
        );
      } else {
        openMaps();
      }
    } else {
      // Open panel to force selection
      openPanel("dest");
      loadDestinations();
    }
  });

  // =========================
  // INIT
  // =========================
  auth.onAuthStateChanged((user) => {
    if (user) {
      calculate();
      getGeo();
    } else {
      console.log("No user");
    }
  });
});
