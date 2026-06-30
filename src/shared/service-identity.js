export const DEFAULT_SERVICE_ID = 'STATE-FAIR-MANAGEMENT';
export const LEGACY_DEFAULT_SERVICE_IDS = ['STATE-FAIR-SPACE-MANAGEMENT'];
export const DEFAULT_ISSUER_UNIT_CODE = 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ';

export function sanitizeServiceId(value) {
  const text = String(value ?? '').trim().toUpperCase();
  const serviceId = text.replace(/[^A-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || DEFAULT_SERVICE_ID;
  return LEGACY_DEFAULT_SERVICE_IDS.includes(serviceId) ? DEFAULT_SERVICE_ID : serviceId;
}

export function serviceStorageKeyPart(serviceId) {
  return encodeURIComponent(sanitizeServiceId(serviceId));
}

export function getCurrentServiceId(form) {
  return sanitizeServiceId(form?.querySelector('#serviceId')?.value);
}

export function getCurrentServiceName(form) {
  return form?.querySelector('#department')?.value.trim() || '';
}

export function getCurrentIssuerUnitCode(form) {
  return form?.querySelector('#issuerUnitCode')?.value.trim() || DEFAULT_ISSUER_UNIT_CODE;
}
