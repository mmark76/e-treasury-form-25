export const MIN_INVOICE_NUMBER = 1;
export const MAX_INVOICE_NUMBER = 99999;

export function parseInvoiceSequenceNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;

  const number = Number(text);
  if (!Number.isInteger(number) || number < MIN_INVOICE_NUMBER || number > MAX_INVOICE_NUMBER) {
    return null;
  }

  return number;
}

export function formatInvoiceSequenceNumber(value) {
  const number = parseInvoiceSequenceNumber(value);
  return number === null ? '' : String(number).padStart(5, '0');
}

export function isInvoiceSequenceNumberInRange(value) {
  return parseInvoiceSequenceNumber(value) !== null;
}

export function buildFullInvoiceIdentifier({ issuerUnitCode, employeeCode, invoiceNumber }) {
  const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
  const unit = String(issuerUnitCode ?? '').trim();
  const employee = String(employeeCode ?? '').trim().toUpperCase();

  if (!unit || !employee || !formattedInvoiceNumber) return '';

  return `${unit}-${employee} / ${formattedInvoiceNumber}`;
}
