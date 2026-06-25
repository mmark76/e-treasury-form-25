import { createCustomersPanel } from './ui.js';

export function initializeCustomersFeature({ form, renderOfficialTemplate, onFormUpdated }) {
  const editorPanel = document.querySelector('.editor-panel');
  if (!editorPanel || document.querySelector('.customers-panel')) return;

  const panel = createCustomersPanel({ form, renderOfficialTemplate, onFormUpdated });
  editorPanel.insertBefore(panel, form);
}
