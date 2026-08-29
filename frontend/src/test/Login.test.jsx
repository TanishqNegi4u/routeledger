import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Login from '../pages/Login.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { ToastProvider } from '../lib/toast.jsx';
import { RouterProvider } from '../lib/router.jsx';
import { api, tokenStore } from '../lib/api.js';

function renderLogin() {
  return render(
    <RouterProvider>
      <ToastProvider>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </ToastProvider>
    </RouterProvider>,
  );
}

describe('pages/Login.jsx', () => {
  beforeEach(() => {
    tokenStore.clear();
    vi.restoreAllMocks();
  });

  it('renders sign in form with email and password fields', () => {
    renderLogin();

    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/work email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('allows clicking demo persona buttons to populate credentials', async () => {
    const user = userEvent.setup();
    renderLogin();

    const ownerButton = screen.getByRole('button', { name: /owner/i });
    await user.click(ownerButton);

    expect(screen.getByLabelText(/work email/i)).toHaveValue('owner@amrutdairy.in');
    expect(screen.getByLabelText(/^password$/i)).toHaveValue('Demo@12345');
  });

  it('displays error message when login fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(api.auth, 'login').mockRejectedValue({
      status: 401,
      message: 'Email or password is incorrect.',
      fieldErrors: [],
    });

    renderLogin();

    await user.type(screen.getByLabelText(/work email/i), 'wrong@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/email or password is incorrect/i)).toBeInTheDocument();
    });
  });
});
