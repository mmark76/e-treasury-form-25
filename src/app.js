import { initializeTemplateManager } from './features/templates.js';
import { initializeOfficialTemplateLayout, renderBlankOfficialTemplate, renderOfficialTemplate } from './features/official-template.js';
import { calculateInvoice } from './features/calculations.js';
import { initializePdfDownload } from './features/pdf-download/index.js';
import { initializeCustomersFeature } from './features/customers/index.js';
import { readCustomers } from './features/customers/storage.js';
import { initializeInvoiceArchive } from './features/invoice-archive/index.js';
import {
  cancelActiveInvoiceReservation,
  findActiveInvoiceReservation,
  hasLegacyEmployeeInvoices,
  migrateInvoiceArchiveForEmployee,
  readInvoiceArchive,
  readInvoiceNumberState,
  reserveInvoiceNumber
} from './features/invoice-archive/storage.js';
import { APP_VERSION_LABEL } from './config/version.js';
import { buildShortInvoiceIdentifier } from './shared/invoice-number.js';
import { getInvoiceStatusPresentation } from './shared/invoice-status.js';
import { getFormValues } from './shared/form-state.js';
import { readJson, writeJson } from './shared/storage.js';
import { getCurrentIssuerUnitCode, getCurrentServiceId, sanitizeServiceId } from './shared/service-identity.js';
import {
  applyEmployeeProfileToForm,
  employeeProfileFromForm,
  ensureEmployeeProfile,
  isEmployeeCodeValid,
  normalizeEmployeeCode,
  readEmployeeProfile,
  saveEmployeeProfile,
  validateEmployeeCode
} from './shared/employee-profile.js';
import { initializeTabCoordination, TAB_ID, withInvoiceIssuanceLock } from './shared/tab-coordination.js';

const DRAFT_KEY = 'eTreasury.form25.draft.v1';
const DEFAULT_DESCRIPTION = 'ΚΑΤΑΝΑΛΩΣΗ ΗΛΕΚΤΡΙΚΟΥ ΡΕΥΜΑΤΟΣ';
const DEFAULT_NET_AMOUNT = '0.00';
const DEFAULT_VAT_RATE = '19';
const INVOICE_CONTENT_FIELD_DEFAULTS = {
  currentCustomerSelect: '',
  issueDate: '',
  debtorName: '',
  debtorTaxId: '',
  debtorAddress: '',
  postalCode: '',
  phone: '',
  spaceName: '',
  description: DEFAULT_DESCRIPTION,
  billingPeriod: '',
  netAmount: DEFAULT_NET_AMOUNT,
  vatRate: DEFAULT_VAT_RATE,
  vatAmount: DEFAULT_NET_AMOUNT,
  grossAmount: DEFAULT_NET_AMOUNT,
  paymentType: 'Πλήρης εξόφληση',
  signDate: ''
};
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

function clearInvoiceContentFields(form) {
  Object.entries(INVOICE_CONTENT_FIELD_DEFAULTS).forEach(([id, value]) => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (field) field.value = value;
  });
  delete form.dataset.customerId;
  setAutomaticDefaults();
  updateChargeCalculationFields(form);
}

function hasInvoiceContentFields(form) {
  return Object.entries(INVOICE_CONTENT_FIELD_DEFAULTS).some(([id, defaultValue]) => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (!field) return false;
    const value = String(field.value || '').trim();
    if (id === 'issueDate' || id === 'signDate' || id === 'billingPeriod') return false;
    return value !== String(defaultValue || '').trim();
  }) || Boolean(form.dataset.customerId);
}

function updateChargeCalculationFields(form) {
  const netAmount = form.querySelector('#netAmount');
  const vatRate = form.querySelector('#vatRate');
  const vatAmount = form.querySelector('#vatAmount');
  const grossAmount = form.querySelector('#grossAmount');
  if (!netAmount || !vatRate) return;

  const calculation = calculateInvoice(netAmount.value, vatRate.value);
  if (vatAmount) vatAmount.value = calculation.vatAmount.toFixed(2);
  if (grossAmount) grossAmount.value = calculation.grossAmount.toFixed(2);
}

function normalizeServiceIdField(form) {
  const serviceId = form.querySelector('#serviceId');
  if (serviceId) serviceId.value = sanitizeServiceId(serviceId.value);
}

function employeeScopeForForm(form) {
  return {
    issuerUnitId: getCurrentServiceId(form),
    employeeId: employeeProfileFromForm(form).employeeId
  };
}

function currentInvoiceStatus(form, reservation, issuedFormNumber) {
  if (form?.dataset.invoiceStatus) return form.dataset.invoiceStatus;
  if (reservation) return 'reserved';
  return issuedFormNumber ? 'issued' : 'reserved';
}

function employeeHasInvoices(form) {
  const profile = employeeProfileFromForm(form);
  if (!profile.employeeId) return false;
  return readInvoiceArchive().some(record =>
    record.issuerUnitId === getCurrentServiceId(form) && record.employeeId === profile.employeeId
  );
}

function updateEmployeeProfileLock(form) {
  const employeeCode = form.querySelector('#employeeCode');
  const note = document.getElementById('employee-code-lock-note');
  const locked = employeeHasInvoices(form);
  if (employeeCode) employeeCode.readOnly = locked;
  if (note) note.hidden = !locked;
}

function updateReservationScopeLock(form) {
  const locked = Boolean(findActiveInvoiceReservation(employeeScopeForForm(form), readInvoiceArchive()));
  ['serviceId', 'issuerUnitCode'].forEach(id => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (field) field.readOnly = locked;
  });
}

function validateEmployeeProfileFields(form) {
  const employeeCode = form.querySelector('#employeeCode');
  if (!employeeCode) return true;

  employeeCode.value = normalizeEmployeeCode(employeeCode.value);
  const message = validateEmployeeCode(employeeCode.value);
  employeeCode.setCustomValidity(message);
  return !message;
}

function persistUnlockedEmployeeProfile(form) {
  const formProfile = employeeProfileFromForm(form);
  if (employeeHasInvoices(form)) {
    const storedProfile = readEmployeeProfile();
    const nextProfile = {
      ...storedProfile,
      employeeName: formProfile.employeeName
    };
    applyEmployeeProfileToForm(form, nextProfile);
    return saveEmployeeProfile(nextProfile);
  }

  if (!validateEmployeeProfileFields(form)) return false;
  return saveEmployeeProfile(formProfile);
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
    numbering: 'Αριθμός και Ημερομηνία Τιμολογίου',
    service: 'Στοιχεία Τμήματος / Υπηρεσίας',
    debtor: 'Στοιχεία Οφειλέτη / Πελάτη',
    charge: 'Στοιχεία Χρέωσης / Φ.Π.Α.',
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
  const form = document.getElementById('invoice-form');
  const profile = employeeProfileFromForm(form);
  const scope = employeeScopeForForm(form);
  const records = readInvoiceArchive();
  const state = readInvoiceNumberState(scope, records);
  const reservation = findActiveInvoiceReservation(scope, records);
  const issuerUnitOutput = document.getElementById('active-issuer-unit-code');
  const employeeCodeOutput = document.getElementById('active-employee-code');
  const nextNumber = document.getElementById('next-invoice-number');
  const numberRange = document.getElementById('invoice-number-range');
  const numberWarning = document.getElementById('invoice-number-warning');
  const numberStatus = document.getElementById('invoice-number-status');
  const activeStatus = document.getElementById('active-invoice-status');
  const activeStatusNumber = document.getElementById('active-invoice-status-number');
  const activeStatusBadge = document.getElementById('active-invoice-status-badge');
  const activeStatusScreenReader = document.getElementById('active-invoice-status-sr');
  const clearButton = document.getElementById('clear-form');
  const registerButton = document.getElementById('register-invoice');
  const cancelInvoiceButton = document.getElementById('cancel-invoice');

  if (issuerUnitOutput) issuerUnitOutput.textContent = getCurrentIssuerUnitCode(form);
  if (employeeCodeOutput) employeeCodeOutput.textContent = profile.employeeCode || '-';
  const issuedFormNumber = buildShortInvoiceIdentifier({
    employeeCode: profile.employeeCode,
    invoiceNumber: form?.querySelector('#invoiceNumber')?.value
  });
  const displayedNumber = reservation?.shortInvoiceIdentifier || issuedFormNumber;
  const status = currentInvoiceStatus(form, reservation, issuedFormNumber);
  const statusPresentation = getInvoiceStatusPresentation(status);
  if (nextNumber) nextNumber.textContent = reservation?.shortInvoiceIdentifier || issuedFormNumber || (state.exhausted ? '' : state.formattedNextNumber);
  if (numberRange) numberRange.textContent = `${state.minimumNumber}-${state.maximumNumber}`;
  if (numberStatus) numberStatus.textContent = displayedNumber ? statusPresentation.label : '';
  if (numberWarning) {
    numberWarning.hidden = !state.exhausted;
    numberWarning.textContent = state.exhausted
      ? 'Η προσωπική σειρά αρίθμησης 00001–99999 έχει εξαντληθεί. Δεν μπορούν να εκδοθούν άλλα τιμολόγια με τον συγκεκριμένο κωδικό υπαλλήλου.'
      : '';
  }
  if (activeStatus) activeStatus.hidden = !displayedNumber;
  if (activeStatusNumber) activeStatusNumber.textContent = displayedNumber || '';
  if (activeStatusBadge) {
    activeStatusBadge.classList.remove('invoice-status-reserved', 'invoice-status-issued', 'invoice-status-cancelled');
    activeStatusBadge.classList.add(statusPresentation.className);
    activeStatusBadge.textContent = displayedNumber ? statusPresentation.label : '';
    activeStatusBadge.setAttribute('aria-label', statusPresentation.accessibleLabel);
  }
  if (activeStatusScreenReader) activeStatusScreenReader.textContent = displayedNumber
    ? `${displayedNumber}. ${statusPresentation.accessibleLabel}.`
    : '';
  if (clearButton) clearButton.disabled = statusPresentation.status === 'cancelled';
  if (registerButton) registerButton.disabled = state.exhausted || statusPresentation.status !== 'reserved' || !reservation;
  if (cancelInvoiceButton) cancelInvoiceButton.disabled = statusPresentation.status !== 'reserved' || !reservation;
  if (form) updateReservationScopeLock(form);
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
  const cancelInvoiceButton = document.getElementById('cancel-invoice');
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

  function applyReservationToForm(reservation) {
    const invoiceNumber = form.querySelector('#invoiceNumber');
    if (invoiceNumber && reservation?.formattedInvoiceNumber) invoiceNumber.value = reservation.formattedInvoiceNumber;
    form.dataset.invoiceStatus = 'reserved';
    delete form.dataset.loadedArchiveRecordId;
    saveDraft(form);
    previewHasInvoiceData = true;
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  }

  async function ensureActiveInvoiceReservation() {
    const profile = employeeProfileFromForm(form);
    if (!profile.employeeId || !isEmployeeCodeValid(profile.employeeCode)) return null;

    const scope = employeeScopeForForm(form);
    return withInvoiceIssuanceLock(scope, () => {
      const result = reserveInvoiceNumber(scope, {
        issuerUnitCode: getCurrentIssuerUnitCode(form),
        issuerUnitName: form.querySelector('#department')?.value.trim() || '',
        employeeCode: profile.employeeCode,
        employeeName: profile.employeeName,
        tabId: TAB_ID
      });

      if (result?.ok && result.record) {
        applyReservationToForm(result.record);
      } else if (result?.blocked) {
        window.alert(result.message);
      } else if (result?.exhausted) {
        window.alert('Η προσωπική σειρά αρίθμησης 00001–99999 έχει εξαντληθεί.');
      }

      return result;
    });
  }

  async function cancelCurrentReservation({ reason = '' } = {}) {
    const scope = employeeScopeForForm(form);
    return withInvoiceIssuanceLock(scope, () => cancelActiveInvoiceReservation(scope, { reason }));
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
  updateChargeCalculationFields(form);
  normalizeServiceIdField(form);
  ensureEmployeeProfile(form);
  validateEmployeeProfileFields(form);
  setAutomaticDefaults();
  if (hasLegacyEmployeeInvoices() && isEmployeeCodeValid(employeeProfileFromForm(form).employeeCode)) {
    const confirmed = window.confirm('Τα υφιστάμενα τοπικά τιμολόγια θα συνδεθούν με το τρέχον προφίλ υπαλλήλου. Να συνεχιστεί η migration;');
    if (confirmed) migrateInvoiceArchiveForEmployee(employeeProfileFromForm(form), getCurrentServiceId(form));
  } else {
    migrateInvoiceArchiveForEmployee(employeeProfileFromForm(form), getCurrentServiceId(form));
  }
  initializeTemplateManager();
  initializeDateFields();
  initializeVersionIndicator();
  updateEmployeeProfileLock(form);

  function handleFormUpdated(updatedForm) {
    updateChargeCalculationFields(updatedForm);
    validateEmployeeProfileFields(updatedForm);
    persistUnlockedEmployeeProfile(updatedForm);
    updateEmployeeProfileLock(updatedForm);
    saveDraft(updatedForm);
    updateInvoiceNumberDisplay();
  }

  initializeTabCoordination(() => {
    updateEmployeeProfileLock(form);
    updateInvoiceNumberDisplay();
    window.dispatchEvent(new CustomEvent('invoice-archive:external-update'));
  });

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
  void ensureActiveInvoiceReservation();

  form.addEventListener('input', event => {
    if (event.target?.id === 'employeeCode') {
      event.target.value = normalizeEmployeeCode(event.target.value);
      validateEmployeeProfileFields(form);
    }
    if (inputBelongsToInvoicePreview(event.target)) previewHasInvoiceData = true;
    if (event.target?.id === 'employeeCode' || event.target?.id === 'employeeName') {
      persistUnlockedEmployeeProfile(form);
      updateEmployeeProfileLock(form);
    }
    if (event.target?.id === 'netAmount' || event.target?.id === 'vatRate') {
      updateChargeCalculationFields(form);
    }
    saveDraft(form);
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  form.addEventListener('change', event => {
    if (event.target?.id === 'employeeCode') {
      event.target.value = normalizeEmployeeCode(event.target.value);
      validateEmployeeProfileFields(form);
    }
    if (inputBelongsToInvoicePreview(event.target)) previewHasInvoiceData = true;
    if (event.target?.id === 'employeeCode' || event.target?.id === 'employeeName') {
      persistUnlockedEmployeeProfile(form);
      updateEmployeeProfileLock(form);
    }
    if (event.target?.id === 'netAmount' || event.target?.id === 'vatRate') {
      updateChargeCalculationFields(form);
    }
    saveDraft(form);
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  clearButton.addEventListener('click', async () => {
    const currentReservation = findActiveInvoiceReservation(employeeScopeForForm(form), readInvoiceArchive());
    const reservedIdentifier = currentReservation?.shortInvoiceIdentifier || currentReservation?.formattedInvoiceNumber || '';
    if (hasInvoiceContentFields(form)) {
      const message = reservedIdentifier
        ? `Να καθαριστούν τα πεδία του τιμολογίου; Ο δεσμευμένος αριθμός ${reservedIdentifier} θα παραμείνει ενεργός.`
        : 'Να καθαριστούν τα πεδία του τιμολογίου;';
      if (!window.confirm(message)) return;
    }

    clearInvoiceContentFields(form);
    saveDraft(form);
    previewHasInvoiceData = true;
    updateInvoiceNumberDisplay();
    renderCurrentPreview();
  });

  cancelInvoiceButton?.addEventListener('click', async () => {
    const currentReservation = findActiveInvoiceReservation(employeeScopeForForm(form), readInvoiceArchive());
    const reservedIdentifier = currentReservation?.shortInvoiceIdentifier || currentReservation?.formattedInvoiceNumber || '';
    if (!currentReservation) {
      window.alert('Δεν υπάρχει ενεργό προαριθμημένο draft για ακύρωση.');
      return;
    }

    const confirmed = window.confirm(`Το τιμολόγιο ${reservedIdentifier} θα καταχωριστεί ως ακυρωμένο και ο αριθμός δεν θα χρησιμοποιηθεί ξανά. Θέλετε να συνεχίσετε;`);
    if (!confirmed) return;

    cancelInvoiceButton.disabled = true;
    try {
      const cancelled = await cancelCurrentReservation({ reason: 'cancel-invoice' });
      if (!cancelled?.ok) {
        window.alert('Δεν ήταν δυνατή η ακύρωση του δεσμευμένου αριθμού. Η φόρμα δεν καθαρίστηκε και δεν αποδόθηκε νέος αριθμός.');
        return;
      }
      window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
      window.dispatchEvent(new CustomEvent('invoice-archive:external-update'));

      clearInvoiceContentFields(form);
      const invoiceNumber = form.querySelector('#invoiceNumber');
      if (invoiceNumber) invoiceNumber.value = '';
      form.dataset.invoiceStatus = 'reserved';
      delete form.dataset.loadedArchiveRecordId;
      saveDraft(form);
      previewHasInvoiceData = false;
      updateInvoiceNumberDisplay();
      renderCurrentPreview();
      await ensureActiveInvoiceReservation();
    } finally {
      cancelInvoiceButton.disabled = false;
    }
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
