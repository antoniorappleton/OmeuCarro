// js/theme.js

/**
 * L100 Theme Manager
 * Handles Light/Dark mode toggling and persistence.
 * Should be loaded in <head> to avoid flash of wrong theme.
 */

(function() {
  const STORAGE_KEY = 'app-theme';
  
  // 1. Check saved preference
  const savedTheme = localStorage.getItem(STORAGE_KEY);
  
  // 2. Check system preference
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // 3. Determine initial theme
  // If saved, use it. If not, use system.
  // Note: We only set data-theme if there is a saved preference or if we want to force explicit state.
  // To stick to "System Default" when nothing is saved, we strictly follow CSS media query.
  // BUT, to allow "overriding" system default, we need to know if the user explicitly chose something.
  
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else {
    // Optional: could set based on system to explicit attribute, but CSS media query handles it better for "auto" updates.
    // We leave it empty to respect @media (prefers-color-scheme: dark) in CSS.
  }

  // Expose API globally
  window.AppTheme = {
    /**
     * Set theme to 'light', 'dark', or 'auto' (null)
     */
    set: function(mode) {
      if (mode === 'light' || mode === 'dark') {
        document.documentElement.setAttribute('data-theme', mode);
        localStorage.setItem(STORAGE_KEY, mode);
      } else {
        // Auto / System
        document.documentElement.removeAttribute('data-theme');
        localStorage.removeItem(STORAGE_KEY);
      }
      
      // Dispatch event for other components (like charts) to react
      window.dispatchEvent(new CustomEvent('theme-changed', { detail: { mode } }));
    },
    
    /**
     * Get current effective mode ('light' or 'dark')
     */
    getDisplayMode: function() {
      const attr = document.documentElement.getAttribute('data-theme');
      if (attr) return attr;
      
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    },

    /**
     * Get saved preference ('light', 'dark', or null for auto)
     */
    getPreference: function() {
      return localStorage.getItem(STORAGE_KEY);
    }
  };

  // Log for debug
  console.log('[Theme] Initialized. Saved:', savedTheme, 'System Dark:', systemPrefersDark);

})();
