import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const requestUse = vi.fn();
  const responseUse = vi.fn();
  const apiInstance = vi.fn();
  Object.assign(apiInstance, {
    interceptors: {
      request: { use: requestUse },
      response: { use: responseUse },
    },
  });
  return { requestUse, responseUse, apiInstance };
});

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mocks.apiInstance),
  },
}));

vi.mock('./identity', () => ({
  ensureIdentity: vi.fn(),
  getToken: vi.fn(),
  rebuildIdentity: vi.fn(),
}));

import './client';
import { ensureIdentity, getToken, rebuildIdentity } from './identity';

const mockIdentity = {
  ensureIdentity: ensureIdentity as unknown as ReturnType<typeof vi.fn>,
  getToken: getToken as unknown as ReturnType<typeof vi.fn>,
  rebuildIdentity: rebuildIdentity as unknown as ReturnType<typeof vi.fn>,
};

describe('api client identity interceptors', () => {
  beforeEach(() => {
    mockIdentity.ensureIdentity.mockReset();
    mockIdentity.getToken.mockReset();
    mockIdentity.rebuildIdentity.mockReset();
    mocks.apiInstance.mockReset();
  });

  it('ensures identity before normal requests', async () => {
    mockIdentity.ensureIdentity.mockResolvedValue('token-a');
    mockIdentity.getToken.mockReturnValue('token-a');
    const onRequest = mocks.requestUse.mock.calls[0][0];

    const config = await onRequest({ url: '/terraces/mine', headers: {} });

    expect(mockIdentity.ensureIdentity).toHaveBeenCalledTimes(1);
    expect(config.headers.Authorization).toBe('Bearer token-a');
  });

  it('does not ensure identity for anonymous auth request', async () => {
    mockIdentity.getToken.mockReturnValue(null);
    const onRequest = mocks.requestUse.mock.calls[0][0];

    await onRequest({ url: '/auth/anonymous', headers: {} });

    expect(mockIdentity.ensureIdentity).not.toHaveBeenCalled();
  });

  it('rebuilds identity once and retries original 401 request', async () => {
    mockIdentity.rebuildIdentity.mockResolvedValue('token-b');
    mocks.apiInstance.mockResolvedValue({ data: 'ok' });
    const onError = mocks.responseUse.mock.calls[0][1];
    const original = { url: '/terraces/mine', headers: {} };

    const result = await onError({ response: { status: 401 }, config: original });

    expect(result).toEqual({ data: 'ok' });
    expect(mockIdentity.rebuildIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.apiInstance).toHaveBeenCalledWith({
      ...original,
      __identityRetry: true,
      headers: { Authorization: 'Bearer token-b' },
    });
  });

  it('does not convert 403 into anonymous identity', async () => {
    const onError = mocks.responseUse.mock.calls[0][1];
    const err = { response: { status: 403 }, config: { url: '/terraces/mine' } };

    await expect(onError(err)).rejects.toBe(err);
    expect(mockIdentity.rebuildIdentity).not.toHaveBeenCalled();
  });
});
