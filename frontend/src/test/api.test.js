import { describe, it, expect, beforeEach } from 'vitest';
import { client, normalise, tokenStore } from '../lib/api.js';

describe('lib/api.js', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('attaches in-memory access token to outgoing request headers', async () => {
    tokenStore.setAccessToken('mock-access-token-123');

    // Simulate interceptor execution
    const config = { headers: {} };
    const interceptedConfig = client.interceptors.request.handlers[0].fulfilled(config);

    expect(interceptedConfig.headers.Authorization).toBe('Bearer mock-access-token-123');
  });

  it('normalises network error into safe user-facing message', () => {
    const networkError = { message: 'Network Error' };
    const normalised = normalise(networkError);

    expect(normalised.status).toBe(0);
    expect(normalised.message).toContain('Cannot reach the RouteLedger API');
    expect(normalised.fieldErrors).toEqual([]);
  });

  it('normalises 403 Forbidden with role message', () => {
    const error403 = {
      response: {
        status: 403,
        data: { message: 'Your role does not allow that action.' },
      },
    };
    const normalised = normalise(error403);

    expect(normalised.status).toBe(403);
    expect(normalised.message).toBe('Your role does not allow that action.');
  });

  it('normalises 400 Bad Request with field errors list', () => {
    const error400 = {
      response: {
        status: 400,
        data: {
          message: 'Some fields need attention',
          fieldErrors: [{ field: 'name', message: 'must not be blank' }],
        },
      },
    };
    const normalised = normalise(error400);

    expect(normalised.status).toBe(400);
    expect(normalised.message).toBe('Some fields need attention');
    expect(normalised.fieldErrors).toHaveLength(1);
    expect(normalised.fieldErrors[0].field).toBe('name');
  });

  it('tokenStore keeps access token strictly in memory and refresh token in localStorage', () => {
    tokenStore.setAccessToken('in-mem-jwt-token');
    tokenStore.setRefreshToken('refresh-token-uuid-123');

    // Access token should be readable from memory getter but NOT from localStorage
    expect(tokenStore.getAccessToken()).toBe('in-mem-jwt-token');
    expect(window.localStorage.getItem('routeledger.token')).toBeNull();

    // Refresh token is stored in localStorage
    expect(tokenStore.getRefreshToken()).toBe('refresh-token-uuid-123');
    expect(window.localStorage.getItem('routeledger.refresh_token')).toBe('refresh-token-uuid-123');

    // Clearing removes both
    tokenStore.clear();
    expect(tokenStore.getAccessToken()).toBeNull();
    expect(tokenStore.getRefreshToken()).toBeNull();
  });
});
