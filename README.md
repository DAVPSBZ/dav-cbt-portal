# DAV CBT Phase - II (Demo / Interview) - Application Portal

Online application form, admin dashboard, QR scan desk and PDF report for D.A.V. Public Schools, Bihar Zone.

```
 Browser (phone / PC)
      |  opens
      v
 GitHub Pages  ->  docs/index.html            (the whole user interface - static files)
      |  POST (JSON)
      v
 Google Apps Script web app  ->  apps-script/Code.gs      (the back end)
      |
      +--> Google Sheet   (settings, applications, one tab per Subject, scans)
      +--> Google Drive   (photo + PCE certificate)
```

GitHub Pages can only serve static files, so the **data stays in your Google Sheet / Drive** and the Apps Script
acts as a small private API. The page in `docs/` is generated from `apps-script/Index.html`, so there is only one
source of truth for the user interface.

---

## 1. Set up the back end (Google, ~10 minutes)

1. Create a new **Google Sheet** and copy its ID (the long text between `/d/` and `/edit` in the address bar).
   *Optional:* upload `sample/DAV_Application_Sample_Sheet.xlsx` to Drive, open it with Google Sheets and use that sheet
   instead - it already contains every settings tab with sample data.
2. In the sheet open **Extensions > Apps Script**.
3. Paste `apps-script/Code.gs` into `Code.gs`, then **+ > HTML** and create a file named exactly `Index`; paste
   `apps-script/Index.html` into it. (Keep both files - the same script can also serve the form directly.)
4. At the top of `Code.gs` set `SPREADSHEET_ID` (step 1) and check `FOLDER_ID` (the Drive folder for photos/certificates).
5. **Deploy > New deployment > Web app** - *Execute as:* **Me**, *Who has access:* **Anyone** - then **Deploy** and
   accept the permission prompts. Copy the **Web app URL** (ends with `/exec`).
6. Test it: open `<web app URL>?api=ping` in a browser. You should see `{"ok":true,...}`.

On first use the script creates these tabs automatically (edit them any time):
`Settings`, `InterviewPlaces`, `PostSubjects`, `Categories`, `Schools`, `Preferences`, `Admins`,
`Applications`, `Scans` and one tab per Subject.

## 2. Put the front end on GitHub

```bash
git init
git add .
git commit -m "DAV CBT portal"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

1. Open `docs/config.js` and replace the placeholder with your web app URL from step 1.5:
   ```js
   window.DAV_API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
   Commit and push.
2. On GitHub: **Settings > Pages > Build and deployment > Source = Deploy from a branch**, branch `main`, folder **/docs** > Save.
   *Optional alternative:* Source = **GitHub Actions** - the workflow in `.github/workflows/pages.yml` then rebuilds
   `docs/index.html` from `apps-script/Index.html` on every push and publishes `docs/`.
3. After 1-3 minutes the site is live at `https://<your-user>.github.io/<your-repo>/`.

> **First time with GitHub or Apps Script?** Follow **[GITHUB_GUIDE.md](GITHUB_GUIDE.md)** - a click-by-click guide with a
> browser-only upload route, a test checklist, a go-live checklist and troubleshooting.

| Page | Address |
|------|---------|
| Home (Apply / Edit / Download / Admin) | `https://<user>.github.io/<repo>/` |
| Admin panel | `.../?admin=1` |
| Scan results (view only) | `.../?results=1` |
| Scan desk (what the QR code opens) | `.../?scan=<ApplicationID>` |

The QR code printed on every application form automatically points to the address the form was opened from.

## 3. Day-to-day settings (the `Settings` tab)

| Key | Meaning |
|-----|---------|
| `CBT_PREFIX`, `CBT_YEAR` | printed roll number prefix and year |
| `AGE_CUTOFF`, `MIN_AGE` | age is calculated as on this date; minimum age |
| `FORM_LIVE_DATE` | form accepts responses from this date (blank = already live) |
| `FORM_STOP_DATE` | last date, inclusive. Afterwards new responses **and edits** show *Last Date Over - please contact the Administrator* |
| `PDF_DOWNLOAD_START` | applicants can download / print their form only from this date. Admin tools are never blocked |
| `SCAN_PIN` | PIN staff enter on the scan desk. **Change the sample PIN** |

Dates: `dd/mm/yyyy` or `dd/mm/yyyy HH:mm` (Indian time). Keep the cells formatted as *Plain text*.

* **Admins tab** - `Admin ID | Password | Name | Allowed Places` (`;` separated, `*` = all venues). Passwords may be plain text or a
  SHA-256 hex hash. **Change the sample passwords.**
* **Subject tabs** - every application is also written to a tab named after its Subject, and moves tabs if the applicant
  edits the Subject. For data collected earlier run `rebuildSubjectTabs` once (Apps Script editor > Run, or the sheet
  menu **DAV Tools > Rebuild subject tabs**).

## 4. Updating the project

* **Back end:** change `apps-script/Code.gs` (and `Index.html`), paste into the Apps Script editor, then
  **Deploy > Manage deployments > pencil icon > Version: New version > Deploy**. The `/exec` URL stays the same.
  (With [clasp](https://github.com/google/clasp) copy `.clasp.json.example` to `.clasp.json`, set your script ID and run `clasp push`.)
* **Front end:** edit `apps-script/Index.html`, then either push (the workflow rebuilds `docs/index.html`) or run
  `python tools/build_static.py` locally and commit `docs/index.html`.
* **Try it locally:** `python tools/build_static.py && python -m http.server -d docs 8000`, then open <http://localhost:8000>.

## 5. Security notes

* The web app address is visible in `docs/config.js`. That is normal for a static site: every action is still protected by
  the Roll No + DOB check, the admin login (ID + password from the `Admins` tab) or the scan PIN, and only a fixed list of
  functions can be called (see `doPost` in `Code.gs`).
* Never commit Google credentials, `.clasp.json` or `.clasprc.json` (they are in `.gitignore`).
* Use strong admin passwords / a hashed password and change `SCAN_PIN` before going live.
* Applicants' personal data lives only in your Google Sheet and Drive folder - not in this repository.

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| "The server address is not set" | edit `docs/config.js` (step 2.1) |
| "Could not reach the server..." | re-deploy the web app with *Execute as: Me* and *Who has access: Anyone*; check the URL ends with `/exec` |
| Changes in `Code.gs` have no effect | create a **New version** of the deployment (section 4) |
| "Authorization required" the first time | open the web app URL once in your browser and accept the permissions |
| Page shows old design after a push | hard refresh (Ctrl+F5) - GitHub Pages caches for a few minutes |
| Roll numbers lose their leading zero | keep the sheet cells formatted as *Plain text* (the script writes text) |

## Repository layout

```
GITHUB_GUIDE.md       detailed step-by-step hosting guide (start here)
apps-script/          Code.gs, Index.html, appsscript.json   (paste / clasp-push into Google Apps Script)
docs/                 index.html (generated), config.js, .nojekyll   (published by GitHub Pages)
tools/build_static.py generates docs/index.html from apps-script/Index.html
sample/               DAV_Application_Sample_Sheet.xlsx   (settings + sample data)
.github/workflows/    pages.yml   (build + deploy to GitHub Pages)
```
