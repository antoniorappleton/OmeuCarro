// js/mapa.js
// L100 Premium Map Logic
// Leaflet Integration + Real Geocoding (Nominatim)

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
      detName: document.getElementById("det-name"),
      detAddr: document.getElementById("det-address"),
      inpName: document.getElementById("inp-name"),
      inpAddr: document.getElementById("inp-address"),
      inpCat: document.getElementById("inp-category"),
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
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
        const res = await fetch(url, {
          headers: { "User-Agent": "L100-App/1.0 (internal-demo)" },
        });
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
      // Remove the mock pins layer if it exists
      const oldLayer = document.getElementById("map-pins-layer");
      if (oldLayer) oldLayer.style.display = "none";

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
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            state.map.flyTo([latitude, longitude], 16);

            // Show user marker
            L.circleMarker([latitude, longitude], {
              radius: 8,
              fillColor: "#3b82f6",
              color: "#fff",
              weight: 3,
              fillOpacity: 1,
            }).addTo(state.map);

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
        els.fab.style.bottom = "calc(70px + 16px + 200px)"; // Approx
      } else {
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
                    <div class="pin-shape" style="transform: rotate(-45deg);">
                       <svg class="icon" style="transform: rotate(45deg);"><use href="assets/icons-unified.svg#${iconName}"></use></svg>
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
        chip.textContent = fav.nome;
        chip.addEventListener("click", () => {
          if (fav.lat && fav.lng) {
            const m = markers[fav.id];
            selectFavorite(fav, m);
          } else {
            showToast("Local sem coordenadas. Edite para corrigir.");
            // Auto-select for edit without flying
            state.selected = fav;
            els.detName.textContent = fav.nome;
            els.detAddr.textContent = fav.endereco;
            setSheet("half", "details");
          }
        });
        els.chips.appendChild(chip);
      });
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
    document
      .getElementById("btn-search-open")
      .addEventListener("click", () => els.overlay.classList.add("visible"));
    document
      .getElementById("btn-search-close")
      .addEventListener("click", () => els.overlay.classList.remove("visible"));

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
        item.addEventListener("click", () => {
          const m = markers[fav.id]; // Might be null if no coords
          if (m) {
            selectFavorite(fav, m);
          } else {
            // Select without marker
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
        els.formHeading.textContent = "Editar Favorito";
        els.inpName.value = fav.nome;
        els.inpAddr.value = fav.endereco;
        els.inpCat.value = fav.category || "Outro";
      } else {
        els.formHeading.textContent = "Novo Favorito";
        els.inpName.value = "";
        els.inpAddr.value = "";
        els.inpCat.value = "Outro";
      }
      setSheet("full", "form");
    }

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
          await loadFavorites();

          // If new, find the new item in list to select it?
          // Simplification for now: close to main map
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
    // USE PLANNER
    // ============================
    document.getElementById("btn-use-planner").addEventListener("click", () => {
      if (!state.selected) return;
      const data = {
        id: state.selected.id,
        name: state.selected.nome,
        address: state.selected.endereco,
        category: state.selected.category,
        isFavorite: true,
        favId: state.selected.id,
        // Include coords for planner
        lat: state.selected.lat,
        lng: state.selected.lng,
      };
      localStorage.setItem("selected_destination", JSON.stringify(data));
      window.location.href = "planeador.html";
    });

    // Utils
    const modal = document.getElementById("modal-confirm");
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

    function showToast(msg, type = "info") {
      const el = document.createElement("div");
      el.className = "toast";
      if (type === "error") el.classList.add("error");
      el.textContent = msg;
      document.getElementById("toast-container").appendChild(el);
      requestAnimationFrame(() => el.classList.add("visible"));
      setTimeout(() => {
        el.classList.remove("visible");
        setTimeout(() => el.remove(), 300);
      }, 3000);
    }

    // Init
    initMap();
    auth.onAuthStateChanged((user) => {
      if (user) loadFavorites();
    });
  });
}
