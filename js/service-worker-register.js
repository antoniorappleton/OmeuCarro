// js/service-worker-register.js

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((reg) => {
        console.log("Service Worker registado com sucesso:", reg);
      })
      .catch((err) => {
        console.error("Erro ao registar o Service Worker:", err);
      });
  });
}
