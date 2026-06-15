import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SecretField } from '../SecretField';

describe('SecretField', () => {
  it('masks the secret by default and reveals on click', async () => {
    const user = userEvent.setup();
    render(<SecretField label="API key" value="super-secret-value" />);

    const field = screen.getByTestId('secret-API key');
    expect(field).not.toHaveTextContent('super-secret-value');

    await user.click(screen.getByRole('button', { name: 'Reveal' }));
    expect(field).toHaveTextContent('super-secret-value');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(field).not.toHaveTextContent('super-secret-value');
  });

  it('copies to the clipboard and never logs the secret', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(<SecretField label="Signing secret" value="hmac-key-123" />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('hmac-key-123'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    for (const call of [...logSpy.mock.calls, ...errSpy.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain('hmac-key-123');
    }

    vi.restoreAllMocks();
  });
});
