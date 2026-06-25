import { readJson, writeJson } from '../shared/storage.js';

const STORAGE_KEY = 'eTreasury.form25.templates.v1';

const DEFAULT_TEMPLATES = {
  department: ['ΚΛΑΔΟΣ ΔΙΑΧΕΙΡΙΣΗΣ ΧΩΡΟΥ ΚΡΑΤΙΚΗΣ ΕΚΘΕΣΗΣ / ΥΕ / ΥΕΕ&Β'],
  chapterCode: ['1401100'],
  vatRegistration: ['9000158T'],
  serviceAddress: ['ΑΝΔΡΕΑ ΑΡΑΟΥΖΟΥ 6, ΛΕΥΚΩΣΙΑ'],
  description: ['ΚΑΤΑΝΑΛΩΣΗ ΗΛΕΚΤΡΙΚΟΥ ΡΕΥΜΑΤΟΣ'],
  vatRate: ['19'],
  signatoryName: ['ΜΑΡΚΕΛΛΟΣ ΜΑΡΚΙΔΗΣ'],
  paymentType: ['Πλήρης εξόφληση', 'Μερική εξόφληση', 'Προκαταβολή']
};

function cloneDefaults() {
  return Object.fromEntries(
    Object.entries(DEFAULT_TEMPLATES).map(([key, values]) => [key, [...values]])
  );
}

function loadTemplates() {
  return readJson(STORAGE_KEY, cloneDefaults());
}

function saveTemplates(templates) {
  writeJson(STORAGE_KEY, templates);
}

function uniqueValues(values) {
  return [...new Set(values.map(value => String(value).trim()).filter(Boolean))];
}

function createOption(value) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = value;
  return option;
}

function renderOptions(select, values) {
  const previousValue = select.value;
  select.replaceChildren(createOption(''));
  select.firstElementChild.textContent = 'Επιλογή προτύπου…';

  values.forEach(value => select.appendChild(createOption(value)));
  select.value = values.includes(previousValue) ? previousValue : '';
}

function notifyFieldChanged(field) {
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

export function initializeTemplateManager() {
  const templates = loadTemplates();
  const fields = document.querySelectorAll('[data-template-key]');

  fields.forEach(field => {
    const key = field.dataset.templateKey;
    templates[key] = uniqueValues(templates[key] ?? []);

    const controls = document.createElement('div');
    controls.className = 'template-controls';

    if (key === 'issueDate' || key === 'signDate') {
      const pickerButton = document.createElement('button');
      pickerButton.type = 'button';
      pickerButton.className = `template-select date-picker-button ${key}-picker-button`;
      pickerButton.textContent = 'Επιλογή';
      pickerButton.setAttribute('aria-label', 'Επιλογή ημερομηνίας');

      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'template-button';
      saveButton.textContent = 'Αποθήκευση';

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'template-button template-button-danger';
      deleteButton.textContent = 'Διαγραφή';

      saveButton.addEventListener('click', () => {
        const value = String(field.value).trim();
        if (!value || !field.reportValidity()) return;

        templates[key] = uniqueValues([...templates[key], value]);
        saveTemplates(templates);
      });

      deleteButton.addEventListener('click', () => {
        const value = String(field.value).trim();
        if (!value) return;

        templates[key] = templates[key].filter(savedValue => savedValue !== value);
        saveTemplates(templates);
      });

      controls.append(pickerButton, saveButton, deleteButton);
      field.closest('.date-entry')?.insertAdjacentElement('afterend', controls);
      return;
    }

    const select = document.createElement('select');
    select.className = 'template-select';
    select.setAttribute('aria-label', `Αποθηκευμένα πρότυπα για ${key}`);

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'template-button';
    saveButton.textContent = 'Αποθήκευση';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'template-button template-button-danger';
    deleteButton.textContent = 'Διαγραφή';

    renderOptions(select, templates[key]);

    select.addEventListener('change', () => {
      if (!select.value) return;
      field.value = select.value;
      notifyFieldChanged(field);
    });

    saveButton.addEventListener('click', () => {
      const value = String(field.value).trim();
      if (!value) return;

      templates[key] = uniqueValues([...templates[key], value]);
      saveTemplates(templates);
      renderOptions(select, templates[key]);
      select.value = value;
    });

    deleteButton.addEventListener('click', () => {
      if (!select.value) return;
      templates[key] = templates[key].filter(value => value !== select.value);
      saveTemplates(templates);
      renderOptions(select, templates[key]);
    });

    controls.append(select, saveButton, deleteButton);
    field.insertAdjacentElement('afterend', controls);
  });

  saveTemplates(templates);
}
