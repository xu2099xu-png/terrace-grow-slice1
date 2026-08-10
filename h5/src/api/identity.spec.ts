import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    create: vi.fn(() => ({
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}));

import axios from 'axios';
import { ensureIdentity, getOrCreateDeviceId, rebuildIdentity } from './identity';

const mockAxios = axios as unknown as {
  post: ReturnType<typeof vi.fn>;
};

describe('identity api', () => {
  beforeEach(() => {
    localStorage.clear();
    mockAxios.post.mockReset();
  });

  it('persists one stable device id', () => {
    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();
    expect(first).toBe(second);
    expect(first).toMatch(/^h5-/);
  });

  it('singleflights anonymous identity creation', async () => {
    mockAxios.post.mockResolvedValueOnce({ data: { token: 'token-a' } });

    const [a, b] = await Promise.all([ensureIdentity(), ensureIdentity()]);

    expect(a).toBe('token-a');
    expect(b).toBe('token-a');
    expect(mockAxios.post).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('token')).toBe('token-a');
  });

  it('rebuilds token while keeping device id stable', async () => {
    localStorage.setItem('device_id', 'h5-existing');
    localStorage.setItem('token', 'old-token');
    mockAxios.post.mockResolvedValueOnce({ data: { token: 'new-token' } });

    await rebuildIdentity();

    expect(localStorage.getItem('device_id')).toBe('h5-existing');
    expect(localStorage.getItem('token')).toBe('new-token');
    expect(mockAxios.post).toHaveBeenCalledWith('/api/auth/anonymous', {
      device_id: 'h5-existing',
    }, {
      headers: { 'Content-Type': 'application/json' },
    });
  });
});
