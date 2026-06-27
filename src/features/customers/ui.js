import { setFormValues } from '../../shared/form-state.js';
import {
  CUSTOMER_FIELDS,
  customerMatchesInvoice,
  customerFromForm,
  customerLabel,
  findDuplicateCustomer,
  matchesCustomer
} from './model.js';
import { readCustomers, saveCustomers } from './storage.js';
import { readInvoiceArchive } from '../invoice-archive/storage.js';
import { recordSummary } from '../invoice-archive/snapshot.js';
import { downloadOfficialPdf } from '../pdf-download/index.js';

function createField(labelText, input) {
  const label = document.createElement('label');
  label.className = 'field';
  label.append(labelText, input);
  return label;
}

function createButton(text, className = 'template-button') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = text;
  return button;
}

function applyCustomerToForm(form, customer) {
  form.dataset.customerId = customer.id || '';
  setFormValues(form, Object.fromEntries(
    CUSTOMER_FIELDS.map(field => [field, customer[field] ?? ''])
  ));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function filenameForInvoice(record) {
  const number = String(record.invoiceNumber || '00000').replace(/[<>:"\\|?*\x00-\x1f\s]+/g, '-');
  const date = String(record.issueDate || '').replace(/\//g, '-').replace(/[<>:"\\|?*\x00-\x1f\s]+/g, '');
  return `GL25-${number || '00000'}-${date || 'χωρις-ημερομηνια'}.pdf`;
}

export function createCustomersPanel({ form, renderOfficialTemplate, onFormUpdated }) {
  let customers = readCustomers();
  let selectedId = '';
  let customerInvoices = [];

  const section = document.createElement('section');
  section.className = 'feature-panel customers-panel no-print';
  section.innerHTML = `
    <h3>Καρτέλες πελατών</h3>
    <p class="feature-help">Αποθήκευση και επαναχρησιμοποίηση μόνο των στοιχείων οφειλέτη.</p>
  `;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Αναζήτηση με όνομα ή φορολογική ταυτότητα';

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Αποθηκευμένοι πελάτες');

  const nameInput = document.createElement('input');
  const taxInput = document.createElement('input');
  const addressInput = document.createElement('input');
  const postalInput = document.createElement('input');
  const phoneInput = document.createElement('input');

  const fields = document.createElement('div');
  fields.className = 'feature-grid';
  fields.append(
    createField('Όνομα οφειλέτη', nameInput),
    createField('Φορολογική ταυτότητα (προαιρετική)', taxInput),
    createField('Διεύθυνση', addressInput),
    createField('Ταχυδρομικός κώδικας', postalInput),
    createField('Τηλέφωνο', phoneInput)
  );

  const newButton = createButton('Νέος πελάτης', 'template-button');
  const saveButton = createButton('Αποθήκευση');
  const updateButton = createButton('Ενημέρωση');
  const loadButton = createButton('Φόρτωση στη φόρμα');
  const deleteButton = createButton('Διαγραφή', 'template-button template-button-danger');

  const controls = document.createElement('div');
  controls.className = 'feature-actions';
  controls.append(newButton, saveButton, updateButton, loadButton, deleteButton);

  const invoicesTitle = document.createElement('h4');
  invoicesTitle.textContent = 'Τιμολόγια πελάτη';

  const invoicesWrap = document.createElement('div');
  invoicesWrap.className = 'table-scroll customer-invoices';
  invoicesWrap.innerHTML = `
    <table class="records-table">
      <thead>
        <tr>
          <th>Αριθμός</th>
          <th>Ημερομηνία</th>
          <th>Περιγραφή</th>
          <th>Καθαρό</th>
          <th>Φ.Π.Α.</th>
          <th>Σύνολο</th>
          <th>Ενέργειες</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  section.append(
    createField('Αναζήτηση πελάτη', searchInput),
    createField('Επιλογή πελάτη', select),
    fields,
    controls,
    invoicesTitle,
    invoicesWrap
  );

  function currentEditorCustomer(id = selectedId) {
    return {
      id,
      debtorName: nameInput.value.trim(),
      debtorTaxId: taxInput.value.trim(),
      debtorAddress: addressInput.value.trim(),
      postalCode: postalInput.value.trim(),
      phone: phoneInput.value.trim(),
      updatedAt: new Date().toISOString()
    };
  }

  function fillEditor(customer = {}) {
    selectedId = customer.id ?? '';
    nameInput.value = customer.debtorName ?? '';
    taxInput.value = customer.debtorTaxId ?? '';
    addressInput.value = customer.debtorAddress ?? '';
    postalInput.value = customer.postalCode ?? '';
    phoneInput.value = customer.phone ?? '';
    select.value = selectedId;
    renderCustomerInvoices();
  }

  function renderOptions() {
    const query = searchInput.value;
    const filtered = customers.filter(customer => matchesCustomer(customer, query));
    select.replaceChildren(new Option('Επιλογή πελάτη...', ''));
    filtered.forEach(customer => {
      select.append(new Option(customerLabel(customer), customer.id));
    });
    select.value = filtered.some(customer => customer.id === selectedId) ? selectedId : '';
    renderCustomerInvoices(filtered);
  }

  function invoiceCustomers(filteredCustomers = customers.filter(customer => matchesCustomer(customer, searchInput.value))) {
    if (selectedId) {
      const selected = customers.find(customer => customer.id === selectedId);
      return selected ? [selected] : [];
    }
    return searchInput.value.trim() ? filteredCustomers : [];
  }

  function renderCustomerInvoices(filteredCustomers) {
    const tbody = invoicesWrap.querySelector('tbody');
    const owners = invoiceCustomers(filteredCustomers);
    const records = readInvoiceArchive()
      .filter(record => owners.some(customer => customerMatchesInvoice(customer, record)));
    customerInvoices = records;
    tbody.replaceChildren();

    if (!owners.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'Αναζήτησε ή επίλεξε πελάτη για προβολή τιμολογίων.';
      row.append(cell);
      tbody.append(row);
      return;
    }

    if (!records.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'Δεν υπάρχουν αποθηκευμένα τιμολόγια για τον πελάτη.';
      row.append(cell);
      tbody.append(row);
      return;
    }

    records.forEach(record => {
      const summary = recordSummary(record);
      const row = document.createElement('tr');
      row.dataset.recordId = record.id;
      row.innerHTML = `
        <td>${escapeHtml(summary.invoiceNumber)}</td>
        <td>${escapeHtml(summary.issueDate)}</td>
        <td>${escapeHtml(record.description || '')}</td>
        <td>${escapeHtml(summary.netAmount)}</td>
        <td>${escapeHtml(summary.vatAmount)}</td>
        <td>${escapeHtml(summary.grossAmount)}</td>
        <td class="table-actions">
          <button type="button" class="template-button" data-action="view">Προβολή</button>
          <button type="button" class="template-button" data-action="load">Φόρτωση</button>
          <button type="button" class="template-button" data-action="print">Εκτύπωση</button>
          <button type="button" class="template-button" data-action="pdf">Λήψη PDF</button>
        </td>
      `;
      tbody.append(row);
    });
  }

  function persist(nextCustomers) {
    customers = nextCustomers;
    saveCustomers(customers);
    renderOptions();
    window.dispatchEvent(new CustomEvent('customers:updated'));
  }

  searchInput.addEventListener('input', renderOptions);
  window.addEventListener('invoice-archive:updated', () => renderCustomerInvoices());

  select.addEventListener('change', () => {
    const customer = customers.find(saved => saved.id === select.value);
    if (!customer) {
      fillEditor();
      return;
    }
    fillEditor(customer);
    applyCustomerToForm(form, customer);
  });

  invoicesWrap.addEventListener('click', async event => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const record = customerInvoices.find(invoice => invoice.id === button.closest('tr')?.dataset.recordId);
    if (!record) return;

    if (button.dataset.action === 'view') {
      window.alert(`Τιμολόγιο ${record.invoiceNumber}\n${record.issueDate}\n${record.description || ''}`);
      return;
    }

    setFormValues(form, record.formValues);
    form.dataset.customerId = record.customerId || selectedId || '';
    renderOfficialTemplate();
    onFormUpdated?.(form);

    if (button.dataset.action === 'print') {
      window.print();
      return;
    }

    if (button.dataset.action === 'pdf') {
      button.disabled = true;
      try {
        await downloadOfficialPdf({ filename: filenameForInvoice(record) });
      } finally {
        button.disabled = false;
      }
    }
  });

  newButton.addEventListener('click', () => {
    selectedId = '';
    fillEditor(customerFromForm(form, ''));
    renderOptions();
  });

  saveButton.addEventListener('click', () => {
    const customer = currentEditorCustomer();
    if (!customer.debtorName && !customer.debtorTaxId) {
      window.alert('Συμπλήρωσε όνομα οφειλέτη ή αριθμό φορολογικής ταυτότητας.');
      return;
    }

    const duplicate = findDuplicateCustomer(customers, customer);
    if (duplicate && !window.confirm(`Υπάρχει ήδη πελάτης "${customerLabel(duplicate)}". Να δημιουργηθεί νέα καρτέλα;`)) {
      return;
    }

    const newCustomer = { ...customer, id: crypto.randomUUID?.() ?? `customer-${Date.now()}` };
    selectedId = newCustomer.id;
    form.dataset.customerId = newCustomer.id;
    persist([...customers, newCustomer]);
    fillEditor(newCustomer);
  });

  updateButton.addEventListener('click', () => {
    if (!selectedId) {
      window.alert('Επίλεξε πελάτη για ενημέρωση.');
      return;
    }

    const customer = currentEditorCustomer(selectedId);
    const duplicate = findDuplicateCustomer(customers, customer, selectedId);
    if (duplicate && !window.confirm(`Τα στοιχεία ταιριάζουν με τον πελάτη "${customerLabel(duplicate)}". Να συνεχιστεί η ενημέρωση;`)) {
      return;
    }

    form.dataset.customerId = selectedId;
    persist(customers.map(saved => saved.id === selectedId ? customer : saved));
  });

  loadButton.addEventListener('click', () => {
    const customer = currentEditorCustomer(selectedId || crypto.randomUUID?.() || `customer-${Date.now()}`);
    applyCustomerToForm(form, customer);
  });

  deleteButton.addEventListener('click', () => {
    const customer = customers.find(saved => saved.id === selectedId);
    if (!customer) return;
    if (!window.confirm(`Να διαγραφεί ο πελάτης "${customerLabel(customer)}";`)) return;

    persist(customers.filter(saved => saved.id !== selectedId));
    form.dataset.customerId = '';
    fillEditor();
  });

  fillEditor(customerFromForm(form, ''));
  renderOptions();

  return section;
}
