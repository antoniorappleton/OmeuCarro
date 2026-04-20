// js/pwa-install.js

/**
 * PWA Install Prompt Handler
 * Intercepts 'beforeinstallprompt' and shows a custom UI.
 */
(function() {
  let deferredPrompt;

  // 1. Listen for the event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent default browser banner
    e.preventDefault();
    // Stash the event
    deferredPrompt = e;
    
    // Check if user already dismissed it recently (optional optimization)
    // const dismissed = localStorage.getItem('pwa-install-dismissed');
    // if (dismissed) return; 

    // Show our custom UI
    showInstallPrompt();
  });

  // 2. Create and Inject UI
  function showInstallPrompt() {
    // Avoid duplicates
    if (document.getElementById('pwa-install-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'pwa-install-modal';
    modal.className = 'pwa-install-modal';
    modal.innerHTML = `
      <div class="pwa-content">
        <div class="pwa-icon">
          <img src="./images/logo-icon192.png" alt="L100 Scan">
        </div>
        <div class="pwa-details">
            <h3>Instalar App</h3>
            <p>Adicione a L100 ao seu ecrã principal para acesso rápido e offline.</p>
        </div>
      </div>
      <div class="pwa-actions">
        <button id="pwa-dismiss" class="btn-text">Agora não</button>
        <button id="pwa-install" class="btn-primary-sm">Instalar</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    requestAnimationFrame(() => {
        modal.classList.add('visible');
    });

    // Bind events
    document.getElementById('pwa-dismiss').addEventListener('click', () => {
        hideInstallPrompt();
    });

    document.getElementById('pwa-install').addEventListener('click', async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to install prompt: ${outcome}`);
            deferredPrompt = null;
        }
        hideInstallPrompt();
    });
  }

  function hideInstallPrompt() {
    const modal = document.getElementById('pwa-install-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 300);
    }
  }

  // 3. Listen for successful install
  window.addEventListener('appinstalled', () => {
    hideInstallPrompt();
    deferredPrompt = null;
    console.log('PWA was installed');
  });

})();
