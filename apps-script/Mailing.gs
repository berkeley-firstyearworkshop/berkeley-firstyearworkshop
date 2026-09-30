// Mailing list, confirmations, presenter reminders and the weekly announcement.
// Emails are sent from the Google account that runs setupTriggers().

// ===== Email config: edit these =====
const SEMINAR_NAME = 'First-Year Workshop';
const FROM_NAME = 'Berkeley Econ First-Year Workshop';   // sender name shown in inboxes
const SITE_URL = 'https://berkeley-firstyearworkshop.github.io/';
const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyKSG1n4KbB1eWgaFmqymYPwRdcB93aVjRPO6l-MA5kJSoXVKEyKrJgSS6Xpp-sKFKEKg/exec';  // used for unsubscribe links
const ROOM = 'Room C330, Cheit Hall, Haas';
const REMINDER = { daysBefore: 2, hour: 9 };    // presenters: Monday 9am before a Wednesday session
const ANNOUNCE = { daysBefore: 6, hour: 10 };   // mailing list: Thursday 10am the week before
const SKIP_EMPTY_WEEKS = true;                  // no list email when nobody has signed up
const SUBSCRIBERS_SHEET = 'Subscribers';
const ADMIN_EMAIL = 'berkeleyfirstyearworkshop@gmail.com';                         // gets a note for every sign-up; '' = the account running the script
// ====================================

const TYPE_LABEL = { paper: 'Paper', idea: 'Early idea' };
const FORMAT_NOTE = 'You have 15 minutes and questions are welcome throughout, so leave some room for them.';
const WELCOME_NOTE = 'Everyone is welcome to participate!';
const OPEN_NOTE = "You don't need a finished paper to present: a rough idea, an early result or a question you're stuck on all make for a good 15 minutes.";

// Run once from the editor (and again after changing REMINDER or ANNOUNCE).
// Each trigger runs daily and only sends when a session is exactly `daysBefore` days away.
function setupTriggers() {
  const handlers = ['sendPresenterReminders', 'sendWeeklyAnnouncement'];
  ScriptApp.getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('sendPresenterReminders').timeBased().everyDays(1).atHour(REMINDER.hour).inTimezone(TZ).create();
  ScriptApp.newTrigger('sendWeeklyAnnouncement').timeBased().everyDays(1).atHour(ANNOUNCE.hour).inTimezone(TZ).create();
}

// Sends every email type for the next session to you only. Safe to run any time.
function testEmails() {
  const me = Session.getEffectiveUser().getEmail();
  const s = nextSession_();
  if (!s) return Logger.log('No upcoming sessions.');
  const booked = s.slots.find(x => x.booking);
  const sample = booked
    ? { date: s.date, name: booked.booking.name, email: me, title: booked.booking.title }
    : { date: s.date, name: 'Test Presenter', email: me, title: 'TBD' };
  sendBookingConfirmation_(sample, booked ? booked.time : SLOT_TIMES[0], true);
  sendAdminNotice_(Object.assign({ department: 'Econ', type: 'paper' }, sample), booked ? booked.time : SLOT_TIMES[0], me);
  sendWelcome_(me);
  reminders_(me);
  announce_(me);
}

function sendPresenterReminders() { reminders_(null); }
function sendWeeklyAnnouncement() { announce_(null); }

// ----- Booking confirmation (called from Code.gs), with a calendar invite -----
// joinedList: they were just added to the mailing list, so say so and give them a way out.
function sendBookingConfirmation_(c, time, joinedList) {
  const tbd = String(c.title).trim().toUpperCase() === 'TBD';
  const when = `${fmtLong_(c.date)}, ${slotRange_(time)}pm`;
  const invite = ics_({
    uid: `${c.date}-${hash_(c.email)}-presenter@${host_()}`,
    date: c.date,
    summary: `${SEMINAR_NAME}: presenting at ${fmt12_(time)}pm`,
    description: `Your slot: ${slotRange_(time)}pm\nTitle: ${c.title}\n\n${SITE_URL}`,
  });
  const tbdNote = "When you have a title, reply to this email and we'll update the schedule.";
  const cancelNote = 'If you need to cancel or swap, reply to this email.';
  const listNote = "We've also added you to the mailing list, which sends the line-up before each session.";
  const unsub = joinedList ? unsubscribeLink_(c.email) : '';
  const text =
`Hi ${firstName_(c.name)},

Thanks for signing up to present at the ${SEMINAR_NAME}.

When: ${when} (the session runs ${sessionRange_()})
Where: ${ROOM}
Title: ${c.title}
${c.link ? `${c.linkType}: ${c.link}\n` : ''}
${tbd ? tbdNote + '\n\n' : ''}${FORMAT_NOTE} A calendar invite is attached, and we'll send a reminder nearer the time.

${cancelNote}

${joinedList ? `${listNote} Unsubscribe: ${unsub}\n\n` : ''}${SEMINAR_NAME}
${SITE_URL}`;
  const html = shell_("You're booked in", `${when}, ${ROOM}`, `
    ${p_(`Hi ${h_(firstName_(c.name))},`)}
    ${p_(`Thanks for signing up to present at the ${h_(SEMINAR_NAME)}.`)}
    ${details_([['When', `${when} (session runs ${sessionRange_()})`], ['Where', ROOM], ['Title', c.title]].concat(c.link ? [[c.linkType, linkHtml_(c), true]] : []))}
    ${tbd ? p_(tbdNote) : ''}
    ${p_(`${FORMAT_NOTE} A calendar invite is attached, and we'll send a reminder nearer the time.`)}
    ${p_(cancelNote)}
    ${joinedList ? p_(`${listNote} <a href="${unsub}" style="color:#003262">Unsubscribe</a> if you'd rather not get it.`) : ''}`);
  send_({ to: c.email, subject: `You're presenting on ${fmtLong_(c.date)} at ${fmt12_(time)}pm`, body: text, htmlBody: html, attachments: [invite] });
}

// ----- Sign-up notice to the organisers (called from Code.gs). Replying goes to the presenter. -----
function sendAdminNotice_(c, time, to) {
  const text =
`${c.name} signed up to present.

When: ${fmtLong_(c.date)}, ${slotRange_(time)}pm
Name: ${c.name}
Email: ${c.email}
Department: ${c.department}
Title: ${c.title}
Type: ${TYPE_LABEL[c.type] || c.type}
${c.link ? `Link: ${c.linkType}, ${c.link}\n` : ''}
Bookings sheet: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`;
  send_({
    to: to || ADMIN_EMAIL || Session.getEffectiveUser().getEmail(),
    replyTo: c.email,
    subject: `New sign-up: ${c.name}, ${fmtLong_(c.date)} at ${fmt12_(time)}pm`,
    body: text,
  });
}

// ----- Presenter reminders -----
function reminders_(testTo) {
  const s = testTo ? nextSession_() : sessionInDays_(REMINDER.daysBefore);
  if (!s) return;
  const talks = s.slots.filter(x => x.booking);
  if (!talks.length) return Logger.log('No presenters booked for ' + s.date + '.');
  if (!testTo && !claimSend_('remind_' + s.date)) return;

  talks.forEach(x => {
    const b = x.booking;
    const when = `${fmtLong_(s.date)}, ${slotRange_(x.time)}pm`;
    const text =
`Hi ${firstName_(b.name)},

A reminder that you're presenting at the ${SEMINAR_NAME} on ${fmtLong_(s.date)}.

Your slot: ${slotRange_(x.time)}pm, ${ROOM}
Your title: ${titleText_(b.title)}

Full line-up

${lineupText_(talks)}

${FORMAT_NOTE} If you can no longer make it, reply to this email.

${SEMINAR_NAME}
${SITE_URL}`;
    const html = shell_("Reminder: you're presenting soon", `${when}, ${ROOM}`, `
      ${p_(`Hi ${h_(firstName_(b.name))},`)}
      ${p_(`A reminder that you're presenting at the ${h_(SEMINAR_NAME)} on ${h_(fmtLong_(s.date))}.`)}
      ${details_([['Your slot', `${slotRange_(x.time)}pm`], ['Where', ROOM], ['Your title', titleText_(b.title)]])}
      <h3 style="font-family:Georgia,serif;color:#003262;font-size:17px;margin:24px 0 4px">Full line-up</h3>
      ${lineupHtml_(talks, x.time)}
      ${p_(`${FORMAT_NOTE} If you can no longer make it, reply to this email.`)}`);
    send_({ to: testTo || b.email, subject: `Reminder: you're presenting on ${fmtLong_(s.date)} at ${fmt12_(x.time)}pm`, body: text, htmlBody: html });
  });
}

// ----- Announcement to the list, with a calendar invite -----
function announce_(testTo) {
  const s = testTo ? nextSession_() : sessionInDays_(ANNOUNCE.daysBefore);
  if (!s) return;
  const talks = s.slots.filter(x => x.booking);
  if (!testTo && !talks.length && SKIP_EMPTY_WEEKS) return;

  const recipients = testTo ? [testTo] : activeSubscribers_();
  if (!recipients.length) return;
  const quota = MailApp.getRemainingDailyQuota();
  if (quota < recipients.length) {
    throw new Error(`Only ${quota} emails left in today's quota for ${recipients.length} subscribers.`);
  }
  if (!testTo && !claimSend_('announce_' + s.date)) return;

  const heading = `${ANNOUNCE.daysBefore >= 5 ? 'Next week' : 'This week'} at the ${SEMINAR_NAME}`;
  const open = s.slots.length - talks.length;
  const when = `${fmtLong_(s.date)}, ${sessionRange_()}, ${ROOM}`;
  const openWords = `${open} ${open === 1 ? 'slot is' : 'slots are'} still open.`;
  const laterSpace = !open && buildSessions_().some(x => x.date > s.date && x.slots.some(y => !y.booking));
  const signup = open ? openWords : laterSpace ? 'This week is fully booked.' : '';
  const signupLink = open ? 'Sign up on the website' : 'Sign up for a future week';

  const invite = ics_({
    uid: `${s.date}-session@${host_()}`,
    date: s.date,
    summary: SEMINAR_NAME,
    description: (talks.length
      ? talks.map(x => `${fmt12_(x.time)} ${x.booking.name}: ${titleText_(x.booking.title)}`).join('\n')
      : 'Line-up to be confirmed.') + `\n\n${SITE_URL}`,
  });

  recipients.forEach(email => {
    const unsub = unsubscribeLink_(email);
    const text =
`${heading}
${when}

${talks.length ? lineupText_(talks) : 'No talks booked yet.'}

${signup ? `${signup} ${signupLink}: ${SITE_URL}\n\n${OPEN_NOTE}\n\n` : ''}${WELCOME_NOTE} A calendar invite is attached.

Unsubscribe: ${unsub}`;
    const html = shell_(heading, when, `
      ${talks.length ? lineupHtml_(talks) : p_('No talks booked yet.')}
      ${signup ? p_(`${signup} <a href="${SITE_URL}" style="color:#003262">${signupLink}</a>.`) + p_(`<em>${h_(OPEN_NOTE)}</em>`) : ''}
      ${p_(`${WELCOME_NOTE} A calendar invite is attached.`)}`, unsub);
    send_({ to: email, subject: `${SEMINAR_NAME}: ${fmtLong_(s.date)}`, body: text, htmlBody: html, attachments: [invite] });
  });
}

// ----- Subscribers -----
function subscribe_(d) {
  const email = str_(d.email, 120).toLowerCase();
  const name = str_(d.name, 100);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const sheet = getSubsSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) {
      const wasActive = String(rows[i][3]).trim() === 'subscribed';
      sheet.getRange(i + 1, 4).setValue('subscribed');
      if (!wasActive) trySend_(() => sendWelcome_(email));
      return { ok: true };
    }
  }
  sheet.appendRow([email, safe_(name), new Date(), 'subscribed']);
  trySend_(() => sendWelcome_(email));
  return { ok: true };
}

// Presenters join the list automatically. Returns true if newly added; anyone who unsubscribed stays off.
function addPresenterToList_(email, name) {
  const sheet = getSubsSheet_();
  const known = sheet.getDataRange().getValues().slice(1).some(r => String(r[0]).trim().toLowerCase() === email);
  if (known) return false;
  sheet.appendRow([email, safe_(name), new Date(), 'subscribed']);
  return true;
}

function sendWelcome_(email) {
  const unsub = unsubscribeLink_(email);
  const intro = "Before each session you'll get an email with who's presenting and a calendar invite.";
  const when = `Sessions are on Wednesdays, ${sessionRange_()}, ${ROOM}.`;
  send_({
    to: email,
    subject: `You're on the ${SEMINAR_NAME} mailing list`,
    body: `Thanks for signing up.\n\n${intro} ${when}\n\nSee the schedule or sign up to present: ${SITE_URL}\n\n${OPEN_NOTE}\n\nUnsubscribe: ${unsub}`,
    htmlBody: shell_("You're on the list", '', `
      ${p_('Thanks for signing up.')}
      ${p_(`${intro} ${h_(when)}`)}
      ${p_(`<a href="${SITE_URL}" style="color:#003262">See the schedule or sign up to present</a>.`)}
      ${p_(`<em>${h_(OPEN_NOTE)}</em>`)}`, unsub),
  });
}

function activeSubscribers_() {
  const rows = getSubsSheet_().getDataRange().getValues().slice(1);
  const out = rows.filter(r => String(r[3]).trim() === 'subscribed').map(r => String(r[0]).trim().toLowerCase());
  return Array.from(new Set(out.filter(Boolean)));
}

function unsubscribePage_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  let msg = 'This unsubscribe link is not valid.';
  if (email && p.token === token_(email)) {
    const sheet = getSubsSheet_();
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toLowerCase() === email) sheet.getRange(i + 1, 4).setValue('unsubscribed');
    }
    msg = `${email} has been unsubscribed from the ${SEMINAR_NAME} emails.`;
  }
  return HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif;font-size:16px;max-width:480px;margin:15vh auto;padding:0 20px">${h_(msg)}</p>`
  ).setTitle(SEMINAR_NAME);
}

function getSubsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SUBSCRIBERS_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUBSCRIBERS_SHEET);
    sheet.appendRow(['email', 'name', 'subscribed_at', 'status']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Unsubscribe links carry a signature so nobody can unsubscribe other people.
function token_(email) {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('UNSUB_SECRET');
  if (!secret) { secret = Utilities.getUuid(); props.setProperty('UNSUB_SECRET', secret); }
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(email, secret)).slice(0, 22);
}
const unsubscribeLink_ = email => `${WEB_APP_URL}?action=unsubscribe&email=${encodeURIComponent(email)}&token=${token_(email)}`;

// ----- Calendar invite (.ics) for the whole session -----
function ics_(o) {
  const stamp = d => Utilities.formatDate(d, 'UTC', "yyyyMMdd'T'HHmmss'Z'");
  const at = t => stamp(Utilities.parseDate(`${o.date} ${t}`, TZ, 'yyyy-MM-dd HH:mm'));
  const esc = v => String(v).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => line.length <= 73 ? line : line.match(/.{1,73}/g).join('\r\n ');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//First-Year Workshop//Sign-ups//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + o.uid,
    'DTSTAMP:' + stamp(new Date()),
    'DTSTART:' + at(SLOT_TIMES[0]),
    'DTEND:' + at(sessionEnd_()),
    'SUMMARY:' + esc(o.summary),
    'LOCATION:' + esc(ROOM),
    'DESCRIPTION:' + esc(o.description),
    'URL:' + SITE_URL,
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return Utilities.newBlob(lines.map(fold).join('\r\n') + '\r\n', 'text/calendar', 'first-year-workshop.ics');
}

// ----- Email building blocks -----
function send_(o) { MailApp.sendEmail(Object.assign({ name: FROM_NAME }, o)); }

function shell_(heading, sub, inner, unsub) {
  return `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#15212c;max-width:560px;line-height:1.5">
  <h2 style="font-family:Georgia,serif;color:#003262;margin:0 0 4px">${h_(heading)}</h2>
  ${sub ? `<p style="margin:0 0 16px;color:#5a6773">${h_(sub)}</p>` : ''}
  ${inner}
  <p style="font-size:12px;color:#8a96a3;margin-top:32px">
    <a href="${SITE_URL}" style="color:#8a96a3">${h_(SITE_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''))}</a>
    ${unsub ? ` &nbsp;|&nbsp; <a href="${unsub}" style="color:#8a96a3">Unsubscribe</a>` : ''}
  </p>
</div>`;
}
const p_ = html => `<p style="margin:16px 0">${html}</p>`;

function details_(rows) {
  return `<table style="border-collapse:collapse;margin:16px 0">${rows.map(([k, v, html]) => `
    <tr><td style="padding:4px 16px 4px 0;color:#5a6773;vertical-align:top;white-space:nowrap">${h_(k)}</td>
    <td style="padding:4px 0;font-weight:600">${html ? v : h_(v)}</td></tr>`).join('')}</table>`;
}

// mine: highlight that slot's row (used in presenter reminders)
function lineupHtml_(talks, mine) {
  return `<table style="border-collapse:collapse;width:100%">${talks.map(x => {
    const b = x.booking;
    const you = x.time === mine;
    return `
    <tr${you ? ' style="background:#fff7df"' : ''}>
      <td style="width:1%;padding:10px 16px 10px 8px;vertical-align:top;color:#003262;font-weight:600;white-space:nowrap;border-top:1px solid #e3e8ee">${fmt12_(x.time)}</td>
      <td style="padding:10px 8px 10px 0;border-top:1px solid #e3e8ee">
        <div style="font-weight:600">${h_(titleText_(b.title))}</div>
        <div style="color:#5a6773">${h_(b.name)}, ${h_(b.department)} (${TYPE_LABEL[b.type] || ''})${you ? ' &nbsp;<strong style="color:#003262">You</strong>' : ''}</div>
        ${b.link ? `<div>${linkHtml_(b)}</div>` : ''}
      </td>
    </tr>`;
  }).join('')}</table>`;
}

function lineupText_(talks) {
  return talks.map(x => {
    const b = x.booking;
    return `${fmt12_(x.time)}  ${titleText_(b.title)}\n       ${b.name}, ${b.department} (${TYPE_LABEL[b.type] || ''})` +
      (b.link ? `\n       ${b.linkType}: ${b.link}` : '');
  }).join('\n\n');
}

// ----- Helpers -----
const host_ = () => SITE_URL.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
function sessionData_(date) {
  const rows = readBookings_(getSheet_());
  return {
    date: date,
    slots: SLOT_TIMES.map(t => ({ time: t, booking: rows.find(r => r.slot_id === slotId_(date, t)) || null })),
  };
}
function sessionInDays_(n) {
  const target = Utilities.formatDate(new Date(Date.now() + n * 864e5), TZ, 'yyyy-MM-dd');
  return sessionDates_().indexOf(target) !== -1 ? sessionData_(target) : null;
}
function nextSession_() {
  const today = today_();
  const date = sessionDates_().find(d => d >= today);
  return date ? sessionData_(date) : null;
}

// Stops a trigger that fires twice from sending the same email twice.
function claimSend_(key) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(key)) return false;
  props.setProperty(key, new Date().toISOString());
  return true;
}
function trySend_(fn) { try { fn(); } catch (err) { console.error(err); } }

const addMin_ = (t, n) => { let [h, m] = t.split(':').map(Number); m += n; h += Math.floor(m / 60); m %= 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const sessionEnd_ = () => addMin_(SLOT_TIMES[SLOT_TIMES.length - 1], 15);
const fmt12_ = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')}`; };
const slotRange_ = t => `${fmt12_(t)}-${fmt12_(addMin_(t, 15))}`;
const sessionRange_ = () => `${fmt12_(SLOT_TIMES[0])}-${fmt12_(sessionEnd_())}pm`;
const fmtLong_ = iso => Utilities.formatDate(new Date(iso + 'T12:00:00Z'), 'UTC', 'EEEE d MMMM');
const titleText_ = t => (String(t).trim().toUpperCase() === 'TBD' ? 'Title TBD' : t);
const linkHtml_ = b => `<a href="${h_(b.link)}" style="color:#003262">${h_(b.linkType)}</a>`;
const firstName_ = n => String(n).trim().split(/\s+/)[0];
const hash_ = s => Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, s)).slice(0, 10);
const h_ = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));