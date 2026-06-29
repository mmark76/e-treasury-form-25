import { initializeTemplateManager } from './features/templates.js';
import { initializeOfficialTemplateLayout, renderBlankOfficialTemplate, renderOfficialTemplate } from './features/official-template.js';
import { initializePdfDownload } from './features/pdf-download/index.js';
import { initializeCustomersFeature } from './features/customers/index.js';
import { readCustomers } from './features/customers/storage.js';
import { initializeInvoiceArchive } from './features/invoice-archive/index.js';
import { formatInvoiceSequenceNumber, readNextInvoiceNumber } from './features/invoice-archive/storage.js';
import { APP_VERSION_LABEL } from './config/version.js';
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

function initializeViewShell({ renderPreview }) {
  const landingView = document.getElementById('landing-view');
  const applicationView = document.getElementById('application-view');
  const workspace = document.querySelector('.workspace');
  const editorTitle = document.getElementById('editor-title');
  const viewButtons = document.querySelectorAll('[data-view-target]');
  const closeButton = document.querySelector('[data-view-close]');
  if (!landingView || !applicationView || !workspace) return;

  const viewTitles = {
    numbering: 'Αύξων Αριθμός Τιμολογίου',
    service: 'Στοιχεία Τμήματος / Υπηρεσίας',
    debtor: 'Στοιχεία Οφειλέτη / Πελάτη',
    customers: 'Αρχείο Οφειλετών / Πελατών',
    archive: 'Αρχείο Τιμολογίων'
  };

  function focusFirstControl(container) {
    const target = container.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    target?.focus({ preventScroll: true });
  }

  function showView(view, { moveFocus = true } = {}) {
    if (view === 'home') {
      applicationView.hidden = false;
      workspace.dataset.activeView = 'home';
      document.querySelectorAll('.nav-card').forEach(button => button.removeAttribute('aria-current'));
      renderPreview();
      if (moveFocus) focusFirstControl(landingView);
      return;
    }

    workspace.dataset.activeView = view;
    applicationView.hidden = false;
    if (editorTitle) editorTitle.textContent = viewTitles[view] ?? 'Στοιχεία εντύπου';
    document.querySelectorAll('.nav-card').forEach(button => {
      if (button.dataset.viewTarget === view) {
        button.setAttribute('aria-current', 'page');
      } else {
        button.removeAttribute('aria-current');
      }
    });
    renderPreview();
    if (moveFocus) focusFirstControl(document.querySelector('.editor-panel') ?? applicationView);
  }

  viewButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetView = button.dataset.viewTarget;
      const isAlreadyActive = workspace.dataset.activeView === targetView;
      showView(isAlreadyActive ? 'home' : targetView);
    });
  });
  closeButton?.addEventListener('click', () => showView('home'));

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

function updateInvoiceNumberDisplay() {
  const nextNumber = document.getElementById('next-invoice-number');

  if (nextNumber) nextNumber.textContent = formatInvoiceSequenceNumber(readNextInvoiceNumber());
}

function initializeVersionIndicator() {
  const versionIndicator = document.getElementById('app-version');
  if (versionIndicator) versionIndicator.textContent = APP_VERSION_LABEL;
}

function initializeCurrentCustomerSelector({ form, renderInvoicePreview, onFormUpdated }) {
  const select = document.getElementById('currentCustomerSelect');
  if (!select) return;

  function customerLabel(customer) {
    return [customer.debtorName, customer.debtorTaxId].filter(Boolean).join(' - ') || customer.id;
  }

  function renderOptions() {
    const selectedValue = select.value;
    select.replaceChildren(new Option('Επιλογή οφειλέτη / πελάτη...', ''));
    readCustomers().forEach(customer => {
      select.append(new Option(customerLabel(customer), customer.id));
    });
    select.value = [...select.options].some(option => option.value === selectedValue) ? selectedValue : '';
  }

  select.addEventListener('change', () => {
    const customer = readCustomers().find(saved => saved.id === select.value);
    if (!customer) return;

    form.dataset.customerId = customer.id || '';
    ['debtorName', 'debtorTaxId', 'debtorAddress', 'postalCode', 'phone'].forEach(id => {
      const field = form.querySelector(`#${CSS.escape(id)}`);
      if (field) field.value = customer[id] ?? '';
    });
    renderInvoicePreview();
    onFormUpdated(form);
  });

  window.addEventListener('customers:updated', renderOptions);
  renderOptions();
}

function initializeApp() {
  const form = document.getElementById('invoice-form');
  const clearButton = document.getElementById('clear-form');
  const printButton = document.getElementById('print-form');
  const downloadPdfButton = document.getElementById('download-pdf');
  const workspace = document.querySelector('.workspace');
  let previewHasInvoiceData = false;

  function isHomeView() {
    return workspace?.dataset.activeView === 'home';
  }

  function renderCurrentPreview() {
    if (!previewHasInvoiceData) {
      renderBlankOfficialTemplate();
    } else {
      renderOfficialTemplate();
    }
  }

  function renderInvoicePreview() {
    previewHasInvoiceData = true;
    renderOfficialTemplate();
    updateInvoiceNumberDisplay();
  }

  function inputBelongsToInvoicePreview(target) {
    if (!(target instanceof Element)) return true;
    if (workspace?.dataset.activeView === 'service') {
      return !target.closest('.service-setting-field, .invoice-default-field');
    }
    return true;
  }

  initializeOfficialTemplateLayout();
  setAutomaticDefaults();
  restoreDraft(form);
  setAutomaticDefaults();
  initializeTemplateManager();
  initializeDateFields();
  initializeVersionIndicator();

  function handleFormUpdated(updatedForm) {
    saveDraft(updatedForm);
    updateInvoiceNumberDisplay();
  }

  initializeCustomersFeature({
    form,
    renderOfficialTemplate: renderInvoicePreview,
    onFormUpdated: handleFormUpdated
  });
  initializeInvoiceArchive({
    form,
    renderOfficialTemplate: renderInvoicePreview,
    onFormUpdated: handleFormUpdated
  });
  initializeCurrentCustomerSelector({
    form,
    renderInvoicePreview,
    onFormUpdated: handleFormUpdated
  });
  renderCurrentPreview();
  updateInvoiceNumberDisplay();

  form.addEventListener('input', event => {
    if (inputBelongsToInvoicePreview(event.target)) previewHasInvoiceData = true;
    saveDraft(form);
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  form.addEventListener('change', event => {
    if (inputBelongsToInvoicePreview(event.target)) previewHasInvoiceData = true;
    saveDraft(form);
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  clearButton.addEventListener('click', () => {
    const confirmed = window.confirm('Να καθαριστούν τα στοιχεία της τρέχουσας φόρμας; Τα αποθηκευμένα πρότυπα θα παραμείνουν.');
    if (!confirmed) return;

    removeStoredValue(DRAFT_KEY);
    form.reset();
    setAutomaticDefaults();
    saveDraft(form);
    previewHasInvoiceData = false;
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  printButton.addEventListener('click', () => {
    if (!isHomeView() && !form.reportValidity()) return;
    renderCurrentPreview();
    window.print();
  });

  initializePdfDownload({
    button: downloadPdfButton,
    form,
    renderOfficialTemplate: renderCurrentPreview,
    shouldValidate: () => !isHomeView()
  });

  window.addEventListener('beforeprint', renderCurrentPreview);
  window.addEventListener('invoice-archive:updated', updateInvoiceNumberDisplay);
  initializeViewShell({ renderPreview: renderCurrentPreview });
  initializePageSettingsDialog();
}

initializeApp();
