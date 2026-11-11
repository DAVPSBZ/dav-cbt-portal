# Step-by-step: host and publish the DAV CBT Phase - II portal on GitHub

This guide assumes **no previous GitHub or Google Apps Script experience**. Follow the parts in order.
Total time: about 30-40 minutes the first time.

**How the pieces fit together**

| Piece | Where it lives | What it does |
|-------|----------------|--------------|
| Website (what applicants see) | **GitHub Pages** (`docs/` folder) | Home screen, form, admin panel, scan desk, PDF report |
| Back end (saves and reads data) | **Google Apps Script** (`apps-script/Code.gs`) | Talks to the Sheet and Drive, enforces dates / PIN / logins |
| Data | **Google Sheet + Google Drive folder** | Applications, one tab per Subject, scans, photos, PCE certificates |

GitHub never stores applicant data - only the website files.

---

## Part 0 - What you need before you start

- [ ] A **Google account** (the one that owns the Drive folder `1oeMH8ABADc_V1jZvg9GBNjjTiW1LI1TP`).
- [ ] A **GitHub account** - free at <https://github.com/signup>.
- [ ] The file **`dav-cbt-portal.zip`** downloaded and **unzipped** (you get a folder `dav-cbt-portal`).
- [ ] A computer browser (Chrome / Edge / Firefox). No software installation is needed for Route A below.

---

## Part 1 - Set up the Google back end

### 1.1 Create the Google Sheet
1. Go to <https://sheets.google.com> and click **Blank spreadsheet**.
2. Name it, for example, **DAV CBT Phase II - Data**.
3. *(Recommended)* Start from the sample: upload `sample/DAV_Application_Sample_Sheet.xlsx` to Google Drive, double-click it,
   choose **File > Save as Google Sheets**, and use that new Sheet. It already has all setting tabs filled with samples.
4. Copy the **Sheet ID** from the address bar - it is the long text between `/d/` and `/edit`:
   `https://docs.google.com/spreadsheets/d/`**`1AbC...xyz`**`/edit`

### 1.2 Get the Drive folder ID (photos and PCE certificates go here)
1. In Google Drive open (or create) the folder where uploads should be stored.
2. The address looks like `https://drive.google.com/drive/folders/`**`1oeMH8ABADc_V1jZvg9GBNjjTiW1LI1TP`** - the last part is the **Folder ID**.
   (The code already contains the ID you gave me; change it only if you use another folder.)

### 1.3 Add the code to Apps Script
1. In the Sheet click **Extensions > Apps Script**. A new tab opens.
2. In the left list click **Code.gs**, select everything in the editor (Ctrl+A) and delete it.
3. Open `apps-script/Code.gs` from the unzipped folder in any text editor, copy all of it, paste it into the editor.
4. Near the top find these two lines and set them:
   ```js
   const FOLDER_ID      = '1oeMH8ABADc_V1jZvg9GBNjjTiW1LI1TP';   // Drive folder from 1.2
   const SPREADSHEET_ID = '';                                    // <- paste the Sheet ID from 1.1 between the quotes
   ```
5. Click the **+** next to *Files* > **HTML**, name it exactly **`Index`** (capital I, no `.html`), then replace its content with
   the content of `apps-script/Index.html`.
   *(Keep this file even when you use GitHub Pages - the script uses it when someone opens the Apps Script address directly.)*
6. Click the **Save** icon (or Ctrl+S).

### 1.4 Give permission (one time)
1. In the toolbar choose the function **`getConfigForClient`** in the drop-down and click **Run**.
2. Click **Review permissions**, pick your Google account.
3. If you see *"Google hasn't verified this app"*: click **Advanced** > **Go to (project name) (unsafe)** > **Allow**.
   (It is your own script, so this warning is expected.)
4. Run finishes in a few seconds. Go back to the Sheet: the tabs `Settings`, `InterviewPlaces`, `PostSubjects`, `Categories`,
   `Schools`, `Preferences`, `Admins` now exist (if you did not use the sample).

### 1.5 Publish the script as a web app
1. Click **Deploy > New deployment**.
2. Click the gear icon next to *Select type* and choose **Web app**.
3. Fill in:
   - **Description:** `v1`
   - **Execute as:** **Me (your email)**
   - **Who has access:** **Anyone**   *(not "Anyone with Google account" - the public website must be able to call it)*
4. Click **Deploy**, then **Authorize access** if asked.
5. **Copy the Web app URL** - it looks like `https://script.google.com/macros/s/AKfycb.../exec`. Keep it handy.
6. **Test it:** paste that URL into a browser tab and add `?api=ping` at the end. You must see something like
   `{"ok":true,"time":"..."}`. If you see a Google sign-in page instead, the access setting in step 3 is wrong.

> Google Workspace (school / company) accounts: an administrator may restrict "Anyone" access. If so, use a personal Gmail
> account for the script, or ask your administrator to allow it.

---

## Part 2 - Publish the website on GitHub

There are two routes. **Route A (browser only)** is easiest. Route B uses Git for people who already know it.

### Route A - Browser only (recommended for the first time)

#### 2.1 Create the repository
1. Sign in at <https://github.com>. Click the **+** (top right) > **New repository**.
2. **Repository name:** `dav-cbt-portal` (any name; it becomes part of your website address).
3. Choose **Public**. *(GitHub Pages on a free account needs a public repository. See Part 7 for what that means.)*
4. Leave "Add a README" **unticked**. Click **Create repository**.

#### 2.2 Upload the files
1. On the empty repository page click **uploading an existing file**.
2. Open the unzipped folder `dav-cbt-portal` on your computer. Select **everything inside it** (the folders
   `apps-script`, `docs`, `sample`, `tools`, the files `README.md`, `GITHUB_GUIDE.md`, `.gitignore`, ...) and **drag them into the
   browser window**.
   - Drag the *contents*, not the outer folder, so that `docs` ends up at the top level of the repository.
   - Hidden items such as `.github` and `.gitignore` may not show in Finder / Explorer. They are optional for this route - you
     can skip them. The site works without them.
3. Wait until all files show as uploaded. At the bottom write the message `Add portal files` and click **Commit changes**.
4. Check the repository page: you should see the folders `apps-script`, `docs`, `sample`, `tools`.

#### 2.3 Tell the website where your back end is
1. In the repository open **docs > config.js**.
2. Click the **pencil icon** (Edit this file).
3. Replace `PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE` with the Web app URL from step 1.5. The line must look like:
   ```js
   window.DAV_API_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
   ```
   Keep the single quotes and the semicolon.
4. Click **Commit changes...** > **Commit changes**.

#### 2.4 Turn on GitHub Pages
1. In the repository click **Settings** (top row of tabs).
2. In the left sidebar click **Pages**.
3. Under **Build and deployment** set **Source** to **Deploy from a branch**.
4. Under **Branch** choose **main** and the folder **/docs**, then click **Save**.
5. Wait 1-3 minutes and refresh the Pages screen. A green box appears:
   **"Your site is live at `https://<your-user>.github.io/dav-cbt-portal/`"**.
   (Progress is visible under the **Actions** tab as "pages build and deployment".)

#### 2.5 Open your site
Open `https://<your-user>.github.io/dav-cbt-portal/`. You should see the animated home screen with four buttons.
If you instead see an error message about the server address, go to Part 6.

### Route B - With Git (command line or GitHub Desktop)

```bash
cd dav-cbt-portal
git init
git add .
git commit -m "DAV CBT portal"
git branch -M main
git remote add origin https://github.com/<your-user>/dav-cbt-portal.git
git push -u origin main
```
GitHub Desktop: *File > Add local repository*, choose the folder, **Publish repository** (untick "Keep this code private").
Then do steps 2.3 (edit `docs/config.js`) and 2.4 (enable Pages) exactly as above.

### Optional - publish with GitHub Actions instead of the `/docs` branch
The file `.github/workflows/pages.yml` rebuilds `docs/index.html` from `apps-script/Index.html` on every push, then publishes it.
1. Make sure the `.github` folder is in the repository (Route B uploads it automatically; in Route A use *Add file > Create new
   file* and type the path `.github/workflows/pages.yml`, paste the file content, commit).
2. **Settings > Pages > Source: GitHub Actions**.
3. Open the **Actions** tab and check the run **"Deploy to GitHub Pages"** turns green.

---

## Part 3 - Test everything before real use

Open your site (on a phone too) and go through this list. **Use test data only.**

- [ ] Home screen appears; the **Apply** button shows a green **OPEN** chip.
- [ ] **Apply**: fill the form with test data, attach a small photo and a small PDF, submit. You get a *Form Number* like
      `DAVBR-DDMMYYHHMM-00001`.
- [ ] In the Google Sheet: the row appears in **Applications**, and a tab named after the chosen **Subject** appears with the same row.
- [ ] Drive folder: `<roll number>.jpg` and `<roll number>_PCE_CERTIFICATE.pdf` are there.
- [ ] **Print application** shows the 2-page report with the QR code and the Form Number in the *Form Control Number* box;
      **Print / Save as PDF** works.
- [ ] **Download Application** with Roll No + Date of Birth works (only after `PDF_DOWNLOAD_START`).
- [ ] **Edit Existing Data** loads the form, saves a change, and stops after 2 edits.
- [ ] **Admin login** (`.../?admin=1` or the Admin button) with an ID from the `Admins` tab: dashboard numbers, filters,
      export, PDF forms.
- [ ] **Scan test:** scan the QR code on the printed test form with a phone. Enter the PIN, choose Level / Location and Remark, Save.
      Scan again - the same row is updated in the `Scans` tab.
- [ ] **Scan results** (`.../?results=1`): log in with an Admins ID - the scans are listed (view only).
- [ ] **Date test:** set `FORM_STOP_DATE` to yesterday in the Settings tab - Apply and Edit show *Last Date Over - Please contact the
      Administrator*, while Download and Admin still work. Put the real date back afterwards.

Finally **delete the test rows** from `Applications`, the Subject tabs and `Scans` (keep row 1, the headers) and the test files from the Drive folder.

---

## Part 4 - Go-live checklist (Google Sheet)

- [ ] **Admins** tab: replace the sample IDs / passwords (`admin / ChangeMe@123`, `buxar / Buxar@123`). Use long passwords.
- [ ] **Settings** tab: set `SCAN_PIN` (sample is `1234`), `FORM_LIVE_DATE`, `FORM_STOP_DATE`, `PDF_DOWNLOAD_START`, `CBT_PREFIX`,
      `CBT_YEAR`, `AGE_CUTOFF`, `MIN_AGE`.
- [ ] **InterviewPlaces**, **PostSubjects**, **Categories**, **Preferences**: put your real lists.
- [ ] **Schools**: real School Code, School Name and the venue (Place of Interview) each school belongs to.
- [ ] Remove the sample rows from `Applications`, `Scans` and the sample `Physics` tab.
- [ ] Keep all cells in these tabs formatted as **Plain text** (Format > Number > Plain text) so `00123` keeps its zeros.
- [ ] Share the **Sheet** only with the people who must see applicant data.

Tip: keep a backup - **File > Make a copy** now and then, and use **File > Version history** if something is changed by mistake.

---

## Part 5 - Updating later

**Change the website design/text** (`apps-script/Index.html`)
- *Branch route:* run `python tools/build_static.py` on your computer, then upload the new `docs/index.html` (and the changed
  `apps-script/Index.html`) to GitHub (*Add file > Upload files*, or Git push). Wait 1-2 minutes.
- *Actions route:* just upload / push `apps-script/Index.html`; the workflow rebuilds `docs/index.html`.

**Change the back end** (`apps-script/Code.gs`)
1. Paste the new code into the Apps Script editor and save.
2. **Deploy > Manage deployments > pencil icon > Version: New version > Deploy.**
   The web app URL stays the same, so `docs/config.js` does not change.

**Change only settings, lists, passwords, dates, PIN:** edit the Google Sheet tabs - nothing needs to be redeployed.

**Edit a file directly on GitHub:** open the file > pencil icon > change > *Commit changes*. Use *Delete* (trash icon) and
re-upload if you need to replace a file.

---

## Part 6 - Troubleshooting

| What you see | Likely cause | What to do |
|--------------|--------------|------------|
| GitHub Pages address shows **404** | Pages not enabled yet, or wrong folder | Settings > Pages: Source *Deploy from a branch*, branch `main`, folder **/docs**. Wait 2-3 minutes. Make sure `docs/index.html` exists |
| Page loads but says *"The server address is not set"* | `docs/config.js` still has the placeholder | Part 2.3 |
| *"Could not reach the server..."* | Wrong URL, or the web app is not public | URL must end with `/exec`; redeploy with *Execute as: Me* and *Who has access: Anyone*; test `?api=ping` |
| `?api=ping` shows a Google login page | Access is not "Anyone" | Deploy > Manage deployments > edit > Who has access: Anyone |
| `?api=ping` shows *"Authorization required"* | Permissions not granted | Part 1.4 (Run `getConfigForClient` and Allow) |
| Code changes do not take effect | Old deployment version still active | Deploy > Manage deployments > pencil > **New version** |
| *"Could not load form settings: Invalid date in Settings..."* | A date in the Settings tab is not `dd/mm/yyyy` | Fix the date; keep the cell as Plain text |
| Admin login says *"Invalid Admin ID or Password"* | Typo, or cells auto-formatted | Re-type in the `Admins` tab (Plain text); 5 wrong tries lock that ID for 10 minutes |
| Scan page says *"Wrong PIN"* | `SCAN_PIN` differs | Check the `Settings` tab; 5 wrong tries lock the PIN for 10 minutes |
| Old design after an update | Browser cache | Hard refresh: Ctrl+F5 (phone: clear site data or open in a private tab) |
| Photo / PDF not saved | Drive folder not accessible by the script owner | Open the folder with the same Google account that owns the script; check `FOLDER_ID` |
| *"Service invoked too many times"* / slow on the last day | Google daily limits / many people at once | Spread announcements over time; test with several phones beforehand |

---

## Part 7 - Good to know

- **Public repository:** the website files and the back-end address (`config.js`) are visible to everyone. That is normal for a static
  site. Applicant data is **not** in GitHub, and every sensitive action needs a login, the PIN or Roll No + Date of Birth.
- **Never** put passwords, API keys, `.clasp.json` or `.clasprc.json` into the repository.
- **Private repository:** GitHub Pages from a private repo needs a paid GitHub plan. The portal works the same.
- **Custom address (optional):** Settings > Pages > *Custom domain*, add the domain, create the DNS record GitHub shows
  (a `CNAME` pointing to `<your-user>.github.io`), wait for the check, then tick **Enforce HTTPS**. Update nothing else - the QR
  codes automatically use the address from which the form was opened.
- **QR codes** printed on forms contain the website address. If you later change the address (new repository name or domain), forms
  printed earlier will still point to the old address, so keep the old site online or redirect it.
- **Cost:** GitHub Pages and Google Apps Script are free for this use (subject to Google's daily quotas).
