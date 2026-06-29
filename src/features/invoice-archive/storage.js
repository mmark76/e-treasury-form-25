import { readJson, writeJson, removeStoredValue } from '../../shared/storage.js';
import {
  MAX_INVOICE_NUMBER,
  MIN_INVOICE_NUMBER,
  buildFullInvoiceIdentifier,
  formatInvoiceSequenceNumber,
  parseInvoiceSequenceNumber
} from '../../shared/invoice-number.js';
import {
  DEFAULT_SERVICE_ID,
  DEFAULT_ISSUER_UNIT_CODE,
  LEGACY_DEFAULT_SERVICE_IDS,
  sanitizeServiceId,
  serviceStorageKeyPart
} from '../../shared/service-identity.js';
import { normalizeEmployeeCode } from '../../shared/employee-profile.js';

export const INVOICE_ARCHIVE_KEY = 'eTreasury.form25.invoiceArchive.v1';
const LEGACY_INVOICE_COUNTER_KEY = 'eTreasury.form25.invoiceCounter.v1';
const INVOICE_COUNTER_PREFIX = 'eTreasury.form25.invoiceCounter';
const EMPLOYEE_COUNTER_PREFIX = 'eTreasury.form25.employeeInvoiceCounter';
const EMPLOYEE_MIGRATION_VERSION_KEY = 'eTreasury.form25.employeeInvoiceMigration.v1';
const EMPLOYEE_MIGRATION_VERSION = 1;

function rawInvoiceCounterKey(serviceId) {
  return `${INVOICE_COUNTER_PREFIX}.${encodeURIComponent(String(serviceId ?? '').trim().toUpperCase())}.v1`;
}

export function createNumberingScope(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, employeeId = '') {
  if (typeof scopeOrIssuerUnitId === 'object' && scopeOrIssuerUnitId) {
    return {
      issuerUnitId: sanitizeServiceId(scopeOrIssuerUnitId.issuerUnitId || scopeOrIssuerUnitId.serviceId),
      employeeId: String(scopeOrIssuerUnitId.employeeId || '').trim()
    };
  }

  return {
    issuerUnitId: sanitizeServiceId(scopeOrIssuerUnitId),
    employeeId: String(employeeId || '').trim()
  };
}

export function employeeInvoiceCounterKey(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, employeeId = '') {
  const scope = createNumberingScope(scopeOrIssuerUnitId, employeeId);
  return `${EMPLOYEE_COUNTER_PREFIX}.${serviceStorageKeyPart(scope.issuerUnitId)}.${encodeURIComponent(scope.employeeId)}.v1`;
}

function recordNumber(record) {
  return parseInvoiceSequenceNumber(record.invoiceNumber ?? record.formattedInvoiceNumber ?? record.formValues?.invoiceNumber);
}

function recordBelongsToScope(record, scopeOrIssuerUnitId, employeeId = '') {
  const scope = createNumberingScope(scopeOrIssuerUnitId, employeeId);
  return (
    sanitizeServiceId(record.issuerUnitId || record.serviceId || DEFAULT_SERVICE_ID) === scope.issuerUnitId &&
    String(record.employeeId || '') === scope.employeeId
  );
}

export function normalizeArchive(value, employeeProfile = null) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(record => record && typeof record.id === 'string' && record.formValues)
    .map(record => {
      const issuerUnitId = sanitizeServiceId(record.issuerUnitId || record.serviceId || record.formValues?.serviceId || DEFAULT_SERVICE_ID);
      const issuerUnitName = String(record.issuerUnitName || record.serviceName || record.formValues?.department || '').trim();
      const issuerUnitCode = String(record.issuerUnitCode || record.formValues?.issuerUnitCode || DEFAULT_ISSUER_UNIT_CODE).trim();
      const employeeId = String(record.employeeId || record.formValues?.employeeId || employeeProfile?.employeeId || '').trim();
      const employeeCode = normalizeEmployeeCode(record.employeeCode || record.formValues?.employeeCode || employeeProfile?.employeeCode);
      const employeeName = String(record.employeeName || record.formValues?.employeeName || employeeProfile?.employeeName || '').trim();
      const invoiceNumber = recordNumber(record);
      const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
      const fullInvoiceIdentifier = record.fullInvoiceIdentifier || buildFullInvoiceIdentifier({
        issuerUnitCode,
        employeeCode,
        invoiceNumber
      });
      return {
        ...record,
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
        formValues: {
          ...record.formValues,
          serviceId: issuerUnitId,
          issuerUnitCode,
          employeeId,
          employeeCode,
          employeeName,
          invoiceNumber: formattedInvoiceNumber,
          department: record.formValues.department || issuerUnitName
        }
      };
    });
}

export function readInvoiceArchive(employeeProfile = null) {
  return normalizeArchive(readJson(INVOICE_ARCHIVE_KEY, []), employeeProfile);
}

export function saveInvoiceArchive(records, employeeProfile = null) {
  return writeJson(INVOICE_ARCHIVE_KEY, normalizeArchive(records, employeeProfile));
}

export function hasLegacyEmployeeInvoices(records = readInvoiceArchive()) {
  return records.some(record => !record.employeeId);
}

export function migrateInvoiceArchiveForEmployee(employeeProfile, issuerUnitId = DEFAULT_SERVICE_ID) {
  if (!employeeProfile?.employeeId) return false;
  const scope = createNumberingScope(issuerUnitId, employeeProfile.employeeId);
  const records = readInvoiceArchive(employeeProfile);
  const archiveSaved = saveInvoiceArchive(records, employeeProfile);
  const counterSaved = ensureInvoiceCounterMigrated(scope, records, { includeLegacyCounters: true });
  if (archiveSaved && counterSaved && scope.issuerUnitId === DEFAULT_SERVICE_ID) {
    LEGACY_DEFAULT_SERVICE_IDS.forEach(legacyServiceId => removeStoredValue(rawInvoiceCounterKey(legacyServiceId)));
    writeJson(EMPLOYEE_MIGRATION_VERSION_KEY, EMPLOYEE_MIGRATION_VERSION);
  }
  return archiveSaved && counterSaved;
}

export function invoiceCounterKey(serviceId) {
  return `${INVOICE_COUNTER_PREFIX}.${serviceStorageKeyPart(serviceId)}.v1`;
}

export function highestInvoiceNumber(records, scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, employeeId = '') {
  const scope = createNumberingScope(scopeOrIssuerUnitId, employeeId);
  return records.reduce((highest, record) => {
    if (!recordBelongsToScope(record, scope)) return highest;
    const number = recordNumber(record);
    return number === null ? highest : Math.max(highest, number);
  }, 0);
}

function highestLegacyInvoiceNumber(records, issuerUnitId = DEFAULT_SERVICE_ID) {
  const currentIssuerUnitId = sanitizeServiceId(issuerUnitId);
  return records.reduce((highest, record) => {
    if (record.employeeId) return highest;
    if (sanitizeServiceId(record.issuerUnitId || record.serviceId || DEFAULT_SERVICE_ID) !== currentIssuerUnitId) return highest;
    const number = recordNumber(record);
    return number === null ? highest : Math.max(highest, number);
  }, 0);
}

function readStoredCounter(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, employeeId = '') {
  const scope = createNumberingScope(scopeOrIssuerUnitId, employeeId);
  const employeeCounter = scope.employeeId
    ? parseStoredCounter(readJson(employeeInvoiceCounterKey(scope), 0))
    : null;
  const serviceCounter = parseStoredCounter(readJson(invoiceCounterKey(scope.issuerUnitId), 0));

  if (scope.employeeId) return employeeCounter ?? MIN_INVOICE_NUMBER;

  if (scope.issuerUnitId !== DEFAULT_SERVICE_ID) {
    return Math.max(employeeCounter ?? MIN_INVOICE_NUMBER, serviceCounter ?? MIN_INVOICE_NUMBER);
  }

  const legacyCounters = LEGACY_DEFAULT_SERVICE_IDS
    .map(legacyServiceId => parseStoredCounter(readJson(rawInvoiceCounterKey(legacyServiceId), 0)))
    .filter(counter => counter !== null);

  const legacyCounter = parseStoredCounter(readJson(LEGACY_INVOICE_COUNTER_KEY, 0));
  return Math.max(
    employeeCounter ?? MIN_INVOICE_NUMBER,
    serviceCounter ?? MIN_INVOICE_NUMBER,
    legacyCounter ?? MIN_INVOICE_NUMBER,
    ...legacyCounters,
    MIN_INVOICE_NUMBER
  );
}

function readLegacyStoredCounter(issuerUnitId = DEFAULT_SERVICE_ID) {
  const serviceCounter = parseStoredCounter(readJson(invoiceCounterKey(issuerUnitId), 0));
  const legacyCounters = sanitizeServiceId(issuerUnitId) === DEFAULT_SERVICE_ID
    ? LEGACY_DEFAULT_SERVICE_IDS
      .map(legacyServiceId => parseStoredCounter(readJson(rawInvoiceCounterKey(legacyServiceId), 0)))
      .filter(counter => counter !== null)
    : [];
  const legacyCounter = sanitizeServiceId(issuerUnitId) === DEFAULT_SERVICE_ID
    ? parseStoredCounter(readJson(LEGACY_INVOICE_COUNTER_KEY, 0))
    : null;

  return Math.max(
    serviceCounter ?? MIN_INVOICE_NUMBER,
    legacyCounter ?? MIN_INVOICE_NUMBER,
    ...legacyCounters,
    MIN_INVOICE_NUMBER
  );
}

function parseStoredCounter(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;

  const number = Number(text);
  if (!Number.isInteger(number) || number < MIN_INVOICE_NUMBER) return null;
  return number > MAX_INVOICE_NUMBER ? MAX_INVOICE_NUMBER + 1 : number;
}

export function readNextInvoiceNumber(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const nextNumber = Math.max(
    readStoredCounter(scope),
    highestInvoiceNumber(records, scope) + 1,
    highestLegacyInvoiceNumber(records, scope.issuerUnitId) + 1,
    MIN_INVOICE_NUMBER
  );

  return nextNumber > MAX_INVOICE_NUMBER ? null : nextNumber;
}

export function readInvoiceNumberState(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const nextNumber = readNextInvoiceNumber(scope, records);
  return {
    serviceId: scope.issuerUnitId,
    issuerUnitId: scope.issuerUnitId,
    employeeId: scope.employeeId,
    nextNumber,
    formattedNextNumber: nextNumber === null ? '' : formatInvoiceSequenceNumber(nextNumber),
    minimumNumber: formatInvoiceSequenceNumber(MIN_INVOICE_NUMBER),
    maximumNumber: formatInvoiceSequenceNumber(MAX_INVOICE_NUMBER),
    exhausted: nextNumber === null
  };
}

export function ensureInvoiceCounterMigrated(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, records = readInvoiceArchive(), { includeLegacyCounters = false } = {}) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const nextNumber = readNextInvoiceNumber(scope, records);
  const legacyCounter = includeLegacyCounters ? readLegacyStoredCounter(scope.issuerUnitId) : MIN_INVOICE_NUMBER;
  const storedValue = Math.max(nextNumber === null ? MAX_INVOICE_NUMBER + 1 : nextNumber, legacyCounter);
  return scope.employeeId
    ? writeJson(employeeInvoiceCounterKey(scope), storedValue)
    : writeJson(invoiceCounterKey(scope.issuerUnitId), storedValue);
}

export function invoiceNumberMatchesNext(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, invoiceNumber, records = readInvoiceArchive()) {
  const number = parseInvoiceSequenceNumber(invoiceNumber);
  const nextNumber = readNextInvoiceNumber(scopeOrIssuerUnitId, records);
  return number !== null && nextNumber !== null && number === nextNumber;
}

export function advanceInvoiceCounter(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, invoiceNumber, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const number = parseInvoiceSequenceNumber(invoiceNumber);
  if (number === null) return false;

  const nextCounter = number >= MAX_INVOICE_NUMBER ? MAX_INVOICE_NUMBER + 1 : number + 1;
  const safeCounter = Math.max(nextCounter, highestInvoiceNumber(records, scope) + 1, MIN_INVOICE_NUMBER);
  return scope.employeeId
    ? writeJson(employeeInvoiceCounterKey(scope), safeCounter)
    : writeJson(invoiceCounterKey(scope.issuerUnitId), safeCounter);
}

export function reserveNextInvoiceNumber(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, records = readInvoiceArchive()) {
  const nextNumber = readNextInvoiceNumber(scopeOrIssuerUnitId, records);
  if (nextNumber === null) return { ok: false, exhausted: true, invoiceNumber: '' };

  if (!advanceInvoiceCounter(scopeOrIssuerUnitId, formatInvoiceSequenceNumber(nextNumber), records)) {
    return { ok: false, exhausted: false, invoiceNumber: '' };
  }

  return { ok: true, exhausted: false, invoiceNumber: formatInvoiceSequenceNumber(nextNumber) };
}

export { formatInvoiceSequenceNumber };
