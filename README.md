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
