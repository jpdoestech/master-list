// dashboard.js

let CURRENT_USER = null;
let BRANCHES = [];
let CLIENTS = [];
let EMPLOYEES = [];
let ACTIVE_FILTERS = { branchId: '', clientId: '', status: '', search: '' };

let SORT_STATE = { key: 'LastName', dir: 'asc' };
let PAGE = 1;
let PAGE_SIZE = 10;
let SELECTED_IDS = new Set();
let DENSITY = 'compact';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Session.isLoggedIn()) {
    window.location.href = 'index.html';
    return;
  }
  CURRENT_USER = Session.getUser();
  renderUserChrome();
  wireGlobalControls();
  showTableSkeleton();

  try {
    const data = await API.call('bootstrap', {});
    BRANCHES = data.branches;
    CLIENTS = data.clients;
    EMPLOYEES = data.employees;
    renderBranchTree();
    renderEmployeeTable();
  } catch (err) {
    Toast.error(err.message);
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
    PAGE = 1;
    renderEmployeeTable();
  }, 250));

  document.getElementById('status-filter').addEventListener('change', (e) => {
    ACTIVE_FILTERS.status = e.target.value;
    PAGE = 1;
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

  // Sorting
  document.querySelectorAll('#employee-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (SORT_STATE.key === key) {
        SORT_STATE.dir = SORT_STATE.dir === 'asc' ? 'desc' : 'asc';
      } else {
        SORT_STATE = { key, dir: 'asc' };
      }
      renderEmployeeTable();
    });
  });

  // Density toggle
  document.getElementById('density-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-density]');
    if (!btn) return;
    DENSITY = btn.dataset.density;
    document.querySelectorAll('#density-toggle button').forEach(b => b.classList.toggle('active', b === btn));
    document.getElementById('employee-table').classList.toggle('density-compact', DENSITY === 'compact');
  });

  // Pagination
  document.getElementById('page-size-select').addEventListener('change', (e) => {
    PAGE_SIZE = parseInt(e.target.value, 10);
    PAGE = 1;
    renderEmployeeTable();
  });

  // Select-all checkbox
  document.getElementById('select-all-checkbox').addEventListener('change', (e) => {
    const rows = getPagedRows();
    if (e.target.checked) {
      rows.forEach(r => SELECTED_IDS.add(r.EmployeeID));
    } else {
      rows.forEach(r => SELECTED_IDS.delete(r.EmployeeID));
    }
    renderEmployeeTable();
  });

  // Bulk actions
  document.getElementById('bulk-clear-btn').addEventListener('click', () => {
    SELECTED_IDS.clear();
    renderEmployeeTable();
  });
  document.getElementById('bulk-export-btn').addEventListener('click', () => {
    const rows = EMPLOYEES.filter(e => SELECTED_IDS.has(e.EmployeeID));
    exportEmployeesCsv(rows, 'employees-selected.csv');
  });
  document.getElementById('bulk-delete-btn').addEventListener('click', handleBulkDelete);
  document.getElementById('bulk-reactivate-btn').addEventListener('click', handleBulkReactivate);
  document.getElementById('export-all-btn').addEventListener('click', () => {
    const rows = EMPLOYEES.filter(e => matchesFilters(e));
    exportEmployeesCsv(rows, 'employees.csv');
  });
}

// ---- Data loading -----------------------------------------------------------

async function loadOrgData() {
  BRANCHES = await API.call('listBranches', {});
  CLIENTS = await API.call('listClients', {});
  renderBranchTree();
}

async function loadEmployees() {
  EMPLOYEES = await API.call('listEmployees', { filters: {} });
  SELECTED_IDS.clear();
  renderEmployeeTable();
}

// ---- Sidebar tree -------------------------------------------------------------

function renderBranchTree() {
  const tree = document.getElementById('branch-tree');
  tree.innerHTML = '';

  const allItem = document.createElement('div');
  allItem.className = 'tree-item active';
  allItem.innerHTML = `<span class="tree-dot" style="--dot:#4F46E5"></span> All records`;
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
  PAGE = 1;
  document.querySelectorAll('.tree-item').forEach(item => item.classList.remove('active'));
  if (el) el.classList.add('active');
  renderEmployeeTable();
}

// ---- Employee table -------------------------------------------------------------

function showTableSkeleton() {
  const tbody = document.getElementById('employee-rows');
  const rowsHtml = Array.from({ length: 6 }).map(() => `
    <tr>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:16px"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:70%"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:60%"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:60%"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:50%"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:50%"></div></td>
      <td class="skeleton-cell"><div class="skeleton-bar" style="width:40%"></div></td>
      <td class="skeleton-cell"></td>
    </tr>`).join('');
  tbody.innerHTML = rowsHtml;
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

function sortRows(rows) {
  const { key, dir } = SORT_STATE;
  const mult = dir === 'asc' ? 1 : -1;
  return rows.slice().sort((a, b) => {
    let av, bv;
    if (key === 'LastName') {
      av = `${a.LastName} ${a.FirstName}`.toLowerCase();
      bv = `${b.LastName} ${b.FirstName}`.toLowerCase();
    } else if (key === 'BranchID') {
      const ab = BRANCHES.find(x => String(x.BranchID) === String(a.BranchID));
      const bb = BRANCHES.find(x => String(x.BranchID) === String(b.BranchID));
      av = (ab ? ab.BranchName : '').toLowerCase();
      bv = (bb ? bb.BranchName : '').toLowerCase();
    } else if (key === 'ClientID') {
      const ac = CLIENTS.find(x => String(x.ClientID) === String(a.ClientID));
      const bc = CLIENTS.find(x => String(x.ClientID) === String(b.ClientID));
      av = (ac ? ac.ClientName : '').toLowerCase();
      bv = (bc ? bc.ClientName : '').toLowerCase();
    } else {
      av = String(a[key] || '').toLowerCase();
      bv = String(b[key] || '').toLowerCase();
    }
    if (av < bv) return -1 * mult;
    if (av > bv) return 1 * mult;
    return 0;
  });
}

function getFilteredSortedRows() {
  return sortRows(EMPLOYEES.filter(e => matchesFilters(e)));
}

function getPagedRows() {
  const all = getFilteredSortedRows();
  const start = (PAGE - 1) * PAGE_SIZE;
  return all.slice(start, start + PAGE_SIZE);
}

function renderEmployeeTable() {
  const allFiltered = getFilteredSortedRows();
  const totalPages = Math.max(1, Math.ceil(allFiltered.length / PAGE_SIZE));
  if (PAGE > totalPages) PAGE = totalPages;

  const tbody = document.getElementById('employee-rows');
  const rows = getPagedRows();

  document.getElementById('page-subtitle').textContent =
    `${allFiltered.length} record${allFiltered.length === 1 ? '' : 's'} across ${BRANCHES.length} branch${BRANCHES.length === 1 ? '' : 'es'}`;

  // Update sort arrows
  document.querySelectorAll('#employee-table th.sortable').forEach(th => {
    const arrow = th.querySelector('.sort-arrow');
    if (th.dataset.sort === SORT_STATE.key) {
      arrow.classList.add('active');
      arrow.textContent = SORT_STATE.dir === 'asc' ? '▲' : '▼';
    } else {
      arrow.classList.remove('active');
      arrow.textContent = '▲';
    }
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-state-icon">—</div>No employees match your filters.</td></tr>`;
  } else {
    tbody.innerHTML = rows.map(e => {
      const branch = BRANCHES.find(b => String(b.BranchID) === String(e.BranchID));
      const client = CLIENTS.find(c => String(c.ClientID) === String(e.ClientID));
      const initials = `${(e.FirstName || '?')[0] || ''}${(e.LastName || '')[0] || ''}`.toUpperCase();
      const checked = SELECTED_IDS.has(e.EmployeeID) ? 'checked' : '';
      const selectedCls = SELECTED_IDS.has(e.EmployeeID) ? 'row-selected' : '';
      return `
        <tr class="${selectedCls}" data-row="${e.EmployeeID}">
          <td class="td-checkbox"><input type="checkbox" class="row-checkbox" data-id="${e.EmployeeID}" ${checked}></td>
          <td>
            <div class="name-cell">
              <span class="avatar" style="--av-color:${branchColor(e.BranchID)}">${escapeHtml(initials)}</span>
              <span class="cell-name" data-emp="${e.EmployeeID}">${escapeHtml(e.LastName)}, ${escapeHtml(e.FirstName)}</span>
            </div>
          </td>
          <td><span class="chip" style="--chip-color:${branchColor(e.BranchID)}">${escapeHtml(branch ? branch.BranchName : '—')}</span></td>
          <td>${escapeHtml(client ? client.ClientName : '—')}</td>
          <td>${escapeHtml(e.Position || '—')}</td>
          <td>${escapeHtml(e.EmploymentStatus || '—')}</td>
          <td><span class="status-pill status-${e.Status}">${e.Status}</span></td>
          <td class="cell-actions">
            <button class="link-btn" data-view="${e.EmployeeID}">View</button>
            ${Can.editEmployees(CURRENT_USER.role) ? `<button class="link-btn" data-edit="${e.EmployeeID}">Edit</button>` : ''}
            ${e.Status === 'Inactive'
              ? (Can.editEmployees(CURRENT_USER.role) ? `<button class="link-btn" data-reactivate="${e.EmployeeID}">Reactivate</button>` : '')
              : (Can.deleteEmployees(CURRENT_USER.role) ? `<button class="link-btn link-danger" data-delete="${e.EmployeeID}">Delete</button>` : '')}
          </td>
        </tr>`;
    }).join('');
  }

  tbody.querySelectorAll('[data-view]').forEach(el => el.addEventListener('click', () => openDetailPanel(el.dataset.view)));
  tbody.querySelectorAll('.cell-name').forEach(el => el.addEventListener('click', () => openDetailPanel(el.dataset.emp)));
  tbody.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openEmployeePanel(el.dataset.edit)));
  tbody.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => handleDelete(el.dataset.delete)));
  tbody.querySelectorAll('[data-reactivate]').forEach(el => el.addEventListener('click', () => handleReactivate(el.dataset.reactivate)));
  tbody.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) SELECTED_IDS.add(id); else SELECTED_IDS.delete(id);
      renderEmployeeTable();
    });
  });

  // Select-all checkbox state reflects current page
  const selectAll = document.getElementById('select-all-checkbox');
  const pageIds = rows.map(r => r.EmployeeID);
  const allSelected = pageIds.length > 0 && pageIds.every(id => SELECTED_IDS.has(id));
  selectAll.checked = allSelected;
  selectAll.indeterminate = !allSelected && pageIds.some(id => SELECTED_IDS.has(id));

  renderBulkBar();
  renderPagination(allFiltered.length, totalPages);
}

function renderBulkBar() {
  const bar = document.getElementById('bulk-bar');
  const count = SELECTED_IDS.size;
  bar.hidden = count === 0;
  document.getElementById('bulk-count').textContent = `${count} selected`;
  if (count === 0) return;

  const selectedRows = EMPLOYEES.filter(e => SELECTED_IDS.has(e.EmployeeID));
  const hasInactive = selectedRows.some(e => e.Status === 'Inactive');
  const hasActive = selectedRows.some(e => e.Status !== 'Inactive');

  document.getElementById('bulk-reactivate-btn').hidden = !(hasInactive && Can.editEmployees(CURRENT_USER.role));
  document.getElementById('bulk-delete-btn').hidden = !(hasActive && Can.deleteEmployees(CURRENT_USER.role));
}

function renderPagination(total, totalPages) {
  const start = total === 0 ? 0 : (PAGE - 1) * PAGE_SIZE + 1;
  const end = Math.min(total, PAGE * PAGE_SIZE);
  document.getElementById('pagination-summary-text').textContent = `Showing ${start}–${end} of ${total}`;

  const controls = document.getElementById('pagination-controls');
  const buttons = [];
  buttons.push(`<button class="page-btn" data-page="prev" ${PAGE === 1 ? 'disabled' : ''}>‹</button>`);

  const pageNumbers = getPageNumbers(PAGE, totalPages);
  pageNumbers.forEach(p => {
    if (p === '…') {
      buttons.push(`<span class="page-ellipsis">…</span>`);
    } else {
      buttons.push(`<button class="page-btn ${p === PAGE ? 'active' : ''}" data-page="${p}">${p}</button>`);
    }
  });

  buttons.push(`<button class="page-btn" data-page="next" ${PAGE === totalPages ? 'disabled' : ''}>›</button>`);
  controls.innerHTML = buttons.join('');

  controls.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.page;
      if (val === 'prev') PAGE = Math.max(1, PAGE - 1);
      else if (val === 'next') PAGE = Math.min(totalPages, PAGE + 1);
      else PAGE = parseInt(val, 10);
      renderEmployeeTable();
    });
  });
}

function getPageNumbers(current, total) {
  const pages = [];
  const windowSize = 1;
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || (p >= current - windowSize && p <= current + windowSize)) {
      pages.push(p);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }
  return pages;
}

async function handleDelete(employeeId) {
  if (!confirm('Mark this employee as inactive? This can be reversed by editing the record.')) return;
  try {
    await API.call('deleteEmployee', { employeeId });
    await loadEmployees();
    Toast.success('Employee marked inactive.');
  } catch (err) {
    Toast.error(err.message);
  }
}

async function handleReactivate(employeeId) {
  try {
    await API.call('reactivateEmployee', { employeeId });
    await loadEmployees();
    Toast.success('Employee reactivated.');
  } catch (err) {
    Toast.error(err.message);
  }
}

async function handleBulkReactivate() {
  const ids = Array.from(SELECTED_IDS);
  if (ids.length === 0) return;
  try {
    for (const id of ids) {
      await API.call('reactivateEmployee', { employeeId: id });
    }
    SELECTED_IDS.clear();
    await loadEmployees();
    Toast.success(`${ids.length} employee${ids.length === 1 ? '' : 's'} reactivated.`);
  } catch (err) {
    Toast.error(err.message);
  }
}

async function handleBulkDelete() {
  const ids = Array.from(SELECTED_IDS);
  if (ids.length === 0) return;
  if (!confirm(`Mark ${ids.length} employee${ids.length === 1 ? '' : 's'} as inactive?`)) return;
  try {
    for (const id of ids) {
      await API.call('deleteEmployee', { employeeId: id });
    }
    SELECTED_IDS.clear();
    await loadEmployees();
    Toast.success(`${ids.length} employee${ids.length === 1 ? '' : 's'} marked inactive.`);
  } catch (err) {
    Toast.error(err.message);
  }
}

// ---- CSV export ---------------------------------------------------------------

function exportEmployeesCsv(rows, filename) {
  if (rows.length === 0) {
    Toast.info('Nothing to export.');
    return;
  }
  const headers = ['Last Name', 'First Name', 'Middle Name', 'Branch', 'Client', 'Position', 'Employment Status', 'Status', 'Mobile No', 'Email', 'Date Hired'];
  const lines = [headers.join(',')];

  rows.forEach(e => {
    const branch = BRANCHES.find(b => String(b.BranchID) === String(e.BranchID));
    const client = CLIENTS.find(c => String(c.ClientID) === String(e.ClientID));
    const cells = [
      e.LastName, e.FirstName, e.MiddleName,
      branch ? branch.BranchName : '', client ? client.ClientName : '',
      e.Position, e.EmploymentStatus, e.Status, e.MobileNo, e.Email, e.DateHired
    ].map(csvCell);
    lines.push(cells.join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  Toast.success(`Exported ${rows.length} record${rows.length === 1 ? '' : 's'}.`);
}

function csvCell(value) {
  const s = String(value ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
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
    Toast.error(err.message);
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
  const submitBtn = document.getElementById('org-form').querySelector('button[type="submit"]');
  errEl.hidden = true;
  submitBtn.disabled = true;

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
    Toast.success(kind === 'client' ? 'Client added.' : 'Branch added.');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    submitBtn.disabled = false;
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
