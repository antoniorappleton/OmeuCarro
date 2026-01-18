// js/planeador.js
// L100 Unified Trip & Map Controller
// Merges Planner and Map logic into a single cohesive experience.

document.addEventListener("DOMContentLoaded", () => {
  // ============================
  // ELEMENTS
  // ============================
  const mapContainer = document.getElementById("map-container");
  const pinsContainer = document.getElementById("map-pins-container");
  const sheet = document.getElementById("sheet-container");
  const sheetHandle = document.querySelector(".sheet-handle-bar");

  // Sections
  const secDest = document.getElementById("sec-destination");
  const secSim = document.getElementById("sec-simulation");
  const secRes = document.getElementById("sec-results");
  const secForm = document.getElementById("sec-form");

  // Sheet Destination Elements
  const sheetDestName = document.getElementById("sheet-dest-name");
  const sheetDestAddress = document.getElementById("sheet-dest-address");
  const btnClearDest = document.getElementById("btn-clear-dest");
  const chipsContainer = document.getElementById("sheet-favorites-list");

  // Inputs
  const inputs = {
    distance: document.getElementById("simp-distance"),
    tolls: document.getElementById("simp-tolls"),
    trips: document.getElementById("simp-trips"),
    people: document.getElementById("simp-people"),
    consumption: document.getElementById("simp-consumption"),
    price: document.getElementById("simp-price"),
  };

  // Results
  const results = {
    total: document.getElementById("res-total"),
    fuel: document.getElementById("res-fuel-cost"),
    tolls: document.getElementById("res-tolls"),
    perPerson: document.getElementById("res-per-person"),
  };

  // Buttons
  const btnOpenRoute = document.getElementById("btn-open-route");
  const btnOpenRouteText = document.getElementById("btn-open-route-text");
  const btnUseAverages = document.getElementById("btn-use-averages");
  const fabAdd = document.getElementById("fab-add-favorite");

  // Map Controls
  const btnZoomIn = document.getElementById("btn-zoom-in");
  const btnZoomOut = document.getElementById("btn-zoom-out");
  const btnMyLoc = document.getElementById("btn-my-loc");

  // Search
  const searchOverlay = document.getElementById("search-overlay");
  const searchInput = document.getElementById("map-search-input");
  const searchResults = document.getElementById("search-results");
  const btnSearchToggle = document.getElementById("btn-search-toggle");
  const btnCloseSearch = document.getElementById("close-search");

  // Form
  const inputFavName = document.getElementById("input-fav-name");
  const inputFavAddress = document.getElementById("input-fav-address");
  const inputFavCategory = document.getElementById("input-fav-category");
  const btnSaveForm = document.getElementById("btn-save-form");
  const btnCancelForm = document.getElementById("btn-cancel-form");
  const favActions = document.getElementById("fav-actions");
  const btnEditFav = document.getElementById("btn-edit-fav");
  const btnDeleteFav = document.getElementById("btn-delete-fav");

  // State
  let favorites = [];
  let selectedDest = null; // { name, address, isFavorite, favId, coords? }
  let sheetState = "compact"; // compact, half, full, form
  let isEditMode = false;
  let currentLoc = null;

  // ============================
  // INIT
  // ============================
  auth.onAuthStateChanged((user) => {
    if (user) {
      loadFavorites();
      // Also check local storage for intent from other pages?
      const stored = localStorage.getItem("selected_destination");
      if (stored) {
        try {
          const data = JSON.parse(stored);
          selectDestination(data, true); // true = center map
          localStorage.removeItem("selected_destination"); // consume it
        } catch (e) {
          console.error(e);
        }
      }
    }
  });

  // ============================
  // LOAD FAVORITES
  // ============================
  async function loadFavorites() {
    if (!auth.currentUser) return;
    try {
      const snap = await db
        .collection("users")
        .doc(auth.currentUser.uid)
        .collection("localizacoes")
        .orderBy("createdAt", "desc")
        .get();

      favorites = [];
      snap.forEach((doc) => favorites.push({ id: doc.id, ...doc.data() }));

      renderPins();
      renderChips();
    } catch (e) {
      console.error("Error loading favorites", e);
    }
  }

  // ============================
  // RENDERING
  // ============================
  function renderPins() {
    pinsContainer.innerHTML = "";
    favorites.forEach((fav) => {
      const pin = document.createElement("div");
      pin.className = "map-pin";

      // Pseudo-random position for demo
      const x = (hash(fav.id + "x") % 80) + 10;
      const y = (hash(fav.id + "y") % 50) + 25;
      pin.style.left = `${x}%`;
      pin.style.top = `${y}%`;

      let icon = "icon-pin";
      if (fav.category === "Casa") icon = "icon-home";
      if (fav.category === "Trabalho") icon = "icon-car";

      pin.innerHTML = `
        <div class="pin-icon">
            <svg class="icon"><use href="assets/icons-unified.svg#${icon}"></use></svg>
        </div>
        <div class="pin-label">${fav.nome}</div>
      `;

      pin.addEventListener("click", (e) => {
        e.stopPropagation();
        selectDestination({
          name: fav.nome,
          address: fav.endereco,
          isFavorite: true,
          favId: fav.id,
          category: fav.category,
        });
      });

      pinsContainer.appendChild(pin);
      fav._pinElement = pin;
    });
  }

  function renderChips() {
    chipsContainer.innerHTML = "";
    if (favorites.length === 0) {
      chipsContainer.innerHTML =
        '<span class="text-xs text-muted">Ainda sem favoritos.</span>';
      return;
    }

    // Quick add chip?

    favorites.forEach((fav) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      chip.textContent = fav.nome;
      chip.addEventListener("click", () => {
        selectDestination({
          name: fav.nome,
          address: fav.endereco,
          isFavorite: true,
          favId: fav.id,
          category: fav.category,
        });
      });
      chipsContainer.appendChild(chip);
      fav._chipElement = chip;
    });
  }

  // ============================
  // SELECTION LOGIC
  // ============================
  function selectDestination(destData, centerMap = false) {
    selectedDest = destData;

    // UI Updates
    sheetDestName.textContent = destData.name;
    sheetDestAddress.textContent = destData.address;
    btnClearDest.classList.remove("hidden");

    // Highlight Pin
    document
      .querySelectorAll(".map-pin")
      .forEach((p) => p.classList.remove("active"));
    if (destData.isFavorite && destData.favId) {
      const fav = favorites.find((f) => f.id === destData.favId);
      if (fav && fav._pinElement) fav._pinElement.classList.add("active");
      if (fav && fav._chipElement) {
        document
          .querySelectorAll(".chip")
          .forEach((c) => c.classList.remove("active"));
        fav._chipElement.classList.add("active");
      }
      favActions.classList.remove("hidden");
    } else {
      favActions.classList.add("hidden");
    }

    // Expand Sheet logic
    // If selecting, we probably want to simulate immediately
    setSheetState("half");
    calculate(); // Attempt calc
  }

  function clearSelection() {
    selectedDest = null;
    sheetDestName.textContent = "Selecionar Destino";
    sheetDestAddress.textContent = "Toque no mapa ou escolha abaixo";
    btnClearDest.classList.add("hidden");

    document
      .querySelectorAll(".map-pin")
      .forEach((p) => p.classList.remove("active"));
    document
      .querySelectorAll(".chip")
      .forEach((c) => c.classList.remove("active"));
    favActions.classList.add("hidden");

    setSheetState("compact");
    // Reset inputs? Maybe keep them.
    updateCTA(0);
  }

  btnClearDest.addEventListener("click", (e) => {
    e.stopPropagation();
    clearSelection();
  });

  mapContainer.addEventListener("click", () => {
    // Clicking map toggles compact if nothing selected?
    // Or deselects?
    if (sheetState !== "compact") {
      setSheetState("compact");
    }
  });

  // ============================
  // SHEET STATE MACHINE
  // ============================
  function setSheetState(newState) {
    sheetState = newState;

    // Reset classes
    sheet.classList.remove("compact", "half", "full");
    sheet.classList.add(newState);

    // Section Visibility
    // Default hiding
    secSim.classList.add("hidden");
    secRes.classList.add("hidden");
    secForm.classList.add("hidden");
    secDest.classList.remove("hidden"); // Always show dest unless form?
    fabAdd.classList.remove("hidden");

    if (newState === "compact") {
      fabAdd.style.bottom = "200px"; // Adjust position
    } else if (newState === "half") {
      secSim.classList.remove("hidden");
      secRes.classList.remove("hidden");
      fabAdd.classList.add("hidden"); // Hide FAB when implementing
      // Populate distance if zero?
      if (!inputs.distance.value)
        inputs.distance.value = (Math.random() * 20 + 5).toFixed(1); // Fake distance for UX feel
    } else if (newState === "full") {
      secSim.classList.remove("hidden");
      secRes.classList.remove("hidden");
      fabAdd.classList.add("hidden");
    } else if (newState === "form") {
      secDest.classList.add("hidden"); // Hide dest headers
      secForm.classList.remove("hidden");
      fabAdd.classList.add("hidden");
      sheet.classList.remove("form"); // no specific class, mimics full or half
      sheet.classList.add("half"); // Form fits in half usually
    }
  }

  // Handle Drag/Click (Simplistic toggle)
  sheetHandle.addEventListener("click", () => {
    if (sheetState === "compact") setSheetState("half");
    else if (sheetState === "half")
      setSheetState("compact"); // or full?
    else if (sheetState === "full") setSheetState("half");
  });

  // ============================
  // CALCULATOR
  // ============================
  function calculate() {
    if (!selectedDest && sheetState === "compact") return;

    const dist = parseFloat(inputs.distance.value) || 0;
    const tolls = parseFloat(inputs.tolls.value) || 0;
    const trips = parseFloat(inputs.trips.value) || 1;
    const people = parseFloat(inputs.people.value) || 1;
    const cons = parseFloat(inputs.consumption.value) || 0;
    const price = parseFloat(inputs.price.value) || 0;

    const totalKm = dist * trips;
    const totalLiters = (cons * totalKm) / 100;
    const costFuel = totalLiters * price;
    const costTolls = tolls * trips;
    const total = costFuel + costTolls;
    const perPerson = people > 1 ? total / people : total;

    results.total.textContent = formatCurrency(total);
    results.fuel.textContent = formatCurrency(costFuel);
    results.tolls.textContent = formatCurrency(costTolls);
    results.perPerson.textContent =
      people > 1 ? formatCurrency(perPerson) : "—";

    updateCTA(total);
  }

  // Bind inputs
  Object.values(inputs).forEach((inp) =>
    inp.addEventListener("input", calculate),
  );

  // Segment Control
  document.querySelectorAll('input[name="sim-mode"]').forEach((r) => {
    r.addEventListener("change", (e) => {
      const mode = e.target.value;
      const adv = document.getElementById("adv-inputs");
      if (mode === "advanced") adv.classList.add("visible");
      else adv.classList.remove("visible");
    });
  });

  function updateCTA(total) {
    if (!selectedDest) {
      btnOpenRouteText.textContent = "Selecionar Destino";
      btnOpenRoute.classList.add("btn-secondary");
      // Actually primary usually better for main CTA even if disabled style logic
    } else if (total > 0) {
      btnOpenRouteText.textContent = `Navegar (€${total.toFixed(2)})`;
    } else {
      btnOpenRouteText.textContent = "Navegar (Google Maps)";
    }
  }

  // Averages
  btnUseAverages.addEventListener("click", async () => {
    if (!auth.currentUser) return;
    btnUseAverages.textContent = "...";
    try {
      // Reuse fetch logic briefly
      const snap = await db
        .collection("veiculos")
        .where("userId", "==", auth.currentUser.uid)
        .limit(1)
        .get();
      if (!snap.empty) {
        const v = snap.docs[0].data();
        if (v.consumo) inputs.consumption.value = v.consumo;
        // Could fetch price too
      }
    } catch (e) {}
    inputs.price.value = "1.750"; // Mock/Fallback
    calculate();
    btnUseAverages.textContent = "Médias aplicadas";
    setTimeout(
      () => (btnUseAverages.textContent = "Usar médias do meu veículo"),
      2000,
    );
  });

  // ============================
  // NAVIGATION
  // ============================
  btnOpenRoute.addEventListener("click", () => {
    if (!selectedDest) {
      // Shake or focus search?
      btnSearchToggle.click();
      return;
    }

    const dest = encodeURIComponent(selectedDest.address);
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${dest}`,
      "_blank",
    );
  });

  // ============================
  // CRUD FORM
  // ============================
  fabAdd.addEventListener("click", () => {
    openForm();
  });

  btnEditFav.addEventListener("click", () => {
    if (!selectedDest || !selectedDest.isFavorite) return;
    const fav = favorites.find((f) => f.id === selectedDest.favId);
    if (fav) openForm(fav);
  });

  function openForm(fav = null) {
    isEditMode = !!fav;
    if (fav) {
      inputFavName.value = fav.nome;
      inputFavAddress.value = fav.endereco;
      inputFavCategory.value = fav.category || "Outro";
    } else {
      inputFavName.value = "";
      inputFavAddress.value = selectedDest ? selectedDest.address : ""; // Pre-fill if map clicked (future)
      inputFavCategory.value = "Outro";
    }
    setSheetState("form");
  }

  btnCancelForm.addEventListener("click", () => {
    setSheetState(selectedDest ? "half" : "compact");
  });

  btnSaveForm.addEventListener("click", async () => {
    const name = inputFavName.value.trim();
    const addr = inputFavAddress.value.trim();
    const cat = inputFavCategory.value;
    if (!name || !addr) return alert("Preencha tudo");

    try {
      btnSaveForm.textContent = "Guardando...";
      const data = {
        nome: name,
        endereco: addr,
        category: cat,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      if (isEditMode && selectedDest) {
        await db
          .collection("users")
          .doc(auth.currentUser.uid)
          .collection("localizacoes")
          .doc(selectedDest.favId)
          .update(data);
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db
          .collection("users")
          .doc(auth.currentUser.uid)
          .collection("localizacoes")
          .add(data);
      }

      await loadFavorites();
      setSheetState("compact");
    } catch (e) {
      console.error(e);
      alert("Erro");
    } finally {
      btnSaveForm.textContent = "Guardar";
    }
  });

  btnDeleteFav.addEventListener("click", async () => {
    if (!confirm("Apagar?")) return;
    try {
      await db
        .collection("users")
        .doc(auth.currentUser.uid)
        .collection("localizacoes")
        .doc(selectedDest.favId)
        .delete();
      clearSelection();
      loadFavorites();
    } catch (e) {
      console.error(e);
    }
  });

  // ============================
  // SEARCH
  // ============================
  btnSearchToggle.addEventListener("click", () => {
    searchOverlay.classList.toggle("visible");
    if (searchOverlay.classList.contains("visible")) searchInput.focus();
  });
  btnCloseSearch.addEventListener("click", () =>
    searchOverlay.classList.remove("visible"),
  );

  searchInput.addEventListener("input", (e) => {
    const term = e.target.value.toLowerCase();
    searchResults.innerHTML = "";
    if (!term) return;

    const matches = favorites.filter(
      (f) =>
        f.nome.toLowerCase().includes(term) ||
        f.endereco.toLowerCase().includes(term),
    );

    matches.forEach((f) => {
      const div = document.createElement("div");
      div.className = "p-2 border-b flex justify-between cursor-pointer";
      div.innerHTML = `<span>${f.nome}</span> <span class="text-xs text-muted">${f.endereco}</span>`;
      div.addEventListener("click", () => {
        selectDestination({
          name: f.nome,
          address: f.endereco,
          isFavorite: true,
          favId: f.id,
          category: f.category,
        });
        searchOverlay.classList.remove("visible");
        searchInput.value = "";
      });
      searchResults.appendChild(div);
    });
  });

  // ============================
  // UTILS
  // ============================
  function formatCurrency(v) {
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency: "EUR",
    }).format(v);
  }
  function hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++)
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return Math.abs(hash);
  }
});
