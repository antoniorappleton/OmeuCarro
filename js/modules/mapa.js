// js/mapa.js
// L100 Premium Map Logic
// Leaflet Integration + Real Geocoding (Nominatim)
// TripCalculator is now loaded as a module

if (window.__L100_MAP_INIT__) {
  console.warn("Map already initialized");
} else {
  window.__L100_MAP_INIT__ = true;

  // DOM is ready because this is a module/defer script
  console.log("Map Module Start");

  // ============================
  // STATE & REFS
  // ============================
  // ============================
  // STATE & REFS
  // ============================
  const state = {
    map: null,
    sheet: "compact", // compact, half, full
    view: "quick", // quick, details, form
    favorites: [],
    selected: null,
    isEdit: false,
    initialZoom: 13,
    initialCenter: [38.722, -9.139], // Lisbon Default
    userMarker: null,
    currentLocation: null, // [lat, lng]
    // Filter & Categories
    filterCategory: "Todos",
    availableCategories: [],
  };

  const els = {
    mapContainer: document.getElementById("map-container"),
    sheet: document.getElementById("sheet"),
    views: {
      quick: document.getElementById("view-quick"),
      details: document.getElementById("view-details"),
      form: document.getElementById("view-form"),
    },
    fab: document.getElementById("fab-add"),
    overlay: document.getElementById("search-overlay"),
    searchInput: document.getElementById("search-input"),
    searchResults: document.getElementById("search-results"),
    chips: document.getElementById("quick-chips"),
    filters: document.getElementById("category-filters"), // New
    detName: document.getElementById("det-name"),
    detAddr: document.getElementById("det-address"),
    inpName: document.getElementById("inp-name"),
    inpAddr: document.getElementById("inp-address"),
    inpCat: document.getElementById("inp-category"),
    inpNotes: document.getElementById("inp-notes"),
    formHeading: document.getElementById("form-heading"),
    typeChipsContainer: document.getElementById("type-chips-container"),
  };

  let confirmCallback = null;
  let markers = {}; // id -> L.marker

  // ============================
  // GEOCODING SERVICE (Nominatim)
  // ============================
  // Rate limit: 1 request per second strictly enforced
  let lastGeocodeTime = 0;

  async function geocodeAddress(address) {
    const now = Date.now();
    if (now - lastGeocodeTime < 1100) {
      await new Promise((r) => setTimeout(r, 1100 - (now - lastGeocodeTime)));
    }
    lastGeocodeTime = Date.now();

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=pt`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("API Error");
      const data = await res.json();

      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
      return null;
    } catch (e) {
      console.warn("Geocoding failed:", e);
      return null;
    }
  }

  // ============================
  // MAP INITIALIZATION (Leaflet)
  // ============================
  function initMap() {
    state.map = L.map("map-container", {
      zoomControl: false,
      attributionControl: true, // OSM requires attribution
    }).setView(state.initialCenter, state.initialZoom);

    // STANDARD OPENSTREETMAP TILES (Real Map)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(state.map);

    state.map.on("click", () => {
      deselect();
    });

    // GPS Watcher
    if ("geolocation" in navigator) {
      navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          state.currentLocation = [latitude, longitude];
          window.L100_CURRENT_LOC = { lat: latitude, lng: longitude };

          // Update user marker
          if (state.userMarker) {
            state.userMarker.setLatLng([latitude, longitude]);
          } else {
            state.userMarker = L.circleMarker([latitude, longitude], {
              radius: 8,
              fillColor: "#3b82f6",
              color: "#fff",
              weight: 3,
              fillOpacity: 1,
            }).addTo(state.map);
          }

          // Update nav link if needed
          updateNavigationLink();
        },
        (err) => console.warn("GPS Watch Error", err),
        { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 },
      );
    }
  }

  // ============================
  // MAP CONTROLS
  // ============================
  document.getElementById("btn-zoom-in").addEventListener("click", () => {
    state.map.zoomIn();
  });

  document.getElementById("btn-zoom-out").addEventListener("click", () => {
    state.map.zoomOut();
  });

  document.getElementById("btn-my-loc").addEventListener("click", () => {
    window.showToast("A obter localização...");
    if (state.currentLocation) {
      state.map.flyTo(state.currentLocation, 16);
      window.showToast("Localização encontrada!");
    } else {
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            state.map.flyTo([latitude, longitude], 16);
            // (Marker updated by watcher eventually)
            showToast("Localização encontrada!");
          },
          (err) => {
            console.error(err);
            showToast("Permissão negada ou erro de GPS", "error");
          },
        );
      } else {
        showToast("Geolocalização não suportada", "error");
      }
    }
  });

  // ============================
  // SHEET STATE MACHINE
  // ============================
  function setSheet(size, viewName) {
    state.sheet = size;
    state.view = viewName;
    els.sheet.setAttribute("data-state", size);

    Object.values(els.views).forEach((el) =>
      el.classList.remove("active", "flex-active"),
    );

    const target = els.views[viewName];
    if (target) {
      // Fix for visibility: form needs flex layout
      const needsFlex = viewName === "form";

      if (needsFlex) {
        target.classList.add("flex-active");
        // Ensure explicit display property is set via style just in case of CSS conflicts
        target.style.display = "flex";
        target.style.flexDirection = "column";
        target.style.height = "100%";
      } else {
        target.classList.add("active");
        target.style.display = "block";
        target.style.height = "auto"; // Reset if reused? Not needed if disjoint
      }
    }

    if (size === "compact" && viewName === "quick") {
      els.fab.classList.remove("hidden");
      // Use class for positioning
      requestAnimationFrame(() => els.fab.classList.add("compact"));
    } else {
      els.fab.classList.remove("compact");
      els.fab.classList.add("hidden");
    }
  }

  document.querySelector(".sheet-handle-area").addEventListener("click", () => {
    if (state.sheet === "compact") setSheet("half", state.view);
    else if (state.sheet === "half") setSheet("compact", state.view);
    else if (state.sheet === "full") setSheet("half", state.view);
  });

  // ============================
  // DATA & RENDERING
  // ============================
  async function loadFavorites() {
    if (!window.auth.currentUser) return;
    try {
      const snap = await window.db
        .collection("users")
        .doc(window.auth.currentUser.uid)
        .collection("localizacoes")
        .orderBy("createdAt", "desc")
        .get();

      state.favorites = [];
      snap.forEach((doc) =>
        state.favorites.push({ id: doc.id, ...doc.data() }),
      );

      // Load Categories
      if (window.getMapCategories) {
        state.availableCategories = await window.getMapCategories();
      } else {
        state.availableCategories = ["Casa", "Trabalho", "Outro"];
      }

      renderPins();
      renderFilters();
      renderChips();
    } catch (e) {
      console.error(e);
      window.showToast("Erro ao carregar locais", "error");
    }
  }

  function renderPins() {
    // Clear existing markers
    Object.values(markers).forEach((m) => state.map.removeLayer(m));
    markers = {};

    state.favorites.forEach((fav) => {
      if (!fav.lat || !fav.lng) {
        return;
      }

      const lat = fav.lat;
      const lng = fav.lng;

      let iconName = "icon-pin";
      if (fav.category === "Casa") iconName = "icon-home";
      if (fav.category === "Trabalho") iconName = "icon-car";

      // Create Custom DivIcon (L100 Style)
      const iconHtml = `
                    <div class="pin-shape pin-rotate-base">
                       <svg class="icon pin-icon-rotate"><use href="assets/icons-unified.svg#${iconName}"></use></svg>
                    </div>
                    <div class="pin-label">${fav.nome}</div>
                `;

      const customIcon = L.divIcon({
        className: "map-pin-leaflet",
        html: `<div class="map-pin">${iconHtml}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      });

      const marker = L.marker([lat, lng], { icon: customIcon }).addTo(
        state.map,
      );

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        selectFavorite(fav, marker);
      });

      markers[fav.id] = marker;
    });
  }

  function renderFilters() {
    if (!els.filters) return;
    els.filters.innerHTML = "";

    const cats = [
      "Todos",
      ...(Array.isArray(state.availableCategories)
        ? state.availableCategories
        : ["Casa", "Trabalho", "Outro"]),
    ];

    cats.forEach((cat) => {
      const pill = document.createElement("div");
      pill.className = "filter-pill";
      if (state.filterCategory === cat) pill.classList.add("active");
      pill.textContent = cat;
      pill.onclick = () => {
        state.filterCategory = cat;
        renderFilters();
        renderChips();
      };
      els.filters.appendChild(pill);
    });
  }

  function renderChips() {
    els.chips.innerHTML = "";

    // Filter
    let list = state.favorites;
    if (state.filterCategory && state.filterCategory !== "Todos") {
      list = list.filter((f) => f.category === state.filterCategory);
    }

    if (list.length === 0) {
      els.chips.innerHTML =
        '<span class="u-empty-state" style="padding: 10px; color: #888;">Sem favoritos nesta categoria.</span>';
      return;
    }

    // Allow more items since we wrap
    list.slice(0, 50).forEach((fav) => {
      const chip = document.createElement("div");
      chip.className = "chip";
      if (!fav.lat || !fav.lng) chip.classList.add("warning");
      chip.textContent = fav.nome;
      chip.addEventListener("click", async () => {
        if (fav.lat && fav.lng) {
          const m = markers[fav.id];
          selectFavorite(fav, m);
        } else {
          // AUTO-REPAIR: Try to geocode on the fly
          window.showToast(`A obter coordenadas para "${fav.nome}"...`, "info");

          try {
            const coords = await geocodeAddress(fav.endereco);
            if (coords) {
              // Update DB
              await window.db
                .collection("users")
                .doc(window.auth.currentUser.uid)
                .collection("localizacoes")
                .doc(fav.id)
                .update({
                  lat: coords.lat,
                  lng: coords.lng,
                });

              window.showToast("Localização corrigida!", "success");

              // Update Local State & Map (Wait for listener or manual update)
              // We manually update here to be snappy
              fav.lat = coords.lat;
              fav.lng = coords.lng;

              /* Re-render pins to include new one */
              renderPins();

              /* Select it */
              const m = markers[fav.id];
              if (m) selectFavorite(fav, m);
            } else {
              throw new Error("Geocode Falhou");
            }
          } catch (err) {
            console.error(err);
            window.showToast(
              "Não foi possível encontrar o local. Edite.",
              "error",
            );
            // Fallback to Edit Mode
            state.selected = fav;
            els.detName.textContent = fav.nome;
            els.detAddr.textContent = fav.endereco;
            setSheet("half", "details");
          }
        }
      });
      els.chips.appendChild(chip);
    });
  }

  // ============================
  // HELPER: Update Nav Link
  // ============================
  function updateNavigationLink() {
    const btnNav = document.getElementById("btn-navigate");
    const btnVia = document.getElementById("btn-viamichelin");

    if (!btnNav && !btnVia) return;

    const fav = state.selected;

    // 1. Google Maps Navigation
    if (btnNav) {
      if (fav && fav.lat && fav.lng) {
        let url = `https://www.google.com/maps/dir/?api=1&destination=${fav.lat},${fav.lng}`;
        if (state.currentLocation) {
          const [uLat, uLng] = state.currentLocation;
          url += `&origin=${uLat},${uLng}`;
        }
        btnNav.href = url;
        btnNav.style.opacity = "1";
        btnNav.style.pointerEvents = "auto";
      } else {
        btnNav.removeAttribute("href");
        btnNav.style.opacity = "0.5";
        btnNav.style.pointerEvents = "none";
      }
    }

    // 2. ViaMichelin Route Planner
    if (btnVia) {
      if (fav && fav.lat && fav.lng) {
        let vmUrl = `https://www.viamichelin.pt/web/Itinerarios?arrival=${fav.lat},${fav.lng}&arrivalTid=gps`;

        if (state.currentLocation) {
          const [uLat, uLng] = state.currentLocation;
          vmUrl += `&departure=${uLat},${uLng}&departureTid=gps`;
        }

        btnVia.href = vmUrl;
        btnVia.style.opacity = "1";
        btnVia.style.pointerEvents = "auto";
      } else {
        btnVia.removeAttribute("href");
        btnVia.style.opacity = "0.5";
        btnVia.style.pointerEvents = "none";
      }
    }
  }

  function selectFavorite(fav, markerInstance) {
    state.selected = fav;
    window.L100_SELECTED_DEST = {
      id: fav.id,
      nome: fav.nome,
      endereco: fav.endereco,
      lat: fav.lat,
      lng: fav.lng,
    };

    // Highlight Logic
    document
      .querySelectorAll(".map-pin")
      .forEach((p) => p.classList.remove("active"));
    if (markerInstance) {
      const el = markerInstance.getElement();
      if (el) {
        const pin = el.querySelector(".map-pin");
        if (pin) pin.classList.add("active");
      }
      state.map.flyTo(markerInstance.getLatLng(), 16, { duration: 1.5 });
    }

    els.detName.textContent = fav.nome;
    els.detAddr.textContent = fav.endereco;

    updateNavigationLink();

    setSheet("half", "details");
  }

  function deselect() {
    state.selected = null;
    window.L100_SELECTED_DEST = null;
    document
      .querySelectorAll(".map-pin")
      .forEach((p) => p.classList.remove("active"));
    setSheet("compact", "quick");
  }

  // ============================
  // CRUD & SEARCH
  // ============================
  // ============================
  // HISTORY & NAVIGATION STATE
  // ============================
  window.addEventListener("popstate", (event) => {
    const state = event.state;
    // If we popped back to null or initial state, close everything
    if (!state || !state.modal) {
      closeSearch(false); // false = don't go back, just close
      closeTripModal(false);
    } else if (state.modal === "search") {
      // If we somehow went FORWARD to search? Unlikely flow, but ensure open
      els.overlay.classList.add("visible");
    } else if (state.modal === "trip") {
      document
        .getElementById("modal-trip-calculator")
        .classList.remove("hidden");
    }
  });

  function pushModalState(modalName) {
    history.pushState({ modal: modalName }, "", `#${modalName}`);
  }

  function goBackIfModalOpen() {
    // If we have a hash or state, go back
    if (history.state && history.state.modal) {
      history.back();
    }
  }

  // ============================
  // CRUD & SEARCH
  // ============================
  // Search Logic
  function openSearch() {
    pushModalState("search");
    els.overlay.classList.add("visible");
    setTimeout(() => els.searchInput.focus(), 100);
  }

  function closeSearch(doBack = true) {
    els.overlay.classList.remove("visible");
    els.searchInput.value = "";
    els.searchResults.innerHTML = "";
    if (doBack) goBackIfModalOpen();
  }

  document
    .getElementById("btn-search-open")
    .addEventListener("click", openSearch);
  document
    .getElementById("btn-search-close")
    .addEventListener("click", () => closeSearch(true));

  let debounceTimer;
  els.searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const term = e.target.value.toLowerCase();
      renderSearchResults(term);
    }, 250);
  });

  function renderSearchResults(term) {
    els.searchResults.innerHTML = "";
    if (!term) return;
    // Search local favorites logic
    const matches = state.favorites.filter(
      (f) =>
        f.nome.toLowerCase().includes(term) ||
        f.endereco.toLowerCase().includes(term),
    );
    matches.forEach((fav) => {
      const item = document.createElement("div");
      item.className = "result-item";
      item.innerHTML = `
                     <div class="result-info"><div>${fav.nome}</div><div>${fav.endereco}</div></div>
                     <div><svg class="icon icon-result"><use href="assets/icons-unified.svg#icon-car"></use></svg></div>
                 `;
      item.addEventListener("click", async () => {
        const m = markers[fav.id]; // Might be null if no coords
        if (m) {
          selectFavorite(fav, m);
        } else if (!fav.lat || !fav.lng) {
          // AUTO-REPAIR Logic (Search Context)
          window.showToast("A recuperar coordenadas...", "info");
          try {
            const coords = await geocodeAddress(fav.endereco);
            if (coords) {
              await window.db
                .collection("users")
                .doc(window.auth.currentUser.uid)
                .collection("localizacoes")
                .doc(fav.id)
                .update({
                  lat: coords.lat,
                  lng: coords.lng,
                });
              window.showToast("Localizado!", "success");
              // Update local & visual
              fav.lat = coords.lat;
              fav.lng = coords.lng;
              renderPins();

              const newM = markers[fav.id];
              if (newM) selectFavorite(fav, newM);
            } else {
              throw new Error("No coords");
            }
          } catch (e) {
            window.showToast("Morada desconhecida. Edite.", "error");
            state.selected = fav;
            els.detName.textContent = fav.nome;
            els.detAddr.textContent = fav.endereco;
            setSheet("half", "details");
          }
        } else {
          // Should not happen if m exists, but fallback
          state.selected = fav;
          els.detName.textContent = fav.nome;
          els.detAddr.textContent = fav.endereco;
          setSheet("half", "details");
        }
        closeSearch(true); // Close search and go back
      });
      els.searchResults.appendChild(item);
    });
  }

  // CRUD Forms
  els.fab.addEventListener("click", () => {
    state.isEdit = false;
    openForm();
  });
  document.getElementById("btn-edit").addEventListener("click", () => {
    if (state.selected) {
      state.isEdit = true;
      openForm(state.selected);
    }
  });

  function renderFormCategoryChips() {
    if (!els.typeChipsContainer) return;
    els.typeChipsContainer.innerHTML = "";

    state.availableCategories.forEach((cat) => {
      const btn = document.createElement("button");
      btn.className = "type-chip";
      btn.setAttribute("data-value", cat);

      let icon = "icon-pin";
      if (cat === "Casa") icon = "icon-home";
      else if (cat === "Trabalho") icon = "icon-car";

      btn.innerHTML = `<svg class="icon"><use href="assets/icons-unified.svg#${icon}"></use></svg> ${cat}`;
      els.typeChipsContainer.appendChild(btn);
    });

    // Add "+" Button
    const addBtn = document.createElement("button");
    addBtn.className = "type-chip";
    addBtn.id = "btn-add-cat-ui"; // ID for easy ref
    addBtn.innerHTML = `<svg class="icon"><use href="assets/icons-unified.svg#icon-plus"></use></svg> Novo`;

    addBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // 1. Replace content with Input
      addBtn.classList.add("input-mode");
      addBtn.innerHTML = `
            <input type="text" id="new-cat-input" class="chip-input" placeholder="Nome" />
            <div class="chip-actions">
                <button id="btn-confirm-cat" class="icon-btn-xs"><svg class="icon"><use href="assets/icons-unified.svg#icon-check"></use></svg></button>
                <button id="btn-cancel-cat" class="icon-btn-xs"><svg class="icon"><use href="assets/icons-unified.svg#icon-close"></use></svg></button>
            </div>
        `;

      // 2. Focus
      const input = addBtn.querySelector("input");
      input.focus();

      // 3. Bind Actions
      const confirm = async () => {
        const val = input.value.trim();
        if (val) {
          if (!state.availableCategories.includes(val)) {
            // Save to DB
            await window.addMapCategory(val);
            state.availableCategories.push(val);
            renderFilters(); // Update main filters
          }
          // Re-render form chips (restores UI)
          renderFormCategoryChips();
          // Select it
          els.inpCat.value = val;
          updateChips(val);
        }
      };

      const cancel = () => {
        renderFormCategoryChips(); // Reset
      };

      addBtn.querySelector("#btn-confirm-cat").onclick = (ev) => {
        ev.stopPropagation();
        confirm();
      };

      addBtn.querySelector("#btn-cancel-cat").onclick = (ev) => {
        ev.stopPropagation();
        cancel();
      };

      input.onkeydown = (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault(); // Prevent form submit
          confirm();
        }
        if (ev.key === "Escape") cancel();
      };

      input.onclick = (ev) => ev.stopPropagation(); // Prevent chip select
    };
    els.typeChipsContainer.appendChild(addBtn);
  }

  function openForm(fav = null) {
    if (fav) {
      els.formHeading.textContent = "Editar Local";
      els.inpName.value = fav.nome;
      els.inpAddr.value = fav.endereco;
      els.inpCat.value = fav.category || "Outro";
      els.inpNotes.value = fav.notes || "";
    } else {
      els.formHeading.textContent = "Novo Local";
      els.inpName.value = "";
      els.inpAddr.value = "";
      els.inpCat.value = "Outro";
      els.inpNotes.value = "";
    }

    // Render Chips Dynamic
    renderFormCategoryChips();

    updateChips(els.inpCat.value);
    setSheet("full", "form");
  }

  // Chips Logic
  function updateChips(selectedVal) {
    document.querySelectorAll(".type-chip").forEach((chip) => {
      if (chip.dataset.value === selectedVal) {
        chip.classList.add("active");
      } else {
        chip.classList.remove("active");
      }
    });
  }

  // Bind Chip Clicks (Global or Event Delegation)
  document
    .getElementById("type-chips-container")
    .addEventListener("click", (e) => {
      const chip = e.target.closest(".type-chip");
      // Ignora se for o botão "+ Novo" que já tem handler próprio
      if (chip && chip.hasAttribute("data-value")) {
        const val = chip.dataset.value;
        els.inpCat.value = val;
        updateChips(val);
      }
    });

  document.getElementById("btn-cancel-form").addEventListener("click", () => {
    if (state.selected) setSheet("half", "details");
    else setSheet("compact", "quick");
  });

  // SAVE BUTTON - WITH GEOCODING LOGIC
  document
    .getElementById("btn-save-form")
    .addEventListener("click", async () => {
      const name = els.inpName.value.trim();
      const addr = els.inpAddr.value.trim();
      const cat = els.inpCat.value;
      const notes = els.inpNotes.value.trim();

      if (!name || !addr)
        return window.showToast("Preencha todos os campos", "error");

      let lat = null;
      let lng = null;

      const btn = document.getElementById("btn-save-form");
      const oldText = btn.textContent;
      btn.textContent = "A guardar...";
      btn.disabled = true;

      try {
        // Check if Address Changed or is New
        let needsGeocoding = true;
        if (state.isEdit && state.selected) {
          if (
            state.selected.endereco === addr &&
            state.selected.lat &&
            state.selected.lng
          ) {
            needsGeocoding = false;
            lat = state.selected.lat;
            lng = state.selected.lng;
          }
        }

        if (needsGeocoding) {
          window.showToast("A procurar endereço...", "info");
          try {
            const coords = await geocodeAddress(addr);
            if (coords) {
              lat = coords.lat;
              lng = coords.lng;
            } else {
              throw new Error("AddressNotFound");
            }
          } catch (err) {
            // Fallback: Use Map Center
            console.warn("Geocoding failed, using map center.");
            window.showToast(
              "Endereço não exato. Usado o centro do mapa.",
              "warning",
            );
            const center = state.map.getCenter();
            lat = center.lat;
            lng = center.lng;
          }
        }

        const data = {
          nome: name,
          endereco: addr,
          category: cat,
          notes: notes,
          lat: lat,
          lng: lng,
          updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
        };

        if (state.isEdit && state.selected) {
          await window.db
            .collection("users")
            .doc(window.auth.currentUser.uid)
            .collection("localizacoes")
            .doc(state.selected.id)
            .update(data);
        } else {
          data.createdAt =
            window.firebase.firestore.FieldValue.serverTimestamp();
          await window.db
            .collection("users")
            .doc(window.auth.currentUser.uid)
            .collection("localizacoes")
            .add(data);
        }

        window.showToast("Guardado com sucesso!");

        // Preserve Selection Context
        const savedId =
          state.isEdit && state.selected ? state.selected.id : null; // Logic for new ID requires doc ref returned by add(), simplified here to just reload

        await loadFavorites();

        if (savedId) {
          const freshFav = state.favorites.find((f) => f.id === savedId);
          if (freshFav) {
            const m = markers[freshFav.id];
            selectFavorite(freshFav, m);
            setSheet("half", "details");
            return;
          }
        }

        // If new or lost, reset
        setSheet("compact", "quick");

        // Fly to new location
        state.map.flyTo([lat, lng], 16, { duration: 1.5 });
      } catch (e) {
        console.error(e);
        if (e.message === "Endereço não encontrado") {
          window.showToast(
            "Endereço desconhecido. Tente ser mais específico.",
            "error",
          );
        } else {
          window.showToast("Erro ao guardar. Tente novamente.", "error");
        }
      } finally {
        btn.textContent = oldText;
        btn.disabled = false;
      }
    });

  document.getElementById("btn-delete").addEventListener("click", () => {
    if (!state.selected) return;
    confirmCallback = async () => {
      try {
        await window.db
          .collection("users")
          .doc(window.auth.currentUser.uid)
          .collection("localizacoes")
          .doc(state.selected.id)
          .delete();
        window.showToast("Apagado");
        loadFavorites();
        hideModal();
        deselect();
      } catch (e) {
        window.showToast("Erro", "error");
        hideModal();
      }
    };
    showModal();
  });

  // ============================
  // NAVIGATION LOGIC (Handled in selectFavorite)
  // ============================

  // ============================
  // TRIP CALCULATOR MODAL HANDLERS
  // ============================
  const tripModal = document.getElementById("modal-trip-calculator");
  const btnTripClose = document.getElementById("trip-modal-close");

  function openTripModal() {
    pushModalState("trip");
    tripModal.classList.remove("hidden");
    // Lazy init logic
    if (typeof window.initTripCalculator === "function") {
      window.initTripCalculator();
    }
  }

  function closeTripModal(doBack = true) {
    tripModal.classList.add("hidden");
    if (doBack) goBackIfModalOpen();
  }

  document
    .getElementById("btn-simulator-open")
    .addEventListener("click", openTripModal);
  btnTripClose.addEventListener("click", () => closeTripModal(true));

  // Close on backdrop click
  tripModal.addEventListener("click", (e) => {
    if (e.target === tripModal) closeTripModal(true);
  });

  // Utils
  const modal = document.getElementById("modal-confirm");
  const backdrop = document.querySelector(".modal-backdrop");

  function showModal() {
    modal.classList.add("visible");
  }
  function hideModal() {
    modal.classList.remove("visible");
  }

  document
    .getElementById("btn-modal-cancel")
    .addEventListener("click", hideModal);
  document.getElementById("btn-modal-confirm").addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
  });

  // UX Premium: Backdrop click + ESC
  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  // Global Escape Handler
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (tripModal && !tripModal.classList.contains("hidden")) {
        closeTripModal(true); // Close and back
        return;
      }

      if (modal.classList.contains("visible")) hideModal();
      if (els.overlay.classList.contains("visible")) closeSearch(true);
    }
  });

  // Init
  initMap();
  window.auth.onAuthStateChanged((user) => {
    if (user) {
      loadFavorites();

      // --- NOVO: Listener de mensagens e refresh automático do token ---
      if (typeof window.listenToForegroundMessages === "function") {
        window.listenToForegroundMessages();
      }
      if ("Notification" in window && Notification.permission === "granted") {
        getUserSettings().then((settings) => {
          if (settings && settings.notificacoesAtivas !== false) {
            console.log("[Mapa] A atualizar token FCM...");
            window
              .requestNotificationPermissionAndSaveToken()
              .catch(console.error);
          }
        });
      }
      // -----------------------------------------------------------------
    }
  });
}
