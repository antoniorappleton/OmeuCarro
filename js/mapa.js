// js/mapa.js
// L100 Premium Map Logic
// Leaflet Integration + Real Geocoding (Nominatim)
import { TripCalculator } from "./tripCalculator.js";

if (window.__L100_MAP_INIT__) {
  console.warn("Map already initialized");
} else {
  window.__L100_MAP_INIT__ = true;

  document.addEventListener("DOMContentLoaded", () => {
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
    };

    const els = {
      mapContainer: document.getElementById("map-container"),
      sheet: document.getElementById("sheet"),
      views: {
        quick: document.getElementById("view-quick"),
        details: document.getElementById("view-details"),
        form: document.getElementById("view-form"),
        simulator: document.getElementById("view-simulator"),
      },
      fab: document.getElementById("fab-add"),
      overlay: document.getElementById("search-overlay"),
      searchInput: document.getElementById("search-input"),
      searchResults: document.getElementById("search-results"),
      chips: document.getElementById("quick-chips"),
      detName: document.getElementById("det-name"),
      detAddr: document.getElementById("det-address"),
      inpName: document.getElementById("inp-name"),
      inpAddr: document.getElementById("inp-address"),
      inpCat: document.getElementById("inp-category"),
      inpNotes: document.getElementById("inp-notes"),
      formHeading: document.getElementById("form-heading"),
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
      showToast("A obter localização...");
      if (state.currentLocation) {
        state.map.flyTo(state.currentLocation, 16);
        showToast("Localização encontrada!");
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
        if (viewName === "form") target.classList.add("flex-active");
        else target.classList.add("active");
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

    document
      .querySelector(".sheet-handle-area")
      .addEventListener("click", () => {
        if (state.sheet === "compact") setSheet("half", state.view);
        else if (state.sheet === "half") setSheet("compact", state.view);
        else if (state.sheet === "full") setSheet("half", state.view);
      });

    // ============================
    // DATA & RENDERING
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

        state.favorites = [];
        snap.forEach((doc) =>
          state.favorites.push({ id: doc.id, ...doc.data() }),
        );

        renderPins();
        renderChips();
      } catch (e) {
        console.error(e);
        showToast("Erro ao carregar locais", "error");
      }
    }

    function renderPins() {
      // Clear existing markers
      Object.values(markers).forEach((m) => state.map.removeLayer(m));
      markers = {};

      state.favorites.forEach((fav) => {
        // Determine Coordinates
        // If we have lat/lng, use them.
        // If not, we skip rendering it on map OR render in center?
        // Let's skip and maybe show in list only, or default to center.
        // For a premium feel, skipping "broken" pins is better than cluttering the center.

        if (!fav.lat || !fav.lng) {
          // Try to self-repair next time it's edited or opened?
          // For now, simple logic: ignore
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

    function renderChips() {
      els.chips.innerHTML = "";
      if (state.favorites.length === 0) {
        els.chips.innerHTML =
          '<span class="u-empty-state">Sem favoritos ainda.</span>';
        return;
      }
      state.favorites.slice(0, 5).forEach((fav) => {
        const chip = document.createElement("div");
        chip.className = "chip";
        if (!fav.lat || !fav.lng) chip.classList.add("warning");
        chip.textContent = fav.nome;
        chip.textContent = fav.nome;
        chip.addEventListener("click", async () => {
          if (fav.lat && fav.lng) {
            const m = markers[fav.id];
            selectFavorite(fav, m);
          } else {
            // AUTO-REPAIR: Try to geocode on the fly
            showToast(`A obter coordenadas para "${fav.nome}"...`, "info");

            try {
              const coords = await geocodeAddress(fav.endereco);
              if (coords) {
                // Update DB
                await db
                  .collection("users")
                  .doc(auth.currentUser.uid)
                  .collection("localizacoes")
                  .doc(fav.id)
                  .update({
                    lat: coords.lat,
                    lng: coords.lng,
                  });

                showToast("Localização corrigida!", "success");

                // Update Local State & Map (Wait for listener or manual update)
                // We manually update here to be snappy
                fav.lat = coords.lat;
                fav.lng = coords.lng;

                /* Re-render pins to include new one */
                renderPins();

                /* Select it */
                // We need to find the new marker.
                // renderPins is sync but might need a moment? No, it's instant.
                const m = markers[fav.id];
                if (m) selectFavorite(fav, m);
              } else {
                throw new Error("Geocode Falhou");
              }
            } catch (err) {
              console.error(err);
              showToast("Não foi possível encontrar o local. Edite.", "error");
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
          // Base: Destination
          // Format: https://www.viamichelin.pt/web/Itinerarios?arrival={lat},{lng}&arrivalTid=gps
          // Note: ViaMichelin uses comma separated lat,lng but URL encoded often safer -> actually they use {lat},{lng} in query params usually
          // but constructing valid query params:

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
      document
        .querySelectorAll(".map-pin")
        .forEach((p) => p.classList.remove("active"));
      setSheet("compact", "quick");
    }

    // ============================
    // CRUD & SEARCH
    // ============================
    // Search Logic
    document.getElementById("btn-search-open").addEventListener("click", () => {
      els.overlay.classList.add("visible");
      setTimeout(() => els.searchInput.focus(), 100);
    });

    function closeSearch() {
      els.overlay.classList.remove("visible");
      els.searchInput.value = "";
      els.searchResults.innerHTML = "";
    }

    document
      .getElementById("btn-search-close")
      .addEventListener("click", closeSearch);

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
            showToast("A recuperar coordenadas...", "info");
            try {
              const coords = await geocodeAddress(fav.endereco);
              if (coords) {
                await db
                  .collection("users")
                  .doc(auth.currentUser.uid)
                  .collection("localizacoes")
                  .doc(fav.id)
                  .update({
                    lat: coords.lat,
                    lng: coords.lng,
                  });
                showToast("Localizado!", "success");
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
              showToast("Morada desconhecida. Edite.", "error");
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
          els.overlay.classList.remove("visible");
          els.searchInput.value = "";
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
        if (chip) {
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
          return showToast("Preencha todos os campos", "error");

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
            showToast("A procurar endereço...", "info");
            const coords = await geocodeAddress(addr);
            if (!coords) {
              throw new Error("Endereço não encontrado");
            }
            lat = coords.lat;
            lng = coords.lng;
          }

          const data = {
            nome: name,
            endereco: addr,
            category: cat,
            notes: notes,
            lat: lat,
            lng: lng,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          };

          if (state.isEdit && state.selected) {
            await db
              .collection("users")
              .doc(auth.currentUser.uid)
              .collection("localizacoes")
              .doc(state.selected.id)
              .update(data);
          } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db
              .collection("users")
              .doc(auth.currentUser.uid)
              .collection("localizacoes")
              .add(data);
          }

          showToast("Guardado com sucesso!");

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
            showToast(
              "Endereço desconhecido. Tente ser mais específico.",
              "error",
            );
          } else {
            showToast("Erro ao guardar. Tente novamente.", "error");
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
          await db
            .collection("users")
            .doc(auth.currentUser.uid)
            .collection("localizacoes")
            .doc(state.selected.id)
            .delete();
          showToast("Apagado");
          loadFavorites();
          hideModal();
          deselect();
        } catch (e) {
          showToast("Erro", "error");
          hideModal();
        }
      };
      showModal();
    });

    // ============================
    // NAVIGATION LOGIC (Handled in selectFavorite)
    // ============================

    // ============================
    // USE PLANNER (REMOVED)
    // ============================
    // Logic removed as per user request.

    // Utils
    const modal = document.getElementById("modal-confirm");
    const backdrop = document.querySelector(".modal-backdrop"); // Assuming backdrop is the modal container? No, it's modal itself typically.
    // CSS check: .modal-backdrop is the container. id="modal-confirm" is likely proper.

    function showModal() {
      modal.classList.add("visible");
    }
    function hideModal() {
      modal.classList.remove("visible");
    }

    document
      .getElementById("btn-modal-cancel")
      .addEventListener("click", hideModal);
    document
      .getElementById("btn-modal-confirm")
      .addEventListener("click", () => {
        if (confirmCallback) confirmCallback();
      });

    // UX Premium: Backdrop click + ESC
    modal.addEventListener("click", (e) => {
      if (e.target === modal) hideModal();
    });

    // ============================
    // SIMULATOR LOGIC
    // ============================
    const simInputs = {
      dist: document.getElementById("sim-dist"),
      cons: document.getElementById("sim-cons"),
      price: document.getElementById("sim-price"),
      trips: document.getElementById("sim-trips"),
      tolls: document.getElementById("sim-tolls"),
      people: document.getElementById("sim-people"),
      // Results
      resFuelCost: document.getElementById("sim-res-fuel-cost"),
      resTolls: document.getElementById("sim-res-tolls"),
      resTotal: document.getElementById("sim-result-cost"),
      resPerson: document.getElementById("sim-res-person"),
    };

    const btnSimOpen = document.getElementById("btn-simulator-open");
    const btnSimClose = document.getElementById("btn-close-simulator");
    const btnUseDb = document.getElementById("btn-use-db");

    if (btnSimOpen) {
      btnSimOpen.addEventListener("click", () => {
        setSheet("half", "simulator");
      });
    }

    if (btnSimClose) {
      btnSimClose.addEventListener("click", () => {
        setSheet("compact", "quick");
      });
    }

    // Database Button
    if (btnUseDb) {
      btnUseDb.addEventListener("click", () => {
        const data = TripCalculator.getDatabaseAverages();
        if (simInputs.cons) simInputs.cons.value = data.consumo;
        if (simInputs.price) simInputs.price.value = data.precoLitro;
        window.showToast("Média da BD aplicada!", "success");
        calculateSim();
      });
    }

    function calculateSim() {
      // Gather Data with explicit checks
      const data = {
        km: simInputs.dist && simInputs.dist.value ? simInputs.dist.value : 0,
        consumo:
          simInputs.cons && simInputs.cons.value ? simInputs.cons.value : 0,
        precoLitro:
          simInputs.price && simInputs.price.value ? simInputs.price.value : 0,
        viagens:
          simInputs.trips && simInputs.trips.value ? simInputs.trips.value : 1,
        portagens:
          simInputs.tolls && simInputs.tolls.value ? simInputs.tolls.value : 0,
        pessoas:
          simInputs.people && simInputs.people.value
            ? simInputs.people.value
            : 1,
      };

      // Calculate
      const res = TripCalculator.calculate(data);

      // Render
      const setTxt = (el, txt) => {
        if (el) el.textContent = txt;
      };

      setTxt(simInputs.resFuelCost, `${res.custoCombustivel.toFixed(2)} €`);
      setTxt(simInputs.resTolls, `${res.portagensTotais.toFixed(2)} €`);
      setTxt(simInputs.resTotal, `${res.custoTotal.toFixed(2)} €`);
      setTxt(simInputs.resPerson, `${res.custoPorPessoa.toFixed(2)} €`);
    }

    // Bind inputs
    const allInps = [
      simInputs.dist,
      simInputs.cons,
      simInputs.price,
      simInputs.trips,
      simInputs.tolls,
      simInputs.people,
    ];

    allInps.forEach((inp) => {
      if (inp) inp.addEventListener("input", calculateSim);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal.classList.contains("visible")) hideModal();
        if (els.overlay.classList.contains("visible")) closeSearch();
      }
    });

    // Local showToast removed in favor of global window.showToast from utils.js

    // Init
    initMap();
    auth.onAuthStateChanged((user) => {
      if (user) loadFavorites();
    });
  });
}
