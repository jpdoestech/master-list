// dashboard.js

let CURRENT_USER = null;
let BRANCHES = [];
let CLIENTS = [];
let EMPLOYEES = [];
let ACTIVE_FILTERS = { branchId: '', clientId: '', status: '', search: '' };

document.addEventListener('DOMContentLoaded', async () => {
  if (!Session.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }
  CURRENT_USER = Session.getUser();
  renderUserChrome();
  wireGlobalControls();

  try {
    await loadOrgData();
    await loadEmployees();
  } catch (err) {
    alert(err.message);
  }
});

function renderUserChrome() {
  document.getElementById('user-email').textContent = CURRENT_USER.email;
  document.getElementById('role-badge').textContent = ROLE_LABELS[CURRENT_USER.role] || CURRENT_USER.role;
  document.getElementById('role-badge').className = 'role-badge role-' + CURRENT_USER.role;

  if (Can.manageUsers(CURRENT_USER.role)) {
    document.getElementById('nav-users-link').hidden = false;
  }
  if (Can.editEmployees(CURRENT_USER.role)) {
    document.getElementById('add-employee-btn').hidden = false;
  }
  if (Can.manageBranchesClients(CURRENT_USER.role)) {
    document.getElementById('add-branch-btn').hidden = false;
  }
  document.getElementById('scope-label').textContent =
    CURRENT_USER.assignedBranches === 'ALL' ? 'Viewing all branches' : 'Viewing your assigned branches/clients';
}

function wireGlobalControls() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await API.call('logout', {}); } catch (e) { /* ignore */ }
    Session.clear();
    window.location.href = 'index.html';
  });

  document.getElementById('global-search').addEventListener('input', debounce((e) => {
    ACTIVE_FILTERS.search = e.target.value;
    renderEmployeeTable();
  }, 250));

  document.getElementById('status-filter').addEventListener('change', (e) => {
    ACTIVE_FILTERS.status = e.target.value;
    renderEmployeeTable();
  });

  document.getElementById('add-employee-btn').addEventListener('click', () => openEmployeePanel(null));

  document.querySelectorAll('[data-close-panel]').forEach(el => {
    el.addEventListener('click', () => closePanel(el.dataset.closePanel));
  });
  document.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.dataset.closeModal));
  });

  document.getElementById('add-branch-btn').addEventListener('click', () => openOrgModal('branch'));
  document.getElementById('org-form').addEventListener('submit', handleOrgSubmit);
  document.getElementById('comment-form').addEventListener('submit', handleCommentSubmit);
}

// ---- Data loading -----------------------------------------------------------

async function loadOrgData() {
  BRANCHES = await API.call('listBranches', {});
  CLIENTS = await API.call('listClients', {});
  renderBranchTree();
}

async function loadEmployees() {
  EMPLOYEES = await API.call('listEmployees', { filters: {} });
  renderEmployeeTable();
}

// ---- Sidebar tree -------------------------------------------------------------

function renderBranchTree() {
  const tree = document.getElementById('branch-tree');
  tree.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'tree-item active';
  allItem.innerHTML = `<span class="tree-dot" style="--dot:#16233D"></span> All records`;
  allItem.addEventListener('click', () => selectScope('', '', allItem));
  tree.appendChild(allItem);

  BRANCHES.forEach(branch => {
    const branchRow = document.createElement('div');
    branchRow.className = 'tree-item tree-branch';
    branchRow.innerHTML = `
      <span class="tree-branch-label"><span class="tree-dot" style="--dot:${branchColor(branch.BranchID)}"></span> ${escapeHtml(branch.BranchName)}</span>
      ${Can.manageBranchesClients(CURRENT_USER.role) ? `<button type="button" class="tree-add-client" data-add-client="${branch.BranchID}" title="Add client under this branch">+ client</button>` : ''}
    `;
    branchRow.querySelector('.tree-branch-label').addEventListener('click', () => selectScope(branch.BranchID, '', branchRow));
    const addClientBtn = branchRow.querySelector('[data-add-client]');
    if (addClientBtn) {
      addClientBtn.addEventListener('click', (evt) => {
        evt.stopPropagation();
        openOrgModal('client', branch.BranchID);
      });
    }
    tree.appendChild(branchRow);

    CLIENTS.filter(c => String(c.BranchID) === String(branch.BranchID)).forEach(client => {
      const clientRow = document.createElement('div');
      clientRow.className = 'tree-item tree-client';
      clientRow.textContent = client.ClientName;
      clientRow.addEventListener('click', () => selectScope(branch.BranchID, client.ClientID, clientRow));
      tree.appendChild(clientRow);
    });
  });
}

function selectScope(branchId, clientId, el) {
  ACTIVE_FILTERS.branchId = branchId;
  ACTIVE_FILTERS.clientId = clientId;
  document.querySelectorAll('.tree-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');
  renderEmployeeTable();
}

// ---- Employee table -------------------------------------------------------------

function renderEmployeeTable() {
  const tbody = document.getElementById('employee-rows');
  const rows = EMPLOYEES.filter(e => matchesFilters(e));

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No employees match your filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(e => {
    const branch = BRANCHES.find(b => String(b.BranchID) === String(e.BranchID));
    const client = CLIENTS.find(c => String(c.ClientID) === String(e.ClientID));
    return `
      <tr>
        <td class="cell-name" data-emp="${e.EmployeeID}">${escapeHtml(e.LastName)}, ${escapeHtml(e.FirstName)}</td>
        <td><span class="chip" style="--chip-color:${branchColor(e.BranchID)}">${escapeHtml(branch ? branch.BranchName : '—')}</span></td>
        <td>${escapeHtml(client ? client.ClientName : '—')}</td>
        <td>${escapeHtml(e.Position || '—')}</td>
        <td>${escapeHtml(e.EmploymentStatus || '—')}</td>
        <td><span class="status-pill status-${e.Status}">${e.Status}</span></td>
        <td class="cell-actions">
          <button class="link-btn" data-view="${e.EmployeeID}">View</button>
          ${Can.editEmployees(CURRENT_USER.role) ? `<button class="link-btn" data-edit="${e.EmployeeID}">Edit</button>` : ''}
          ${Can.deleteEmployees(CURRENT_USER.role) ? `<button class="link-btn link-danger" data-delete="${e.EmployeeID}">Delete</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => openDetailPanel(el.dataset.view)));
  tbody.querySelectorAll('.cell-name').forEach(el => el.addEventListener('click', () => openDetailPanel(el.dataset.emp)));
  tbody.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openEmployeePanel(el.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => handleDelete(el.dataset.delete)));
}

function matchesFilters(e) {
  if (ACTIVE_FILTERS.branchId && String(e.BranchID) !== String(ACTIVE_FILTERS.branchId)) return false;
  if (ACTIVE_FILTERS.clientId && String(e.ClientID) !== String(ACTIVE_FILTERS.clientId)) return false;
  if (ACTIVE_FILTERS.status && e.Status !== ACTIVE_FILTERS.status) return false;
  if (ACTIVE_FILTERS.search) {
    const q = ACTIVE_FILTERS.search.toLowerCase();
    const hay = `${e.FirstName} ${e.LastName} ${e.Position} ${e.Email}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

async function handleDelete(employeeId) {
  if (!confirm('Mark this employee as inactive? This can be reversed by editing the record.')) return;
  try {
    await API.call('deleteEmployee', { employeeId });
    await loadEmployees();
  } catch (err) {
    alert(err.message);
  }
}

// ---- Detail panel + comments --------------------------------------------------

async function openDetailPanel(employeeId) {
  const panel = document.getElementById('detail-panel');
  panel.hidden = false;
  document.getElementById('detail-name').textContent = 'Loading…';
  document.getElementById('detail-body').innerHTML = '';
  document.getElementById('comments-list').innerHTML = '';

  try {
    const emp = await API.call('getEmployee', { employeeId });
    const branch = BRANCHES.find(b => String(b.BranchID) === String(emp.BranchID));
    const client = CLIENTS.find(c => String(c.ClientID) === String(emp.ClientID));

    document.getElementById('detail-name').textContent = `${emp.FirstName} ${emp.LastName}`;
    document.getElementById('detail-body').innerHTML = `
      <div class="detail-grid">
        <div><span class="detail-label">Branch</span><span class="chip" style="--chip-color:${branchColor(emp.BranchID)}">${escapeHtml(branch ? branch.BranchName : '—')}</span></div>
        <div><span class="detail-label">Client</span>${escapeHtml(client ? client.ClientName : '—')}</div>
        <div><span class="detail-label">Position</span>${escapeHtml(emp.Position || '—')}</div>
        <div><span class="detail-label">Employment status</span>${escapeHtml(emp.EmploymentStatus || '—')}</div>
        <div><span class="detail-label">Date hired</span>${escapeHtml(emp.DateHired || '—')}</div>
        <div><span class="detail-label">Mobile</span>${escapeHtml(emp.MobileNo || '—')}</div>
        <div><span class="detail-label">Email</span>${escapeHtml(emp.Email || '—')}</div>
        <div><span class="detail-label">Address</span>${escapeHtml(emp.Address || '—')}</div>
        <div><span class="detail-label">TIN</span><span class="mono">${escapeHtml(emp.TIN || '—')}</span></div>
        <div><span class="detail-label">SSS / GSIS</span><span class="mono">${escapeHtml(emp.SSSGSIS || '—')}</span></div>
      </div>`;

    const comments = await API.call('listComments', { employeeId });
    renderComments(comments);

    if (Can.comment(CURRENT_USER.role)) {
      const form = document.getElementById('comment-form');
      form.hidden = false;
      form.dataset.employeeId = employeeId;
    }
  } catch (err) {
    document.getElementById('detail-name').textContent = 'Error';
    document.getElementById('detail-body').innerHTML = `<p class="form-error">${escapeHtml(err.message)}</p>`;
  }
}

function renderComments(comments) {
  const list = document.getElementById('comments-list');
  if (comments.length === 0) {
    list.innerHTML = '<p class="empty-state-sm">No comments yet.</p>';
    return;
  }
  list.innerHTML = comments.map(c => `
    <div class="comment">
      <div class="comment-meta"><strong>${escapeHtml(c.UserEmail)}</strong> · ${formatTimestamp(c.Timestamp)}</div>
      <div class="comment-text">${escapeHtml(c.CommentText)}</div>
    </div>
  `).join('');
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('comment-form');
  const employeeId = form.dataset.employeeId;
  const textEl = document.getElementById('comment-text');
  try {
    await API.call('addComment', { employeeId, commentText: textEl.value });
    textEl.value = '';
    const comments = await API.call('listComments', { employeeId });
    renderComments(comments);
  } catch (err) {
    alert(err.message);
  }
}

// ---- Org modal (add branch / client) --------------------------------------------

function openOrgModal(kind, presetBranchId) {
  document.getElementById('org-modal').hidden = false;
  document.getElementById('org-modal').dataset.kind = kind;
  document.getElementById('org-modal-title').textContent = kind === 'client' ? 'Add client' : 'Add branch';
  document.getElementById('org-branch-field').hidden = kind === 'client';
  document.getElementById('org-client-fields').hidden = kind !== 'client';
  document.getElementById('org-branch-name').value = '';
  document.getElementById('org-client-name').value = '';

  if (kind === 'client') {
    const sel = document.getElementById('org-client-branch');
    sel.innerHTML = BRANCHES.map(b => `<option value="${b.BranchID}">${escapeHtml(b.BranchName)}</option>`).join('');
    if (presetBranchId) sel.value = presetBranchId;
  }
}

async function handleOrgSubmit(e) {
  e.preventDefault();
  // Default to branch mode unless the modal was explicitly opened as 'client' —
  // safer than requiring an exact 'branch' match, since branch is the primary action.
  const kind = document.getElementById('org-modal').dataset.kind === 'client' ? 'client' : 'branch';
  const errEl = document.getElementById('org-form-error');
  errEl.hidden = true;

  try {
    if (kind === 'client') {
      const name = document.getElementById('org-client-name').value.trim();
      const branchId = document.getElementById('org-client-branch').value;
      if (!name) throw new Error('Client name is required.');
      if (!branchId) throw new Error('Please choose which branch this client belongs to.');
      await API.call('createClient', { clientName: name, branchId });
    } else {
      const name = document.getElementById('org-branch-name').value.trim();
      if (!name) throw new Error('Branch name is required.');
      await API.call('createBranch', { branchName: name });
    }
    await loadOrgData();
    closeModal('org-modal');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}

// ---- Panel/modal helpers -----------------------------------------------------

function closePanel(id) { document.getElementById(id).hidden = true; }
function closeModal(id) { document.getElementById(id).hidden = true; }

// ---- Small utils ---------------------------------------------------------------

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
function formatTimestamp(iso) {
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}
