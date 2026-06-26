import { initializeTemplateManager } from './features/templates.js';
import { initializeOfficialTemplateLayout, renderOfficialTemplate } from './features/official-template.js';
import { initializePdfDownload } from './features/pdf-download/index.js';
import { initializeCustomersFeature } from './features/customers/index.js';
import { initializeInvoiceArchive } from './features/invoice-archive/index.js';
import { getFormValues } from './shared/form-state.js';
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

function isoToDisplayDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function parseDisplayDate(value) {
  const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isRealDate =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);

  return isRealDate ? { day, month, year, iso: `${year}-${month}-${day}` } : null;
}

function formatDateInputValue(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
  const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean);
  return parts.join('/');
}

function currentBillingPeriod(date = new Date()) {
  return `${GREEK_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function setAutomaticDefaults() {
  const today = localIsoDate();
  const issueDate = document.getElementById('issueDate');
  const signDate = document.getElementById('signDate');
  const billingPeriod = document.getElementById('billingPeriod');

  if (!issueDate.value) issueDate.value = isoToDisplayDate(today);
  if (!signDate.value) signDate.value = isoToDisplayDate(today);
  if (!billingPeriod.value) billingPeriod.value = currentBillingPeriod();
}

function restoreDraft(form) {
  const draft = readJson(DRAFT_KEY, {});
  Object.entries(draft).forEach(([id, value]) => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (field) field.value = id === 'issueDate' || id === 'signDate' ? isoToDisplayDate(value) : value;
  });
}

function saveDraft(form) {
  writeJson(DRAFT_KEY, getFormValues(form));
}

function initializeDateField(fieldId) {
  const field = document.getElementById(fieldId);
  const entry = field?.closest('.date-entry');
  const picker = entry?.querySelector('.date-picker-proxy');
  const pickerButton = document.querySelector(`.${fieldId}-picker-button`);
  if (!field || !picker || !pickerButton) return;

  function syncPicker() {
    const parsed = parseDisplayDate(field.value);
    picker.value = parsed?.iso ?? '';
    field.setCustomValidity(
      field.value && !parsed ? 'Συμπλήρωσε πραγματική ημερομηνία σε μορφή dd/mm/yyyy.' : ''
    );
  }

  field.addEventListener('input', () => {
    const formatted = formatDateInputValue(field.value);
    if (field.value !== formatted) field.value = formatted;
    syncPicker();
  });

  field.addEventListener('blur', syncPicker);

  picker.addEventListener('change', () => {
    field.value = isoToDisplayDate(picker.value);
    syncPicker();
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });

  pickerButton.addEventListener('click', () => {
    syncPicker();
    try {
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
        return;
      }
    } catch {
      picker.focus();
    }
    picker.focus();
  });

  syncPicker();
}

function initializeDateFields() {
  initializeDateField('issueDate');
  initializeDateField('signDate');
}

function initializeViewShell({ renderOfficialTemplate }) {
  const landingView = document.getElementById('landing-view');
  const applicationView = document.getElementById('application-view');
  const workspace = document.querySelector('.workspace');
  const viewButtons = document.querySelectorAll('[data-view-target]');
  if (!landingView || !applicationView || !workspace) return;

  function focusFirstControl(container) {
    const target = container.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    target?.focus({ preventScroll: true });
  }

  function showView(view, { moveFocus = true } = {}) {
    if (view === 'home') {
      landingView.hidden = false;
      applicationView.hidden = true;
      workspace.dataset.activeView = 'issue';
      document.querySelectorAll('.nav-card').forEach(button => button.removeAttribute('aria-current'));
      if (moveFocus) focusFirstControl(landingView);
      return;
    }

    workspace.dataset.activeView = view;
    landingView.hidden = true;
    applicationView.hidden = false;
    document.querySelectorAll('.nav-card').forEach(button => {
      if (button.dataset.viewTarget === view) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    renderOfficialTemplate();
    if (moveFocus) focusFirstControl(applicationView);
  }

  viewButtons.forEach(button => {
    button.addEventListener('click', () => showView(button.dataset.viewTarget));
  });

  showView('home', { moveFocus: false });
}

function initializePageSettingsDialog() {
  const button = document.getElementById('page-settings');
  const dialog = document.getElementById('page-settings-dialog');
  const colorTheme = document.getElementById('page-color-theme');
  const fontSize = document.getElementById('page-font-size');
  const fontFamily = document.getElementById('page-font-family');
  const resetButton = document.getElementById('reset-page-appearance');
  if (!button || !dialog) return;

  function applyAppearanceSettings() {
    document.body.classList.remove(
      'page-theme-teal',
      'page-theme-sage',
      'page-font-compact',
      'page-font-large',
      'page-font-serif',
      'page-font-arial'
    );

    if (colorTheme?.value === 'teal') document.body.classList.add('page-theme-teal');
    if (colorTheme?.value === 'sage') document.body.classList.add('page-theme-sage');
    if (fontSize?.value === 'compact') document.body.classList.add('page-font-compact');
    if (fontSize?.value === 'large') document.body.classList.add('page-font-large');
    if (fontFamily?.value === 'serif') document.body.classList.add('page-font-serif');
    if (fontFamily?.value === 'arial') document.body.classList.add('page-font-arial');
  }

  [colorTheme, fontSize, fontFamily].forEach(select => {
    select?.addEventListener('change', applyAppearanceSettings);
  });

  resetButton?.addEventListener('click', () => {
    if (colorTheme) colorTheme.value = 'warm';
    if (fontSize) fontSize.value = 'standard';
    if (fontFamily) fontFamily.value = 'system';
    applyAppearanceSettings();
  });

  button.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
    dialog.querySelector('select, button')?.focus({ preventScroll: true });
  });

  dialog.addEventListener('close', () => {
    button.focus({ preventScroll: true });
  });
}

function initializeApp() {
  const form = document.getElementById('invoice-form');
  const clearButton = document.getElementById('clear-form');
  const printButton = document.getElementById('print-form');
  const downloadPdfButton = document.getElementById('download-pdf');

  initializeOfficialTemplateLayout();
  setAutomaticDefaults();
  restoreDraft(form);
  setAutomaticDefaults();
  initializeTemplateManager();
  initializeDateFields();
  initializeCustomersFeature({
    form,
    renderOfficialTemplate,
    onFormUpdated: saveDraft
  });
  initializeInvoiceArchive({
    form,
    renderOfficialTemplate,
    onFormUpdated: saveDraft
  });
  renderOfficialTemplate();

  form.addEventListener('input', () => {
    saveDraft(form);
    renderOfficialTemplate();
  });

  form.addEventListener('change', () => {
    saveDraft(form);
    renderOfficialTemplate();
  });

  clearButton.addEventListener('click', () => {
    const confirmed = window.confirm('Να καθαριστούν τα στοιχεία της τρέχουσας φόρμας; Τα αποθηκευμένα πρότυπα θα παραμείνουν.');
    if (!confirmed) return;

    removeStoredValue(DRAFT_KEY);
    form.reset();
    setAutomaticDefaults();
    saveDraft(form);
    renderOfficialTemplate();
  });

  printButton.addEventListener('click', () => {
    if (!form.reportValidity()) return;
    renderOfficialTemplate();
    window.print();
  });

  initializePdfDownload({
    button: downloadPdfButton,
    form,
    renderOfficialTemplate
  });

  window.addEventListener('beforeprint', renderOfficialTemplate);
  initializeViewShell({ renderOfficialTemplate });
  initializePageSettingsDialog();
}

initializeApp();
