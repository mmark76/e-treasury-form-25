import { readJson, readStoredValue, writeStoredValue } from '../../shared/storage.js';
import {
  MAX_INVOICE_NUMBER,
  MIN_INVOICE_NUMBER,
  buildFullInvoiceIdentifier,
  formatInvoiceSequenceNumber,
  parseInvoiceSequenceNumber
} from '../../shared/invoice-number.js';
import {
  EMPLOYEE_PROFILE_KEY,
  normalizeEmployeeCode,
  validateEmployeeCode
} from '../../shared/employee-profile.js';
import {
  DEFAULT_ISSUER_UNIT_CODE,
  DEFAULT_SERVICE_ID,
  sanitizeServiceId
} from '../../shared/service-identity.js';
import {
  INVOICE_ARCHIVE_KEY,
  createNumberingScope,
  employeeInvoiceCounterKey,
  highestInvoiceNumber,
  normalizeArchive,
  readInvoiceArchive,
  readInvoiceNumberState
} from './storage.js';

const SUPPORTED_SCHEMA_VERSION = 1;
const EXPORT_TYPE = 'employee-invoice-archive';

function parseCounterValue(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  if (!Number.isInteger(number) || number < MIN_INVOICE_NUMBER) return null;
  return number > MAX_INVOICE_NUMBER ? MAX_INVOICE_NUMBER + 1 : number;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isPlainObject(value)) return value;
  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = canonicalValue(value[key]);
      return result;
    }, {});
}

function stableStringify(value) {
  return JSON.stringify(canonicalValue(value));
}

function compositeKey(record) {
  return `${record.issuerUnitId}\n${record.employeeId}\n${record.invoiceNumber}`;
}

function validationError(message) {
  return { ok: false, message };
}

function requiredObject(value, name) {
  return isPlainObject(value) ? '' : `Το πεδίο ${name} δεν είναι έγκυρο.`;
}

function normalizeImportedRecord(record, { issuerUnit, employee }) {
  if (!isPlainObject(record)) return validationError('Το archive περιέχει μη έγκυρο invoice record.');

  const invoiceNumber = parseInvoiceSequenceNumber(record.invoiceNumber ?? record.formattedInvoiceNumber ?? record.formValues?.invoiceNumber);
  if (invoiceNumber === null) {
    return validationError('Το archive περιέχει αριθμό τιμολογίου εκτός του 00001-99999.');
  }

  const issuerUnitId = sanitizeServiceId(record.issuerUnitId || record.serviceId || record.formValues?.serviceId);
  const employeeId = String(record.employeeId || record.formValues?.employeeId || '').trim();
  if (issuerUnitId !== issuerUnit.id || employeeId !== employee.id) {
    return validationError('Το archive περιέχει τιμολόγια άλλης εκδούσας μονάδας ή άλλου υπαλλήλου.');
  }

  const issuerUnitCode = String(record.issuerUnitCode || record.formValues?.issuerUnitCode || issuerUnit.code || DEFAULT_ISSUER_UNIT_CODE).trim();
  const employeeCode = normalizeEmployeeCode(record.employeeCode || record.formValues?.employeeCode || employee.code);
  const employeeName = String(record.employeeName || record.formValues?.employeeName || employee.name || '').trim();
  const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
  const fullInvoiceIdentifier = buildFullInvoiceIdentifier({ issuerUnitCode, employeeCode, invoiceNumber });

  if (!fullInvoiceIdentifier) {
    return validationError('Το archive δεν μπορεί να δημιουργήσει έγκυρο πλήρη αριθμό τιμολογίου.');
  }

  return {
    ok: true,
    record: {
      ...record,
      serviceId: issuerUnit.id,
      serviceName: String(record.serviceName || record.issuerUnitName || issuerUnit.name || '').trim(),
      issuerUnitId: issuerUnit.id,
      issuerUnitCode,
      issuerUnitName: String(record.issuerUnitName || record.serviceName || issuerUnit.name || '').trim(),
      employeeId: employee.id,
      employeeCode,
      employeeName,
      invoiceNumber,
      formattedInvoiceNumber,
      fullInvoiceIdentifier,
      formValues: {
        ...(isPlainObject(record.formValues) ? record.formValues : {}),
        serviceId: issuerUnit.id,
        issuerUnitCode,
        employeeId: employee.id,
        employeeCode,
        employeeName,
        invoiceNumber: formattedInvoiceNumber,
        department: record.formValues?.department || record.issuerUnitName || record.serviceName || issuerUnit.name || ''
      }
    }
  };
}

export function parseEmployeeArchiveBackup(jsonText) {
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return validationError('Το αρχείο δεν είναι έγκυρο JSON.');
  }

  if (!isPlainObject(payload)) return validationError('Το αρχείο JSON πρέπει να είναι plain object.');
  if (payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return validationError('Μη υποστηριζόμενη έκδοση backup.');
  if (payload.exportType !== EXPORT_TYPE) return validationError('Το αρχείο δεν είναι προσωπικό JSON backup της εφαρμογής.');
  if (requiredObject(payload.issuerUnit, 'issuerUnit')) return validationError(requiredObject(payload.issuerUnit, 'issuerUnit'));
  if (requiredObject(payload.employee, 'employee')) return validationError(requiredObject(payload.employee, 'employee'));
  if (requiredObject(payload.numbering, 'numbering')) return validationError(requiredObject(payload.numbering, 'numbering'));
  if (!Array.isArray(payload.invoices)) return validationError('Το πεδίο invoices πρέπει να είναι array.');

  const issuerUnit = {
    id: sanitizeServiceId(payload.issuerUnit.id),
    code: String(payload.issuerUnit.code || DEFAULT_ISSUER_UNIT_CODE).trim(),
    name: String(payload.issuerUnit.name || '').trim()
  };
  if (!String(payload.issuerUnit.id || '').trim() || !issuerUnit.id) {
    return validationError('Το backup δεν έχει έγκυρο issuerUnit.id.');
  }

  const employee = {
    id: String(payload.employee.id || '').trim(),
    code: normalizeEmployeeCode(payload.employee.code),
    name: String(payload.employee.name || '').trim()
  };
  if (!employee.id) return validationError('Το backup δεν έχει έγκυρο employee.id.');
  const employeeCodeMessage = validateEmployeeCode(employee.code);
  if (employeeCodeMessage) return validationError(employeeCodeMessage);

  const importedRecords = [];
  const seen = new Map();
  for (const invoice of payload.invoices) {
    const normalized = normalizeImportedRecord(invoice, { issuerUnit, employee });
    if (!normalized.ok) return normalized;
    const key = compositeKey(normalized.record);
    const existing = seen.get(key);
    if (existing && stableStringify(existing) !== stableStringify(normalized.record)) {
      return validationError('Το backup περιέχει duplicate composite key με αντικρουόμενα στοιχεία.');
    }
    if (!existing) {
      seen.set(key, normalized.record);
      importedRecords.push(normalized.record);
    }
  }

  const highestImportedInvoice = importedRecords.reduce((highest, record) => Math.max(highest, record.invoiceNumber), 0);
  const importedNextNumber = parseInvoiceSequenceNumber(payload.numbering.nextNumber);
  const nextNumber = Math.max(
    highestImportedInvoice >= MAX_INVOICE_NUMBER ? MAX_INVOICE_NUMBER + 1 : highestImportedInvoice + 1,
    importedNextNumber ?? MIN_INVOICE_NUMBER,
    MIN_INVOICE_NUMBER
  );

  return {
    ok: true,
    issuerUnit,
    employee,
    records: importedRecords,
    exportedAt: String(payload.exportedAt || ''),
    importedNextNumber: nextNumber > MAX_INVOICE_NUMBER ? null : nextNumber,
    exhausted: nextNumber > MAX_INVOICE_NUMBER
  };
}

export function buildRestorePlan(importState, {
  existingRecords = readInvoiceArchive(),
  existingProfile = readJson(EMPLOYEE_PROFILE_KEY, null),
  existingCounter = null
} = {}) {
  if (!importState?.ok) return importState || validationError('Δεν υπάρχει έγκυρο backup για επαναφορά.');

  const scope = createNumberingScope({
    issuerUnitId: importState.issuerUnit.id,
    employeeId: importState.employee.id
  });
  const existingEmployeeRecords = existingRecords.filter(record =>
    record.issuerUnitId === scope.issuerUnitId && record.employeeId === scope.employeeId
  );
  const browserHasOtherProfile =
    existingProfile?.employeeId &&
    String(existingProfile.employeeId) !== importState.employee.id &&
    existingRecords.length > 0;

  if (browserHasOtherProfile) {
    return validationError('Το αρχείο ανήκει σε διαφορετικό προφίλ υπαλλήλου. Η επαναφορά σε αυτόν τον browser δεν μπορεί να συνεχιστεί χωρίς πρώτα να εξαχθούν και να διασφαλιστούν τα υπάρχοντα δεδομένα.');
  }

  const existingByKey = new Map(existingEmployeeRecords.map(record => [compositeKey(record), record]));
  const mergedRecords = [...existingRecords];
  let newCount = 0;
  let existingCount = 0;
  const conflicts = [];

  for (const record of importState.records) {
    const key = compositeKey(record);
    const existing = existingByKey.get(key);
    if (!existing) {
      mergedRecords.push(record);
      existingByKey.set(key, record);
      newCount += 1;
      continue;
    }

    if (stableStringify(normalizeArchive([existing])[0]) === stableStringify(record)) {
      existingCount += 1;
      continue;
    }

    conflicts.push(key);
  }

  if (conflicts.length) {
    return {
      ok: false,
      message: 'Εντοπίστηκαν conflicts με υπάρχοντα τιμολόγια. Η επαναφορά δεν εκτελέστηκε.',
      conflicts,
      conflictCount: conflicts.length,
      newCount,
      existingCount
    };
  }

  const highestMerged = highestInvoiceNumber(mergedRecords, scope);
  const storedCounter = parseCounterValue(existingCounter) ?? MIN_INVOICE_NUMBER;
  const importedCounter = importState.importedNextNumber ?? MAX_INVOICE_NUMBER + 1;
  const nextCounter = Math.max(
    highestMerged >= MAX_INVOICE_NUMBER ? MAX_INVOICE_NUMBER + 1 : highestMerged + 1,
    importedCounter,
    storedCounter,
    MIN_INVOICE_NUMBER
  );

  return {
    ok: true,
    scope,
    issuerUnit: importState.issuerUnit,
    employee: importState.employee,
    records: normalizeArchive(mergedRecords, importState.employee),
    counterValue: nextCounter,
    counterKey: employeeInvoiceCounterKey(scope),
    newCount,
    existingCount,
    conflictCount: 0,
    firstNumber: importState.records.length ? Math.min(...importState.records.map(record => record.invoiceNumber)) : null,
    lastNumber: importState.records.length ? Math.max(...importState.records.map(record => record.invoiceNumber)) : null,
    exportedAt: importState.exportedAt,
    exhausted: nextCounter > MAX_INVOICE_NUMBER,
    nextNumber: nextCounter > MAX_INVOICE_NUMBER ? null : nextCounter
  };
}

function restoreRawValue(key, value) {
  if (value === null) {
    try {
      localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
  return writeStoredValue(key, value);
}

export function applyRestorePlan(plan) {
  if (!plan?.ok) return plan || validationError('Δεν υπάρχει έγκυρο σχέδιο επαναφοράς.');

  const profile = {
    employeeId: plan.employee.id,
    employeeCode: plan.employee.code,
    employeeName: plan.employee.name
  };
  const keys = [EMPLOYEE_PROFILE_KEY, INVOICE_ARCHIVE_KEY, plan.counterKey];
  const previousValues = new Map(keys.map(key => [key, readStoredValue(key)]));
  const writes = [
    [EMPLOYEE_PROFILE_KEY, JSON.stringify(profile)],
    [INVOICE_ARCHIVE_KEY, JSON.stringify(plan.records)],
    [plan.counterKey, JSON.stringify(plan.counterValue)]
  ];

  for (const [key, value] of writes) {
    if (!writeStoredValue(key, value)) {
      previousValues.forEach((previousValue, previousKey) => restoreRawValue(previousKey, previousValue));
      return validationError('Δεν ήταν δυνατή η αποθήκευση της επαναφοράς. Τα προηγούμενα δεδομένα επανήλθαν όπου ήταν δυνατό.');
    }
  }

  const restoredRecords = readInvoiceArchive(profile);
  const restoredState = readInvoiceNumberState(plan.scope, restoredRecords);
  const consistent = restoredState.exhausted === plan.exhausted &&
    (restoredState.exhausted || restoredState.nextNumber === plan.nextNumber);

  if (!consistent) {
    previousValues.forEach((previousValue, previousKey) => restoreRawValue(previousKey, previousValue));
    return validationError('Η επαναφορά γράφτηκε αλλά απέτυχε ο τελικός έλεγχος συνέπειας. Τα προηγούμενα δεδομένα επανήλθαν όπου ήταν δυνατό.');
  }

  return {
    ok: true,
    restoredCount: plan.newCount,
    nextNumber: restoredState.nextNumber,
    formattedNextNumber: restoredState.formattedNextNumber,
    exhausted: restoredState.exhausted
  };
}
