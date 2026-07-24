// employee.js — the Add/Edit employee slide-over

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('employee-form').addEventListener('submit', handleEmployeeSubmit);
  document.getElementById('emp-branch').addEventListener('change', () => populateClientOptions());
});

function populateBranchOptions(selectedBranchId) {
  const sel = document.getElementById('emp-branch');
  sel.innerHTML = BRANCHES.map(b => `<option value="${b.BranchID}">${escapeHtml(b.BranchName)}</option>`).join('');
  if (selectedBranchId) sel.value = selectedBranchId;
  populateClientOptions(document.getElementById('emp-client').dataset.selected);
}

function populateClientOptions(selectedClientId) {
  const branchId = document.getElementById('emp-branch').value;
  const sel = document.getElementById('emp-client');
  const options = CLIENTS.filter(c => String(c.BranchID) === String(branchId));
  sel.innerHTML = options.map(c => `<option value="${c.ClientID}">${escapeHtml(c.ClientName)}</option>`).join('');
  if (selectedClientId) sel.value = selectedClientId;
}

function openEmployeePanel(employeeId) {
  const panel = document.getElementById('employee-panel');
  const form = document.getElementById('employee-form');
  form.reset();
  document.getElementById('employee-form-error').hidden = true;
  document.getElementById('emp-client').dataset.selected = '';

  if (employeeId) {
    document.getElementById('employee-panel-title').textContent = 'Edit employee';
    const emp = EMPLOYEES.find(e => e.EmployeeID === employeeId);
    document.getElementById('emp-id').value = emp.EmployeeID;
    document.getElementById('emp-client').dataset.selected = emp.ClientID;
    populateBranchOptions(emp.BranchID);

    document.getElementById('emp-first').value = emp.FirstName || '';
    document.getElementById('emp-middle').value = emp.MiddleName || '';
    document.getElementById('emp-last').value = emp.LastName || '';
    document.getElementById('emp-gender').value = emp.Gender || '';
    document.getElementById('emp-civil').value = emp.CivilStatus || '';
    document.getElementById('emp-dob').value = emp.DateOfBirth || '';
    document.getElementById('emp-address').value = emp.Address || '';
    document.getElementById('emp-mobile').value = emp.MobileNo || '';
    document.getElementById('emp-email').value = emp.Email || '';
    document.getElementById('emp-position').value = emp.Position || '';
    document.getElementById('emp-datehired').value = emp.DateHired || '';
    document.getElementById('emp-empstatus').value = emp.EmploymentStatus || '';
    document.getElementById('emp-tin').value = emp.TIN || '';
    document.getElementById('emp-sss').value = emp.SSSGSIS || '';
  } else {
    document.getElementById('employee-panel-title').textContent = 'Add employee';
    document.getElementById('emp-id').value = '';
    populateBranchOptions(ACTIVE_FILTERS.branchId || null);
  }

  panel.hidden = false;
}

async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('employee-form-error');
  errEl.hidden = true;

  const employeeId = document.getElementById('emp-id').value;
  const payload = {
    branchId: document.getElementById('emp-branch').value,
    clientId: document.getElementById('emp-client').value,
    firstName: document.getElementById('emp-first').value.trim(),
    middleName: document.getElementById('emp-middle').value.trim(),
    lastName: document.getElementById('emp-last').value.trim(),
    gender: document.getElementById('emp-gender').value,
    civilStatus: document.getElementById('emp-civil').value,
    dateOfBirth: document.getElementById('emp-dob').value,
    address: document.getElementById('emp-address').value.trim(),
    mobileNo: document.getElementById('emp-mobile').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    position: document.getElementById('emp-position').value.trim(),
    dateHired: document.getElementById('emp-datehired').value,
    employmentStatus: document.getElementById('emp-empstatus').value,
    tin: document.getElementById('emp-tin').value.trim(),
    sssGsis: document.getElementById('emp-sss').value.trim()
  };

  if (!payload.branchId || !payload.clientId || !payload.firstName || !payload.lastName) {
    errEl.textContent = 'Branch, client, first name, and last name are required.';
    errEl.hidden = false;
    return;
  }

  try {
    if (employeeId) {
      await API.call('updateEmployee', Object.assign({ employeeId }, payload));
    } else {
      await API.call('createEmployee', payload);
    }
    await loadEmployees();
    closePanel('employee-panel');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}
