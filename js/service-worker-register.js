// js/service-worker-register.js

// PANIC SWITCH: ?nocache=1
if (window.location.search.includes("nocache=1")) {
  console.warn("PANIC SWITCH ACTIVATED: Clearing SW and Caches");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
      console.log("SW Unregistered");
    });
  }
  caches.keys().then((names) => {
    names.forEach((name) => caches.delete(name));
    console.log("Caches Deleted");
  });
} else if ("serviceWorker" in navigator) {
  // NORMAL FLOW
  window.addEventListener("load", () => {
    // FORCE UPDATE CHECKS: Append version to URL to bypass browser cache of the SW file itself
    navigator.serviceWorker
      .register("./service-worker.js?v=13")
      .then((reg) => {
        console.log("Service Worker registado com sucesso (v13):", reg);

        // Check for updates periodically
        reg.update();

        // 1. Detect if there's a new SW waiting
        if (reg.waiting) {
          updateReady(reg.waiting);
        }

        // 2. Detect if a new SW is installing
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          newWorker.addEventListener("statechange", () => {
            if (
              newWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              // New version available!
              updateReady(newWorker);
            }
          });
        });
      })
      .catch((err) => {
        console.error("Erro ao registar o Service Worker:", err);
      });

    // 3. Refresh page when new SW takes control
    let refreshing;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      window.location.reload();
      refreshing = true;
    });
  });
}

function updateReady(worker) {
  console.log("New version found. Updating...");
  worker.postMessage({ type: "SKIP_WAITING" });
}
