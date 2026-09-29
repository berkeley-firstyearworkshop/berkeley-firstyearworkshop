# First-Year Workshop sign-ups

```
index.html            the website (GitHub Pages)
apps-script/Code.gs   bookings backend (Google Apps Script)
apps-script/Mailing.gs  mailing list and emails (Google Apps Script)
```

The files in `apps-script/` are a copy for reference. What actually runs is the code in the Sheet's Apps Script project, so after editing them here, paste the changes into Apps Script and save. Changes to `Code.gs` also need **Deploy > Manage deployments > Edit > New version**.

A static page (GitHub Pages) that reads and writes presentation slots in a Google Sheet via Apps Script.

## 1. Backend (Google Sheet + Apps Script)

1. Create a new Google Sheet (or use the existing one; the script adds its own `Bookings` tab).
2. **Extensions > Apps Script**. Replace the default code with `apps-script/Code.gs`.
3. Edit the config block at the top: `START_DATE`, `END_DATE`, `SKIP_DATES`, and optionally `ALLOWED_EMAIL_DOMAIN = 'berkeley.edu'`.
4. **Deploy > New deployment > Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorise when prompted and copy the web app URL (ends in `/exec`).

After editing the script later: **Deploy > Manage deployments > Edit > Version: New version**. The URL stays the same.

## 2. Emails (mailing list, reminders, weekly announcement)

1. In Apps Script, click **+ > Script**, name it `Mailing`, and paste in `apps-script/Mailing.gs`.
2. Edit its config: `SITE_URL`, `ROOM`, `WEB_APP_URL` (your `/exec` URL), and `REMINDER` / `ANNOUNCE` (days before the session and hour).
3. Save, pick `setupTriggers` in the function dropdown and click **Run**. Accept the new permissions (sending email).
4. Pick `testEmails` and click **Run**. It sends you a sample of every email for the next session: booking confirmation, mailing-list welcome, presenter reminder and announcement.
5. **Deploy > Manage deployments > Edit > Version: New version** so the site can use the new sign-up and unsubscribe features.

Run `setupTriggers` again whenever you change `REMINDER` or `ANNOUNCE`. Emails come from whichever account ran `setupTriggers`. A personal Gmail can send to about 100 recipients a day, which is plenty for one announcement a week.

Subscribers are in the `Subscribers` tab. To remove someone, set their status to `unsubscribed`.

## 3. Front end (GitHub Pages)

1. Open `index.html` and paste the URL into `const API_URL = '...'`.
2. Edit the seminar name, room, and organiser email in the HTML.
3. Create a public repo, e.g. `firstyear-workshop`, and add `index.html`.
4. **Settings > Pages > Deploy from a branch > main / (root)**.
5. The site goes live at `https://<your-username>.github.io/firstyear-workshop/` within a minute or two.

With `API_URL` empty, the page runs in preview mode with sample data, so you can open it locally first.

## Managing bookings

- **Cancel:** delete the row in the `Bookings` tab. The freed slot becomes the next one offered for that week.
- **Move someone:** change their `slot_id` (format `YYYY-MM-DD_HHMM`, e.g. `2026-10-14_1530`). Only `slot_id` is used for matching; the date and time columns are just for reading.
- **Emails** stay in the sheet and are never sent to the page.
- People sign up for a week, not a time: they get the earliest free slot, so sessions fill in order.
- Each person can hold one upcoming slot at a time (`MAX_UPCOMING_PER_EMAIL`).
