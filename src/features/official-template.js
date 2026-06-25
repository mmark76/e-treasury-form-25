import { calculateInvoice } from './calculations.js';
import { amountToGreekWords } from './number-to-words.js';

const TEMPLATE_MARKUP = `
  <img class="form-template" src="assets/gl25-template.svg" alt="Επίσημο κενό έντυπο Γ.Λ.25">
  <div class="form-overlay" aria-hidden="true">
    <span class="overlay-field overlay-invoice-number" data-output="invoiceNumber"></span>
    <span class="overlay-field overlay-department" data-output="department"></span>
    <span class="overlay-field overlay-chapter-code" data-output="chapterCode"></span>
    <span class="overlay-field overlay-vat-registration" data-output="vatRegistration"></span>
    <span class="overlay-field overlay-issue-date" data-output="issueDate"></span>
    <span class="overlay-field overlay-service-address" data-output="serviceAddress"></span>
    <span class="overlay-field overlay-service-postal" data-output="servicePostalCode"></span>

    <span class="overlay-field overlay-debtor-name" data-output="debtorName"></span>
    <span class="overlay-field overlay-debtor-tax-id" data-output="debtorTaxId"></span>
    <span class="overlay-field overlay-debtor-location" data-output="debtorLocation"></span>
    <span class="overlay-field overlay-postal-code" data-output="postalCode"></span>
    <span class="overlay-field overlay-phone" data-output="phone"></span>
    <span class="overlay-field overlay-payment-type" data-output="paymentType"></span>

    <span class="overlay-field overlay-description-line-1" data-output="descriptionLine1"></span>
    <span class="overlay-field overlay-description-line-2" data-output="descriptionLine2"></span>
    <span class="overlay-field overlay-billing-period" data-output="billingPeriod"></span>
    <span class="overlay-field overlay-vat-rate" data-output="vatRate"></span>

    <span class="overlay-field overlay-net-euros" data-output="netEuros"></span>
    <span class="overlay-field overlay-net-cents" data-output="netCents"></span>
    <span class="overlay-field overlay-vat-euros" data-output="vatEuros"></span>
    <span class="overlay-field overlay-vat-cents" data-output="vatCents"></span>

    <span class="overlay-field overlay-sum1-euros" data-output="netEuros"></span>
    <span class="overlay-field overlay-sum1-cents" data-output="netCents"></span>
    <span class="overlay-field overlay-sum2-euros" data-output="vatEuros"></span>
    <span class="overlay-field overlay-sum2-cents" data-output="vatCents"></span>
    <span class="overlay-field overlay-gross-euros" data-output="grossEuros"></span>
    <span class="overlay-field overlay-gross-cents" data-output="grossCents"></span>

    <span class="overlay-field overlay-amount-words" data-output="amountInWords"></span>
    <span class="overlay-field overlay-analysis-vat-rate" data-output="vatRate"></span>
    <span class="overlay-field overlay-analysis-euros" data-output="grossEuros"></span>
    <span class="overlay-field overlay-analysis-cents" data-output="grossCents"></span>

    <span class="overlay-field overlay-signatory-name" data-output="signatoryName"></span>
    <span class="overlay-field overlay-sign-date" data-output="signDate"></span>
    <span class="overlay-field overlay-bottom-gross-euros" data-output="grossEuros"></span>
    <span class="overlay-field overlay-bottom-gross-cents" data-output="grossCents"></span>
    <span class="overlay-field overlay-revenue-account" data-output="revenueAccount"></span>
  </div>
`;

function ensureStylesheet() {
  if (document.querySelector('link[data-official-template-styles]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'src/styles/official-template.css';
  link.dataset.officialTemplateStyles = 'true';
  document.head.append(link);
}

function ensureServicePostalField() {
  if (document.getElementById('servicePostalCode')) return;

  const firstGrid = document.querySelector('#invoice-form fieldset .form-grid');
  if (!firstGrid) return;

  const label = document.createElement('label');
  label.className = 'field';
  label.append('Ταχυδρομικός κώδικας Υπηρεσίας');

  const input = document.createElement('input');
  input.id = 'servicePostalCode';
  input.inputMode = 'numeric';
  input.value = '1421';
  input.defaultValue = '1421';
  input.dataset.templateKey = 'servicePostalCode';

  label.append(input);
  firstGrid.append(label);
}

function ensureOfficialPreview() {
  const preview = document.getElementById('invoice-preview');
  if (!preview || preview.dataset.officialTemplateReady === 'true') return;

  preview.innerHTML = TEMPLATE_MARKUP;
  preview.dataset.officialTemplateReady = 'true';
  preview.setAttribute('aria-label', 'Επίσημο έντυπο Γ.Λ.25');
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day} / ${month} / ${year}` : value;
}

function setOutput(key, value) {
  document.querySelectorAll(`[data-output="${key}"]`).forEach(element => {
    element.textContent = value ?? '';
  });
}

function getValue(id) {
  return document.getElementById(id)?.value.trim() ?? '';
}

function padInvoiceNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits ? digits.slice(-5).padStart(5, '0') : '00000';
}

function splitAmount(value, minimumEuroDigits = 3) {
  const totalCents = Math.round(Math.max(0, Number(value) || 0) * 100);
  const euros = Math.floor(totalCents / 100);
  const cents = totalCents % 100;

  return {
    euros: String(euros).padStart(minimumEuroDigits, '0'),
    cents: String(cents).padStart(2, '0')
  };
}

function splitDescription(value, maximumLineLength = 29) {
  const explicitLines = String(value || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (explicitLines.length > 1) {
    return [explicitLines[0], explicitLines.slice(1).join(' ')];
  }

  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return ['', ''];

  const lines = ['', ''];
  words.forEach(word => {
    const target = lines[0] && `${lines[0]} ${word}`.length > maximumLineLength ? 1 : 0;
    lines[target] = lines[target] ? `${lines[target]} ${word}` : word;
  });

  return lines;
}

export function initializeOfficialTemplateLayout() {
  ensureStylesheet();
  ensureServicePostalField();
  ensureOfficialPreview();
}

export function renderOfficialTemplate() {
  ensureOfficialPreview();

  const calculation = calculateInvoice(getValue('netAmount'), getValue('vatRate'));
  const [descriptionLine1, descriptionLine2] = splitDescription(getValue('description'));
  const debtorLocation = [getValue('debtorAddress'), getValue('spaceName')]
    .filter(Boolean)
    .join(' - ');

  const net = splitAmount(calculation.netAmount, 3);
  const vat = splitAmount(calculation.vatAmount, 2);
  const gross = splitAmount(calculation.grossAmount, 3);

  const values = {
    department: getValue('department'),
    chapterCode: getValue('chapterCode'),
    vatRegistration: getValue('vatRegistration'),
    invoiceNumber: padInvoiceNumber(getValue('invoiceNumber')),
    issueDate: formatDate(getValue('issueDate')),
    serviceAddress: getValue('serviceAddress'),
    servicePostalCode: getValue('servicePostalCode'),
    debtorName: getValue('debtorName'),
    debtorTaxId: getValue('debtorTaxId'),
    debtorLocation,
    postalCode: getValue('postalCode'),
    phone: getValue('phone'),
    paymentType: getValue('paymentType'),
    descriptionLine1,
    descriptionLine2,
    billingPeriod: getValue('billingPeriod'),
    vatRate: String(calculation.vatRate),
    netEuros: net.euros,
    netCents: net.cents,
    vatEuros: vat.euros,
    vatCents: vat.cents,
    grossEuros: gross.euros,
    grossCents: gross.cents,
    amountInWords: amountToGreekWords(calculation.grossAmount),
    signatoryName: getValue('signatoryName'),
    signDate: formatDate(getValue('signDate')),
    revenueAccount: getValue('revenueAccount')
  };

  Object.entries(values).forEach(([key, value]) => setOutput(key, value));
}
