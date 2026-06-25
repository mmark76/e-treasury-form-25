function parseAmount(value) {
  const normalized = String(value ?? '').replace(',', '.').trim();
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoice(netAmountValue, vatRateValue) {
  const netAmount = roundCurrency(Math.max(0, parseAmount(netAmountValue)));
  const vatRate = Math.max(0, parseAmount(vatRateValue));
  const vatAmount = roundCurrency(netAmount * vatRate / 100);
  const grossAmount = roundCurrency(netAmount + vatAmount);

  return {
    netAmount,
    vatRate,
    vatAmount,
    grossAmount
  };
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('el-CY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}
