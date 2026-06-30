import { setFormValues } from '../../shared/form-state.js';
import { readStoredValue } from '../../shared/storage.js';
import { downloadOfficialPdf } from '../pdf-download/index.js';
import {
  cancelActiveInvoiceReservation,
  findActiveInvoiceReservation,
  formatInvoiceSequenceNumber,
  issueActiveInvoiceReservation,
  readInvoiceArchive,
  readInvoiceNumberState,
  saveInvoiceArchive
} from './storage.js';
import { getCurrentIssuerUnitCode, getCurrentServiceId } from '../../shared/service-identity.js';
import {
  EMPLOYEE_PROFILE_KEY,
  applyEmployeeProfileToForm,
  employeeProfileFromForm,
  isEmployeeCodeValid,
  normalizeEmployeeCode,
  profileMatchesForm,
  readEmployeeProfile,
  saveEmployeeProfile,
  validateEmployeeCode
} from '../../shared/employee-profile.js';
import { notifyTabs, withInvoiceIssuanceLock } from '../../shared/tab-coordination.js';
import {
  createInvoiceSnapshot,
  recordMatchesFilters,
  recordSummary
} from './snapshot.js';
import { buildEmployeeArchiveCsv, buildEmployeeArchiveExport } from './export.js';
import {
  applyRestorePlan,
  buildRestorePlan,
  parseEmployeeArchiveBackup
} from './restore.js';
import { employeeInvoiceCounterKey } from './storage.js';

function createButton(text, className = 'template-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function dispatchArchiveUpdated(form, renderOfficialTemplate, onFormUpdated) {
  renderOfficialTemplate();
  onFormUpdated?.(form);
}

function loadRecordToForm(record, form, renderOfficialTemplate, onFormUpdated) {
  setFormValues(form, record.formValues);
  form.dataset.customerId = record.customerId || '';
  dispatchArchiveUpdated(form, renderOfficialTemplate, onFormUpdated);
}

function filenameForRecord(record) {
  const number = filenamePart(record.fullInvoiceIdentifier || record.formattedInvoiceNumber || record.invoiceNumber, '00000');
  const date = String(record.issueDate || '').replace(/\//g, '-').replace(/[<>:"\\|?*\x00-\x1f\s]+/g, '');
  return `GL25-${number || '00000'}-${date || 'χωρις-ημερομηνια'}.pdf`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function activeScope(form) {
  return {
    issuerUnitId: getCurrentServiceId(form),
    employeeId: employeeProfileFromForm(form).employeeId
  };
}

function belongsToActiveEmployee(record, form) {
  const scope = activeScope(form);
  return record.issuerUnitId === scope.issuerUnitId && record.employeeId === scope.employeeId;
}

function filenamePart(value, fallback = 'archive') {
  return String(value || fallback)
    .trim()
    .replace(/[<>:"\\|?*\x00-\x1f\s/]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

function downloadTextFile({ filename, content, type }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function readStoredEmployeeProfileForRestore() {
  const rawProfile = readStoredValue(EMPLOYEE_PROFILE_KEY);
  if (!rawProfile) return null;
  try {
    return JSON.parse(rawProfile);
  } catch {
    return null;
  }
}

function displayDateToIso(value) {
  const match = String(value || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return '';

  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const isRealDate =
    date.getFullYear() === Number(year) &&
    date.getMonth() === Number(month) - 1 &&
    date.getDate() === Number(day);

  return isRealDate ? `${year}-${month}-${day}` : '';
}

function formatDateFilterInput(input) {
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)]
    .filter(Boolean)
    .join('/');
}

export function createInvoiceArchivePanel({ form, renderOfficialTemplate, onFormUpdated }) {
  let records = readInvoiceArchive();
  let selectedRecordId = '';

  const section = document.createElement('section');
  section.className = 'feature-panel invoice-archive-panel no-print';
  section.innerHTML = `
    <h3>Εκδοθέντα τιμολόγια</h3>
    <p class="feature-help">Το αρχείο αποθηκεύει πλήρες snapshot της φόρμας τη στιγμή της καταχώρισης.</p>
  `;

  const registerButton = createButton('Καταχώριση στο Αρχείο', 'button button-primary');
  const downloadJsonButton = createButton('Λήψη του αρχείου μου', 'button button-secondary');
  const downloadCsvButton = createButton('Λήψη αναφοράς CSV', 'button button-secondary');
  const restoreButton = createButton('Επαναφορά προσωπικού αρχείου', 'button button-secondary');
  const restoreInput = document.createElement('input');
  restoreInput.type = 'file';
  restoreInput.accept = '.json,application/json';
  restoreInput.hidden = true;
  const archiveTools = document.createElement('div');
  archiveTools.className = 'invoice-archive-tools';
  archiveTools.append(downloadJsonButton, downloadCsvButton, restoreButton, restoreInput);
  const privacyNote = document.createElement('p');
  privacyNote.className = 'feature-help';
  privacyNote.textContent = 'Το αρχείο περιέχει προσωπικά και οικονομικά δεδομένα. Αποθηκεύστε το σε ασφαλή τοποθεσία.';
  const restoreNote = document.createElement('p');
  restoreNote.className = 'feature-help';
  restoreNote.textContent = 'Χρησιμοποιήστε μόνο αρχείο JSON που δημιουργήθηκε από τη λειτουργία “Λήψη του αρχείου μου”. Η επαναφορά δεν εισάγει αρχεία CSV.';
  const archiveCount = document.createElement('p');
  archiveCount.className = 'feature-help';
  const queryInput = document.createElement('input');
  queryInput.type = 'search';
  queryInput.placeholder = 'Αναζήτηση με αριθμό, πελάτη ή φορολογική ταυτότητα';

  const dateFrom = document.createElement('input');
  dateFrom.inputMode = 'numeric';
  dateFrom.maxLength = 10;
  dateFrom.placeholder = 'dd/mm/yyyy';
  const dateTo = document.createElement('input');
  dateTo.inputMode = 'numeric';
  dateTo.maxLength = 10;
  dateTo.placeholder = 'dd/mm/yyyy';
  const clearFiltersButton = createButton('Καθαρισμός φίλτρων');

  const filters = document.createElement('div');
  filters.className = 'feature-grid archive-filters';
  filters.append(
    labelControl('Αναζήτηση', queryInput),
    labelControl('Από ημερομηνία', dateFrom),
    labelControl('Έως ημερομηνία', dateTo),
    clearFiltersButton
  );

  const table = document.createElement('table');
  table.className = 'records-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Αριθμός</th>
        <th>Υπηρεσία</th>
        <th>Υπάλληλος</th>
        <th>Κατάσταση</th>
        <th>Ημερομηνία</th>
        <th>Πελάτης</th>
        <th>Φορολογική ταυτότητα</th>
        <th>Καθαρό</th>
        <th>Φ.Π.Α.</th>
        <th>Σύνολο</th>
        <th>Ενέργειες</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const detail = document.createElement('div');
  detail.className = 'archive-detail';

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-scroll';
  tableWrap.append(table);

  section.append(registerButton, archiveTools, privacyNote, restoreNote, archiveCount, filters, tableWrap, detail);

  function labelControl(text, control) {
    const label = document.createElement('label');
    label.className = 'field';
    label.append(text, control);
    return label;
  }

  function currentFilters() {
    return {
      query: queryInput.value,
      dateFrom: displayDateToIso(dateFrom.value),
      dateTo: displayDateToIso(dateTo.value)
    };
  }

  function persist(nextRecords) {
    const saved = saveInvoiceArchive(nextRecords);
    if (!saved) return false;
    records = nextRecords;
    renderTable();
    window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
    return true;
  }

  function activeEmployeeRecords() {
    return records.filter(record => belongsToActiveEmployee(record, form));
  }

  function refreshRecords() {
    records = readInvoiceArchive();
    renderTable();
  }

  function renderDetail(record) {
    if (!record) {
      detail.textContent = '';
      return;
    }

    const summary = recordSummary(record);
    detail.innerHTML = `
      <strong>Προβολή snapshot</strong>
      <dl>
        <dt>Αριθμός</dt><dd>${escapeHtml(summary.fullInvoiceIdentifier)}</dd>
        <dt>Υπηρεσία</dt><dd>${escapeHtml(summary.serviceName || '-')}</dd>
        <dt>Κωδικός υπαλλήλου</dt><dd>${escapeHtml(summary.employeeCode || '-')}</dd>
        <dt>Κατάσταση</dt><dd>${escapeHtml(summary.status)}</dd>
        <dt>Ημερομηνία έκδοσης</dt><dd>${escapeHtml(summary.issueDate)}</dd>
        <dt>Καταχώριση</dt><dd>${escapeHtml(record.createdAtDisplay)}</dd>
        <dt>Πελάτης</dt><dd>${escapeHtml(summary.debtorName || '-')}</dd>
        <dt>Περιγραφή</dt><dd>${escapeHtml(record.description || '-')}</dd>
        <dt>Καθαρό / Φ.Π.Α. / Σύνολο</dt><dd>${escapeHtml(summary.netAmount)} / ${escapeHtml(summary.vatAmount)} / ${escapeHtml(summary.grossAmount)}</dd>
        <dt>Ολογράφως</dt><dd>${escapeHtml(record.amountInWords)}</dd>
      </dl>
    `;
  }

  function renderTable() {
    const tbody = table.querySelector('tbody');
    const activeRecords = activeEmployeeRecords();
    const filtered = activeRecords.filter(record => recordMatchesFilters(record, currentFilters()));
    archiveCount.textContent = `Πλήθος τιμολογίων ενεργού υπαλλήλου: ${activeRecords.length}`;
    tbody.replaceChildren();

    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 11;
      cell.textContent = 'Δεν υπάρχουν εγγραφές.';
      row.append(cell);
      tbody.append(row);
      renderDetail(activeEmployeeRecords().find(record => record.id === selectedRecordId));
      return;
    }

    filtered.forEach(record => {
      const summary = recordSummary(record);
      const row = document.createElement('tr');
      row.dataset.recordId = record.id;
      row.innerHTML = `
        <td>${escapeHtml(summary.fullInvoiceIdentifier)}</td>
        <td>${escapeHtml(summary.serviceName || '-')}</td>
        <td>${escapeHtml(summary.employeeCode || '-')}</td>
        <td>${escapeHtml(summary.status)}</td>
        <td>${escapeHtml(summary.issueDate)}</td>
        <td>${escapeHtml(summary.debtorName)}</td>
        <td>${escapeHtml(summary.debtorTaxId)}</td>
        <td>${escapeHtml(summary.netAmount)}</td>
        <td>${escapeHtml(summary.vatAmount)}</td>
        <td>${escapeHtml(summary.grossAmount)}</td>
        <td class="table-actions">
          <button type="button" class="template-button" data-action="view">Προβολή</button>
          <button type="button" class="template-button" data-action="load">Φόρτωση</button>
          <button type="button" class="template-button" data-action="print">Εκτύπωση</button>
          <button type="button" class="template-button" data-action="pdf">Λήψη PDF</button>
          <button type="button" class="template-button template-button-danger" data-action="delete">Διαγραφή</button>
        </td>
      `;
      tbody.append(row);
    });

    renderDetail(activeEmployeeRecords().find(record => record.id === selectedRecordId));
  }

  async function issueInvoiceWithinLock() {
    const freshRecords = readInvoiceArchive();
    const storedProfile = readEmployeeProfile();
    const formProfile = employeeProfileFromForm(form);
    const employeeCodeMessage = validateEmployeeCode(formProfile.employeeCode);
    if (employeeCodeMessage) {
      window.alert(employeeCodeMessage);
      return { ok: false };
    }
    const scope = activeScope(form);
    const freshActiveRecords = freshRecords.filter(record =>
      record.issuerUnitId === scope.issuerUnitId && record.employeeId === scope.employeeId
    );

    if (!profileMatchesForm(storedProfile, formProfile) && freshActiveRecords.length) {
      window.alert('Ο κωδικός υπαλλήλου έχει κλειδωθεί επειδή έχουν ήδη εκδοθεί τιμολόγια.');
      return { ok: false };
    }
    if (!freshActiveRecords.length && !saveEmployeeProfile(formProfile)) {
      window.alert('Δεν ήταν δυνατή η αποθήκευση του προφίλ υπαλλήλου. Το τιμολόγιο δεν καταχωρίστηκε.');
      return { ok: false };
    }

    const serviceIdField = form.querySelector('#serviceId');
    if (serviceIdField && !serviceIdField.value.trim()) {
      serviceIdField.setCustomValidity('Συμπλήρωσε σταθερό serviceId πριν την καταχώριση.');
      serviceIdField.reportValidity();
      serviceIdField.setCustomValidity('');
      return { ok: false };
    }

    if (!form.reportValidity()) return { ok: false };

    const reservation = findActiveInvoiceReservation(scope, freshRecords);
    if (!reservation) {
      window.alert('Δεν υπάρχει ενεργός δεσμευμένος αριθμός για το προσχέδιο. Ανοίξτε νέο τιμολόγιο για να δεσμευτεί αριθμός πριν την καταχώριση.');
      window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
      return { ok: false };
    }
    const invoiceNumberField = form.querySelector('#invoiceNumber');
    if (invoiceNumberField) invoiceNumberField.value = reservation.formattedInvoiceNumber;

    const snapshot = createInvoiceSnapshot(form);
    if (!snapshot.invoiceNumber) {
      window.alert('Συμπλήρωσε αριθμό τιμολογίου πριν την καταχώριση.');
      return { ok: false };
    }
    if (!snapshot.issueDate) {
      window.alert('Συμπλήρωσε ημερομηνία έκδοσης πριν την καταχώριση.');
      return { ok: false };
    }
    if (!snapshot.employeeId || !snapshot.employeeCode || !snapshot.fullInvoiceIdentifier) {
      window.alert('Συμπλήρωσε έγκυρα στοιχεία υπαλλήλου πριν την καταχώριση.');
      return { ok: false };
    }
    if (snapshot.invoiceNumber !== reservation.invoiceNumber) {
      window.alert('Ο αριθμός της φόρμας δεν ταιριάζει με τον δεσμευμένο αριθμό του προσχεδίου.');
      return { ok: false };
    }

    const existing = freshRecords.find(record =>
      record.issuerUnitId === snapshot.issuerUnitId &&
      record.employeeId === snapshot.employeeId &&
      record.invoiceNumber === snapshot.invoiceNumber &&
      record.id !== reservation.id
    );
    if (existing) {
      window.alert(`Υπάρχει ήδη τιμολόγιο με αριθμό ${snapshot.invoiceNumber}.`);
      return { ok: false };
    }

    selectedRecordId = snapshot.id;
    const issued = issueActiveInvoiceReservation(scope, snapshot, freshRecords);
    if (!issued.ok) {
      window.alert('Δεν ήταν δυνατή η αποθήκευση του αρχείου τιμολογίων. Το τιμολόγιο δεν καταχωρίστηκε.');
      return { ok: false };
    }
    records = issued.records;
    selectedRecordId = issued.record.id;
    renderTable();
    window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
    onFormUpdated?.(form);
    renderDetail(issued.record);
    notifyTabs('invoice-issued', { scope });
    return { ok: true, snapshot: issued.record };
  }

  registerButton.addEventListener('click', async () => {
    registerButton.disabled = true;
    try {
      const scope = activeScope(form);
      const result = await withInvoiceIssuanceLock(scope, issueInvoiceWithinLock);
      if (result?.blocked) window.alert(result.message);
    } finally {
      registerButton.disabled = false;
      window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
    }
  });

  [queryInput, dateFrom, dateTo].forEach(control => {
    control.addEventListener('input', () => {
      if (control === dateFrom || control === dateTo) formatDateFilterInput(control);
      renderTable();
    });
    control.addEventListener('change', renderTable);
  });

  clearFiltersButton.addEventListener('click', () => {
    queryInput.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    renderTable();
  });

  downloadJsonButton.addEventListener('click', () => {
    const profile = employeeProfileFromForm(form);
    if (!profile.employeeId || !isEmployeeCodeValid(profile.employeeCode)) {
      window.alert('Συμπλήρωσε έγκυρο προφίλ υπαλλήλου πριν από τη λήψη αρχείου.');
      return;
    }

    const state = readInvoiceNumberState(activeScope(form), records);
    const exportedAt = new Date().toISOString();
    const payload = buildEmployeeArchiveExport({
      records,
      exportedAt,
      issuerUnit: {
        id: getCurrentServiceId(form),
        code: getCurrentIssuerUnitCode(form),
        name: form.querySelector('#department')?.value.trim() || ''
      },
      employee: {
        id: profile.employeeId,
        code: normalizeEmployeeCode(profile.employeeCode),
        name: profile.employeeName
      },
      numbering: state
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile({
      filename: `form25-archive-${filenamePart(getCurrentServiceId(form))}-${filenamePart(profile.employeeCode)}-${date}.json`,
      content: JSON.stringify(payload, null, 2),
      type: 'application/json;charset=utf-8'
    });
  });

  downloadCsvButton.addEventListener('click', () => {
    const profile = employeeProfileFromForm(form);
    if (!profile.employeeId || !isEmployeeCodeValid(profile.employeeCode)) {
      window.alert('Συμπλήρωσε έγκυρο προφίλ υπαλλήλου πριν από τη λήψη αναφοράς.');
      return;
    }

    const csv = buildEmployeeArchiveCsv(records, activeScope(form));
    const date = new Date().toISOString().slice(0, 10);
    downloadTextFile({
      filename: `form25-report-${filenamePart(getCurrentServiceId(form))}-${filenamePart(profile.employeeCode)}-${date}.csv`,
      content: csv,
      type: 'text/csv;charset=utf-8'
    });
  });

  restoreButton.addEventListener('click', () => {
    restoreInput.value = '';
    restoreInput.click();
  });

  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files?.[0];
    if (!file) return;

    try {
      if (!file.name.toLocaleLowerCase('el').endsWith('.json')) {
        window.alert('Η επαναφορά δέχεται μόνο αρχεία JSON backup.');
        return;
      }

      const parsed = parseEmployeeArchiveBackup(await file.text());
      if (!parsed.ok) {
        window.alert(parsed.message);
        return;
      }

      const counterKey = employeeInvoiceCounterKey({
        issuerUnitId: parsed.issuerUnit.id,
        employeeId: parsed.employee.id
      });
      const plan = buildRestorePlan(parsed, {
        existingRecords: readInvoiceArchive(),
        existingProfile: readStoredEmployeeProfileForRestore(),
        existingCounter: readStoredValue(counterKey)
      });
      if (!plan.ok) {
        const conflictDetails = typeof plan.conflictCount === 'number'
          ? `\nΝέα records: ${plan.newCount}\nΉδη υπάρχοντα: ${plan.existingCount}\nConflicts: ${plan.conflictCount}`
          : '';
        window.alert(`${plan.message}${conflictDetails}`);
        return;
      }

      const nextText = plan.exhausted ? 'Η σειρά έχει εξαντληθεί.' : formatInvoiceSequenceNumber(plan.nextNumber);
      const summary = [
        `Εκδούσα μονάδα: ${plan.issuerUnit.name || plan.issuerUnit.id}`,
        `Κωδικός υπαλλήλου: ${plan.employee.code}`,
        `Ονοματεπώνυμο: ${plan.employee.name || '-'}`,
        `Πλήθος τιμολογίων: ${parsed.records.length}`,
        `Πρώτος αριθμός: ${plan.firstNumber === null ? '-' : formatInvoiceSequenceNumber(plan.firstNumber)}`,
        `Τελευταίος αριθμός: ${plan.lastNumber === null ? '-' : formatInvoiceSequenceNumber(plan.lastNumber)}`,
        `Ημερομηνία export: ${plan.exportedAt || '-'}`,
        `Επόμενος αριθμός μετά την επαναφορά: ${nextText}`,
        `Νέα records: ${plan.newCount}`,
        `Ήδη υπάρχοντα: ${plan.existingCount}`,
        `Conflicts: ${plan.conflictCount}`,
        '',
        'Η επαναφορά θα αποθηκεύσει το προσωπικό προφίλ και το αρχείο τιμολογίων σε αυτόν τον browser. Θέλετε να συνεχίσετε;'
      ].join('\n');

      if (!window.confirm(summary)) return;

      const restored = applyRestorePlan(plan);
      if (!restored.ok) {
        window.alert(restored.message);
        return;
      }

      applyEmployeeProfileToForm(form, {
        employeeId: plan.employee.id,
        employeeCode: plan.employee.code,
        employeeName: plan.employee.name
      });
      const serviceIdField = form.querySelector('#serviceId');
      const issuerUnitCodeField = form.querySelector('#issuerUnitCode');
      const departmentField = form.querySelector('#department');
      if (serviceIdField) serviceIdField.value = plan.issuerUnit.id;
      if (issuerUnitCodeField) issuerUnitCodeField.value = plan.issuerUnit.code;
      if (departmentField && plan.issuerUnit.name) departmentField.value = plan.issuerUnit.name;

      refreshRecords();
      onFormUpdated?.(form);
      notifyTabs('archive-restored', { scope: plan.scope });
      window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
      window.alert(restored.exhausted
        ? 'Η επαναφορά ολοκληρώθηκε επιτυχώς. Η προσωπική σειρά έχει εξαντληθεί στο 99999.'
        : `Η επαναφορά ολοκληρώθηκε επιτυχώς. Επαναφέρθηκαν ${restored.restoredCount} τιμολόγια. Επόμενος αριθμός: ${restored.formattedNextNumber}.`);
    } catch (error) {
      console.warn('Unable to restore employee archive', error);
      window.alert('Δεν ήταν δυνατή η επαναφορά του αρχείου.');
    } finally {
      restoreInput.value = '';
    }
  });

  table.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const row = button.closest('tr[data-record-id]');
    const record = records.find(saved => saved.id === row?.dataset.recordId);
    if (!record) return;

    selectedRecordId = record.id;

    if (button.dataset.action === 'view') {
      renderDetail(record);
      return;
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Να διαγραφεί το τιμολόγιο ${record.invoiceNumber};`)) return;
      persist(records.filter(saved => saved.id !== record.id));
      selectedRecordId = '';
      renderDetail(null);
      return;
    }

    const currentReservation = findActiveInvoiceReservation(activeScope(form), readInvoiceArchive());
    if (currentReservation && currentReservation.id !== record.id) {
      const confirmed = window.confirm(`Ο δεσμευμένος αριθμός ${currentReservation.shortInvoiceIdentifier || currentReservation.formattedInvoiceNumber} θα ακυρωθεί πριν φορτωθεί άλλη εγγραφή. Να συνεχίσουμε;`);
      if (!confirmed) return;
      const cancelled = cancelActiveInvoiceReservation(activeScope(form), { reason: 'load-archive-record' }, readInvoiceArchive());
      if (!cancelled.ok) {
        window.alert('Δεν ήταν δυνατή η ακύρωση του ενεργού δεσμευμένου αριθμού.');
        return;
      }
      refreshRecords();
    }

    loadRecordToForm(record, form, renderOfficialTemplate, onFormUpdated);

    if (button.dataset.action === 'print') {
      window.print();
      return;
    }

    if (button.dataset.action === 'pdf') {
      button.disabled = true;
      try {
        await downloadOfficialPdf({ filename: filenameForRecord(record) });
      } finally {
        button.disabled = false;
      }
    }
  });

  window.addEventListener('invoice-archive:external-update', () => {
    refreshRecords();
  });
  window.addEventListener('storage', event => {
    if (event.key?.startsWith('eTreasury.form25.')) refreshRecords();
  });

  renderTable();
  return section;
}
