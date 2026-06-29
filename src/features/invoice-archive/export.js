import { APP_VERSION_LABEL } from '../../config/version.js';

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function employeeRecords(records, { issuerUnitId, employeeId }) {
  return records.filter(record => record.issuerUnitId === issuerUnitId && record.employeeId === employeeId);
}

export function buildEmployeeArchiveExport({ records, issuerUnit, employee, numbering, exportedAt = new Date().toISOString() }) {
  const invoices = employeeRecords(records, { issuerUnitId: issuerUnit.id, employeeId: employee.id });
  const lastIssuedNumber = invoices.reduce((highest, record) => Math.max(highest, Number(record.invoiceNumber) || 0), 0);

  return {
    schemaVersion: 1,
    exportType: 'employee-invoice-archive',
    exportedAt,
    appVersion: APP_VERSION_LABEL,
    issuerUnit,
    employee,
    numbering: {
      minimum: 1,
      maximum: 99999,
      lastIssuedNumber,
      nextNumber: numbering.nextNumber,
      exhausted: numbering.exhausted
    },
    invoiceCount: invoices.length,
    invoices
  };
}

export function buildEmployeeArchiveCsv(records, { issuerUnitId, employeeId }) {
  const headers = [
    'Πλήρης αριθμός τιμολογίου',
    'Πενταψήφιος αριθμός',
    'Ημερομηνία έκδοσης',
    'Κωδικός υπαλλήλου',
    'Ονοματεπώνυμο υπαλλήλου',
    'Οφειλέτης',
    'Φορολογική ταυτότητα',
    'Καθαρό ποσό',
    'ΦΠΑ',
    'Συνολικό ποσό',
    'Κατάσταση τιμολογίου'
  ];
  const rows = employeeRecords(records, { issuerUnitId, employeeId }).map(record => [
    record.fullInvoiceIdentifier,
    record.formattedInvoiceNumber,
    record.issueDate,
    record.employeeCode,
    record.employeeName,
    record.debtorName,
    record.debtorTaxId,
    record.netAmount,
    record.vatAmount,
    record.grossAmount,
    record.status || 'issued'
  ]);

  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')}`;
}
