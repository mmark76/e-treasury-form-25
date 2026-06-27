import { downloadOfficialPdf } from './download.js';

export { downloadOfficialPdf, filenameFromCurrentForm } from './download.js';

export function initializePdfDownload({ button, form, renderOfficialTemplate, shouldValidate = () => true }) {
  if (!button) return;

  button.addEventListener('click', async () => {
    if (shouldValidate() && !form.reportValidity()) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Λήψη...';

    try {
      renderOfficialTemplate();
      await downloadOfficialPdf();
    } catch (error) {
      console.error(error);
      window.alert('Δεν ήταν δυνατή η δημιουργία του PDF. Δοκίμασε ξανά.');
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}
