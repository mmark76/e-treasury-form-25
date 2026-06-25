import { calculateInvoice, formatCurrency } from './calculations.js';
import { amountToGreekWords } from './number-to-words.js';

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day} / ${month} / ${year}` : value;
}

function setOutput(key, value) {
  document.querySelectorAll(`[data-output="${key}"]`).forEach(element => {
    element.textContent = value || '—';
  });
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() ?? '';
}

export function renderPreview() {
  const calculation = calculateInvoice(getValue('netAmount'), getValue('vatRate'));

  const directValues = {
    department: getValue('department'),
    chapterCode: getValue('chapterCode'),
    vatRegistration: getValue('vatRegistration'),
    invoiceNumber: getValue('invoiceNumber') || '00000',
    issueDate: formatDate(getValue('issueDate')),
    serviceAddress: getValue('serviceAddress'),
    debtorName: getValue('debtorName'),
    debtorTaxId: getValue('debtorTaxId'),
    debtorAddress: getValue('debtorAddress'),
    postalCode: getValue('postalCode'),
    phone: getValue('phone'),
    spaceName: getValue('spaceName'),
    paymentType: getValue('paymentType'),
    description: getValue('description'),
    billingPeriod: getValue('billingPeriod'),
    signatoryName: getValue('signatoryName'),
    signDate: formatDate(getValue('signDate')),
    revenueAccount: getValue('revenueAccount')
  };

  Object.entries(directValues).forEach(([key, value]) => setOutput(key, value));
  setOutput('netAmount', formatCurrency(calculation.netAmount));
  setOutput('vatRate', String(calculation.vatRate));
  setOutput('vatAmount', formatCurrency(calculation.vatAmount));
  setOutput('grossAmount', formatCurrency(calculation.grossAmount));
  setOutput('amountInWords', amountToGreekWords(calculation.grossAmount));
}
