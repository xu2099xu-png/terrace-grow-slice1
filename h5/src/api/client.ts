import axios from 'axios';
import { ensureIdentity, getToken, rebuildIdentity } from './identity';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

function isAnonymousAuthRequest(url?: string): boolean {
  return !!url && url.includes('/auth/anonymous');
}

api.interceptors.request.use(async (config) => {
  if (!isAnonymousAuthRequest(config.url)) {
    await ensureIdentity();
  }
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 401 &&
      original &&
      !original.__identityRetry &&
      !isAnonymousAuthRequest(original.url)
    ) {
      original.__identityRetry = true;
      const token = await rebuildIdentity();
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${token}`;
      return api(original);
    }
    return Promise.reject(err);
  },
);

export default api;
