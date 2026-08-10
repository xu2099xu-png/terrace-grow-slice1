import axios from 'axios';

const TOKEN_KEY = 'token';
const DEVICE_ID_KEY = 'device_id';

let identityPromise: Promise<string> | null = null;

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const next = `h5-${randomId()}`;
  localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function ensureIdentity(force = false): Promise<string> {
  const existing = getToken();
  if (existing && !force) return existing;

  if (!identityPromise) {
    identityPromise = axios.post('/api/auth/anonymous', {
      device_id: getOrCreateDeviceId(),
    }, {
      headers: { 'Content-Type': 'application/json' },
    }).then((res) => {
      const token = res.data?.token;
      if (!token || typeof token !== 'string') {
        throw new Error('Anonymous identity response missing token');
      }
      localStorage.setItem(TOKEN_KEY, token);
      return token;
    }).finally(() => {
      identityPromise = null;
    });
  }

  return identityPromise;
}

export async function rebuildIdentity(): Promise<string> {
  clearToken();
  return ensureIdentity(true);
}
