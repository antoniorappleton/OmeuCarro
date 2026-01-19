/**
 * Trip Calculator Module - Modal Version
 * Decoupled from Sheet logic. Uses Global State for Maps.
 */

(function() {
    // IDEMPOTENCY GUARD
    if (window.__TRIP_CALC_INIT__) {
        console.log("[TripCalculator] Module already loaded.");
        return;
    }
    window.__TRIP_CALC_INIT__ = true;

    // STATE & DEFAULTS
    const defaults = {
        viagens: 1,
        pessoas: 1,
        portagens: 0,
        distancia: 0,
        consumo: 0,
        preco: 0
    };
    
    let userVehicles = [];

    // --- MAIN INIT FUNCTION ---
    window.initTripCalculator = async function() {
        console.log("[TripCalculator] Initializing UI...");
        
        // 1. Inject Vehicle Select (if missing)
        await injectVehicleSelector();
        
        // 2. Bind Listeners (Idempotent check inside)
        bindListeners();
        
        // 3. Initial Calc Run
        calculate();
    };

    // --- DOM / INJECTION ---
    async function injectVehicleSelector() {
        const modalBody = document.getElementById("trip-modal-body");
        if (!modalBody) {
             console.warn("[TripCalculator] Modal body not found.");
             return;
        }

        // Check if already exists
        if (document.getElementById("trip-vehicle-select-container")) return;

        // Container structure matches strict style requirements
        const div = document.createElement("div");
        div.id = "trip-vehicle-select-container";
        div.className = "mt-2 mb-4";
        div.innerHTML = `
            <h3 class="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 px-1 mb-3">Veículo</h3>
            <div class="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden p-4">
                 <div class="trip-input-group">
                    <select id="trip-vehicle-select" class="w-full bg-transparent border-none p-0 text-xl font-bold text-primary dark:text-white focus:ring-0" style="background:none;">
                        <option value="">Selecionar Veículo...</option>
                    </select>
                 </div>
            </div>
        `;
        
        // Insert at TOP of body
        modalBody.insertBefore(div, modalBody.firstChild);
        
        // Load Data
        await loadUserVehicles();
    }

    async function loadUserVehicles() {
        if (!window.auth?.currentUser || !window.db) return;
        
        try {
            const snap = await window.db.collection("users")
                .doc(window.auth.currentUser.uid)
                .collection("veiculos")
                .get();
                
            const select = document.getElementById("trip-vehicle-select");
            if (!select) return;
            
            // Clear except default (rebuilt just in case)
            select.innerHTML = '<option value="">Manual / Genérico</option>';
            userVehicles = [];

            snap.forEach(doc => {
                 const v = { id: doc.id, ...doc.data() };
                 userVehicles.push(v);
                 const opt = document.createElement("option");
                 opt.value = v.id;
                 opt.textContent = `${v.nome} (${v.combustivelPadrao || "?"})`;
                 select.appendChild(opt);
            });
            
            // Bind Change Event Here (Directly on Element)
            select.addEventListener("change", handleVehicleChange);
            
        } catch (e) {
            console.error("[TripCalculator] Error loading vehicles", e);
        }
    }

    function handleVehicleChange(e) {
        const vid = e.target.value;
        const inpConsumo = document.getElementById("trip-consumo");
        const inpPreco = document.getElementById("trip-preco");
        
        if (!vid) return; // Manual mode
        
        const v = userVehicles.find(x => x.id === vid);
        if (v) {
             let estPrice = 0;
             // Basic heuristic for price defaults
             if (v.combustivelPadrao?.includes("Gasolina")) estPrice = 1.75;
             else if (v.combustivelPadrao?.includes("Diesel") || v.combustivelPadrao?.includes("Gasóleo")) estPrice = 1.65;
             else if (v.combustivelPadrao?.includes("GPL")) estPrice = 0.95;
             
             if (estPrice > 0 && inpPreco) inpPreco.value = estPrice;
             if (v.consumoMedio && inpConsumo) inpConsumo.value = v.consumoMedio;
             
             calculate();
        }
    }

    // --- CALCULATION CORE ---
    function calculate() {
        // Read Inputs
        const refs = {
            consumo: document.getElementById("trip-consumo"),
            preco: document.getElementById("trip-preco"),
            distancia: document.getElementById("trip-distancia"),
            viagens: document.getElementById("trip-viagens"),
            portagens: document.getElementById("trip-portagens"),
            pessoas: document.getElementById("trip-pessoas")
        };
        
        // Helper: Parse clamped >= 0
        const val = (el, def = 0) => {
            if(!el) return def;
            const n = parseFloat(el.value);
            return isNaN(n) || n < 0 ? def : n; // Negative check
        };
        
        // 1. Get Values (with strict defaults for multipliers)
        // Viagens/Pessoas default to 1 if empty/0
        let consumo = val(refs.consumo);
        let preco = val(refs.preco);
        let distancia = val(refs.distancia);
        
        let viagens = val(refs.viagens, 1);
        if (viagens < 1) viagens = 1;
        
        let portagens = val(refs.portagens);
        
        let pessoas = val(refs.pessoas, 1);
        if (pessoas < 1) pessoas = 1;

        // 2. Logic (From Requirements)
        // kmTotais = distancia * viagens
        const kmTotais = distancia * viagens;
        
        // litros = (kmTotais * consumo) / 100
        const litros = (kmTotais * consumo) / 100;
        
        // custoCombustivel = litros * preco
        const custoCombustivel = litros * preco;
        
        // custoPortagens = (portagens || 0) * viagens (Requirement: Portagens is PER TRIP)
        const custoPortagens = portagens * viagens;
        
        // total = custoCombustivel + custoPortagens
        const total = custoCombustivel + custoPortagens;
        
        // porPessoa = total / Math.max(pessoas, 1)
        const porPessoa = total / pessoas;

        // 3. Update Outputs
        const fmtMoney = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });
        const fmtNum = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 1 });

        // DOM Elements
        const out = {
            km: document.getElementById("trip-metric-km"),
            liters: document.getElementById("trip-metric-liters"),
            fuel: document.getElementById("trip-result-fuel"),
            tolls: document.getElementById("trip-result-tolls"),
            total: document.getElementById("trip-result-total"),
            person: document.getElementById("trip-result-person")
        };

        if (distancia > 0) {
            if(out.km) out.km.textContent = `${fmtNum.format(kmTotais)} km`;
            if(out.liters) out.liters.textContent = `${fmtNum.format(litros)} L`;
            if(out.fuel) out.fuel.textContent = fmtMoney.format(custoCombustivel);
            if(out.tolls) out.tolls.textContent = fmtMoney.format(custoPortagens);
            if(out.total) out.total.textContent = fmtMoney.format(total);
            if(out.person) out.person.textContent = fmtMoney.format(porPessoa);
        } else {
            // Reset State
            if(out.km) out.km.textContent = "-- km";
            if(out.liters) out.liters.textContent = "-- L";
            if(out.fuel) out.fuel.textContent = "-- €";
            if(out.tolls) out.tolls.textContent = "-- €";
            if(out.total) out.total.textContent = "-- €";
            if(out.person) out.person.textContent = "-- €";
        }
    }

    function clearInputs() {
        const ids = ["trip-consumo", "trip-preco", "trip-distancia", "trip-viagens", "trip-portagens", "trip-pessoas"];
        ids.forEach(id => {
             const el = document.getElementById(id);
             if(el) el.value = "";
        });
        
        // Defaults reset
        const v = document.getElementById("trip-viagens"); if(v) v.value = 1;
        const p = document.getElementById("trip-pessoas"); if(p) p.value = 1;
        
        const sel = document.getElementById("trip-vehicle-select"); if(sel) sel.value = "";
        
        calculate();
    }

    // --- MAPS INTEGRATION ---
    function openInMaps() {
        // Read Global State
        const dest = window.L100_SELECTED_DEST;
        const origin = window.L100_CURRENT_LOC;

        if (!dest || !dest.lat || !dest.lng) {
            // Error handling
            if (window.showToast) window.showToast("Seleciona um destino no mapa", "error");
            else alert("Selecione um local no mapa.");
            return;
        }

        let url = "https://www.google.com/maps/dir/?api=1";
        
        // If Origin available
        if (origin && origin.lat && origin.lng) {
             url += `&origin=${origin.lat},${origin.lng}`;
        }
        
        // Destination
        url += `&destination=${dest.lat},${dest.lng}`;
        
        window.open(url, "_blank");
    }

    // --- LISTENER BINDING ---
    function bindListeners() {
        const ids = ["trip-consumo", "trip-preco", "trip-distancia", "trip-viagens", "trip-portagens", "trip-pessoas"];
        ids.forEach(id => {
             const el = document.getElementById(id);
             // Ensure we don't bind twice. We use a custom property on the element.
             if (el && !el.__tripBound) {
                 el.addEventListener("input", calculate);
                 el.__tripBound = true;
             }
        });

        // Clear Button
        const btnClear = document.getElementById("btn-trip-clear");
        if (btnClear && !btnClear.__tripBound) {
            btnClear.addEventListener("click", clearInputs);
            btnClear.__tripBound = true;
        }

        // Maps Button
        const btnMaps = document.getElementById("btn-trip-maps");
        if (btnMaps && !btnMaps.__tripBound) {
            btnMaps.addEventListener("click", openInMaps);
            btnMaps.__tripBound = true;
        }
    }

})();
