import { readJson, writeJson } from './storage.js';

export const EMPLOYEE_PROFILE_KEY = 'eTreasury.form25.employeeProfile.v1';
export const EMPLOYEE_CODE_PATTERN = /^[\p{Script=Greek}A-Z0-9]{2,10}$/u;

function createEmployeeId() {
  return crypto.randomUUID?.() ?? `employee-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeEmployeeCode(value) {
  return String(value ?? '').trim().toUpperCase();
}

export function validateEmployeeCode(value) {
  const code = normalizeEmployeeCode(value);
  if (!code) return 'Συμπλήρωσε κωδικό υπαλλήλου.';
  if (!EMPLOYEE_CODE_PATTERN.test(code)) {
    return 'Ο κωδικός υπαλλήλου πρέπει να έχει 2 έως 10 ελληνικά ή λατινικά γράμματα ή αριθμούς, χωρίς κενά, παύλα ή κάθετο.';
  }
  return '';
}

export function isEmployeeCodeValid(value) {
  return !validateEmployeeCode(value);
}

export function readEmployeeProfile() {
  const stored = readJson(EMPLOYEE_PROFILE_KEY, {});
  return {
    employeeId: String(stored.employeeId || createEmployeeId()),
    employeeCode: normalizeEmployeeCode(stored.employeeCode || 'ΜΜ'),
    employeeName: String(stored.employeeName || 'Markellos Markides').trim()
  };
}

export function saveEmployeeProfile(profile) {
  return writeJson(EMPLOYEE_PROFILE_KEY, {
    employeeId: String(profile.employeeId || createEmployeeId()),
    employeeCode: normalizeEmployeeCode(profile.employeeCode),
    employeeName: String(profile.employeeName || '').trim()
  });
}

export function employeeProfileFromForm(form) {
  return {
    employeeId: String(form?.querySelector('#employeeId')?.value || '').trim(),
    employeeCode: normalizeEmployeeCode(form?.querySelector('#employeeCode')?.value),
    employeeName: String(form?.querySelector('#employeeName')?.value || '').trim()
  };
}

export function applyEmployeeProfileToForm(form, profile) {
  const employeeId = form?.querySelector('#employeeId');
  const employeeCode = form?.querySelector('#employeeCode');
  const employeeName = form?.querySelector('#employeeName');

  if (employeeId) employeeId.value = profile.employeeId || createEmployeeId();
  if (employeeCode) employeeCode.value = normalizeEmployeeCode(profile.employeeCode);
  if (employeeName) employeeName.value = profile.employeeName || '';
}

export function ensureEmployeeProfile(form) {
  const profile = readEmployeeProfile();
  applyEmployeeProfileToForm(form, profile);
  saveEmployeeProfile(profile);
  return profile;
}

export function profileMatchesForm(profile, formProfile) {
  return (
    String(profile.employeeId || '') === String(formProfile.employeeId || '') &&
    normalizeEmployeeCode(profile.employeeCode) === normalizeEmployeeCode(formProfile.employeeCode)
  );
}
