const title = document.querySelector('.app-header h1');

if (title) {
  title.setAttribute('aria-label', 'e-Treasury Form 25 — Πιλοτική έκδοση, υπό δοκιμή');
}

if (!document.querySelector('link[data-release-status-styles]')) {
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'src/styles/release-status.css';
  stylesheet.dataset.releaseStatusStyles = 'true';
  document.head.append(stylesheet);
}
