// users.js — logic for users.html (Super Admin only)

let USERS = [];
let ALL_BRANCHES = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Session.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }
  const user = Session.getUser();
  if (!Can.manageUsers(user.role)) {
    window.location.href = 'dashboard.html';
    return;
  }

  document.getElementById('user-email').textContent = user.email;
  document.getElementById('role-badge').textContent = ROLE_LABELS[user.role] || user.role;
  document.getElementById('role-badge').className = 'role-badge role-' + user.role;

  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await API.call('logout', {}); } catch (e) {}
    Session.clear();
    window.location.href = 'index.html';
  });

  document.getElementById('add-user-btn').addEventListener('click', () => openUserPanel(null));
  document.getElementById('user-form').addEventListener('submit', handleUserSubmit);
  document.getElementById('user-all-branches').addEventListener('change', (e) => {
    document.getElementById('branch-checkboxes').style.opacity = e.target.checked ? 0.4 : 1;
  });
  document.querySelectorAll('[data-close-panel]').forEach(el => {
    el.addEventListener('click', () => { document.getElementById(el.dataset.closePanel).hidden = true; });
  });

  try {
    ALL_BRANCHES = await API.call('listBranches', {});
    await loadUsers();
  } catch (err) {
    alert(err.message);
  }
});

async function loadUsers() {
  USERS = await API.call('listUsers', {});
  renderUserTable();
}

function renderUserTable() {
  const tbody = document.getElementById('user-rows');
  if (USERS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No users yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = USERS.map(u => `
    <tr>
      <td>${escapeHtml(u.Email)}</td>
      <td><span class="role-badge role-${u.Role}">${ROLE_LABELS[u.Role] || u.Role}</span></td>
      <td>${u.AssignedBranches === 'ALL' ? 'All branches' : branchNamesFor(u.AssignedBranches)}</td>
      <td><span class="status-pill status-${u.Status}">${u.Status}</span></td>
      <td>${u.LastLogin ? formatTimestamp(u.LastLogin) : 'Never'}</td>
      <td><button class="link-btn" data-edit="${u.UserID}">Edit</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit]').forEach(el => {
    el.addEventListener('click', () => openUserPanel(el.dataset.edit));
  });
}

function branchNamesFor(csv) {
  if (!csv) return '—';
  const ids = csv.split(',').map(s => s.trim());
  return ids.map(id => {
    const b = ALL_BRANCHES.find(br => String(br.BranchID) === id);
    return b ? b.BranchName : id;
  }).join(', ');
}

function openUserPanel(userId) {
  const form = document.getElementById('user-form');
  form.reset();
  document.getElementById('user-form-error').hidden = true;

  const checkboxWrap = document.getElementById('branch-checkboxes');
  checkboxWrap.innerHTML = ALL_BRANCHES.map(b => `
    <label class="inline-checkbox">
      <input type="checkbox" value="${b.BranchID}" class="branch-cb"> ${escapeHtml(b.BranchName)}
    </label>
  `).join('');
  checkboxWrap.style.opacity = 1;

  if (userId) {
    const u = USERS.find(x => x.UserID === userId);
    document.getElementById('user-panel-title').textContent = 'Edit user';
    document.getElementById('user-id').value = u.UserID;
    document.getElementById('user-email-input').value = u.Email;
    document.getElementById('user-email-input').disabled = true;
    document.getElementById('user-role').value = u.Role;
    document.getElementById('user-status').value = u.Status;
    document.getElementById('user-password-label').textContent = 'New password (optional)';
    document.getElementById('user-password-hint').textContent = 'Leave blank to keep the current password.';

    if (u.AssignedBranches === 'ALL') {
      document.getElementById('user-all-branches').checked = true;
      checkboxWrap.style.opacity = 0.4;
    } else {
      const ids = (u.AssignedBranches || '').split(',').map(s => s.trim());
      checkboxWrap.querySelectorAll('.branch-cb').forEach(cb => {
        if (ids.indexOf(cb.value) !== -1) cb.checked = true;
      });
    }
  } else {
    document.getElementById('user-panel-title').textContent = 'Add user';
    document.getElementById('user-id').value = '';
    document.getElementById('user-email-input').disabled = false;
    document.getElementById('user-password-label').textContent = 'Password';
    document.getElementById('user-password-hint').textContent = 'Minimum 8 characters.';
  }

  document.getElementById('user-panel').hidden = false;
}

async function handleUserSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('user-form-error');
  errEl.hidden = true;

  const userId = document.getElementById('user-id').value;
  const email = document.getElementById('user-email-input').value.trim();
  const password = document.getElementById('user-password').value;
  const role = document.getElementById('user-role').value;
  const status = document.getElementById('user-status').value;
  const allBranches = document.getElementById('user-all-branches').checked;
  const selectedBranches = Array.from(document.querySelectorAll('.branch-cb:checked')).map(cb => cb.value);

  if (!userId && (!password || password.length < 8)) {
    errEl.textContent = 'A password of at least 8 characters is required for new users.';
    errEl.hidden = false;
    return;
  }
  if (!allBranches && selectedBranches.length === 0) {
    errEl.textContent = 'Assign at least one branch, or check "full access to all branches".';
    errEl.hidden = false;
    return;
  }

  const assignedBranches = allBranches ? 'ALL' : selectedBranches.join(',');

  try {
    if (userId) {
      const payload = { userId, role, assignedBranches, status };
      if (password) payload.password = password;
      await API.call('updateUser', payload);
    } else {
      await API.call('createUser', { email, password, role, assignedBranches });
    }
    await loadUsers();
    document.getElementById('user-panel').hidden = true;
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
function formatTimestamp(iso) {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}
