// Session/auth helpers. Login/logout are full-page navigations / same-origin POSTs to
// the gateway; the frontend only ever sees session STATUS, never tokens or keys.
import type { AuthStatus } from './types';

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const res = await fetch('/api/auth/openai/status', { credentials: 'include' });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return (await res.json()) as AuthStatus;
}

export function loginOpenAI(): void {
  // Full-page navigation through the gateway -> OpenAI authorize -> callback.
  window.location.href = '/api/auth/openai/login';
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
}
