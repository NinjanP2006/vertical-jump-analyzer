// Developer-tools visibility. The dev scrubber and validation harness are dev-only, so their
// nav tabs are hidden from users. Visit any page with `?dev=1` to reveal them (persists in this
// browser via localStorage); `?dev=0` hides them again. The routes themselves stay registered,
// so they're always reachable by typing the URL directly.

function compute(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('dev');
    if (q === '1') localStorage.setItem('vja.dev', '1');
    else if (q === '0') localStorage.removeItem('vja.dev');
    return localStorage.getItem('vja.dev') === '1';
  } catch {
    return false;
  }
}

// Evaluated once at load — a full page navigation re-imports and re-reads it.
export const devMode = compute();
