/**
 * D.A.V. PUBLIC SCHOOLS, BIHAR ZONE - Application Form & Bio-Data   (Code.gs)  v4
 *
 * SETUP
 * 1. Create a Google Sheet, copy its ID from the URL and paste it in SPREADSHEET_ID below.
 *    Open Extensions > Apps Script from that sheet, paste this file as Code.gs and add an HTML
 *    file named  Index  (paste Index.html).
 * 2. Deploy > New deployment > Web app > Execute as: Me | Who has access: Anyone.
 * 3. On first open the script creates these editable tabs (sample data) in the sheet:
 *      Settings         CBT_PREFIX, CBT_YEAR, AGE_CUTOFF (dd/mm/yyyy), MIN_AGE
 *      InterviewPlaces  list for "A. Place of Interview"
 *      PostSubjects     Post | Subject pairs (dependent dropdowns)
 *      Categories       list for "4. Category"
 *      Schools          School Code | School Name | Place of Interview (venue)
 *      Preferences      list for "12. Place / Bihar Zone of Preference"
 *      Admins           Admin ID | Password | Name | Allowed Places  (";" separated, * = all places)
 *                       Password may be plain text or a SHA-256 hex hash.
 *    Applications are stored in the tab "Applications" (one value per cell). Missing columns are
 *    added automatically at the right-hand end, so older sheets keep working.
 * 4. Admin panel: open the web app URL with  ?admin=1  (or use the "Admin Login" button on the form).
 * 5. QR code: every printed application form carries a QR code that opens  <web app URL>?scan=<ApplicationID>.
 *    Staff log in with an ID from the Admins tab, choose Level / Location + Remark and save; the result is
 *    stored in the tab "Scans" (one row per Roll Number + Level / Location, updated on a repeat scan).
 * 6a. Scan PIN: staff open the scan page, type the PIN stored in Settings (SCAN_PIN) and can then scan / save.
 *    Scan results (view only) are opened with an ID + password from the Admins tab (?results=1, scan page link, or Admin panel).
 * 7. Form dates (Settings tab, dd/mm/yyyy or dd/mm/yyyy HH:mm, Indian time):
 *      FORM_LIVE_DATE      form accepts responses from this date (blank = already live)
 *      FORM_STOP_DATE      last date (inclusive); afterwards new responses AND edits are refused with a
 *                          "Last date over - please contact Administrator" message
 *      PDF_DOWNLOAD_START  applicants can download / print their form only from this date (blank = always)
 *    Admin panel, exports, PDF forms and scan results are never blocked by these dates.
 * 8. One tab per Subject: every application is also written to a tab named after its Subject (same columns as
 *    "Applications"), kept in sync when the applicant edits. For old data run  rebuildSubjectTabs  once
 *    (Apps Script editor > Run, or the sheet menu "DAV Tools").
 * 9. GitHub Pages: the same form can be hosted as a static page (see the repo README). The page talks to this script
 *    through doPost (JSON API); only the functions listed in doPost can be called from outside.
 * 6. Form Number (printed in the "Form Control Number" box): DAVBR-DDMMYYHHMM-NNNNN = submission date/time + 5-digit
 *    record number, generated on submit and kept when the form is edited (column "formNumber").
 */

const FOLDER_ID      = '1oeMH8ABADc_V1jZvg9GBNjjTiW1LI1TP';  // Drive folder: photo + PCE certificate
const SHEET_NAME     = 'Applications';
const SPREADSHEET_ID = '';                                    // paste Sheet ID here
const MAX_PDF_BYTES  = 5 * 1024 * 1024;
const MAX_EDITS      = 2;                                     // applicant may edit a submitted form at most 2 times
const ADMIN_SESSION_SECS = 6 * 60 * 60;                       // admin login lasts 6 hours (max for CacheService)
const SCAN_SHEET   = 'Scans';
const SCAN_LEVELS  = ['Registration', 'Subject / Demo Board', 'Chairman Board'];
const SCAN_REMARKS = ['Next Level / Forwarded', 'Rejected'];  // remark is not asked / stored for 'Chairman Board'
const SCAN_HEAD    = ['Roll Number', 'Mobile', 'Name', 'Subject', 'Post', 'Level / Location', 'Remark', 'Scanned @'];

/* ================= Web app entry ================= */
function doGet(e) {
  if (e && e.parameter && e.parameter.api === 'ping')
    return ContentService.createTextOutput(JSON.stringify({ ok: true, time: now_() })).setMimeType(ContentService.MimeType.JSON);
  const t = HtmlService.createTemplateFromFile('Index');
  let cfg, boot = null;
  try { cfg = getFormConfig_(); } catch (err) { cfg = { error: String(err) }; }
  if (e && e.parameter && e.parameter.id) {              // ?id=XXXX -> print view of a saved application
    try { boot = getApplicationById(e.parameter.id); } catch (err) { boot = { error: String(err) }; }
  }
  t.cfg  = JSON.stringify(cfg).replace(/</g, '\\u003c');
  t.boot = JSON.stringify(boot).replace(/</g, '\\u003c');
  t.appUrl = JSON.stringify(ScriptApp.getService().getUrl() || '');
  t.mode = JSON.stringify(e && e.parameter && e.parameter.results ? 'results' : (e && e.parameter && e.parameter.admin ? 'admin' : ''));
  t.scanId = JSON.stringify(e && e.parameter && e.parameter.scan ? String(e.parameter.scan) : '');
  return t.evaluate()
    .setTitle('DAV Public Schools Bihar Zone - Application Form')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ================= JSON API (used when the form is hosted on GitHub Pages) ================= */
function getConfigForClient() {
  try { return getFormConfig_(); } catch (err) { return { error: String(err && err.message || err) }; }
}
function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    const api = {
      getConfigForClient: getConfigForClient, getApplicationById: getApplicationById,
      submitApplication: submitApplication, checkRoll: checkRoll, getForEdit: getForEdit, updateApplication: updateApplication, getForPrint: getForPrint,
      adminLogin: adminLogin, adminLogout: adminLogout, adminList: adminList, adminRows: adminRows, adminForms: adminForms, adminFiles: adminFiles,
      scanUnlock: scanUnlock, scanLookup: scanLookup, scanSave: scanSave, scanResults: scanResults
    };
    const fn = Object.prototype.hasOwnProperty.call(api, req.fn) ? api[req.fn] : null;
    if (!fn) throw new Error('Unknown function: ' + req.fn);
    out = { ok: true, result: fn.apply(null, req.args || []) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ================= Spreadsheet helpers ================= */
function getSS_() {
  const props = PropertiesService.getScriptProperties();
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  if (props.getProperty('SS_ID')) return SpreadsheetApp.openById(props.getProperty('SS_ID'));
  const ss = SpreadsheetApp.create('DAV Bihar Zone - Applications');
  props.setProperty('SS_ID', ss.getId());
  return ss;
}

function setupSheets_(ss) {
  const buxar = 'DAV Public School, Lalganj, Itarhi Road Buxar';
  const defs = {
    Settings: [['Key', 'Value'], ['CBT_PREFIX', 'DAVCBT/DEC26/'], ['CBT_YEAR', '2026'], ['AGE_CUTOFF', '31/03/2026'], ['MIN_AGE', '18'],
      ['FORM_LIVE_DATE', '01/10/2026'], ['FORM_STOP_DATE', '31/12/2026'], ['PDF_DOWNLOAD_START', '01/10/2026'], ['SCAN_PIN', '1234']],
    InterviewPlaces: [['Place of Interview'], [buxar]],
    PostSubjects: [['Post', 'Subject'],
      ['PGT', 'English'], ['PGT', 'Hindi'], ['PGT', 'Physics'], ['PGT', 'Chemistry'], ['PGT', 'Mathematics'], ['PGT', 'Biology'], ['PGT', 'Computer Science'],
      ['TGT', 'English'], ['TGT', 'Hindi'], ['TGT', 'Sanskrit'], ['TGT', 'Mathematics'], ['TGT', 'Science'], ['TGT', 'Social Science'],
      ['PRT', 'All Subjects'], ['PRT', 'Music'], ['PRT', 'Art & Craft']],
    Categories: [['Category'], ['General'], ['EWS'], ['BC'], ['EBC'], ['SC'], ['ST']],
    Schools: [['School Code', 'School Name', 'Place of Interview'],
      ['BR-001', 'Sample School One (edit this list)', buxar], ['BR-002', 'Sample School Two (edit this list)', buxar],
      ['BR-003', 'Sample School Three (edit this list)', buxar], ['BR-008', 'Sample School Eight (edit this list)', buxar],
      ['BR-012', 'Sample School Twelve (edit this list)', buxar]],
    Preferences: [['Place / Bihar Zone'], ['Buxar'], ['Patna'], ['Gaya'], ['Muzaffarpur']],
    Admins: [['Admin ID', 'Password', 'Name', 'Allowed Places'],
      ['admin', 'ChangeMe@123', 'Super Admin', '*'], ['buxar', 'Buxar@123', 'Buxar Coordinator', buxar]]
  };
  Object.keys(defs).forEach(name => {
    if (ss.getSheetByName(name)) return;
    const sh = ss.insertSheet(name), v = defs[name];
    sh.getRange(1, 1, 300, v[0].length).setNumberFormat('@');
    sh.getRange(1, 1, v.length, v[0].length).setValues(v);
    sh.getRange(1, 1, 1, v[0].length).setFontWeight('bold').setBackground('#fff3cd');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, v[0].length, 240);
  });
}

function list_(ss, name, cols) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const w = Math.min(cols, Math.max(sh.getLastColumn(), 1));
  return sh.getRange(2, 1, sh.getLastRow() - 1, w).getDisplayValues()
    .map(r => { const o = r.map(x => String(x).trim()); while (o.length < cols) o.push(''); return o; })
    .filter(r => r[0] !== '');
}

/* settings added in later versions are appended to an existing Settings tab (blank dates = no restriction) */
function ensureSettingKeys_(ss) {
  const sh = ss.getSheetByName('Settings');
  if (!sh) return;
  const have = {};
  list_(ss, 'Settings', 2).forEach(r => have[r[0]] = true);
  const add = [['FORM_LIVE_DATE', ''], ['FORM_STOP_DATE', ''], ['PDF_DOWNLOAD_START', ''], ['SCAN_PIN', '1234']].filter(r => !have[r[0]]);
  if (!add.length) return;
  const r = Math.max(sh.getLastRow(), 1) + 1;
  const rg = sh.getRange(r, 1, add.length, 2);
  rg.setNumberFormat('@'); rg.setValues(add);
}
function settingsMap_() {
  const ss = getSS_();
  setupSheets_(ss); ensureSettingKeys_(ss);
  const set = {};
  list_(ss, 'Settings', 2).forEach(r => set[r[0]] = r[1]);
  return set;
}

/* "31/12/2026" or "31/12/2026 18:30" (Indian time). Date only: start = 00:00, end ("last date") = 23:59:59 */
function parseWhen_(s, endOfDay) {
  s = String(s || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!m) throw new Error('Invalid date in Settings: "' + s + '" (use dd/mm/yyyy or dd/mm/yyyy HH:mm)');
  const p2 = n => ('0' + n).slice(-2);
  let hh = endOfDay ? 23 : 0, mi = endOfDay ? 59 : 0, ss = endOfDay ? 59 : 0;
  if (m[4] !== undefined) {
    hh = Number(m[4]); mi = Number(m[5]); ss = Number(m[6] || 0);
    if (m[7]) { const pm = /pm/i.test(m[7]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
  }
  const ms = new Date(m[3] + '-' + p2(m[2]) + '-' + p2(m[1]) + 'T' + p2(hh) + ':' + p2(mi) + ':' + p2(ss) + '+05:30').getTime();
  if (isNaN(ms)) throw new Error('Invalid date in Settings: "' + s + '"');
  return { ms: ms, hasTime: m[4] !== undefined };
}
function fmtWhen_(w) {
  return Utilities.formatDate(new Date(w.ms), 'Asia/Kolkata', w.hasTime ? 'dd-MMM-yyyy, hh:mm a' : 'dd-MMM-yyyy');
}
function formStatus_(set) {
  const live = parseWhen_(set.FORM_LIVE_DATE, false), stop = parseWhen_(set.FORM_STOP_DATE, true), pdf = parseWhen_(set.PDF_DOWNLOAD_START, false);
  const now = Date.now();
  let state = 'open';
  if (live && now < live.ms) state = 'notyet';
  else if (stop && now > stop.ms) state = 'closed';
  return { state: state, liveText: live ? fmtWhen_(live) : '', stopText: stop ? fmtWhen_(stop) : '',
           pdfOpen: !pdf || now >= pdf.ms, pdfText: pdf ? fmtWhen_(pdf) : '' };
}
/* new responses AND edits only while the form is live */
function assertFormOpen_() {
  const st = formStatus_(settingsMap_());
  if (st.state === 'closed') throw new Error('Last date over. Please contact the Administrator.');
  if (st.state === 'notyet') throw new Error('The application form is not open yet. It opens on ' + st.liveText + '.');
}
/* applicant PDF download / print only from PDF_DOWNLOAD_START (admin functions never call this) */
function assertPdfOpen_() {
  const st = formStatus_(settingsMap_());
  if (!st.pdfOpen) throw new Error('PDF download has not started yet. It will be available from ' + st.pdfText + '.');
}

function toISO_(s) {
  s = String(s).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  throw new Error('AGE_CUTOFF in Settings must look like 31/03/2026 (found: ' + s + ')');
}
function isoToDMY_(iso, sep) { const p = iso.split('-'); return p[2] + sep + p[1] + sep + p[0]; }
function norm_(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

function getFormConfig_() {
  const ss = getSS_();
  setupSheets_(ss);
  ensureSettingKeys_(ss);
  const set = {};
  list_(ss, 'Settings', 2).forEach(r => set[r[0]] = r[1]);
  const subjects = {}, posts = [];
  list_(ss, 'PostSubjects', 2).forEach(r => {
    if (!subjects[r[0]]) { subjects[r[0]] = []; posts.push(r[0]); }
    if (r[1] && subjects[r[0]].indexOf(r[1]) < 0) subjects[r[0]].push(r[1]);
  });
  return {
    prefix: set.CBT_PREFIX || 'DAVCBT/DEC26/',
    year: set.CBT_YEAR || '2026',
    ageCutoff: toISO_(set.AGE_CUTOFF || '31/03/2026'),
    minAge: Number(set.MIN_AGE || 18),
    places: list_(ss, 'InterviewPlaces', 1).map(r => r[0]),
    posts: posts,
    subjects: subjects,
    categories: list_(ss, 'Categories', 1).map(r => r[0]),
    schools: list_(ss, 'Schools', 3).map(r => ({ code: r[0], name: r[1], venue: r[2] })),
    prefs: list_(ss, 'Preferences', 1).map(r => r[0]),
    status: formStatus_(set)
  };
}

/* ================= Column definition: one value per cell ================= */
function fieldKeys_() {
  const k = ['interviewDate', 'place', 'post', 'subject', 'cbtPrefix', 'cbtRoll', 'cbtYear',
             'name', 'fatherName', 'motherName', 'dob', 'ageAsOn', 'ageY', 'ageM', 'ageD', 'gender',
             'maritalStatus', 'spouseName', 'category', 'workingDAV', 'davSchoolCode', 'davSchoolName',
             'postalAddress', 'postalPin', 'permAddress', 'permPin', 'phone', 'whatsapp', 'email', 'expYears'];
  for (let i = 1; i <= 4; i++) ['institution', 'post', 'from', 'to', 'class', 'subject', 'salary'].forEach(f => k.push('exp' + i + '_' + f));
  for (let i = 1; i <= 6; i++) ['course', 'certNo', 'division', 'percent', 'year', 'medium', 'university', 'subjects', 'distance'].forEach(f => k.push('q' + i + '_' + f));
  for (let i = 1; i <= 3; i++) ['type', 'org', 'paper', 'validClass', 'year', 'subject', 'marks', 'percent'].forEach(f => k.push('tet' + i + '_' + f));
  k.push('minSalary', 'publication');
  for (let i = 1; i <= 3; i++) ['game', 'level', 'remark'].forEach(f => k.push('game' + i + '_' + f));
  k.push('coCurricular', 'pref1', 'pref2', 'pref3', 'anywhereBihar', 'joiningTime',
         'ref1Name', 'ref1Prof', 'ref1Addr', 'ref2Name', 'ref2Prof', 'ref2Addr',
         'declaration', 'declDate', 'declPlace', 'declName');
  return k;
}
function headers_() {
  return ['Timestamp', 'ApplicationID'].concat(fieldKeys_(), ['photoUrl', 'photoFileId', 'certUrl', 'certFileId', 'editCount', 'lastEdited', 'formNumber']);
}

/* Applications sheet: header-driven (columns are looked up by name, missing ones are appended) */
function getSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sh);
  return sh;
}
function ensureHeaders_(sh) {
  const want = headers_();
  const lc = sh.getLastColumn();
  const have = lc ? sh.getRange(1, 1, 1, lc).getValues()[0].map(String) : [];
  const missing = want.filter(h => have.indexOf(h) < 0);
  if (!missing.length) return;
  sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#e8eaf6');
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, have.length + 1, rows, missing.length).setNumberFormat('@');   // text: keeps 0123, dd/mm/yyyy, phones
  sh.setFrozenRows(1);
  if (missing.indexOf('formNumber') >= 0 && have.length) backfillFormNumbers_(sh);
}

/* ---- Form Number: DAVBR-DDMMYYHHMM-NNNNN  (submission date/time + 5-digit record number) ---- */
function pad5_(n) { return ('00000' + n).slice(-5); }
function formStamp_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'ddMMyyHHmm'); }
function nextFormNumber_(sh) {
  const all = readAll_(sh).rows;
  let max = all.length;                                          // at least the number of records so far
  all.forEach(r => { const m = /-(\d{5})$/.exec(String(r.formNumber || '')); if (m) max = Math.max(max, Number(m[1])); });
  return 'DAVBR-' + formStamp_() + '-' + pad5_(max + 1);
}
/* older applications (no Form Number yet): build one from their Timestamp and row order */
function backfillFormNumbers_(sh) {
  const head = headOf_(sh), fc = head.indexOf('formNumber') + 1, tc = head.indexOf('Timestamp') + 1, n = sh.getLastRow() - 1;
  if (n < 1 || fc < 1 || tc < 1) return;
  const ts = sh.getRange(2, tc, n, 1).getDisplayValues(), cur = sh.getRange(2, fc, n, 1).getDisplayValues();
  const out = ts.map((t, i) => {
    if (String(cur[i][0]).trim()) return [cur[i][0]];
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(t[0]));
    return ['DAVBR-' + (m ? m[3] + m[2] + m[1].slice(2) + m[4] + m[5] : '0000000000') + '-' + pad5_(i + 1)];
  });
  const rg = sh.getRange(2, fc, n, 1); rg.setNumberFormat('@'); rg.setValues(out);
}
function headOf_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }

/* write one record (object keyed by header name) as TEXT, never as numbers/dates */
function appendRecord_(sh, rec) {
  const head = headOf_(sh);
  const row = head.map(h => rec.hasOwnProperty(h) && rec[h] !== null && rec[h] !== undefined ? String(rec[h]) : '');
  const r = sh.getLastRow() + 1;
  if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
  const rg = sh.getRange(r, 1, 1, row.length);
  rg.setNumberFormat('@');
  rg.setValues([row]);
}
function readAll_(sh) {                       // -> { head, rows:[objects with _row] }
  const head = headOf_(sh), n = sh.getLastRow() - 1;
  if (n < 1) return { head: head, rows: [] };
  const vals = sh.getRange(2, 1, n, head.length).getDisplayValues();
  const rows = vals.map((r, i) => { const o = { _row: i + 2 }; head.forEach((h, j) => o[h] = r[j]); return o; });
  return { head: head, rows: rows };
}
/* ================= One tab per Subject ================= */
const RESERVED_TABS = ['Settings', 'InterviewPlaces', 'PostSubjects', 'Categories', 'Schools', 'Preferences', 'Admins', 'Scans'];
function subjectTabName_(subject) {
  let n = String(subject || '').replace(/[\[\]\*\/\\\?:]/g, '-').replace(/\s+/g, ' ').trim().substring(0, 90) || 'No Subject';
  if (RESERVED_TABS.indexOf(n) >= 0 || n === SHEET_NAME) n += ' (Subject)';
  return n;
}
function subjectSheet_(subject) {
  const ss = getSS_(), name = subjectTabName_(subject);
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh);                                   // same columns as "Applications"
  return sh;
}
function findRowById_(sh, appId) {
  const head = headOf_(sh), col = head.indexOf('ApplicationID') + 1, n = sh.getLastRow() - 1;
  if (n < 1 || col < 1) return 0;
  const v = sh.getRange(2, col, n, 1).getDisplayValues();
  for (let i = 0; i < n; i++) if (v[i][0] === appId) return i + 2;
  return 0;
}
/* add or replace the row of this application in its Subject tab (Applications stays the master copy) */
function subjectUpsert_(rec) {
  try {
    const sh = subjectSheet_(rec.subject), head = headOf_(sh);
    const row = head.map(h => rec.hasOwnProperty(h) && rec[h] !== null && rec[h] !== undefined ? String(rec[h]) : '');
    const at = findRowById_(sh, rec.ApplicationID);
    let r = at;
    if (!r) { r = sh.getLastRow() + 1; if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200); }
    const rg = sh.getRange(r, 1, 1, row.length);
    rg.setNumberFormat('@'); rg.setValues([row]);
  } catch (err) { console.error('Subject tab sync failed: ' + err); }
}
function subjectRemove_(subject, appId) {
  try {
    const sh = getSS_().getSheetByName(subjectTabName_(subject));
    if (!sh) return;
    const at = findRowById_(sh, appId);
    if (at) sh.deleteRow(at);
  } catch (err) { console.error('Subject tab cleanup failed: ' + err); }
}
/* run once for data collected before this feature existed (also safe to run again any time) */
function rebuildSubjectTabs() {
  const all = readAll_(getSheet_()), by = {};
  all.rows.forEach(r => { const k = subjectTabName_(r.subject); (by[k] = by[k] || []).push(r); });
  Object.keys(by).forEach(k => {
    const sh = subjectSheet_(by[k][0].subject), head = headOf_(sh);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, head.length).clearContent();
    const rows = by[k].map(r => head.map(h => r[h] === undefined ? '' : String(r[h])));
    const rg = sh.getRange(2, 1, rows.length, head.length);
    rg.setNumberFormat('@'); rg.setValues(rows);
  });
  return Object.keys(by).length;
}
function onOpen() {
  try { SpreadsheetApp.getUi().createMenu('DAV Tools').addItem('Rebuild subject tabs', 'rebuildSubjectTabs').addToUi(); } catch (err) {}
}

function rollKey_(s) { s = String(s || '').trim(); return /^\d+$/.test(s) ? (s.replace(/^0+/, '') || '0') : s; }
function recFromData_(data) {
  const rec = {};
  fieldKeys_().forEach(k => rec[k] = data[k] === undefined || data[k] === null ? '' : String(data[k]));
  return rec;
}

function rollExists_(roll) {
  const key = rollKey_(roll);
  return readAll_(getSheet_()).rows.some(r => rollKey_(r.cbtRoll) === key);
}
/* live check used by the form */
function checkRoll(roll) {
  roll = String(roll || '').trim();
  if (!/^\d{1,10}$/.test(roll)) return { exists: false };
  return { exists: rollExists_(roll) };
}

function now_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm:ss'); }

/* ================= Shared validation ================= */
function prepare_(data, cfg) {
  data.cbtPrefix = cfg.prefix;
  data.cbtYear = cfg.year;
  data.ageAsOn = isoToDMY_(cfg.ageCutoff, '-');

  const m = String(data.dob || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) throw new Error('A valid Date of Birth is required.');
  const c = cfg.ageCutoff.split('-').map(Number);
  let y = c[0] - Number(m[3]), mo = c[1] - Number(m[2]), d = c[2] - Number(m[1]);
  if (d < 0) { mo--; d += new Date(c[0], c[1] - 1, 0).getDate(); }
  if (mo < 0) { y--; mo += 12; }
  if (y < cfg.minAge) throw new Error('Minimum age is ' + cfg.minAge + ' years as on ' + data.ageAsOn + '.');
  data.ageY = y; data.ageM = mo; data.ageD = d;

  if (['Male', 'Female', 'Transgender'].indexOf(data.gender) < 0) throw new Error('Please select Gender.');
  if (cfg.places.indexOf(data.place) < 0) throw new Error('Invalid place of interview.');
  if (cfg.categories.indexOf(data.category) < 0) throw new Error('Invalid category.');
  if (cfg.posts.indexOf(data.post) < 0) throw new Error('Invalid post.');
  if ((cfg.subjects[data.post] || []).indexOf(data.subject) < 0) throw new Error('Invalid subject for the selected post.');
  if (data.workingDAV === 'Yes') {
    const s = cfg.schools.filter(x => norm_(x.code) === norm_(data.davSchoolCode))[0];
    if (!s) throw new Error('School code not found in the school list.');
    data.davSchoolCode = s.code; data.davSchoolName = s.name;
  }
}
function checkPhoto_(photo) {
  if (!photo || !photo.base64 || !/^image\//.test(photo.mime || '')) throw new Error('Passport size photograph is required.');
}
function checkCert_(cert) {
  if (!cert || !cert.base64 || cert.mime !== 'application/pdf') throw new Error('PCE Qualifying Certificate (PDF) is required.');
  const bytes = Utilities.base64Decode(cert.base64);
  if (bytes.length > MAX_PDF_BYTES) throw new Error('PCE certificate must be under 5 MB.');
  return bytes;
}

/* ================= Submit (new application) ================= */
function submitApplication(data, photo, cert) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    assertFormOpen_();
    const cfg = getFormConfig_();
    data = data || {};
    const roll = String(data.cbtRoll || '').trim();
    if (!/^\d{1,10}$/.test(roll)) throw new Error('CBT Roll Number must contain digits only.');
    if (rollExists_(roll)) throw new Error('This CBT Roll Number is already registered.');
    checkPhoto_(photo);
    const cBytes = checkCert_(cert);
    data.interviewDate = '';
    prepare_(data, cfg);

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const pFile = folder.createFile(Utilities.newBlob(Utilities.base64Decode(photo.base64), 'image/jpeg', roll + '.jpg'));
    const cFile = folder.createFile(Utilities.newBlob(cBytes, 'application/pdf', roll + '_PCE_CERTIFICATE.pdf'));
    const id = 'DAV' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd') + '-' +
               Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();

    const sheet = getSheet_(), formNumber = nextFormNumber_(sheet);
    const rec = recFromData_(data);
    Object.assign(rec, { Timestamp: now_(), ApplicationID: id, photoUrl: pFile.getUrl(), photoFileId: pFile.getId(),
                         certUrl: cFile.getUrl(), certFileId: cFile.getId(), editCount: '0', lastEdited: '', formNumber: formNumber });
    appendRecord_(sheet, rec);
    subjectUpsert_(rec);
    return { ok: true, id: id, formNumber: formNumber };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Find an application by Roll Number + Date of Birth ================= */
/* Roll: leading zeros ignored when matching. DOB: accepts text dd/mm/yyyy or a value Sheets converted to a date. */
function dobSet_(s, ambiguous) {
  s = String(s || '').trim();
  const out = [];
  let m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (m) { out.push(m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2)); return out; }
  m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) {
    out.push(m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2));                       // dd/mm/yyyy
    if (ambiguous) out.push(m[3] + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2));       // mm/dd/yyyy
  }
  return out;
}
function dobMatches_(stored, input) {
  const a = dobSet_(stored, true), b = dobSet_(input, false);
  return a.some(x => b.indexOf(x) >= 0);
}
function findByRollDob_(roll, dob) {
  roll = String(roll || '').trim();
  if (!/^\d{1,10}$/.test(roll)) return null;
  const key = rollKey_(roll), sh = getSheet_(), all = readAll_(sh);
  for (let i = 0; i < all.rows.length; i++) {
    const r = all.rows[i];
    if (rollKey_(r.cbtRoll) === key && dobMatches_(r.dob, dob)) return { sh: sh, head: all.head, row: r };
  }
  return null;
}
function verifyApplicant_(roll, dob) {
  const f = findByRollDob_(roll, dob);
  if (!f) {
    Utilities.sleep(1000);                                   // slows down guessing
    throw new Error('Roll Number and Date of Birth do not match any submitted application.');
  }
  f.obj = f.row; f.obj.dob = String(dob).trim();             // verified: use the DOB the applicant typed (dd/mm/yyyy)
  f.used = Number(f.obj.editCount || 0) || 0;
  return f;
}
function fileB64_(id) {
  try { const b = DriveApp.getFileById(id).getBlob(); return { mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) }; }
  catch (e) { return null; }
}
function cleanObj_(o) { const c = {}; Object.keys(o).forEach(k => { if (k !== '_row') c[k] = o[k]; }); return c; }

/* ---- applicant: download / print their own application ---- */
function getForPrint(roll, dob) {
  assertPdfOpen_();
  const f = verifyApplicant_(roll, dob);
  const p = fileB64_(f.obj.photoFileId);
  return { id: f.obj.ApplicationID, data: cleanObj_(f.obj), photo: p ? 'data:' + p.mime + ';base64,' + p.b64 : '' };
}

/* ---- applicant: edit (max 2 times) ---- */
function getForEdit(roll, dob) {
  assertFormOpen_();
  const f = verifyApplicant_(roll, dob);
  if (f.used >= MAX_EDITS) throw new Error('Edit limit reached. An application can be edited a maximum of ' + MAX_EDITS + ' times.');
  const p = fileB64_(f.obj.photoFileId), c = fileB64_(f.obj.certFileId);
  return { data: cleanObj_(f.obj), photo: p ? 'data:' + p.mime + ';base64,' + p.b64 : '', cert: c ? c.b64 : '', editsLeft: MAX_EDITS - f.used };
}

/* photo / cert are null when the applicant keeps the existing file */
function updateApplication(auth, data, photo, cert) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    assertFormOpen_();
    auth = auth || {};
    const f = verifyApplicant_(auth.roll, auth.dob);
    if (f.used >= MAX_EDITS) throw new Error('Edit limit reached. An application can be edited a maximum of ' + MAX_EDITS + ' times.');
    const cfg = getFormConfig_();
    data = data || {};
    data.cbtRoll = f.obj.cbtRoll;                            // roll number can never change
    data.interviewDate = '';
    prepare_(data, cfg);

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const trash = id => { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) {} };
    let photoUrl = f.obj.photoUrl, photoId = f.obj.photoFileId, certUrl = f.obj.certUrl, certId = f.obj.certFileId;
    if (photo && photo.base64) {
      checkPhoto_(photo); trash(photoId);
      const pf = folder.createFile(Utilities.newBlob(Utilities.base64Decode(photo.base64), 'image/jpeg', data.cbtRoll + '.jpg'));
      photoUrl = pf.getUrl(); photoId = pf.getId();
    }
    if (cert && cert.base64) {
      const bytes = checkCert_(cert); trash(certId);
      const cf = folder.createFile(Utilities.newBlob(bytes, 'application/pdf', data.cbtRoll + '_PCE_CERTIFICATE.pdf'));
      certUrl = cf.getUrl(); certId = cf.getId();
    }

    const rec = recFromData_(data);
    Object.assign(rec, { photoUrl: photoUrl, photoFileId: photoId, certUrl: certUrl, certFileId: certId,
                         editCount: String(f.used + 1), lastEdited: now_() });
    const head = f.head;                                     // keep Timestamp, ApplicationID and any custom columns
    const row = head.map(h => rec.hasOwnProperty(h) ? String(rec[h]) : String(f.obj[h] === undefined ? '' : f.obj[h]));
    const rg = f.sh.getRange(f.row._row, 1, 1, row.length);
    rg.setNumberFormat('@'); rg.setValues([row]);
    const full = {}; head.forEach((h, i) => full[h] = row[i]);
    if (String(f.obj.subject) !== String(data.subject)) subjectRemove_(f.obj.subject, f.obj.ApplicationID);
    subjectUpsert_(full);
    return { ok: true, id: f.obj.ApplicationID, formNumber: f.obj.formNumber, editsLeft: MAX_EDITS - (f.used + 1) };
  } finally {
    lock.releaseLock();
  }
}

/* ================= Print view by Application ID (?id=...) ================= */
function getApplicationById(id) {
  assertPdfOpen_();
  const all = readAll_(getSheet_());
  const r = all.rows.filter(x => x.ApplicationID === id)[0];
  if (!r) throw new Error('Application not found: ' + id);
  const p = fileB64_(r.photoFileId);
  return { id: id, data: cleanObj_(r), photo: p ? 'data:' + p.mime + ';base64,' + p.b64 : '' };
}

/* ================= ADMIN PANEL ================= */
function sha256hex_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function splitPlaces_(s) { return String(s || '').split(';').map(x => x.trim()).filter(Boolean); }

function adminLogin(id, pw) {
  id = String(id || '').trim().toLowerCase(); pw = String(pw || '');
  if (!id || !pw) throw new Error('Enter Admin ID and Password.');
  const cache = CacheService.getScriptCache(), failKey = 'fail:' + id, fails = Number(cache.get(failKey) || 0);
  if (fails >= 5) throw new Error('Too many failed attempts. Please try again after 10 minutes.');
  const ss = getSS_(); setupSheets_(ss);
  const r = list_(ss, 'Admins', 4).filter(x => x[0].toLowerCase() === id)[0];
  let ok = false;
  if (r) ok = /^[a-f0-9]{64}$/i.test(r[1]) ? sha256hex_(pw) === r[1].toLowerCase() : pw === r[1];
  if (!ok) { cache.put(failKey, String(fails + 1), 600); Utilities.sleep(800); throw new Error('Invalid Admin ID or Password.'); }
  cache.remove(failKey);
  const places = splitPlaces_(r[3]);
  if (!places.length) throw new Error('No Place of Interview is assigned to this admin ID.');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('adm:' + token, JSON.stringify({ id: r[0], name: r[2] || r[0], places: places }), ADMIN_SESSION_SECS);
  return { token: token, name: r[2] || r[0], places: places };
}
function adminLogout(token) { CacheService.getScriptCache().remove('adm:' + token); return true; }
function adminSession_(token) {
  const v = CacheService.getScriptCache().get('adm:' + String(token || ''));
  if (!v) throw new Error('Session expired. Please log in again.');
  return JSON.parse(v);
}
function adminAllowed_(s, place) { return s.places.indexOf('*') >= 0 || s.places.indexOf(place) >= 0; }

/* list of applications the admin may see (summary columns) */
function adminList(token) {
  const s = adminSession_(token);
  const all = readAll_(getSheet_());
  const rows = all.rows.filter(r => adminAllowed_(s, r.place)).map(r => ({
    roll: r.cbtRoll, name: r.name, place: r.place, post: r.post, subject: r.subject, gender: r.gender,
    workingDAV: r.workingDAV, davSchoolCode: r.davSchoolCode, category: r.category, phone: r.phone,
    email: r.email, ts: r.Timestamp, id: r.ApplicationID, editCount: r.editCount, formNumber: r.formNumber
  }));
  return { name: s.name, places: s.places, rows: rows };
}
function adminPick_(token, rolls) {
  const s = adminSession_(token), want = {};
  (rolls || []).forEach(x => want[String(x)] = true);
  const all = readAll_(getSheet_());
  return { head: all.head, rows: all.rows.filter(r => want[r.cbtRoll] && adminAllowed_(s, r.place)) };
}
/* full rows (all columns) for Excel export */
function adminRows(token, rolls) {
  const p = adminPick_(token, rolls);
  return { headers: p.head, rows: p.rows.map(r => p.head.map(h => r[h])) };
}
/* data + photo for the PDF form report (same layout as the applicant's report) */
function adminForms(token, rolls) {
  const p = adminPick_(token, rolls);
  return p.rows.map(r => {
    const f = fileB64_(r.photoFileId);
    return { id: r.ApplicationID, data: cleanObj_(r), photo: f ? 'data:' + f.mime + ';base64,' + f.b64 : '' };
  });
}
/* photo + PCE certificate files for the ZIP export (call with 1-3 rolls at a time) */
function adminFiles(token, rolls) {
  const p = adminPick_(token, rolls);
  return p.rows.map(r => {
    const ph = fileB64_(r.photoFileId), ce = fileB64_(r.certFileId);
    return { roll: r.cbtRoll, photo: ph ? ph.b64 : '', cert: ce ? ce.b64 : '' };
  });
}

/* ================= QR SCAN: Level / Location + Remark ================= */
function getScanSheet_() {
  const ss = getSS_();
  let sh = ss.getSheetByName(SCAN_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SCAN_SHEET);
    sh.getRange(1, 1, 1, SCAN_HEAD.length).setValues([SCAN_HEAD]).setFontWeight('bold').setBackground('#e0f2f1');
    sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), SCAN_HEAD.length).setNumberFormat('@');   // text: keeps 0123 and the time stamp
    sh.setFrozenRows(1);
  }
  return sh;
}
function scanStamp_() { return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'dd-MMM-yyyy, hh:mm:ss a'); }   // 12-Oct-2026, 10:30:45 AM
function scanRows_() {
  const sh = getScanSheet_(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, SCAN_HEAD.length).getDisplayValues()
    .map((r, i) => ({ row: i + 2, roll: r[0], level: r[5], remark: r[6], at: r[7] }));
}
function scanHistory_(roll) {
  const key = rollKey_(roll);
  return scanRows_().filter(x => rollKey_(x.roll) === key)
    .sort((a, b) => SCAN_LEVELS.indexOf(a.level) - SCAN_LEVELS.indexOf(b.level))
    .map(x => ({ level: x.level, remark: x.remark, at: x.at }));
}
/* PIN (Settings > SCAN_PIN) unlocks the scan page for 6 hours */
function scanUnlock(pin) {
  const real = String(settingsMap_().SCAN_PIN || '').trim();
  if (!real) throw new Error('Scan PIN is not set in the Settings sheet (SCAN_PIN).');
  const cache = CacheService.getScriptCache(), fails = Number(cache.get('pinfail') || 0);
  if (fails >= 5) throw new Error('Too many wrong PINs. Please try again after 10 minutes.');
  if (String(pin || '').trim() !== real) { cache.put('pinfail', String(fails + 1), 600); Utilities.sleep(800); throw new Error('Wrong PIN.'); }
  cache.remove('pinfail');
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put('scn:' + token, '1', ADMIN_SESSION_SECS);
  return { token: token };
}
function scanSession_(token) {
  if (!CacheService.getScriptCache().get('scn:' + String(token || ''))) throw new Error('Session expired. Please enter the PIN again.');
}
function scanApp_(token, appId) {
  scanSession_(token);
  const app = readAll_(getSheet_()).rows.filter(r => r.ApplicationID === String(appId || '') || (r.formNumber && r.formNumber === String(appId || '')))[0];
  if (!app) throw new Error('Application not found for this QR code.');
  return app;
}

/* view-only scan results: Admins tab login, limited to the admin's allowed venues */
function scanResults(token) {
  const s = adminSession_(token);
  const placeOf = {};
  readAll_(getSheet_()).rows.forEach(r => { placeOf[rollKey_(r.cbtRoll)] = r.place; });
  const rows = scanRows_().map(x => ({ x: x, place: placeOf[rollKey_(x.roll)] || '' }))
    .filter(o => adminAllowed_(s, o.place));
  const sh = getScanSheet_();
  const full = rows.length ? sh.getRange(2, 1, sh.getLastRow() - 1, SCAN_HEAD.length).getDisplayValues() : [];
  return { name: s.name, places: s.places, rows: rows.map(o => { const r = full[o.x.row - 2];
    return { roll: r[0], mobile: r[1], name: r[2], subject: r[3], post: r[4], level: r[5], remark: r[6], at: r[7], place: o.place }; }) };
}

/* applicant summary + what was already recorded for this roll number */
function scanLookup(token, appId) {
  const app = scanApp_(token, appId);
  return {
    app: { roll: app.cbtRoll, formNumber: app.formNumber, name: app.name, mobile: app.phone, post: app.post, subject: app.subject, place: app.place },
    scans: scanHistory_(app.cbtRoll), levels: SCAN_LEVELS, remarks: SCAN_REMARKS
  };
}

/* one row per Roll Number + Level / Location: added the first time, updated on every later scan */
function scanSave(token, appId, level, remark) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const app = scanApp_(token, appId);
    level = String(level || ''); remark = String(remark || '');
    if (SCAN_LEVELS.indexOf(level) < 0) throw new Error('Please select Level / Location.');
    if (level === 'Chairman Board') remark = '';                       // remark is disabled for Chairman Board
    else if (SCAN_REMARKS.indexOf(remark) < 0) throw new Error('Please select Remark.');

    const sh = getScanSheet_(), key = rollKey_(app.cbtRoll), at = scanStamp_();
    const rec = [app.cbtRoll, app.phone, app.name, app.subject, app.post, level, remark, at];
    const hit = scanRows_().filter(x => rollKey_(x.roll) === key && x.level === level)[0];
    let action;
    if (hit) {                                                          // scanned before: update changed values
      const rg = sh.getRange(hit.row, 1, 1, SCAN_HEAD.length);
      rg.setNumberFormat('@'); rg.setValues([rec]);
      action = 'updated';
    } else {
      const r = sh.getLastRow() + 1;
      if (r > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 200);
      const rg = sh.getRange(r, 1, 1, SCAN_HEAD.length);
      rg.setNumberFormat('@'); rg.setValues([rec]);
      action = 'added';
    }
    return { ok: true, action: action, at: at, scans: scanHistory_(app.cbtRoll) };
  } finally {
    lock.releaseLock();
  }
}
