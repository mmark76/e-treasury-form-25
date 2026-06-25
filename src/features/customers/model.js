export const CUSTOMER_FIELDS = ['debtorName', 'debtorTaxId', 'debtorAddress', 'postalCode', 'phone'];

export function createCustomerId() {
  return crypto.randomUUID?.() ?? `customer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function customerFromForm(form, id = createCustomerId()) {
  return {
    id,
    debtorName: form.querySelector('#debtorName')?.value.trim() ?? '',
    debtorTaxId: form.querySelector('#debtorTaxId')?.value.trim() ?? '',
    debtorAddress: form.querySelector('#debtorAddress')?.value.trim() ?? '',
    postalCode: form.querySelector('#postalCode')?.value.trim() ?? '',
    phone: form.querySelector('#phone')?.value.trim() ?? '',
    updatedAt: new Date().toISOString()
  };
}

export function customerLabel(customer) {
  const name = customer.debtorName || 'Χωρίς όνομα';
  return customer.debtorTaxId ? `${name} - ${customer.debtorTaxId}` : name;
}

export function findDuplicateCustomer(customers, customer, ignoredId = '') {
  const name = customer.debtorName.trim().toLocaleLowerCase('el');
  const taxId = customer.debtorTaxId.trim().toLocaleLowerCase('el');

  return customers.find(saved => {
    if (saved.id === ignoredId) return false;
    const sameTaxId = taxId && saved.debtorTaxId.trim().toLocaleLowerCase('el') === taxId;
    const sameName = name && saved.debtorName.trim().toLocaleLowerCase('el') === name;
    return sameTaxId || sameName;
  });
}

export function matchesCustomer(customer, query) {
  const normalized = query.trim().toLocaleLowerCase('el');
  if (!normalized) return true;
  return [customer.debtorName, customer.debtorTaxId]
    .some(value => String(value || '').toLocaleLowerCase('el').includes(normalized));
}

export function customerMatchesInvoice(customer, invoice) {
  if (!customer || !invoice) return false;
  if (invoice.customerId && invoice.customerId === customer.id) return true;
  if (invoice.customerId) return false;

  const customerName = customer.debtorName.trim().toLocaleLowerCase('el');
  const invoiceName = String(invoice.debtorName || '').trim().toLocaleLowerCase('el');
  return Boolean(customerName && invoiceName && customerName === invoiceName);
}
