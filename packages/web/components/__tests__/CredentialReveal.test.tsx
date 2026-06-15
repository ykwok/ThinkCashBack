import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CredentialReveal } from '../CredentialReveal';

describe('CredentialReveal', () => {
  const creds = { apiKey: 'ak_live_123', signingSecret: 'ss_live_456' };

  it('warns the credentials are shown once and exposes both secrets masked', () => {
    render(<CredentialReveal credentials={creds} onDismiss={() => {}} />);
    expect(screen.getByText(/only once/i)).toBeInTheDocument();
    expect(screen.getByTestId('secret-API key')).not.toHaveTextContent('ak_live_123');
    expect(screen.getByTestId('secret-Signing secret')).not.toHaveTextContent('ss_live_456');
  });

  it('fires onDismiss when the user confirms they saved them', async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<CredentialReveal credentials={creds} onDismiss={onDismiss} />);
    await user.click(screen.getByRole('button', { name: /saved them/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
