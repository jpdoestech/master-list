# HRIS Master List — Setup Guide

A web-based employee master list for a multi-branch organization, with
Google Sheets as the data store, Google Apps Script as the API/backend, and
a static frontend deployable to GitHub Pages. Five roles: Super Admin,
Admin, Editor (Manager), Viewer, Commenter — each scoped to the branches
they're assigned to.

This follows the same split-architecture pattern as the client intake form
project: **GitHub Pages hosts only static files** (no Google branding, no
server), and **Apps Script is redeployed as a JSON API**, not an HTML app.

---

## 1. Create the Google Sheet (your database)

Create a new, blank Google Sheet — that's it, no manual tabs or headers
needed, `Setup.gs` (below) creates them for you.

Copy the Spreadsheet ID from the URL — the long string between `/d/` and
`/edit`:
```
https://docs.google.com/spreadsheets/d/  THIS_PART  /edit
```

---

## 2. Set up the Apps Script backend

1. In your Sheet, go to **Extensions → Apps Script**.
2. Delete the default `Code.gs` content.
3. Create the following files in the Apps Script editor (matching names) and
   paste in the contents from this project's `backend/` folder:
   - `Config.gs`
   - `Utils.gs`
   - `Auth.gs`
   - `Branches.gs`
   - `Clients.gs`
   - `Employees.gs`
   - `Users.gs`
   - `Comments.gs`
   - `Code.gs`
   - `Setup.gs`
   - `SeedAdmin.gs`
4. In `Config.gs`, paste your **Spreadsheet ID** into `SPREADSHEET_ID`.
5. Run `setupSheets` once (select it from the function dropdown at the top,
   click **Run**). The first time, Google will ask you to authorize the
   script — approve it. This creates all six tabs (`Branches`, `Clients`,
   `Employees`, `Users`, `Comments`, `AuditLog`) with the correct header
   rows, bolded and frozen, and removes the blank default "Sheet1" tab.
   Check the **Execution log** to confirm which tabs were created.
   - Safe to re-run: it skips any tab that already has data, so running it
     again later (e.g. after adding a column) won't erase anything.
6. In `SeedAdmin.gs`, set your real email and a temporary password.
7. Run `seedFirstSuperAdmin` once the same way. Check the **Execution log**
   to confirm "Super Admin created".
8. **Clear the password out of `SeedAdmin.gs`** afterward (or delete the
   file) so it isn't sitting in plain text.

### Deploy as a web app

1. Click **Deploy → New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** (this is safe — our own login/token system,
   not Apps Script's access setting, is what actually gates access to data).
5. Click **Deploy**, authorize again if asked.
6. Copy the **Web app URL** (ends in `/exec`).

Every time you edit the backend code afterward, you'll need **Deploy →
Manage deployments → Edit → New version** for changes to take effect.

---

## 3. Configure and deploy the frontend

1. In `js/config.js`, paste your Web app URL into `API_URL`.
2. Push this project to a new GitHub repo (e.g. `hris-master-list`).
3. In the repo settings, enable **GitHub Pages** (Settings → Pages → Deploy
   from branch → `main` → `/root`).
4. Your app will be live at `https://yourusername.github.io/hris-master-list/`.
5. Log in with the Super Admin account you seeded in step 2.

---

## 4. Add your organization's structure

Once logged in as Super Admin:
1. Use **+ Add branch** in the sidebar to create your branches.
2. Add clients under each branch (via the same sidebar controls, once a
   branch exists — the "Add client" flow uses the same modal).
3. Go to **Users** (top-right nav) to create accounts for your team:
   pick a role, and assign the branch(es) each person should have access
   to (or check "full access to all branches" for Admins).
4. Start adding employees under the correct branch/client from the
   dashboard.

---

## How roles work

| Role | Can do |
|---|---|
| **Super Admin** | Everything, including managing users/roles and branch assignments. Always sees all branches. |
| **Admin** | Full employee CRUD, branch/client management, always sees all branches. Cannot manage users. |
| **Editor (Manager)** | Full employee CRUD, but only within their assigned branches/clients. |
| **Viewer** | Read-only, only within their assigned branches/clients. |
| **Commenter** | Read-only, plus can leave comments on employee records, only within their assigned branches/clients. |

The scoping is enforced **in the Apps Script backend**, not just hidden in
the UI — every request re-checks the logged-in user's assigned branches
before returning or modifying any record.

---

## Known limitations (be aware of these)

- **Apps Script concurrency cap**: ~30 simultaneous executions when running
  as "Execute as: Me." Comfortable for a small team; something to watch if
  usage grows significantly.
- **No true database transactions**: writes use `LockService` to avoid
  collisions, but Sheets is not built for high-concurrency writes.
- **Password hashing** uses salted SHA-256 via Apps Script's built-in
  `Utilities.computeDigest` — reasonable for an internal tool, not a
  substitute for a dedicated identity provider if this ever needs to scale
  or handle more sensitive data.
- **Session storage**: the login token is kept in the browser's
  `sessionStorage` (cleared when the tab closes) rather than a permanent
  cookie, trading a little convenience for reduced exposure.
- **Sensitive data**: this stores TIN/SSS numbers and personal info in a
  Google Sheet, which is not an enterprise-grade encrypted database. Treat
  sharing/access permissions on the underlying Sheet itself with the same
  care as the app's own login system.
