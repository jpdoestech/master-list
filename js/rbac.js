// rbac.js
// Client-side permission helpers. These control what the UI SHOWS —
// the actual enforcement always happens again on the backend, since
// anyone can open devtools and ignore the frontend.

const ROLES = {
  SUPER_ADMIN: 'SuperAdmin',
  ADMIN: 'Admin',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
  COMMENTER: 'Commenter'
};

const ROLE_LABELS = {
  SuperAdmin: 'Super Admin',
  Admin: 'Admin',
  Editor: 'Editor / Manager',
  Viewer: 'Viewer',
  Commenter: 'Commenter'
};

const Can = {
  manageUsers(role) {
    return role === ROLES.SUPER_ADMIN;
  },
  manageBranchesClients(role) {
    return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
  },
  editEmployees(role) {
    return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EDITOR].indexOf(role) !== -1;
  },
  deleteEmployees(role) {
    return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EDITOR].indexOf(role) !== -1;
  },
  comment(role) {
    return [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.EDITOR, ROLES.COMMENTER].indexOf(role) !== -1;
  },
  viewAllBranches(role) {
    return role === ROLES.SUPER_ADMIN || role === ROLES.ADMIN;
  }
};

// A fixed color rotation so each branch reads consistently everywhere
// (sidebar tree, table chips, employee panel) without needing per-branch config.
const BRANCH_COLOR_ROTATION = ['#B8863A', '#2C6E68', '#5B6472', '#8A5A9E', '#3E6FA6', '#A6402F'];

function branchColor(branchId) {
  let hash = 0;
  const str = String(branchId);
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return BRANCH_COLOR_ROTATION[hash % BRANCH_COLOR_ROTATION.length];
}
