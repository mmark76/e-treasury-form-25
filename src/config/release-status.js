const title = document.querySelector('.app-header h1');
const headerActions = document.querySelector('.app-header .header-actions');

if (title) {
  title.setAttribute('aria-label', 'e-Treasury Form 25 — Πιλοτική έκδοση, υπό δοκιμή');
}

if (title && headerActions && !document.getElementById('release-status-badge')) {
  const badge = document.createElement('span');
  badge.id = 'release-status-badge';
  badge.className = 'release-status-badge';
  badge.textContent = 'ΠΙΛΟΤΙΚΗ ΕΚΔΟΣΗ · ΥΠΟ ΔΟΚΙΜΗ';
  badge.setAttribute('aria-label', 'Η εφαρμογή βρίσκεται ακόμη σε πιλοτική φάση και είναι υπό δοκιμή');
  title.insertAdjacentElement('afterend', badge);
}

if (!document.querySelector('link[data-release-status-styles]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'src/styles/release-status.css';
  stylesheet.dataset.releaseStatusStyles = 'true';
  document.head.append(stylesheet);
}
