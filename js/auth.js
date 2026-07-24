// auth.js — logic for index.html (login page)

document.addEventListener('DOMContentLoaded', () => {
  if (Session.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired')) {
    showError('Your session expired. Please log in again.');
  }

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();
    setLoading(true);

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    try {
      const data = await API.call('login', { email, password });
      Session.set(data.token, data.user);
      window.location.href = 'dashboard.html';
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });
});

function showError(msg) {
  const el = document.getElementById('login-error');
  el.textContent = msg;
  el.hidden = false;
}
function clearError() {
  const el = document.getElementById('login-error');
  el.hidden = true;
}
function setLoading(isLoading) {
  const btn = document.getElementById('login-submit');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Signing in…' : 'Sign in';
}
