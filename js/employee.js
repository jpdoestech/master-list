// employee.js — the Add/Edit employee slide-over, matching the reference
// intake form's field set (https://jpdoestech.github.io/employee-info/):
// Personal / Employment / Home Address / Birth Info / Health & Civil
// Status / Government ID Numbers / Emergency Contact + address.
// Photo & Signature and the public reference-code lookup from that form
// don't apply here (this is an admin-managed CRUD panel, not a public
// self-service intake form), so they're intentionally left out.

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Divorced'];
const RELATIONSHIPS = ['Parent', 'Spouse', 'Sibling', 'Child', 'Relative', 'Guardian', 'Friend', 'Other'];
const COUNTRIES = [
  'Philippines', 'United States', 'Canada', 'Australia', 'United Kingdom', 'Japan',
  'South Korea', 'Singapore', 'Malaysia', 'United Arab Emirates', 'Saudi Arabia',
  'Qatar', 'China', 'Taiwan', 'Hong Kong', 'India', 'Indonesia', 'Vietnam', 'Other'
];

// Mirrors the backend's ID_NUMBER_RULES — catches bad input before it's
// ever sent, but the server re-checks the same patterns since a direct
// API call could otherwise bypass this.
const ID_RULES = {
  'emp-mobile': { pattern: /^09\d{9}$/, message: 'Must be 11 digits, e.g. 09161234567' },
  'emp-emergency-mobile': { pattern: /^09\d{9}$/, message: 'Must be 11 digits, e.g. 09161234567' },
  'emp-tin': { pattern: /^\d{9}$/, message: 'Must be 9 digits' },
  'emp-sss': { pattern: /^\d{10}$/, message: 'Must be 10 digits' },
  'emp-philhealth': { pattern: /^\d{12}$/, message: 'Must be 12 digits' },
  'emp-pagibig': { pattern: /^\d{12}$/, message: 'Must be 12 digits' }
};

// "I don't have a ___" checkboxes: field key -> [checkbox id, input id]
const OPTIONAL_ID_TOGGLES = [
  ['emp-no-philhealth', 'emp-philhealth'],
  ['emp-no-pagibig', 'emp-pagibig'],
  ['emp-no-sss', 'emp-sss'],
  ['emp-no-tin', 'emp-tin']
];

// ---- PH address data (regions/provinces/cities/barangays), loaded from
// the static data/address/*.json files already committed to this repo ----
const ADDRESS_DATA_BASE = 'data/address';
let _regionsPromise = null, _provincesPromise = null, _citiesPromise = null;
const _barangaysPromiseByCity = {};

function fetchJson_(path) {
  return fetch(path).then(res => {
    if (!res.ok) throw new Error('Could not load ' + path + ' (' + res.status + ')');
    return res.json();
  });
}
function loadRegions_() { return _regionsPromise || (_regionsPromise = fetchJson_(`${ADDRESS_DATA_BASE}/regions.json`)); }
function loadProvinces_() { return _provincesPromise || (_provincesPromise = fetchJson_(`${ADDRESS_DATA_BASE}/provinces.json`)); }
function loadCities_() { return _citiesPromise || (_citiesPromise = fetchJson_(`${ADDRESS_DATA_BASE}/cities.json`)); }
function loadBarangaysForCity_(cityCode) {
  return _barangaysPromiseByCity[cityCode] || (_barangaysPromiseByCity[cityCode] = fetchJson_(`${ADDRESS_DATA_BASE}/barangays/${cityCode}.json`));
}
function getProvincesForRegion_(regionCode) {
  return loadProvinces_().then(all => all.filter(p => p.regionCode === regionCode));
}
function getCitiesForProvince_(provinceCode) {
  return loadCities_().then(all => all.filter(c => c.provinceCode === provinceCode));
}
function getCitiesForRegionDirect_(regionCode) {
  // Province-less regions like NCR: cities attach straight to the region.
  return loadCities_().then(all => all.filter(c => c.regionCode === regionCode && !c.provinceCode));
}

function fillSelect_(selectEl, items, placeholder, preferredValue) {
  selectEl.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = placeholder;
  selectEl.appendChild(ph);
  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.code; opt.textContent = item.name; opt.dataset.name = item.name;
    selectEl.appendChild(opt);
  });
  if (preferredValue) selectEl.value = preferredValue;
}
function fillSimpleSelect_(selectEl, names, placeholder, preferredValue) {
  selectEl.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = ''; ph.textContent = placeholder;
  selectEl.appendChild(ph);
  names.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name; opt.textContent = name; opt.dataset.name = name;
    selectEl.appendChild(opt);
  });
  if (preferredValue) selectEl.value = preferredValue;
}
function resetSelect_(selectEl, placeholder) {
  selectEl.innerHTML = '';
  const opt = document.createElement('option');
  opt.value = ''; opt.textContent = placeholder;
  selectEl.appendChild(opt);
  selectEl.disabled = true;
}
function selectedName_(selectEl) {
  const opt = selectEl.options[selectEl.selectedIndex];
  return opt ? (opt.dataset.name || '') : '';
}

/**
 * Generic Region -> Province -> City -> Barangay cascade, shared by Home
 * Address and Emergency Contact Address so the logic isn't duplicated.
 */
function createAddressCascade_(regionEl, provinceEl, cityEl, barangayEl) {
  const state = { provinceLevelExists: true };

  function onRegionChange() {
    const regionCode = regionEl.value;
    const regionName = selectedName_(regionEl);
    resetSelect_(provinceEl, 'Loading provinces\u2026');
    resetSelect_(cityEl, 'Select province first');
    resetSelect_(barangayEl, 'Select city first');
    if (!regionCode) { resetSelect_(provinceEl, 'Select region first'); return; }

    getProvincesForRegion_(regionCode).then(provinces => {
      if (provinces.length) {
        state.provinceLevelExists = true;
        provinceEl.disabled = false;
        fillSelect_(provinceEl, provinces, 'Select province');
      } else {
        state.provinceLevelExists = false;
        fillSelect_(provinceEl, [{ code: regionCode, name: regionName }], 'N/A for this region');
        provinceEl.value = regionCode;
        provinceEl.disabled = true;
        loadCitiesForRegion(regionCode);
      }
    });
  }

  function loadCitiesForRegion(regionCode) {
    resetSelect_(cityEl, 'Loading cities\u2026');
    getCitiesForRegionDirect_(regionCode).then(cities => {
      if (cities.length) { cityEl.disabled = false; fillSelect_(cityEl, cities, 'Select city/municipality'); }
      else { resetSelect_(cityEl, 'No cities found'); }
    });
  }

  function onProvinceChange() {
    const provinceCode = provinceEl.value;
    resetSelect_(cityEl, 'Loading cities\u2026');
    resetSelect_(barangayEl, 'Select city first');
    if (!provinceCode) { resetSelect_(cityEl, 'Select province first'); return; }
    getCitiesForProvince_(provinceCode).then(cities => {
      cityEl.disabled = false; fillSelect_(cityEl, cities, 'Select city/municipality');
    });
  }

  function onCityChange() {
    const cityCode = cityEl.value;
    resetSelect_(barangayEl, 'Loading barangays\u2026');
    if (!cityCode) { resetSelect_(barangayEl, 'Select city first'); return; }
    loadBarangaysForCity_(cityCode).then(barangays => {
      barangayEl.disabled = false; fillSelect_(barangayEl, barangays, 'Select barangay');
    });
  }

  regionEl.addEventListener('change', onRegionChange);
  provinceEl.addEventListener('change', onProvinceChange);
  cityEl.addEventListener('change', onCityChange);

  async function restore(regionCode, provinceCode, cityCode, barangayCode) {
    if (!regionCode) return;
    regionEl.value = regionCode;
    const regionName = selectedName_(regionEl);

    const provinces = await getProvincesForRegion_(regionCode);
    if (provinces.length) {
      state.provinceLevelExists = true;
      provinceEl.disabled = false;
      fillSelect_(provinceEl, provinces, 'Select province');
      if (provinceCode) provinceEl.value = provinceCode;
    } else {
      state.provinceLevelExists = false;
      fillSelect_(provinceEl, [{ code: regionCode, name: regionName }], 'N/A for this region');
      provinceEl.value = regionCode;
      provinceEl.disabled = true;
    }

    const cities = state.provinceLevelExists
      ? await getCitiesForProvince_(provinceCode)
      : await getCitiesForRegionDirect_(regionCode);
    if (cities.length) {
      cityEl.disabled = false;
      fillSelect_(cityEl, cities, 'Select city/municipality');
      if (cityCode) cityEl.value = cityCode;
    }

    if (cityCode) {
      const barangays = await loadBarangaysForCity_(cityCode);
      if (barangays.length) {
        barangayEl.disabled = false;
        fillSelect_(barangayEl, barangays, 'Select barangay');
        if (barangayCode) barangayEl.value = barangayCode;
      }
    }
  }

  function reset(regionPlaceholder) {
    resetSelect_(provinceEl, 'Select region first');
    resetSelect_(cityEl, 'Select province first');
    resetSelect_(barangayEl, 'Select city first');
  }

  return { state, restore, reset };
}

let homeCascade, emergencyCascade;
let birthProvinceLevelExists = true;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('employee-form').addEventListener('submit', handleEmployeeSubmit);
  document.getElementById('emp-branch').addEventListener('change', () => populateClientOptions());

  homeCascade = createAddressCascade_(
    document.getElementById('emp-home-region'), document.getElementById('emp-home-province'),
    document.getElementById('emp-home-city'), document.getElementById('emp-home-barangay')
  );
  emergencyCascade = createAddressCascade_(
    document.getElementById('emp-emergency-region'), document.getElementById('emp-emergency-province'),
    document.getElementById('emp-emergency-city'), document.getElementById('emp-emergency-barangay')
  );

  const birthRegionEl = document.getElementById('emp-birth-region');
  const birthProvinceEl = document.getElementById('emp-birth-province');
  birthRegionEl.addEventListener('change', () => {
    const regionCode = birthRegionEl.value;
    const regionName = selectedName_(birthRegionEl);
    resetSelect_(birthProvinceEl, 'Loading provinces\u2026');
    if (!regionCode) { resetSelect_(birthProvinceEl, 'Select region first'); return; }
    getProvincesForRegion_(regionCode).then(provinces => {
      if (provinces.length) {
        birthProvinceLevelExists = true;
        birthProvinceEl.disabled = false;
        fillSelect_(birthProvinceEl, provinces, 'Select province');
      } else {
        birthProvinceLevelExists = false;
        fillSelect_(birthProvinceEl, [{ code: regionCode, name: regionName }], 'N/A for this region');
        birthProvinceEl.value = regionCode;
        birthProvinceEl.disabled = true;
      }
    });
  });

  // Load regions once for all three region dropdowns.
  loadRegions_().then(regions => {
    fillSelect_(document.getElementById('emp-home-region'), regions, 'Select region');
    fillSelect_(document.getElementById('emp-emergency-region'), regions, 'Select region');
    fillSelect_(document.getElementById('emp-birth-region'), regions, 'Select region');
  }).catch(err => Toast.error('Could not load region list: ' + err.message));

  fillSimpleSelect_(document.getElementById('emp-blood-type'), BLOOD_TYPES, 'Select blood type');
  fillSimpleSelect_(document.getElementById('emp-civil'), CIVIL_STATUSES, 'Select civil status');
  fillSimpleSelect_(document.getElementById('emp-emergency-relationship'), RELATIONSHIPS, 'Select relationship');
  fillSimpleSelect_(document.getElementById('emp-birth-country'), COUNTRIES, 'Select country', 'Philippines');

  // "I don't have a ___ number" — disables and clears the field so it's
  // skipped by validation instead of demanding a fabricated value.
  OPTIONAL_ID_TOGGLES.forEach(([checkboxId, inputId]) => {
    const checkbox = document.getElementById(checkboxId);
    const input = document.getElementById(inputId);
    checkbox.addEventListener('change', () => {
      input.disabled = checkbox.checked;
      if (checkbox.checked) { input.value = ''; setFieldError_(inputId, false); }
    });
  });

  // Dates can't be generated in the future — capped at today, computed
  // fresh each time the panel opens (see openEmployeePanel).
});

function todayStr_() { return new Date().toISOString().slice(0, 10); }

function populateBranchOptions(selectedBranchId) {
  const sel = document.getElementById('emp-branch');
  sel.innerHTML = '<option value="">Select branch</option>' +
    BRANCHES.map(b => `<option value="${b.BranchID}">${escapeHtml(b.BranchName)}</option>`).join('');
  if (selectedBranchId) sel.value = selectedBranchId;
  populateClientOptions(document.getElementById('emp-client').dataset.selected);
}

function populateClientOptions(selectedClientId) {
  const branchId = document.getElementById('emp-branch').value;
  const sel = document.getElementById('emp-client');
  const options = CLIENTS.filter(c => String(c.BranchID) === String(branchId));
  sel.innerHTML = '<option value="">Select client</option>' +
    options.map(c => `<option value="${c.ClientID}">${escapeHtml(c.ClientName)}</option>`).join('');
  if (selectedClientId) sel.value = selectedClientId;
}

function clearAllFieldErrors_() {
  document.querySelectorAll('#employee-form .field-error.show').forEach(el => el.classList.remove('show'));
  document.querySelectorAll('#employee-form .invalid').forEach(el => el.classList.remove('invalid'));
}

async function openEmployeePanel(employeeId) {
  const panel = document.getElementById('employee-panel');
  const form = document.getElementById('employee-form');
  form.reset();
  clearAllFieldErrors_();
  document.getElementById('employee-form-error').hidden = true;
  document.getElementById('emp-client').dataset.selected = '';

  // Dates never let the browser generate/pick a day beyond today.
  const today = todayStr_();
  document.getElementById('emp-dob').max = today;
  document.getElementById('emp-datehired').max = today;

  homeCascade.reset();
  emergencyCascade.reset();
  resetSelect_(document.getElementById('emp-birth-province'), 'Select region first');
  document.getElementById('emp-birth-country').value = 'Philippines';
  OPTIONAL_ID_TOGGLES.forEach(([checkboxId, inputId]) => {
    document.getElementById(checkboxId).checked = false;
    document.getElementById(inputId).disabled = false;
  });

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
    document.getElementById('emp-dob').value = emp.DateOfBirth || '';
    document.getElementById('emp-home-street').value = emp.Address || '';
    document.getElementById('emp-mobile').value = emp.MobileNo || '';
    document.getElementById('emp-email').value = emp.Email || '';
    document.getElementById('emp-position').value = emp.Position || '';
    document.getElementById('emp-datehired').value = emp.DateHired || '';
    document.getElementById('emp-empstatus').value = emp.EmploymentStatus || '';
    document.getElementById('emp-tin').value = emp.TIN || '';
    document.getElementById('emp-sss').value = emp.SSSGSIS || '';
    document.getElementById('emp-philhealth').value = emp.PhilHealthNo || '';
    document.getElementById('emp-pagibig').value = emp.PagIbigNo || '';

    // Restore "I don't have a ___" checkbox state: if the saved value is
    // blank, treat it as having been explicitly opted out on save.
    document.getElementById('emp-no-tin').checked = !emp.TIN;
    document.getElementById('emp-tin').disabled = !emp.TIN;
    document.getElementById('emp-no-sss').checked = !emp.SSSGSIS;
    document.getElementById('emp-sss').disabled = !emp.SSSGSIS;
    document.getElementById('emp-no-philhealth').checked = !emp.PhilHealthNo;
    document.getElementById('emp-philhealth').disabled = !emp.PhilHealthNo;
    document.getElementById('emp-no-pagibig').checked = !emp.PagIbigNo;
    document.getElementById('emp-pagibig').disabled = !emp.PagIbigNo;
    document.getElementById('emp-blood-type').value = emp.BloodType || '';
    document.getElementById('emp-civil').value = emp.CivilStatus || '';
    document.getElementById('emp-place-of-birth').value = emp.PlaceOfBirth || '';
    if (emp.CountryOfBirth) document.getElementById('emp-birth-country').value = emp.CountryOfBirth;
    document.getElementById('emp-emergency-person').value = emp.EmergencyContactPerson || '';
    if (emp.EmergencyRelationship) document.getElementById('emp-emergency-relationship').value = emp.EmergencyRelationship;
    document.getElementById('emp-emergency-mobile').value = emp.EmergencyContactNo || '';
    document.getElementById('emp-emergency-street').value = emp.EmergencyStreet || '';

    await Promise.all([
      homeCascade.restore(emp.HomeRegionCode, emp.HomeProvinceCode, emp.HomeCityCode, emp.HomeBarangayCode),
      emergencyCascade.restore(emp.EmergencyRegionCode, emp.EmergencyProvinceCode, emp.EmergencyCityCode, emp.EmergencyBarangayCode),
      (async () => {
        if (!emp.RegionOfBirthCode) return;
        const birthRegionEl = document.getElementById('emp-birth-region');
        const birthProvinceEl = document.getElementById('emp-birth-province');
        birthRegionEl.value = emp.RegionOfBirthCode;
        const provinces = await getProvincesForRegion_(emp.RegionOfBirthCode);
        if (provinces.length) {
          birthProvinceLevelExists = true;
          birthProvinceEl.disabled = false;
          fillSelect_(birthProvinceEl, provinces, 'Select province');
          if (emp.ProvinceOfBirthCode) birthProvinceEl.value = emp.ProvinceOfBirthCode;
        } else {
          birthProvinceLevelExists = false;
          resetSelect_(birthProvinceEl, 'N/A for this region');
        }
      })()
    ]);
  } else {
    document.getElementById('employee-panel-title').textContent = 'Add employee';
    document.getElementById('emp-id').value = '';
    populateBranchOptions(ACTIVE_FILTERS.branchId || null);
  }

  panel.hidden = false;
}

function setFieldError_(fieldId, show) {
  const input = document.getElementById(fieldId);
  const err = document.querySelector(`.field-error[data-err="${fieldId}"]`);
  if (input) input.classList.toggle('invalid', show);
  if (err) err.classList.toggle('show', show);
}

/**
 * Validates every section of the form, marking bad fields inline.
 * Returns true only when everything passes.
 */
function validateEmployeeForm_() {
  let valid = true;
  const flag = (fieldId, bad) => { setFieldError_(fieldId, bad); if (bad) valid = false; };

  const requiredText = [
    'emp-last', 'emp-first', 'emp-position', 'emp-datehired', 'emp-mobile',
    'emp-home-street', 'emp-dob', 'emp-place-of-birth',
    'emp-philhealth', 'emp-pagibig', 'emp-sss', 'emp-tin',
    'emp-emergency-person', 'emp-emergency-mobile', 'emp-emergency-street'
  ];
  requiredText.forEach(id => {
    const input = document.getElementById(id);
    if (input.disabled) return; // "I don't have a ___" — skipped, not required
    flag(id, !input.value.trim());
  });

  const requiredSelects = ['emp-branch', 'emp-client', 'emp-birth-country', 'emp-blood-type', 'emp-civil', 'emp-emergency-relationship'];
  requiredSelects.forEach(id => flag(id, !document.getElementById(id).value));

  flag('emp-home-region', !document.getElementById('emp-home-region').value);
  if (document.getElementById('emp-home-region').value) {
    flag('emp-home-province', homeCascade.state.provinceLevelExists && !document.getElementById('emp-home-province').value);
  }
  flag('emp-home-city', !document.getElementById('emp-home-city').value);
  flag('emp-home-barangay', !document.getElementById('emp-home-barangay').value);

  flag('emp-emergency-region', !document.getElementById('emp-emergency-region').value);
  if (document.getElementById('emp-emergency-region').value) {
    flag('emp-emergency-province', emergencyCascade.state.provinceLevelExists && !document.getElementById('emp-emergency-province').value);
  }
  flag('emp-emergency-city', !document.getElementById('emp-emergency-city').value);
  flag('emp-emergency-barangay', !document.getElementById('emp-emergency-barangay').value);

  flag('emp-birth-region', !document.getElementById('emp-birth-region').value);
  if (document.getElementById('emp-birth-region').value) {
    flag('emp-birth-province', birthProvinceLevelExists && !document.getElementById('emp-birth-province').value);
  }

  // Government ID / contact number digit-length checks (skip disabled "I don't have" fields).
  Object.keys(ID_RULES).forEach(id => {
    const input = document.getElementById(id);
    if (input.disabled) return;
    const rule = ID_RULES[id];
    if (input.value.trim() && !rule.pattern.test(input.value.trim())) flag(id, true);
  });

  // Dates: never in the future, and hire date can't predate birth date.
  const today = todayStr_();
  const dob = document.getElementById('emp-dob').value;
  const hired = document.getElementById('emp-datehired').value;
  if (dob && dob > today) flag('emp-dob', true);
  if (hired && hired > today) flag('emp-datehired', true);
  if (dob && hired && hired < dob) { flag('emp-datehired', true); }

  return valid;
}

function buildEmployeePayload_() {
  const homeRegionEl = document.getElementById('emp-home-region');
  const homeProvinceEl = document.getElementById('emp-home-province');
  const homeCityEl = document.getElementById('emp-home-city');
  const homeBarangayEl = document.getElementById('emp-home-barangay');
  const emgRegionEl = document.getElementById('emp-emergency-region');
  const emgProvinceEl = document.getElementById('emp-emergency-province');
  const emgCityEl = document.getElementById('emp-emergency-city');
  const emgBarangayEl = document.getElementById('emp-emergency-barangay');
  const birthRegionEl = document.getElementById('emp-birth-region');
  const birthProvinceEl = document.getElementById('emp-birth-province');

  return {
    branchId: document.getElementById('emp-branch').value,
    clientId: document.getElementById('emp-client').value,
    firstName: document.getElementById('emp-first').value.trim(),
    middleName: document.getElementById('emp-middle').value.trim(),
    lastName: document.getElementById('emp-last').value.trim(),
    gender: document.getElementById('emp-gender').value,
    civilStatus: document.getElementById('emp-civil').value,
    dateOfBirth: document.getElementById('emp-dob').value,
    homeStreet: document.getElementById('emp-home-street').value.trim(),
    mobileNo: document.getElementById('emp-mobile').value.trim(),
    email: document.getElementById('emp-email').value.trim(),
    position: document.getElementById('emp-position').value.trim(),
    dateHired: document.getElementById('emp-datehired').value,
    employmentStatus: document.getElementById('emp-empstatus').value,
    tin: document.getElementById('emp-tin').value.trim(),
    sssGsis: document.getElementById('emp-sss').value.trim(),

    homeRegionCode: homeRegionEl.value,
    homeRegionName: selectedName_(homeRegionEl),
    homeProvinceCode: homeCascade.state.provinceLevelExists ? homeProvinceEl.value : homeRegionEl.value,
    homeProvinceName: homeCascade.state.provinceLevelExists ? selectedName_(homeProvinceEl) : selectedName_(homeRegionEl),
    homeCityCode: homeCityEl.value,
    homeCityName: selectedName_(homeCityEl),
    homeBarangayCode: homeBarangayEl.value,
    homeBarangayName: selectedName_(homeBarangayEl),

    placeOfBirth: document.getElementById('emp-place-of-birth').value.trim(),
    regionOfBirthCode: birthRegionEl.value,
    regionOfBirthName: selectedName_(birthRegionEl),
    provinceOfBirthCode: birthProvinceLevelExists ? birthProvinceEl.value : birthRegionEl.value,
    provinceOfBirthName: birthProvinceLevelExists ? selectedName_(birthProvinceEl) : selectedName_(birthRegionEl),
    countryOfBirth: document.getElementById('emp-birth-country').value,

    bloodType: document.getElementById('emp-blood-type').value,
    philHealthNo: document.getElementById('emp-philhealth').value.trim(),
    pagIbigNo: document.getElementById('emp-pagibig').value.trim(),

    emergencyContactPerson: document.getElementById('emp-emergency-person').value.trim(),
    emergencyRelationship: document.getElementById('emp-emergency-relationship').value,
    emergencyContactNo: document.getElementById('emp-emergency-mobile').value.trim(),
    emergencyStreet: document.getElementById('emp-emergency-street').value.trim(),
    emergencyRegionCode: emgRegionEl.value,
    emergencyRegionName: selectedName_(emgRegionEl),
    emergencyProvinceCode: emergencyCascade.state.provinceLevelExists ? emgProvinceEl.value : emgRegionEl.value,
    emergencyProvinceName: emergencyCascade.state.provinceLevelExists ? selectedName_(emgProvinceEl) : selectedName_(emgRegionEl),
    emergencyCityCode: emgCityEl.value,
    emergencyCityName: selectedName_(emgCityEl),
    emergencyBarangayCode: emgBarangayEl.value,
    emergencyBarangayName: selectedName_(emgBarangayEl)
  };
}

async function handleEmployeeSubmit(e) {
  e.preventDefault();
  const errEl = document.getElementById('employee-form-error');
  errEl.hidden = true;

  if (!validateEmployeeForm_()) {
    errEl.textContent = 'Please fix the highlighted fields before saving.';
    errEl.hidden = false;
    document.querySelector('#employee-form .invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const employeeId = document.getElementById('emp-id').value;
  const payload = buildEmployeePayload_();

  try {
    if (employeeId) {
      await API.call('updateEmployee', Object.assign({ employeeId }, payload));
    } else {
      await API.call('createEmployee', payload);
    }
    await loadEmployees();
    closePanel('employee-panel');
    Toast.success(employeeId ? 'Employee updated.' : 'Employee added.');
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  }
}
