// api.js
// Thin wrapper around fetch() for talking to the Apps Script backend.
// Content-Type is set to text/plain on purpose: Apps Script cannot respond
// to an OPTIONS preflight request, so we avoid triggering one entirely.

const API = {
  async call(action, payload) {
    const token = Session.getToken();
    const body = Object.assign({ action, token }, payload || {});

    let res;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body)
      });
    } catch (networkErr) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    let json;
    try {
      json = await res.json();
    } catch (parseErr) {
      throw new Error('Unexpected response from the server.');
    }

    if (!json.success) {
      if (String(json.error).startsWith('UNAUTHENTICATED')) {
        Session.clear();
        window.location.href = 'index.html?expired=1';
      }
      throw new Error(json.error || 'Request failed.');
    }
    return json.data;
  }
};

// Session holds the token + user profile in memory for this tab, backed by
// sessionStorage so a refresh doesn't force a re-login (sessionStorage clears
// when the tab/browser closes, which is a reasonable tradeoff for an
// internal tool — it is not readable across sites the way a stolen cookie
// would be, but note it is still client-side storage).
const Session = {
  KEY: 'hris_session',

  set(token, user) {
    sessionStorage.setItem(this.KEY, JSON.stringify({ token, user }));
  },
  get() {
    const raw = sessionStorage.getItem(this.KEY);
    return raw ? JSON.parse(raw) : null;
  },
  getToken() {
    const s = this.get();
    return s ? s.token : null;
  },
  getUser() {
    const s = this.get();
    return s ? s.user : null;
  },
  clear() {
    sessionStorage.removeItem(this.KEY);
  },
  isLoggedIn() {
    return !!this.get();
  }
};
