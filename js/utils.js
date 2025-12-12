let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  // impede o popup “fugaz”
  e.preventDefault();
  deferredPrompt = e;

  // aqui mostras um botão teu "Instalar"
  const btn = document.getElementById("btn-install");
  if (btn) btn.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  const btn = document.getElementById("btn-install");
  if (btn) btn.classList.add("hidden");
});

// chama isto no click do teu botão
async function instalarPWA() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
}
window.instalarPWA = instalarPWA;
