import { setFormValues } from '../../shared/form-state.js';
import { downloadOfficialPdf } from '../pdf-download/index.js';
import { readInvoiceArchive, reserveNextInvoiceNumber, saveInvoiceArchive } from './storage.js';
import {
  createInvoiceSnapshot,
  recordMatchesFilters,
  recordSummary
} from './snapshot.js';

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
  const number = String(record.invoiceNumber || '00000').replace(/[<>:"\\|?*\x00-\x1f\s]+/g, '-');
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

  section.append(registerButton, filters, tableWrap, detail);

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
    records = nextRecords;
    saveInvoiceArchive(records);
    renderTable();
    window.dispatchEvent(new CustomEvent('invoice-archive:updated'));
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
        <dt>Αριθμός</dt><dd>${escapeHtml(summary.invoiceNumber)}</dd>
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
    const filtered = records.filter(record => recordMatchesFilters(record, currentFilters()));
    tbody.replaceChildren();

    if (!filtered.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'Δεν υπάρχουν εγγραφές.';
      row.append(cell);
      tbody.append(row);
      renderDetail(records.find(record => record.id === selectedRecordId));
      return;
    }

    filtered.forEach(record => {
      const summary = recordSummary(record);
      const row = document.createElement('tr');
      row.dataset.recordId = record.id;
      row.innerHTML = `
        <td>${escapeHtml(summary.invoiceNumber)}</td>
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

    renderDetail(records.find(record => record.id === selectedRecordId));
  }

  registerButton.addEventListener('click', () => {
    if (!form.reportValidity()) return;

    const invoiceNumberField = form.querySelector('#invoiceNumber');
    if (invoiceNumberField && !invoiceNumberField.value.trim()) {
      invoiceNumberField.value = reserveNextInvoiceNumber(records);
    }

    const snapshot = createInvoiceSnapshot(form);
    if (!snapshot.invoiceNumber) {
      window.alert('Συμπλήρωσε αριθμό τιμολογίου πριν την καταχώριση.');
      return;
    }
    if (!snapshot.issueDate) {
      window.alert('Συμπλήρωσε ημερομηνία έκδοσης πριν την καταχώριση.');
      return;
    }

    const existing = records.find(record => record.invoiceNumber === snapshot.invoiceNumber);
    if (existing) {
      window.alert(`Υπάρχει ήδη τιμολόγιο με αριθμό ${snapshot.invoiceNumber}.`);
      return;
    }

    selectedRecordId = snapshot.id;
    persist([...records, snapshot]);
    onFormUpdated?.(form);
    renderDetail(snapshot);
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

  renderTable();
  return section;
}
