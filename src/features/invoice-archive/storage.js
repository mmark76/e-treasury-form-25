import { readJson, writeJson } from '../../shared/storage.js';

const INVOICE_ARCHIVE_KEY = 'eTreasury.form25.invoiceArchive.v1';
const INVOICE_COUNTER_KEY = 'eTreasury.form25.invoiceCounter.v1';

function normalizeArchive(value) {
  return Array.isArray(value)
    ? value.filter(record => record && typeof record.id === 'string' && record.formValues)
    : [];
}

export function readInvoiceArchive() {
  return normalizeArchive(readJson(INVOICE_ARCHIVE_KEY, []));
}

export function saveInvoiceArchive(records) {
  return writeJson(INVOICE_ARCHIVE_KEY, normalizeArchive(records));
}

export function formatInvoiceSequenceNumber(value) {
  const number = Math.max(1, Number(value) || 1);
  return String(number).padStart(5, '0');
}

function highestInvoiceNumber(records) {
  return records.reduce((highest, record) => {
    const number = Number(String(record.invoiceNumber || '').replace(/\D/g, ''));
    return Number.isFinite(number) ? Math.max(highest, number) : highest;
  }, 0);
}

export function readNextInvoiceNumber(records = readInvoiceArchive()) {
  const stored = Number(readJson(INVOICE_COUNTER_KEY, 0));
  return Math.max(stored || 1, highestInvoiceNumber(records) + 1, 1);
}

export function reserveNextInvoiceNumber(records = readInvoiceArchive()) {
  const nextNumber = readNextInvoiceNumber(records);
  writeJson(INVOICE_COUNTER_KEY, nextNumber + 1);
  return formatInvoiceSequenceNumber(nextNumber);
}
