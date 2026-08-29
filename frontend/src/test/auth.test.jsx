import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from '../lib/auth.jsx';
import { api, tokenStore } from '../lib/api.js';

function TestConsumer() {
  const { isAuthenticated, user, isOwner, canManage } = useAuth();
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'anonymous'}</span>
      <span data-testid="user-name">{user?.name || 'none'}</span>
      <span data-testid="is-owner">{isOwner ? 'yes' : 'no'}</span>
      <span data-testid="can-manage">{canManage ? 'yes' : 'no'}</span>
    </div>
  );
}

describe('lib/auth.jsx', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  it('provides anonymous state when no session is present', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('auth-status')).toHaveTextContent('anonymous');
    expect(screen.getByTestId('user-name')).toHaveTextContent('none');
    expect(screen.getByTestId('is-owner')).toHaveTextContent('no');
  });

  it('restores authenticated session when refresh token is present', async () => {
    tokenStore.setRefreshToken('saved-refresh-token');

    vi.spyOn(api.auth, 'refresh').mockResolvedValue({
      token: 'new-access-token',
      refreshToken: 'rotated-refresh-token',
      user: { id: 1, name: 'Amrut Deshmukh', role: 'OWNER' },
      business: { id: 1, name: 'Amrut Dairy' },
    });

    vi.spyOn(api.auth, 'me').mockResolvedValue({
      user: { id: 1, name: 'Amrut Deshmukh', role: 'OWNER' },
      business: { id: 1, name: 'Amrut Dairy' },
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('authenticated');
    });

    expect(screen.getByTestId('user-name')).toHaveTextContent('Amrut Deshmukh');
    expect(screen.getByTestId('is-owner')).toHaveTextContent('yes');
    expect(screen.getByTestId('can-manage')).toHaveTextContent('yes');
    expect(tokenStore.getAccessToken()).toBe('new-access-token');
    expect(tokenStore.getRefreshToken()).toBe('rotated-refresh-token');
  });
});
