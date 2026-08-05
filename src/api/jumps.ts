// Jump-history API client. Talks to the API Gateway backend, attaching the Cognito ID token so
// the authorizer accepts the request and the Lambdas can key data by user.

import { apiUrl } from '../auth/config';
import { getIdToken } from '../auth/cognito';

export interface SavedJump {
  jumpId: string;
  heightCm: number;
  flightTimeMs: number;
  fps: number | null;
  notes: string | null;
  capturedAt: string;
  createdAt: string;
}

export interface NewJump {
  heightCm: number;
  flightTimeMs: number;
  fps?: number | null;
  capturedAt?: string;
  notes?: string;
}

async function authFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!apiUrl) throw new Error('Backend API is not configured.');
  const token = await getIdToken();
  if (!token) throw new Error('You need to be signed in.');
  return fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

export async function saveJump(input: NewJump): Promise<SavedJump> {
  const res = await authFetch('/jumps', { method: 'POST', body: JSON.stringify(input) });
  if (!res.ok) throw new Error(`Couldn't save (HTTP ${res.status})`);
  return (await res.json()).jump as SavedJump;
}

export async function listJumps(): Promise<SavedJump[]> {
  const res = await authFetch('/jumps');
  if (!res.ok) throw new Error(`Couldn't load history (HTTP ${res.status})`);
  return ((await res.json()).jumps ?? []) as SavedJump[];
}

export async function deleteJump(jumpId: string): Promise<void> {
  const res = await authFetch(`/jumps/${encodeURIComponent(jumpId)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error(`Couldn't delete (HTTP ${res.status})`);
}
