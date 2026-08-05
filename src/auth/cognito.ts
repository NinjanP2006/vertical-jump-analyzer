// Cognito Hosted-UI auth via the OAuth2 Authorization Code + PKCE flow, implemented directly on
// browser fetch/crypto so it needs no SDK dependency. Flow:
//   login()   -> redirect to the hosted UI /authorize with a PKCE challenge
//   (callback) -> handleRedirectCallback() exchanges ?code for tokens at /oauth2/token
//   getIdToken() -> returns a valid ID token, refreshing it when near expiry
//   logout()  -> clears tokens and hits the hosted UI /logout
//
// We send the ID token to the API: the API Gateway Cognito authorizer validates `aud`, which is
// present on Cognito ID tokens (access tokens carry client_id instead). Both carry `sub`, which
// the Lambdas use as the user id.

import { cognitoConfig } from './config';

const TOKENS_KEY = 'vja.tokens';
const PKCE_KEY = 'vja.pkce_verifier';

interface StoredTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}

export interface AuthUser {
  sub: string;
  email?: string;
}

function redirectUri(): string {
  return `${window.location.origin}/`;
}

// --- PKCE / encoding helpers ----------------------------------------------------------------

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
}

function randomVerifier(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(''); // 64 hex chars
}

// --- token storage --------------------------------------------------------------------------

function store(t: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(t));
}

function load(): StoredTokens | null {
  const raw = localStorage.getItem(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

function clear(): void {
  localStorage.removeItem(TOKENS_KEY);
}

function fromTokenResponse(t: {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}, keepRefresh?: string): StoredTokens {
  return {
    idToken: t.id_token,
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? keepRefresh,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
}

function decodeJwt(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// --- public API -----------------------------------------------------------------------------

export async function login(): Promise<void> {
  if (!cognitoConfig.domain || !cognitoConfig.clientId) return;
  const verifier = randomVerifier();
  const challenge = base64url(await sha256(verifier));
  sessionStorage.setItem(PKCE_KEY, verifier);
  const params = new URLSearchParams({
    client_id: cognitoConfig.clientId,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  window.location.assign(`${cognitoConfig.domain}/oauth2/authorize?${params.toString()}`);
}

export function logout(): void {
  clear();
  if (!cognitoConfig.domain || !cognitoConfig.clientId) return;
  const params = new URLSearchParams({
    client_id: cognitoConfig.clientId,
    logout_uri: redirectUri(),
  });
  window.location.assign(`${cognitoConfig.domain}/logout?${params.toString()}`);
}

// Guards against React StrictMode invoking the callback twice and consuming the code twice.
// Resets on every page load (login/logout do a full redirect), which is what we want.
let handledRedirect = false;

/** If the URL carries an auth code, exchange it for tokens and clean the URL. */
export async function handleRedirectCallback(): Promise<void> {
  if (handledRedirect) return;
  handledRedirect = true;
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code || !cognitoConfig.domain || !cognitoConfig.clientId) return;

  const verifier = sessionStorage.getItem(PKCE_KEY) ?? '';
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: cognitoConfig.clientId,
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  });

  try {
    const res = await fetch(`${cognitoConfig.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (res.ok) store(fromTokenResponse(await res.json()));
  } finally {
    sessionStorage.removeItem(PKCE_KEY);
    // Strip ?code/?state so a refresh doesn't re-trigger the exchange.
    url.search = '';
    window.history.replaceState({}, '', url.toString());
  }
}

async function refresh(t: StoredTokens): Promise<StoredTokens | null> {
  if (!t.refreshToken || !cognitoConfig.domain || !cognitoConfig.clientId) {
    clear();
    return null;
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: cognitoConfig.clientId,
    refresh_token: t.refreshToken,
  });
  const res = await fetch(`${cognitoConfig.domain}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    clear();
    return null;
  }
  // The refresh response omits refresh_token — carry the existing one forward.
  const next = fromTokenResponse(await res.json(), t.refreshToken);
  store(next);
  return next;
}

/** A valid ID token for API calls, refreshed if it's within a minute of expiring. */
export async function getIdToken(): Promise<string | null> {
  let t = load();
  if (!t) return null;
  if (Date.now() > t.expiresAt - 60_000) {
    t = await refresh(t);
  }
  return t?.idToken ?? null;
}

export function getCurrentUser(): AuthUser | null {
  const t = load();
  if (!t) return null;
  const claims = decodeJwt(t.idToken);
  if (!claims || typeof claims.sub !== 'string') return null;
  return { sub: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined };
}
