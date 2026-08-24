# The Cat Cafe – Website + CMS

A complete website with a CMS admin panel, deployable to Netlify with GitHub as the content backend.

## How it works

```
Browser → Netlify (serves site)
Admin panel → Netlify Functions → GitHub API → writes content/*.json → Netlify rebuilds site
```

Content lives in `content/cats.json`, `content/menu.json`, and `content/settings.json`.
The CMS writes changes directly to GitHub via the API. Netlify detects the commit and rebuilds the site automatically.

---

## Deploy in 5 steps

### 1. Push to GitHub
```bash
cd catcafe-cms
git init
git add .
git commit -m "Initial deploy"
gh repo create thecatcafe-sg --public --push --source=.
```

### 2. Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site → Import from Git**
2. Choose your GitHub repo `jeffersonsoh-arch/thecatcafe-sg`
3. Build settings are auto-detected from `netlify.toml`
4. Click **Deploy site**

### 3. Enable Netlify Identity
1. In Netlify dashboard → **Site configuration → Identity → Enable Identity**
2. Under **Registration** → set to **Invite only**
3. Under **External providers** → optionally add Google
4. Invite yourself: **Identity → Invite users** → enter your email

### 4. Set environment variables
In Netlify dashboard → **Site configuration → Environment variables**, add:

| Key | Value |
|-----|-------|
| `GITHUB_REPO` | `jeffersonsoh-arch/thecatcafe-sg` |
| `GITHUB_TOKEN` | Your GitHub Personal Access Token (needs `repo` scope) |
| `GITHUB_BRANCH` | `main` |

**To create a GitHub token:**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → check `repo` scope → copy the token

### 5. Enable Git Gateway
In Netlify → **Identity → Services → Git Gateway → Enable**

---

## Accessing the admin panel

Go to `https://your-site.netlify.app/admin`

Sign in with the email you invited in step 3.

---

## File structure

```
catcafe-cms/
├── index.html              ← Main website
├── netlify.toml            ← Netlify config
├── admin/
│   └── index.html          ← CMS admin panel (Netlify Identity protected)
├── netlify/functions/
│   ├── content-get.js      ← API: read JSON from GitHub
│   ├── content-save.js     ← API: write JSON to GitHub
│   └── image-upload.js     ← API: upload images to GitHub
├── content/
│   ├── cats.json           ← Cat profiles (edited via CMS)
│   ├── menu.json           ← Menu items (edited via CMS)
│   └── settings.json       ← Hours, pricing, cafe info (edited via CMS)
└── images/
    ├── cats/               ← Cat photos (upload via CMS)
    ├── artjam/             ← Art jamming photos
    └── events/             ← Event photos
```

## Adding your cat photos

Upload via the **Images** tab in the admin panel, or drag the files directly to GitHub:
- `images/cats/missy.jpg`, `jimmy.jpg`, `tommy.jpg`, `oreo.jpg`, `marshmellow.jpg`
- `images/cats/marmite.jpg`, `bobo.jpg`, `mochi.jpg`, `sushi.jpg`, `miso.jpg`
- `images/cats/shoyu.jpg`, `momo.jpg`, `toby.jpg`
- `images/artjam/artjam1.jpg`, `artjam2.jpg`, `artjam3.jpg`
- `images/events/birthday.jpg`, `teambonding.jpg`, `kidsparty.jpg`, `privatehire.jpg`

## Custom domain (thecatcafe.sg)

In Netlify → **Domain management → Add custom domain** → enter `thecatcafe.sg`
Then update your DNS:
- Add a CNAME record: `www` → `your-site.netlify.app`
- Add an ALIAS/ANAME record: `@` → `your-site.netlify.app`
Netlify handles SSL automatically.

## Voucher system setup

The voucher flow uses **HitPay** for payments, **Resend** for email, and stores voucher records in `content/vouchers.json`.

### Additional environment variables needed

Add these in Netlify → Site configuration → Environment variables:

| Key | Value |
|-----|-------|
| `HITPAY_API_KEY` | Your new HitPay API key (from HitPay dashboard → Settings → Payment Gateway) |
| `HITPAY_SALT` | Your new HitPay webhook salt |
| `RESEND_API_KEY` | From resend.com (free tier, 3000 emails/month) |

### HitPay webhook setup

In your HitPay dashboard → Settings → Payment Gateway → Webhooks, add:
```
https://your-site.netlify.app/.netlify/functions/voucher-webhook
```

### Resend setup

1. Sign up at resend.com (free)
2. Add your domain `thecatcafe.sg` and verify DNS
3. Copy your API key and add to Netlify env vars

### How vouchers work

1. Customer selects voucher on site → clicks Pay
2. Redirected to HitPay checkout (PayNow, PayLah!, card, NETS)
3. HitPay sends webhook to Netlify on payment success
4. Netlify function generates unique code (e.g. `TCC-AB3K-7MNP`)
5. Voucher record saved to `content/vouchers.json` in GitHub
6. Branded email sent to customer with voucher code
7. Notification email sent to `info@thecatcafe.sg`
8. Customer shows code on arrival → staff redeems in `/admin` → Vouchers tab

### File structure additions

```
catcafe-cms/
├── voucher-success.html              ← Post-payment success page
├── content/
│   └── vouchers.json                 ← All issued vouchers (auto-managed)
└── netlify/functions/
    ├── voucher-create.js             ← Creates HitPay checkout session
    ├── voucher-webhook.js            ← Receives HitPay webhook, sends email
    └── voucher-manage.js             ← Lookup/redeem/list vouchers (admin)
```

## Booking system

Guests book a table directly on the site at `/booking.html` instead of going through a third-party
scheduler — pick a date, pick an open time slot, enter their details, done. They manage or cancel
their own booking later via the link in their confirmation email (`/booking-manage.html`). Staff
run the whole thing from **Admin → Bookings** / **Admin → Booking setup**: weekly hours, one-off
special dates (holidays, private events), tables and their seat counts, time slots, booking/
cancellation cutoffs, the day's booking list, and a weekly booking count.

Capacity is seating-based and venue-wide: a slot's total capacity is the sum of seats across all
active tables (add/edit tables in **Booking setup**), not a number set per slot. Booking creation
is safe under concurrent requests — it uses GitHub's file `sha` as an optimistic-concurrency token
(read `bookings.json`'s current sha, write with that sha, retry from a fresh read if GitHub reports
a conflict), so two guests racing for the last seat can never both win.

### Additional content files

```
content/
├── tables.json          ← Tables and seat counts (admin-managed)
├── timeslots.json       ← Bookable time-of-day slots (admin-managed)
├── schedule.json        ← Weekly open/closed days + default hours (admin-managed)
├── special-dates.json   ← Per-date overrides: custom hours or fully closed (admin-managed)
└── bookings.json        ← All bookings (guest + admin managed, not exposed via the public CMS API)
```

`content/settings.json` also gained a `booking` block (`booking_cutoff_minutes`,
`cancellation_cutoff_minutes`), editable from **Admin → Booking setup**.

### Additional Netlify Functions

```
netlify/functions/
├── availability.js           ← GET  /api/availability?date=       (public)
├── bookings-create.js        ← POST /api/bookings-create          (public)
├── bookings-detail.js        ← GET  /api/bookings-detail?id=&token=  (public, token-gated)
├── bookings-cancel.js        ← POST /api/bookings-cancel           (public, token-gated)
├── admin-bookings.js         ← GET/POST list, cancel, mark completed/no-show (admin)
├── admin-booking-stats.js    ← GET weekly booking count (admin)
└── lib/
    ├── data-store.js         ← GitHub CAS read/write + local dev fallback + retry helper
    ├── availability.js       ← Schedule/special-date resolution + slot capacity math
    ├── time-utils.js         ← Singapore-time-aware date/time helpers
    └── booking-mailer.js     ← Confirmation/cancellation/admin-alert emails via Resend
```

`content-get.js` / `content-save.js` were extended to also serve `tables`, `timeslots`, `schedule`
and `special-dates` (same admin-authenticated whole-file-save pattern already used for `cats` and
`menu`) — `bookings` is deliberately **not** in that list since it contains guest PII and needs the
capacity-safe write path above, not a blind overwrite.

No new environment variables are required — booking emails reuse the `RESEND_API_KEY` /
`RESEND_FROM` already set up for vouchers, and booking data reuses `GITHUB_REPO` / `GITHUB_TOKEN` /
`GITHUB_BRANCH`. Without `GITHUB_TOKEN` configured, bookings fall back to a local `content/*.json`
file for development — fine for testing, but only the GitHub-backed path gives real concurrency
safety across multiple function instances in production.
