import { createInvoiceArchivePanel } from './ui.js';

export function initializeInvoiceArchive({ form, renderOfficialTemplate, onFormUpdated }) {
  const editorPanel = document.querySelector('.editor-panel');
  if (!editorPanel || document.querySelector('.invoice-archive-panel')) return;

  const panel = createInvoiceArchivePanel({ form, renderOfficialTemplate, onFormUpdated });
  editorPanel.append(panel);
}

