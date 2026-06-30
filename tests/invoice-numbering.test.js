import {
  advanceInvoiceCounter,
  employeeInvoiceCounterKey,
  cancelActiveInvoiceReservation,
  findActiveInvoiceReservation,
  invoiceNumberMatchesNext,
  issueActiveInvoiceReservation,
  migrateInvoiceArchiveForEmployee,
  readInvoiceArchive,
  readInvoiceNumberState,
  readNextInvoiceNumber,
  reserveInvoiceNumber,
  saveInvoiceArchive
} from '../src/features/invoice-archive/storage.js';
import {
  buildFullInvoiceIdentifier,
  buildShortInvoiceIdentifier,
  formatInvoiceSequenceNumber,
  parseInvoiceSequenceNumber
} from '../src/shared/invoice-number.js';
import { DEFAULT_SERVICE_ID, sanitizeServiceId, serviceStorageKeyPart } from '../src/shared/service-identity.js';
import {
  applyRestorePlan,
  buildRestorePlan,
  parseEmployeeArchiveBackup
} from '../src/features/invoice-archive/restore.js';
import {
  hasAnotherActiveTab,
  withInvoiceIssuanceLock
} from '../src/shared/tab-coordination.js';
import {
  EMPLOYEE_PROFILE_KEY,
  normalizeEmployeeCode,
  validateEmployeeCode
} from '../src/shared/employee-profile.js';
import { buildEmployeeArchiveCsv, buildEmployeeArchiveExport } from '../src/features/invoice-archive/export.js';
import { recordSummary } from '../src/features/invoice-archive/snapshot.js';
import { getInvoiceStatusPresentation } from '../src/shared/invoice-status.js';

const results = document.getElementById('results');
const LEGACY_DEFAULT_SERVICE_ID = 'STATE-FAIR-SPACE-MANAGEMENT';
const LEGACY_DEFAULT_COUNTER_KEY = `eTreasury.form25.invoiceCounter.${encodeURIComponent(LEGACY_DEFAULT_SERVICE_ID)}.v1`;

function report(name, passed, detail = '') {
  const row = document.createElement('p');
  row.className = passed ? 'pass' : 'fail';
  row.textContent = passed ? `✓ ${name}` : `✗ ${name}${detail ? `: ${detail}` : ''}`;
  results.appendChild(row);
  if (!passed) throw new Error(row.textContent);
}

function assertEqual(name, actual, expected) {
  report(name, Object.is(actual, expected), `expected "${expected}", got "${actual}"`);
}

function assert(name, value) {
  report(name, Boolean(value));
}

function assertNotEqual(name, actual, unexpected) {
  report(name, !Object.is(actual, unexpected), `did not expect "${unexpected}"`);
}

function record(id, { issuerUnitId = DEFAULT_SERVICE_ID, employeeId, employeeCode, employeeName = 'Employee', invoiceNumber }) {
  const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
  const fullInvoiceIdentifier = buildFullInvoiceIdentifier({
    issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
    employeeCode,
    invoiceNumber
  });
  return {
    id,
    serviceId: issuerUnitId,
    serviceName: 'Unit',
    issuerUnitId,
    issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
    issuerUnitName: 'Unit',
    employeeId,
    employeeCode,
    employeeName,
    invoiceNumber,
    formattedInvoiceNumber,
    fullInvoiceIdentifier,
    issueDate: '29/06/2026',
    debtorName: 'Client',
    debtorTaxId: 'TAX',
    netAmount: 10,
    vatAmount: 1.9,
    grossAmount: 11.9,
    formValues: {
      serviceId: issuerUnitId,
      issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
      employeeId,
      employeeCode,
      employeeName,
      invoiceNumber: formattedInvoiceNumber
    }
  };
}

function backupPayload({ employee = employeeA, records: backupRecords, numbering = null }) {
  const state = numbering ?? readInvoiceNumberState(employee, backupRecords);
  return {
    schemaVersion: 1,
    exportType: 'employee-invoice-archive',
    exportedAt: '2026-06-29T00:00:00.000Z',
    issuerUnit: {
      id: employee.issuerUnitId,
      code: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
      name: 'Unit'
    },
    employee: {
      id: employee.employeeId,
      code: employee.employeeCode,
      name: employee.employeeName
    },
    numbering: {
      minimum: 1,
      maximum: 99999,
      lastIssuedNumber: backupRecords.reduce((highest, item) => Math.max(highest, item.invoiceNumber), 0),
      nextNumber: state.nextNumber,
      exhausted: state.exhausted
    },
    invoiceCount: backupRecords.length,
    invoices: backupRecords
  };
}

localStorage.clear();

assertEqual('Formats minimum invoice number', formatInvoiceSequenceNumber(1), '00001');
assertEqual('Formats maximum invoice number', formatInvoiceSequenceNumber(99999), '99999');
assertEqual('Rejects 00000', formatInvoiceSequenceNumber(0), '');
assertEqual('Rejects 100000 instead of truncating', formatInvoiceSequenceNumber(100000), '');
assertEqual('Parsing rejects out-of-range value', parseInvoiceSequenceNumber('100000'), null);

assertEqual('Employee code uppercases Greek', normalizeEmployeeCode('μμ'), 'ΜΜ');
assertEqual('Employee code uppercases Latin', normalizeEmployeeCode('mk76'), 'MK76');
assertEqual('Two-character code is valid', validateEmployeeCode('ΜΜ'), '');
assertEqual('Longer alphanumeric code is valid', validateEmployeeCode('EMP001'), '');
assert('Blank employee code is rejected', Boolean(validateEmployeeCode('')));
assert('Hyphen employee code is rejected', Boolean(validateEmployeeCode('ΜΜ-1')));
assert('Slash employee code is rejected', Boolean(validateEmployeeCode('ΜΜ/1')));
assert('Space employee code is rejected', Boolean(validateEmployeeCode('Μ Μ')));

assertEqual('Builds full invoice identifier', buildFullInvoiceIdentifier({
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  employeeCode: 'ΜΜ',
  invoiceNumber: 1
}), 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΜΜ / 00001');
assertEqual('Builds full invoice identifier with five-digit number', buildFullInvoiceIdentifier({
  issuerUnitCode: '\u03a5\u0395\u0395\u0392-\u03a5\u0395-\u039a\u0394\u03a7\u039a\u0395',
  employeeCode: '\u039c\u039c',
  invoiceNumber: '00003'
}), '\u03a5\u0395\u0395\u0392-\u03a5\u0395-\u039a\u0394\u03a7\u039a\u0395-\u039c\u039c / 00003');
assertEqual('Builds short invoice identifier', buildShortInvoiceIdentifier({
  employeeCode: '\u039c\u039c',
  invoiceNumber: '00003'
}), '\u039c\u039c/00003');
assertEqual('Short invoice identifier is blank without a valid invoice number', buildShortInvoiceIdentifier({
  employeeCode: '\u039c\u039c',
  invoiceNumber: ''
}), '');
assertEqual('Full invoice identifier is blank without a valid invoice number', buildFullInvoiceIdentifier({
  issuerUnitCode: '\u03a5\u0395\u0395\u0392-\u03a5\u0395-\u039a\u0394\u03a7\u039a\u0395',
  employeeCode: '\u039c\u039c',
  invoiceNumber: ''
}), '');

const reservedStatus = getInvoiceStatusPresentation('reserved');
const issuedStatus = getInvoiceStatusPresentation('issued');
const cancelledStatus = getInvoiceStatusPresentation('cancelled');
const legacyStatus = getInvoiceStatusPresentation(undefined);
assertEqual('Reserved status has Greek label', reservedStatus.label, 'ΠΡΟΣΧΕΔΙΟ / ΔΕΣΜΕΥΜΕΝΟ');
assertEqual('Reserved status has CSS class', reservedStatus.className, 'invoice-status-reserved');
assertEqual('Issued status has Greek label', issuedStatus.label, 'ΕΚΔΟΘΕΝ / ΕΓΚΥΡΟ');
assertEqual('Cancelled status has Greek label', cancelledStatus.label, 'ΑΚΥΡΩΜΕΝΟ / ΑΚΥΡΟ');
assertEqual('Missing legacy status normalizes to issued', legacyStatus.status, 'issued');

const employeeA = { issuerUnitId: DEFAULT_SERVICE_ID, employeeId: 'employee-a', employeeCode: 'ΜΜ', employeeName: 'Employee A' };
const employeeB = { issuerUnitId: DEFAULT_SERVICE_ID, employeeId: 'employee-b', employeeCode: 'ΑΠ1', employeeName: 'Employee B' };
let records = [record('a-1', { ...employeeA, invoiceNumber: 1 })];

assertEqual('Employee A continues from own archive', readNextInvoiceNumber(employeeA, records), 2);
assertEqual('Employee B starts independently', readNextInvoiceNumber(employeeB, records), 1);
assert('Expected number matches next business rule', invoiceNumberMatchesNext(employeeA, '00002', records));
assert('Skipped number is rejected by business rule', !invoiceNumberMatchesNext(employeeA, '00003', records));
assert('Same invoice number is allowed for a different employee', invoiceNumberMatchesNext(employeeB, '00001', records));

localStorage.setItem(employeeInvoiceCounterKey(employeeA), JSON.stringify(99999));
assertEqual('Counter at 99999 allows issuing 99999', readNextInvoiceNumber(employeeA, records), 99999);
const exhaustedRecords = [...records, record('a-99999', { ...employeeA, invoiceNumber: 99999 })];
assertEqual('Series is exhausted after 99999', readNextInvoiceNumber(employeeA, exhaustedRecords), null);
assert('Exhausted state is reported', readInvoiceNumberState(employeeA, exhaustedRecords).exhausted);
assertEqual('Exhausted state has no formatted next number', readInvoiceNumberState(employeeA, exhaustedRecords).formattedNextNumber, '');
assert('No invoice number matches after exhaustion', !invoiceNumberMatchesNext(employeeA, '00001', exhaustedRecords));
assert('100000 is not accepted after exhaustion', !invoiceNumberMatchesNext(employeeA, '100000', exhaustedRecords));

localStorage.clear();
localStorage.setItem('eTreasury.form25.invoiceCounter.v1', JSON.stringify(8));
saveInvoiceArchive([
  {
    id: 'legacy-1',
    invoiceNumber: '00009',
    formValues: {
      invoiceNumber: '00009',
      department: 'Legacy service'
    }
  }
]);
assert('Legacy migration succeeds', migrateInvoiceArchiveForEmployee(employeeA, DEFAULT_SERVICE_ID));
let migrated = readInvoiceArchive();
assertEqual('Legacy record receives current default issuerUnitId', migrated[0].issuerUnitId, DEFAULT_SERVICE_ID);
assertEqual('Legacy record receives employeeId', migrated[0].employeeId, employeeA.employeeId);
assertEqual('Legacy record receives employeeCode', migrated[0].employeeCode, employeeA.employeeCode);
assertEqual('Legacy next number continues from highest invoice', readNextInvoiceNumber(employeeA, migrated), 10);
assert('Legacy migration is idempotent', migrateInvoiceArchiveForEmployee(employeeA, DEFAULT_SERVICE_ID));
assertEqual('Migration does not duplicate records', readInvoiceArchive().length, 1);

localStorage.clear();
localStorage.setItem(LEGACY_DEFAULT_COUNTER_KEY, JSON.stringify(27));
saveInvoiceArchive([
  {
    id: 'legacy-default-service-id',
    serviceId: LEGACY_DEFAULT_SERVICE_ID,
    serviceName: 'Legacy default service',
    invoiceNumber: '00026',
    formValues: {
      serviceId: LEGACY_DEFAULT_SERVICE_ID,
      department: 'Legacy default service',
      invoiceNumber: '00026'
    }
  }
]);
assert('Legacy default serviceId migration succeeds', migrateInvoiceArchiveForEmployee(employeeA, DEFAULT_SERVICE_ID));
migrated = readInvoiceArchive();
assertEqual('Legacy default serviceId is rewritten to the current default', migrated[0].issuerUnitId, DEFAULT_SERVICE_ID);
assertEqual('Legacy service-specific counter continues in the employee series', readNextInvoiceNumber(employeeA, migrated), 27);
assertEqual('Legacy service-specific counter key is removed after migration', localStorage.getItem(LEGACY_DEFAULT_COUNTER_KEY), null);

localStorage.clear();
localStorage.setItem('eTreasury.form25.invoiceCounter.v1', JSON.stringify(42));
assertEqual('Legacy counter alone does not start a new employee series', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 1);

localStorage.clear();
const nextNumber = readNextInvoiceNumber(employeeA, []);
assertEqual('Archive-first flow calculates without writing counter', nextNumber, 1);
assertEqual('Counter is untouched before archive save', localStorage.getItem(employeeInvoiceCounterKey(employeeA)), null);
const archiveRecords = [record('archive-first-1', { ...employeeA, invoiceNumber: 1 })];
assert('Archive save succeeds before counter update', saveInvoiceArchive(archiveRecords));
assert('Counter update after archive succeeds', advanceInvoiceCounter(employeeA, 1, archiveRecords));
assertEqual('Counter advances after archive save', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 2);

localStorage.clear();
const reservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  issuerUnitName: 'Unit',
  employeeCode: employeeA.employeeCode,
  employeeName: employeeA.employeeName,
  tabId: 'tab-a'
});
assert('Reservation succeeds for a new draft', reservation.ok);
assertEqual('Reserved draft receives first number', reservation.record.formattedInvoiceNumber, '00001');
assertEqual('Reserved draft stores short identifier', reservation.record.shortInvoiceIdentifier, 'ΜΜ/00001');
assertEqual('Reserved draft status is stored', readInvoiceArchive()[0].status, 'reserved');
assertEqual('Reload reuses active reservation', findActiveInvoiceReservation(employeeA, readInvoiceArchive()).formattedInvoiceNumber, '00001');
assertEqual('Reservation advances the next available number', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 2);
const reusedReservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  employeeCode: employeeA.employeeCode
});
assert('Existing active reservation is reused', reusedReservation.existing);
assertEqual('Reused reservation keeps the same number', reusedReservation.record.formattedInvoiceNumber, '00001');

const issuedSnapshot = record('issued-from-reservation', { ...employeeA, invoiceNumber: reservation.record.invoiceNumber });
const issuedReservation = issueActiveInvoiceReservation(employeeA, issuedSnapshot, readInvoiceArchive());
assert('Reserved draft converts to issued invoice', issuedReservation.ok);
assertEqual('Issued conversion keeps the reserved record id', readInvoiceArchive()[0].id, reservation.record.id);
assertEqual('Issued conversion keeps the same number', readInvoiceArchive()[0].formattedInvoiceNumber, '00001');
assertEqual('Issued conversion updates status', readInvoiceArchive()[0].status, 'issued');
assertEqual('Next number remains after issued conversion', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 2);

const secondReservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  issuerUnitName: 'Unit',
  employeeCode: employeeA.employeeCode,
  employeeName: employeeA.employeeName
});
assert('Second reservation succeeds after issue', secondReservation.ok);
assertEqual('Second reservation uses the next number', secondReservation.record.formattedInvoiceNumber, '00002');
const cancelledReservation = cancelActiveInvoiceReservation(employeeA, { reason: 'test cancellation' }, readInvoiceArchive());
assert('Active reservation can be cancelled', cancelledReservation.ok && cancelledReservation.cancelled);
assertEqual('Cancelled reservation is persisted', readInvoiceArchive().find(item => item.id === secondReservation.record.id).status, 'cancelled');
assert('Cancelled reservation stores cancellation timestamp', Boolean(readInvoiceArchive().find(item => item.id === secondReservation.record.id).cancelledAt));
assertEqual('Cancelled reservation stores cancellation reason', readInvoiceArchive().find(item => item.id === secondReservation.record.id).cancellationReason, 'test cancellation');
const thirdReservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  issuerUnitName: 'Unit',
  employeeCode: employeeA.employeeCode,
  employeeName: employeeA.employeeName
});
assertEqual('Cancelled number is not reused', thirdReservation.record.formattedInvoiceNumber, '00003');

localStorage.clear();
const cancellationFailureReservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  issuerUnitName: 'Unit',
  employeeCode: employeeA.employeeCode,
  employeeName: employeeA.employeeName
});
const failingCancellationSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = (key, value) => {
  if (key === 'eTreasury.form25.invoiceArchive.v1') throw new Error('simulated cancellation failure');
  return failingCancellationSetItem.call(localStorage, key, value);
};
const failedCancellation = cancelActiveInvoiceReservation(employeeA, { reason: 'simulated failure' }, readInvoiceArchive());
assert('Cancellation write failure is reported', !failedCancellation.ok && !failedCancellation.cancelled);
Storage.prototype.setItem = failingCancellationSetItem;
assertEqual('Failed cancellation keeps the active reservation', findActiveInvoiceReservation(employeeA, readInvoiceArchive()).id, cancellationFailureReservation.record.id);
assertEqual('Failed cancellation keeps the number unavailable for reuse', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 2);

localStorage.clear();
const failingReservationSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = (key, value) => {
  if (key === 'eTreasury.form25.invoiceArchive.v1') throw new Error('simulated reservation failure');
  return failingReservationSetItem.call(localStorage, key, value);
};
const failedReservation = reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  employeeCode: employeeA.employeeCode
});
assert('Reservation write failure is reported', !failedReservation.ok && failedReservation.writeFailed);
Storage.prototype.setItem = failingReservationSetItem;
assertEqual('Failed reservation does not advance the counter', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 1);

localStorage.clear();
let reservationLockOrder = [];
const reservationLocks = {
  async request(name, options, callback) {
    reservationLockOrder.push(name);
    return callback();
  }
};
const firstReserved = await withInvoiceIssuanceLock(employeeA, () => reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  employeeCode: employeeA.employeeCode
}), { locks: reservationLocks });
issueActiveInvoiceReservation(employeeA, record('locked-reserved-1', { ...employeeA, invoiceNumber: firstReserved.record.invoiceNumber }), readInvoiceArchive());
const secondReserved = await withInvoiceIssuanceLock(employeeA, () => reserveInvoiceNumber(employeeA, {
  issuerUnitCode: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ',
  employeeCode: employeeA.employeeCode
}), { locks: reservationLocks });
assertEqual('First locked reservation gets current next number', firstReserved.record.formattedInvoiceNumber, '00001');
assertEqual('Second locked reservation gets following number', secondReserved.record.formattedInvoiceNumber, '00002');
assert('Reservation lock uses scoped Web Locks name', reservationLockOrder[0].includes(encodeURIComponent(employeeA.employeeId)));
assertNotEqual('Locked reservations do not duplicate numbers', firstReserved.record.formattedInvoiceNumber, secondReserved.record.formattedInvoiceNumber);

localStorage.clear();
const failingArchiveSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = (key, value) => {
  if (key === 'eTreasury.form25.invoiceArchive.v1') throw new Error('simulated archive failure');
  return failingArchiveSetItem.call(localStorage, key, value);
};
assert('Archive write failure is reported', !saveInvoiceArchive([record('failed-archive', { ...employeeA, invoiceNumber: 25 })]));
assertEqual('Counter is not advanced when archive write fails', localStorage.getItem(employeeInvoiceCounterKey(employeeA)), null);
Storage.prototype.setItem = failingArchiveSetItem;

localStorage.clear();
assert('Archive save succeeds when counter later fails', saveInvoiceArchive([record('counter-fails-after-archive', { ...employeeA, invoiceNumber: 25 })]));
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = () => {
  throw new Error('simulated quota failure');
};
assert('Counter write failure after archive is reported', !advanceInvoiceCounter(employeeA, 25, readInvoiceArchive()));
Storage.prototype.setItem = originalSetItem;
assertEqual('Next number remains correct from highest invoice after counter write failure', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 26);

const exportRecords = [
  record('export-a', { ...employeeA, invoiceNumber: 1 }),
  record('export-b', { ...employeeB, invoiceNumber: 1 })
];
const exportPayload = buildEmployeeArchiveExport({
  records: exportRecords,
  issuerUnit: { id: DEFAULT_SERVICE_ID, code: 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ', name: 'Unit' },
  employee: { id: employeeA.employeeId, code: employeeA.employeeCode, name: employeeA.employeeName },
  numbering: readInvoiceNumberState(employeeA, exportRecords),
  exportedAt: '2026-06-29T00:00:00.000Z'
});
assertEqual('JSON export includes only active employee records', exportPayload.invoiceCount, 1);
assertEqual('JSON export includes snapshots', exportPayload.invoices[0].id, 'export-a');
assertEqual('JSON export includes numbering state', exportPayload.numbering.nextNumber, 2);

const csv = buildEmployeeArchiveCsv(exportRecords, employeeA);
assert('CSV export includes UTF-8 BOM', csv.startsWith('\uFEFF'));
assert('CSV export includes Greek full identifier', csv.includes('ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΜΜ / 00001'));
assert('CSV export includes visible Greek status label', csv.includes('ΕΚΔΟΘΕΝ / ΕΓΚΥΡΟ'));
assert('CSV export excludes other employee records', !csv.includes('ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΑΠ1 / 00001'));
assertEqual('Legacy record summary normalizes missing status to issued', recordSummary(exportRecords[0]).statusLabel, 'ΕΚΔΟΘΕΝ / ΕΓΚΥΡΟ');

assertEqual('Empty serviceId normalizes to the default', sanitizeServiceId(''), DEFAULT_SERVICE_ID);
assertEqual('Previous default serviceId normalizes to the current default', sanitizeServiceId(LEGACY_DEFAULT_SERVICE_ID), DEFAULT_SERVICE_ID);
assertEqual('Equivalent serviceId variants use the same storage key part', serviceStorageKeyPart(' state-fair-management '), serviceStorageKeyPart('STATE-FAIR-MANAGEMENT'));

localStorage.clear();
const restoreRecords = [
  record('restore-1', { ...employeeA, invoiceNumber: 1 }),
  record('restore-2', { ...employeeA, invoiceNumber: 2 })
];
const parsedRestore = parseEmployeeArchiveBackup(JSON.stringify(backupPayload({ records: restoreRecords })));
assert('Valid JSON backup is accepted', parsedRestore.ok);
const emptyRestorePlan = buildRestorePlan(parsedRestore, { existingRecords: [], existingProfile: null });
assert('Restore plan for empty browser is created', emptyRestorePlan.ok);
assertEqual('Restore keeps original employeeId', emptyRestorePlan.employee.id, employeeA.employeeId);
assertEqual('Restore keeps employeeCode', emptyRestorePlan.employee.code, employeeA.employeeCode);
assertEqual('Restore keeps employeeName', emptyRestorePlan.employee.name, employeeA.employeeName);
const restoreResult = applyRestorePlan(emptyRestorePlan);
assert('Restore in empty browser succeeds', restoreResult.ok);
assertEqual('Restore writes archived invoices', readInvoiceArchive().length, 2);
assertEqual('Restore continues from highest invoice + 1', readNextInvoiceNumber(employeeA, readInvoiceArchive()), 3);
assertEqual('Restored profile employeeId is original', JSON.parse(localStorage.getItem(EMPLOYEE_PROFILE_KEY)).employeeId, employeeA.employeeId);
assertEqual('Full invoice identifier is regenerated', readInvoiceArchive()[0].fullInvoiceIdentifier, 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΜΜ / 00001');

localStorage.clear();
const exhaustedBackup = backupPayload({
  records: [record('restore-99999', { ...employeeA, invoiceNumber: 99999 })],
  numbering: { nextNumber: null, exhausted: true }
});
const exhaustedPlan = buildRestorePlan(parseEmployeeArchiveBackup(JSON.stringify(exhaustedBackup)), { existingRecords: [], existingProfile: null });
assert('Exhausted restore plan is valid', exhaustedPlan.ok);
assert('Restored 99999 series is exhausted', applyRestorePlan(exhaustedPlan).exhausted);

assert('Invalid JSON backup is rejected', !parseEmployeeArchiveBackup('{not-json').ok);
assert('Wrong exportType is rejected', !parseEmployeeArchiveBackup(JSON.stringify({ ...backupPayload({ records: restoreRecords }), exportType: 'csv-report' })).ok);
assert('Unsupported schemaVersion is rejected', !parseEmployeeArchiveBackup(JSON.stringify({ ...backupPayload({ records: restoreRecords }), schemaVersion: 999 })).ok);
assert('Invoice number 0 is rejected', !parseEmployeeArchiveBackup(JSON.stringify(backupPayload({ records: [record('bad-0', { ...employeeA, invoiceNumber: 0 })] }))).ok);
assert('Invoice number 100000 is rejected', !parseEmployeeArchiveBackup(JSON.stringify(backupPayload({ records: [record('bad-100000', { ...employeeA, invoiceNumber: 100000 })] }))).ok);

const conflictingDuplicate = backupPayload({ records: [
  record('duplicate-a', { ...employeeA, invoiceNumber: 5 }),
  { ...record('duplicate-b', { ...employeeA, invoiceNumber: 5 }), debtorName: 'Different' }
] });
assert('Duplicate composite keys in one backup are rejected when conflicting', !parseEmployeeArchiveBackup(JSON.stringify(conflictingDuplicate)).ok);

const wrongEmployeeRecord = backupPayload({ records: [record('wrong-employee', { ...employeeB, invoiceNumber: 1 })] });
wrongEmployeeRecord.employee = { id: employeeA.employeeId, code: employeeA.employeeCode, name: employeeA.employeeName };
assert('Record with different employeeId inside export is rejected', !parseEmployeeArchiveBackup(JSON.stringify(wrongEmployeeRecord)).ok);

localStorage.clear();
saveInvoiceArchive([record('merge-existing', { ...employeeA, invoiceNumber: 1 })]);
const mergeParsed = parseEmployeeArchiveBackup(JSON.stringify(backupPayload({
  records: [
    record('merge-existing', { ...employeeA, invoiceNumber: 1 }),
    record('merge-new', { ...employeeA, invoiceNumber: 2 })
  ]
})));
const mergePlan = buildRestorePlan(mergeParsed, { existingRecords: readInvoiceArchive(), existingProfile: { employeeId: employeeA.employeeId } });
assert('Same employeeId restore can merge safely', mergePlan.ok);
assertEqual('Safe merge counts new records', mergePlan.newCount, 1);
assertEqual('Safe merge counts existing records', mergePlan.existingCount, 1);
assert('Safe merge restore succeeds', applyRestorePlan(mergePlan).ok);
assertEqual('Safe merge keeps unique records only', readInvoiceArchive().length, 2);
const idempotentPlan = buildRestorePlan(mergeParsed, { existingRecords: readInvoiceArchive(), existingProfile: { employeeId: employeeA.employeeId } });
assert('Second import of same archive is idempotent', idempotentPlan.ok);
assertEqual('Idempotent import has no new records', idempotentPlan.newCount, 0);

localStorage.setItem(employeeInvoiceCounterKey(employeeA), JSON.stringify(10));
const lowerCounterPlan = buildRestorePlan(mergeParsed, {
  existingRecords: readInvoiceArchive(),
  existingProfile: { employeeId: employeeA.employeeId },
  existingCounter: localStorage.getItem(employeeInvoiceCounterKey(employeeA))
});
assertEqual('Restore does not reduce existing counter', lowerCounterPlan.counterValue, 10);

const conflictPlan = buildRestorePlan(parseEmployeeArchiveBackup(JSON.stringify(backupPayload({
  records: [{ ...record('merge-existing', { ...employeeA, invoiceNumber: 1 }), debtorName: 'Changed' }]
}))), {
  existingRecords: readInvoiceArchive(),
  existingProfile: { employeeId: employeeA.employeeId }
});
assert('Conflicting existing composite key blocks restore', !conflictPlan.ok);

const otherEmployeePlan = buildRestorePlan(parseEmployeeArchiveBackup(JSON.stringify(backupPayload({
  employee: employeeB,
  records: [record('other-employee', { ...employeeB, invoiceNumber: 1 })]
}))), {
  existingRecords: readInvoiceArchive(),
  existingProfile: { employeeId: employeeA.employeeId }
});
assert('Restore for different employeeId is blocked when browser has data', !otherEmployeePlan.ok);

localStorage.clear();
const partialPlan = buildRestorePlan(parsedRestore, { existingRecords: [], existingProfile: null });
const failingRestoreSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = (key, value) => {
  if (key === 'eTreasury.form25.invoiceArchive.v1') throw new Error('simulated restore failure');
  return failingRestoreSetItem.call(localStorage, key, value);
};
assert('Storage failure blocks restore', !applyRestorePlan(partialPlan).ok);
Storage.prototype.setItem = failingRestoreSetItem;
assertEqual('Storage failure leaves no partial profile', localStorage.getItem(EMPLOYEE_PROFILE_KEY), null);
assertEqual('Storage failure leaves no partial archive', localStorage.getItem('eTreasury.form25.invoiceArchive.v1'), null);

let lockOrder = [];
const fakeLocks = {
  async request(name, options, callback) {
    lockOrder.push(name);
    return callback();
  }
};
const firstIssued = await withInvoiceIssuanceLock(employeeA, async () => {
  const freshRecords = readInvoiceArchive();
  const next = readNextInvoiceNumber(employeeA, freshRecords);
  const nextRecords = [...freshRecords, record('locked-1', { ...employeeA, invoiceNumber: next })];
  saveInvoiceArchive(nextRecords);
  advanceInvoiceCounter(employeeA, next, nextRecords);
  return next;
}, { locks: fakeLocks });
const secondIssued = await withInvoiceIssuanceLock(employeeA, async () => {
  const freshRecords = readInvoiceArchive();
  const next = readNextInvoiceNumber(employeeA, freshRecords);
  const nextRecords = [...freshRecords, record('locked-2', { ...employeeA, invoiceNumber: next })];
  saveInvoiceArchive(nextRecords);
  advanceInvoiceCounter(employeeA, next, nextRecords);
  return next;
}, { locks: fakeLocks });
assertEqual('First locked issuance gets current next number', firstIssued, 1);
assertEqual('Second locked issuance gets following number', secondIssued, 2);
assert('Business logic uses scoped Web Locks name', lockOrder[0].includes(encodeURIComponent(employeeA.employeeId)));

localStorage.setItem('eTreasury.form25.activeTabs.v1', JSON.stringify({ other: Date.now() }));
assert('Fallback detects another active tab', hasAnotherActiveTab());
const blockedLock = await withInvoiceIssuanceLock(employeeA, async () => ({ ok: true }), { locks: null });
assert('Fallback without safe lock blocks issuance', blockedLock.blocked);

localStorage.clear();
