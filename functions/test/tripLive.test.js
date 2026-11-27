const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("subscribes to vehicle alerts during live-trip initialization", async () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "..", "js", "modules", "tripLive.js"),
    "utf8",
  );
  const elements = new Map();
  const listeners = [];
  let authCallback;
  let finalizeRequest;
  let confirmedMessage = "";
  const vehicleDoc = {
    get: async () => ({ data: () => ({}) }),
    collection: () => ({
      orderBy() {
        return this;
      },
      limit() {
        return this;
      },
      onSnapshot(callback) {
        listeners.push({ kind: "readings", callback });
        return () => {};
      },
    }),
    onSnapshot(callback) {
      listeners.push({ kind: "vehicle", callback });
      return () => {};
    },
  };
  const window = {
    location: { search: "?id=vehicle-123" },
    auth: {
      onAuthStateChanged(callback) {
        authCallback = callback;
      },
    },
    db: {
      collection: () => ({ doc: () => vehicleDoc }),
    },
    firebase: {
      app: () => ({
        functions: (region) => ({
          httpsCallable: (name) => {
            assert.equal(region, "us-central1");
            assert.equal(name, "finalizeCurrentVehicleTrip");
            return async (data) => {
              finalizeRequest = data;
              return {
                data: {
                  alreadyFinalized: false,
                  estado: "normal",
                  achados: 0,
                },
              };
            };
          },
        }),
      }),
    },
    confirm(message) {
      confirmedMessage = message;
      return true;
    },
    addEventListener() {},
  };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          textContent: "",
          style: {},
          className: "",
          classList: {
            toggle(name, enabled) {
              if (id === "trip-live-banner" && name === "is-critical") {
                this.isCritical = enabled;
              }
            },
          },
          addEventListener(name, callback) {
            this.listeners = this.listeners || {};
            this.listeners[name] = callback;
          },
        });
      }
      return elements.get(id);
    },
    body: { classList: { toggle() {} } },
  };

  vm.runInNewContext(source, {
    window,
    document,
    navigator: {},
    URLSearchParams,
    setInterval() {},
    console,
  });
  await authCallback({ uid: "user-123" });

  const vehicleListener = listeners.find((listener) => listener.kind === "vehicle");
  assert.ok(vehicleListener, "vehicle alert listener should be registered");
  vehicleListener.callback({
    data: () => ({ alertState: { OVERHEAT: { active: true } } }),
  });
  assert.equal(elements.get("trip-live-banner").classList.isCritical, true);
  assert.match(elements.get("trip-live-banner").textContent, /Temperatura do motor/);

  const endButton = elements.get("trip-live-end-trip");
  await endButton.listeners.click({ preventDefault() {} });
  assert.match(confirmedMessage, /estacionado/);
  assert.equal(finalizeRequest.vehicleId, "vehicle-123");
  assert.equal(endButton.disabled, true);
  assert.match(
    elements.get("trip-live-end-status").textContent,
    /Check-up guardado/,
  );
});
