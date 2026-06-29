import { calculateInvoice, formatCurrency } from '../calculations.js';
import { amountToGreekWords } from '../number-to-words.js';
import { getFormValues } from '../../shared/form-state.js';
import { readCustomers } from '../customers/storage.js';
import {
  buildFullInvoiceIdentifier,
  formatInvoiceSequenceNumber,
  parseInvoiceSequenceNumber
} from '../../shared/invoice-number.js';
import { DEFAULT_ISSUER_UNIT_CODE, sanitizeServiceId } from '../../shared/service-identity.js';
import { normalizeEmployeeCode } from '../../shared/employee-profile.js';

export function createRecordId() {
  return crypto.randomUUID?.() ?? `invoice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function padInvoiceNumber(value) {
  return formatInvoiceSequenceNumber(value);
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function dateValue(dateText) {
  const match = String(dateText || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function findCustomerIdForForm(form, formValues) {
  const debtorName = String(formValues.debtorName || '').trim().toLocaleLowerCase('el');
  const debtorTaxId = String(formValues.debtorTaxId || '').trim().toLocaleLowerCase('el');
  const customers = readCustomers();
  const selected = customers.find(customer => customer.id === form.dataset.customerId);
  if (selected) {
    const sameSelectedTaxId =
      debtorTaxId && selected.debtorTaxId.trim().toLocaleLowerCase('el') === debtorTaxId;
    const sameSelectedName =
      debtorName && selected.debtorName.trim().toLocaleLowerCase('el') === debtorName;
    if (sameSelectedTaxId || sameSelectedName) return selected.id;
  }

  const customer = customers.find(saved => {
    const sameTaxId = debtorTaxId && saved.debtorTaxId.trim().toLocaleLowerCase('el') === debtorTaxId;
    const sameName = debtorName && saved.debtorName.trim().toLocaleLowerCase('el') === debtorName;
    return sameTaxId || sameName;
  });

  return customer?.id ?? '';
}

export function createInvoiceSnapshot(form) {
  const formValues = getFormValues(form);
  const calculation = calculateInvoice(formValues.netAmount, formValues.vatRate);
  const invoiceNumber = parseInvoiceSequenceNumber(formValues.invoiceNumber);
  const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
  const issuerUnitId = sanitizeServiceId(formValues.serviceId);
  const issuerUnitCode = String(formValues.issuerUnitCode || DEFAULT_ISSUER_UNIT_CODE).trim();
  const issuerUnitName = String(formValues.department || '').trim();
  const employeeId = String(formValues.employeeId || '').trim();
  const employeeCode = normalizeEmployeeCode(formValues.employeeCode);
  const employeeName = String(formValues.employeeName || '').trim();
  const fullInvoiceIdentifier = buildFullInvoiceIdentifier({
    issuerUnitCode,
    employeeCode,
    invoiceNumber
  });
  const createdAt = new Date().toISOString();

  return {
    id: createRecordId(),
    serviceId: issuerUnitId,
    serviceName: issuerUnitName,
    issuerUnitId,
    issuerUnitCode,
    issuerUnitName,
    employeeId,
    employeeCode,
    employeeName,
    invoiceNumber,
    formattedInvoiceNumber,
    fullInvoiceIdentifier,
    issueDate: formValues.issueDate || '',
    issueDateValue: dateValue(formValues.issueDate),
    customerId: findCustomerIdForForm(form, formValues),
    createdAt,
    issuedAt: createdAt,
    createdAtDisplay: formatDateTime(createdAt),
    debtorName: formValues.debtorName || '',
    debtorTaxId: formValues.debtorTaxId || '',
    debtorAddress: formValues.debtorAddress || '',
    postalCode: formValues.postalCode || '',
    phone: formValues.phone || '',
    description: formValues.description || '',
    quantity: 1,
    unitPrice: calculation.netAmount,
    netAmount: calculation.netAmount,
    vatRate: calculation.vatRate,
    vatAmount: calculation.vatAmount,
    grossAmount: calculation.grossAmount,
    amountInWords: amountToGreekWords(calculation.grossAmount),
    paymentType: formValues.paymentType || '',
    signatoryName: formValues.signatoryName || '',
    signDate: formValues.signDate || '',
    revenueAccount: formValues.revenueAccount || '',
    formValues
  };
}

export function recordMatchesFilters(record, filters) {
  const text = [
    record.fullInvoiceIdentifier,
    record.formattedInvoiceNumber,
    record.invoiceNumber,
    record.employeeCode,
    record.serviceId,
    record.serviceName,
    record.debtorName,
    record.debtorTaxId
  ]
    .join(' ')
    .toLocaleLowerCase('el');
  const query = filters.query.trim().toLocaleLowerCase('el');
  if (query && !text.includes(query)) return false;
  if (filters.dateFrom && record.issueDateValue && record.issueDateValue < filters.dateFrom) return false;
  if (filters.dateTo && record.issueDateValue && record.issueDateValue > filters.dateTo) return false;
  return true;
}

export function recordSummary(record) {
  return {
    serviceId: record.serviceId || '',
    serviceName: record.serviceName || '',
    issuerUnitId: record.issuerUnitId || record.serviceId || '',
    issuerUnitCode: record.issuerUnitCode || '',
    employeeId: record.employeeId || '',
    employeeCode: record.employeeCode || '',
    employeeName: record.employeeName || '',
    invoiceNumber: record.formattedInvoiceNumber || padInvoiceNumber(record.invoiceNumber) || 'Χωρίς αριθμό',
    fullInvoiceIdentifier: record.fullInvoiceIdentifier || record.formattedInvoiceNumber || padInvoiceNumber(record.invoiceNumber) || 'Χωρίς αριθμό',
    issueDate: record.issueDate || '',
    debtorName: record.debtorName || '',
    debtorTaxId: record.debtorTaxId || '',
    netAmount: formatCurrency(record.netAmount),
    vatAmount: formatCurrency(record.vatAmount),
    grossAmount: formatCurrency(record.grossAmount)
  };
}
