// toast.js — tiny toast notification system, replaces alert() popups.

const Toast = {
  show(message, type) {
    const stack = document.getElementById('toast-stack');
    if (!stack) { console.log(message); return; } // fallback if not on this page
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.2s ease';
      setTimeout(() => el.remove(), 200);
    }, 3200);
  },
  success(message) { this.show(message, 'success'); },
  error(message) { this.show(message, 'danger'); },
  info(message) { this.show(message, ''); }
};
