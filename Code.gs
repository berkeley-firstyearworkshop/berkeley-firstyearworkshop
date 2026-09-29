// ===== Config: edit these =====
const START_DATE = '2026-10-21';            // first Wednesday (YYYY-MM-DD)
const END_DATE   = '2026-12-02';            // last Wednesday
const SKIP_DATES = ['2026-11-25'];          // weeks with no session
const SLOT_TIMES = ['15:00', '15:15', '15:30', '15:45'];
const ALLOWED_EMAIL_DOMAIN = '';            // e.g. 'berkeley.edu' to restrict sign-ups; '' allows any
const MAX_UPCOMING_PER_EMAIL = 1;           // max future slots one person can hold; 0 = no limit
const TZ = 'America/Los_Angeles';
const SHEET_NAME = 'Bookings';
// ==============================

const HEADERS = ['slot_id', 'date', 'time', 'name', 'email', 'department', 'title', 'type', 'booked_at'];

function doGet() {
  return json_({ ok: true, sessions: buildSessions_() });
}

// People sign up for a session, not a time. The script gives them the earliest free slot,
// so sessions fill in order and a slot freed by a cancellation is the next one taken.
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (err) {
    return json_({ ok: false, error: 'The sign-up sheet is busy. Try again in a few seconds.' });
  }
  try {
    let d;
    try { d = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'Invalid request.' }); }

    const clean = {
      date: str_(d.date, 10),
      name: str_(d.name, 100),
      email: str_(d.email, 120).toLowerCase(),
      department: str_(d.department, 60),
      title: str_(d.title, 200),
      type: str_(d.type, 10),
    };

    const error = validate_(clean);
    if (error) return json_({ ok: false, error: error });

    const sheet = getSheet_();
    const rows = readBookings_(sheet);

    if (MAX_UPCOMING_PER_EMAIL > 0) {
      const today = today_();
      const held = rows.filter(r => r.email === clean.email && r.slot_id.slice(0, 10) >= today).length;
      if (held >= MAX_UPCOMING_PER_EMAIL) {
        return json_({ ok: false, error: 'You already have an upcoming slot. Email the organisers to swap.' });
      }
    }

    const taken = new Set(rows.map(r => r.slot_id));
    const time = SLOT_TIMES.find(t => !taken.has(slotId_(clean.date, t)));
    if (!time) {
      return json_({ ok: false, error: 'This session just filled up. Pick another week.', sessions: buildSessions_() });
    }

    const id = slotId_(clean.date, time);
    sheet.appendRow([
      id, clean.date, time,
      safe_(clean.name), clean.email, safe_(clean.department), safe_(clean.title), clean.type, new Date(),
    ]);
    return json_({ ok: true, slot: { id: id, time: time }, sessions: buildSessions_() });
  } finally {
    lock.releaseLock();
  }
}

function validate_(c) {
  if (sessionDates_().indexOf(c.date) === -1) return 'That session does not exist.';
  if (c.date < today_()) return 'That session has already happened.';
  if (!c.name) return 'Add your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) return 'Enter a valid email address.';
  if (ALLOWED_EMAIL_DOMAIN && !c.email.endsWith('@' + ALLOWED_EMAIL_DOMAIN)) {
    return 'Use your @' + ALLOWED_EMAIL_DOMAIN + ' email address.';
  }
  if (!c.department) return 'Choose your department.';
  if (!c.title) return 'Add a working title.';
  if (c.type !== 'paper' && c.type !== 'idea') return 'Choose paper or early-stage idea.';
  return null;
}

function buildSessions_() {
  const booked = {};
  readBookings_(getSheet_()).forEach(r => {
    booked[r.slot_id] = { name: r.name, department: r.department, title: r.title, type: r.type };
  });
  // Emails stay in the sheet and are never returned to the page.
  return sessionDates_().map(date => ({
    date: date,
    slots: SLOT_TIMES.map(t => {
      const id = slotId_(date, t);
      return { id: id, time: t, booking: booked[id] || null };
    }),
  }));
}

function sessionDates_() {
  const skip = new Set(SKIP_DATES);
  const out = [];
  const d = new Date(START_DATE + 'T12:00:00Z');
  const end = new Date(END_DATE + 'T12:00:00Z');
  while (d <= end) {
    const iso = d.toISOString().slice(0, 10);
    if (!skip.has(iso)) out.push(iso);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// Only slot_id is used to match bookings, so the readable date/time columns can be edited freely.
function readBookings_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .map(r => ({
      slot_id: String(r[0]).trim(),
      name: String(r[3]),
      email: String(r[4]).trim().toLowerCase(),
      department: String(r[5]),
      title: String(r[6]),
      type: String(r[7]),
    }))
    .filter(r => r.slot_id);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

const slotId_ = (date, t) => date + '_' + t.replace(':', '');
const today_ = () => Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
const str_ = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
// Stop user input being interpreted as a spreadsheet formula.
const safe_ = v => (/^[=+\-@]/.test(v) ? "'" + v : v);

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
