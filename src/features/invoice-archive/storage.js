import { readJson, writeJson, removeStoredValue } from '../../shared/storage.js';
import {
  MAX_INVOICE_NUMBER,
  MIN_INVOICE_NUMBER,
  buildFullInvoiceIdentifier,
  buildShortInvoiceIdentifier,
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

function createArchiveRecordId(prefix = 'invoice') {
  return crypto.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

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
    .filter(record => record && typeof record.id === 'string')
    .map(record => {
      const formValues = record.formValues && typeof record.formValues === 'object' ? record.formValues : {};
      const issuerUnitId = sanitizeServiceId(record.issuerUnitId || record.serviceId || formValues.serviceId || DEFAULT_SERVICE_ID);
      const issuerUnitName = String(record.issuerUnitName || record.serviceName || formValues.department || '').trim();
      const issuerUnitCode = String(record.issuerUnitCode || formValues.issuerUnitCode || DEFAULT_ISSUER_UNIT_CODE).trim();
      const employeeId = String(record.employeeId || formValues.employeeId || employeeProfile?.employeeId || '').trim();
      const employeeCode = normalizeEmployeeCode(record.employeeCode || formValues.employeeCode || employeeProfile?.employeeCode);
      const employeeName = String(record.employeeName || formValues.employeeName || employeeProfile?.employeeName || '').trim();
      const invoiceNumber = recordNumber(record);
      const formattedInvoiceNumber = formatInvoiceSequenceNumber(invoiceNumber);
      const fullInvoiceIdentifier = record.fullInvoiceIdentifier || buildFullInvoiceIdentifier({
        issuerUnitCode,
        employeeCode,
        invoiceNumber
      });
      const shortInvoiceIdentifier = record.shortInvoiceIdentifier || buildShortInvoiceIdentifier({
        employeeCode,
        invoiceNumber
      });
      const status = ['reserved', 'issued', 'cancelled'].includes(record.status) ? record.status : 'issued';
      return {
        ...record,
        status,
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
        shortInvoiceIdentifier,
        formValues: {
          ...formValues,
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

export function findActiveInvoiceReservation(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  return records.find(record =>
    record.status === 'reserved' &&
    recordBelongsToScope(record, scope)
  ) ?? null;
}

export function reserveInvoiceNumber(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, details = {}, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const existing = findActiveInvoiceReservation(scope, records);
  if (existing) return { ok: true, existing: true, exhausted: false, record: existing };

  const nextNumber = readNextInvoiceNumber(scope, records);
  if (nextNumber === null) return { ok: false, exhausted: true, record: null };

  const formattedInvoiceNumber = formatInvoiceSequenceNumber(nextNumber);
  const issuerUnitCode = String(details.issuerUnitCode || DEFAULT_ISSUER_UNIT_CODE).trim();
  const issuerUnitName = String(details.issuerUnitName || '').trim();
  const employeeCode = normalizeEmployeeCode(details.employeeCode);
  const employeeName = String(details.employeeName || '').trim();
  const fullInvoiceIdentifier = buildFullInvoiceIdentifier({ issuerUnitCode, employeeCode, invoiceNumber: nextNumber });
  const shortInvoiceIdentifier = buildShortInvoiceIdentifier({ employeeCode, invoiceNumber: nextNumber });
  if (!scope.employeeId || !employeeCode || !fullInvoiceIdentifier || !shortInvoiceIdentifier) {
    return { ok: false, exhausted: false, invalidProfile: true, record: null };
  }

  const reservedAt = new Date().toISOString();
  const record = {
    id: createArchiveRecordId('reservation'),
    status: 'reserved',
    serviceId: scope.issuerUnitId,
    serviceName: issuerUnitName,
    issuerUnitId: scope.issuerUnitId,
    issuerUnitCode,
    issuerUnitName,
    employeeId: scope.employeeId,
    employeeCode,
    employeeName,
    invoiceNumber: nextNumber,
    formattedInvoiceNumber,
    fullInvoiceIdentifier,
    shortInvoiceIdentifier,
    reservedAt,
    updatedAt: reservedAt,
    tabId: details.tabId || '',
    draftId: details.draftId || '',
    createdAt: reservedAt,
    createdAtDisplay: formatDateTime(reservedAt),
    formValues: {
      serviceId: scope.issuerUnitId,
      issuerUnitCode,
      employeeId: scope.employeeId,
      employeeCode,
      employeeName,
      invoiceNumber: formattedInvoiceNumber,
      department: issuerUnitName
    }
  };

  const nextRecords = [...records, record];
  if (!saveInvoiceArchive(nextRecords)) {
    return { ok: false, exhausted: false, writeFailed: true, record: null };
  }
  advanceInvoiceCounter(scope, nextNumber, nextRecords);

  return { ok: true, existing: false, exhausted: false, record };
}

export function cancelActiveInvoiceReservation(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, { reason = '' } = {}, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const reservation = findActiveInvoiceReservation(scope, records);
  if (!reservation) return { ok: true, cancelled: false, record: null };

  const cancelledAt = new Date().toISOString();
  const nextRecords = records.map(record => record.id === reservation.id
    ? {
      ...record,
      status: 'cancelled',
      cancelledAt,
      cancellationReason: reason,
      updatedAt: cancelledAt
    }
    : record
  );

  if (!saveInvoiceArchive(nextRecords)) return { ok: false, cancelled: false, record: reservation };

  return {
    ok: true,
    cancelled: true,
    record: nextRecords.find(record => record.id === reservation.id) ?? null
  };
}

export function issueActiveInvoiceReservation(scopeOrIssuerUnitId = DEFAULT_SERVICE_ID, snapshot, records = readInvoiceArchive()) {
  const scope = createNumberingScope(scopeOrIssuerUnitId);
  const reservation = findActiveInvoiceReservation(scope, records);
  if (!reservation) return { ok: false, missingReservation: true };
  if (reservation.invoiceNumber !== snapshot.invoiceNumber) return { ok: false, numberMismatch: true, reservation };

  const issuedAt = new Date().toISOString();
  const issuedRecord = {
    ...reservation,
    ...snapshot,
    id: reservation.id,
    status: 'issued',
    reservedAt: reservation.reservedAt,
    issuedAt: snapshot.issuedAt || issuedAt,
    updatedAt: issuedAt,
    tabId: reservation.tabId || snapshot.tabId || ''
  };
  const nextRecords = records.map(record => record.id === reservation.id ? issuedRecord : record);
  if (!saveInvoiceArchive(nextRecords)) return { ok: false, writeFailed: true, reservation };

  return { ok: true, record: issuedRecord, records: nextRecords };
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
