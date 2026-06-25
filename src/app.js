import { initializeTemplateManager } from './features/templates.js';
import { renderPreview } from './features/preview.js';
import { readJson, writeJson, removeStoredValue } from './shared/storage.js';

const DRAFT_KEY = 'eTreasury.form25.draft.v1';
const GREEK_MONTHS = [
  'ΙΑΝΟΥΑΡΙΟΣ', 'ΦΕΒΡΟΥΑΡΙΟΣ', 'ΜΑΡΤΙΟΣ', 'ΑΠΡΙΛΙΟΣ', 'ΜΑΪΟΣ', 'ΙΟΥΝΙΟΣ',
  'ΙΟΥΛΙΟΣ', 'ΑΥΓΟΥΣΤΟΣ', 'ΣΕΠΤΕΜΒΡΙΟΣ', 'ΟΚΤΩΒΡΙΟΣ', 'ΝΟΕΜΒΡΙΟΣ', 'ΔΕΚΕΜΒΡΙΟΣ'
];

function localIsoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function currentBillingPeriod(date = new Date()) {
  return `${GREEK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function setAutomaticDefaults() {
  const today = localIsoDate();
  const issueDate = document.getElementById('issueDate');
  const signDate = document.getElementById('signDate');
  const billingPeriod = document.getElementById('billingPeriod');

  if (!issueDate.value) issueDate.value = today;
  if (!signDate.value) signDate.value = today;
  if (!billingPeriod.value) billingPeriod.value = currentBillingPeriod();
}

function serializeForm(form) {
  const values = {};
  form.querySelectorAll('input[id], textarea[id], select[id]').forEach(field => {
    values[field.id] = field.value;
  });
  return values;
}

function restoreDraft(form) {
  const draft = readJson(DRAFT_KEY, {});
  Object.entries(draft).forEach(([id, value]) => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (field) field.value = value;
  });
}

function saveDraft(form) {
  writeJson(DRAFT_KEY, serializeForm(form));
}

function initializeApp() {
  const form = document.getElementById('invoice-form');
  const clearButton = document.getElementById('clear-form');
  const printButton = document.getElementById('print-form');

  setAutomaticDefaults();
  restoreDraft(form);
  setAutomaticDefaults();
  initializeTemplateManager();
  renderPreview();

  form.addEventListener('input', () => {
    saveDraft(form);
    renderPreview();
  });

  form.addEventListener('change', () => {
    saveDraft(form);
    renderPreview();
  });

  clearButton.addEventListener('click', () => {
    const confirmed = window.confirm('Να καθαριστούν τα στοιχεία της τρέχουσας φόρμας; Τα αποθηκευμένα πρότυπα θα παραμείνουν.');
    if (!confirmed) return;

    removeStoredValue(DRAFT_KEY);
    form.reset();
    setAutomaticDefaults();
    saveDraft(form);
    renderPreview();
  });

  printButton.addEventListener('click', () => {
    renderPreview();
    window.print();
  });

  window.addEventListener('beforeprint', renderPreview);
}

initializeApp();
