import { readJson, writeJson } from '../../shared/storage.js';

const CUSTOMERS_KEY = 'eTreasury.form25.customers.v1';

function normalizeCustomers(value) {
  return Array.isArray(value)
    ? value.filter(customer => customer && typeof customer.id === 'string')
    : [];
}

export function readCustomers() {
  return normalizeCustomers(readJson(CUSTOMERS_KEY, []));
}

export function saveCustomers(customers) {
  return writeJson(CUSTOMERS_KEY, normalizeCustomers(customers));
}

