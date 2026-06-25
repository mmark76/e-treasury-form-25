import { readJson, writeJson } from '../../shared/storage.js';

const INVOICE_ARCHIVE_KEY = 'eTreasury.form25.invoiceArchive.v1';

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

