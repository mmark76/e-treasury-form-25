const TAB_ID = crypto.randomUUID?.() ?? `tab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const PRESENCE_KEY = 'eTreasury.form25.activeTabs.v1';
const PRESENCE_TTL_MS = 12000;
const HEARTBEAT_MS = 4000;
const CHANNEL_NAME = 'eTreasury.form25.sync.v1';
const MULTI_TAB_BLOCK_MESSAGE = 'Η εφαρμογή είναι ανοικτή σε άλλη καρτέλα. Κλείστε τις υπόλοιπες καρτέλες πριν εκδώσετε νέο τιμολόγιο.';

let channel = null;
let heartbeatTimer = null;

function now() {
  return Date.now();
}

function readPresence() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESENCE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writePresence(value) {
  try {
    localStorage.setItem(PRESENCE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function prunePresence(value, currentTime = now()) {
  return Object.entries(value).reduce((result, [tabId, lastSeen]) => {
    if (currentTime - Number(lastSeen) <= PRESENCE_TTL_MS) result[tabId] = Number(lastSeen);
    return result;
  }, {});
}

function heartbeat() {
  const presence = prunePresence(readPresence());
  presence[TAB_ID] = now();
  writePresence(presence);
}

export function hasAnotherActiveTab() {
  const presence = prunePresence(readPresence());
  return Object.keys(presence).some(tabId => tabId !== TAB_ID);
}

export function initializeTabCoordination(onMessage) {
  heartbeat();
  if (!heartbeatTimer) heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

  if ('BroadcastChannel' in globalThis && !channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener('message', event => {
      if (event.data?.tabId === TAB_ID) return;
      onMessage?.(event.data);
    });
  }

  window.addEventListener('beforeunload', () => {
    const presence = readPresence();
    delete presence[TAB_ID];
    writePresence(presence);
  });

  window.addEventListener('storage', event => {
    if (event.key === PRESENCE_KEY) return;
    onMessage?.({ type: 'storage-updated', key: event.key });
  });
}

export function notifyTabs(type, detail = {}) {
  channel?.postMessage({ type, ...detail, tabId: TAB_ID, at: new Date().toISOString() });
}

export function invoiceLockName({ issuerUnitId, employeeId }) {
  return `eTreasury.form25.issue.${encodeURIComponent(issuerUnitId)}.${encodeURIComponent(employeeId)}`;
}

export async function withInvoiceIssuanceLock(scope, callback, { locks = globalThis.navigator?.locks } = {}) {
  const lockName = invoiceLockName(scope);
  if (locks?.request) {
    return locks.request(lockName, { mode: 'exclusive' }, callback);
  }

  heartbeat();
  if (hasAnotherActiveTab()) {
    return { ok: false, blocked: true, message: MULTI_TAB_BLOCK_MESSAGE };
  }

  return callback();
}

export { MULTI_TAB_BLOCK_MESSAGE, TAB_ID };
