const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

const githubConfigured = () => Boolean(GITHUB_REPO && GITHUB_TOKEN);

function githubRequest(method, filePath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/${filePath}` + (method === "GET" ? `?ref=${GITHUB_BRANCH}` : ""),
      method,
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "catcafe-booking",
        "Accept": "application/vnd.github.v3+json"
      }
    };
    if (payload) {
      options.headers["Content-Type"] = "application/json";
      options.headers["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { /* non-JSON response */ }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function localPathFor(name) {
  return path.resolve(__dirname, "../../../content/" + name + ".json");
}

function readLocal(name) {
  try {
    const p = localPathFor(name);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    console.warn(`readLocal(${name}) failed:`, e.message);
  }
  return null;
}

function writeLocal(name, data) {
  try {
    fs.writeFileSync(localPathFor(name), JSON.stringify(data, null, 2), "utf8");
  } catch (e) {
    console.warn(`writeLocal(${name}) failed:`, e.message);
  }
}

// Read a content/<name>.json collection. Returns { sha, items }.
// sha is the GitHub blob sha to use as an optimistic-concurrency token on the next write,
// or null when GitHub isn't configured / the file doesn't exist yet (local-only mode).
async function readCollection(name) {
  const local = readLocal(name);
  if (!githubConfigured()) {
    return { sha: null, items: local || [] };
  }
  try {
    const res = await githubRequest("GET", `content/${name}.json`);
    if (res.status === 200 && res.body && typeof res.body.content === "string") {
      const content = Buffer.from(res.body.content, "base64").toString("utf8");
      return { sha: res.body.sha, items: JSON.parse(content) };
    }
    if (res.status === 404) return { sha: null, items: local || [] };
    console.warn(`GitHub read of ${name}.json returned ${res.status}, falling back to local file`);
    return { sha: null, items: local || [] };
  } catch (e) {
    console.warn(`GitHub read of ${name}.json failed: ${e.message}, falling back to local file`);
    return { sha: null, items: local || [] };
  }
}

// Write a content/<name>.json collection. `sha` must be the value returned by the
// readCollection() call this write is based on, so GitHub can reject the write (409/422)
// if someone else's write landed in between - this is what makes updateCollection() below
// safe under concurrent requests.
async function writeCollection(name, items, sha, message) {
  if (!githubConfigured()) {
    writeLocal(name, items);
    return { ok: true };
  }

  const content = Buffer.from(JSON.stringify(items, null, 2)).toString("base64");
  const payload = {
    message: message || `Booking system: update ${name}.json`,
    content,
    branch: GITHUB_BRANCH
  };
  if (sha) payload.sha = sha;

  const res = await githubRequest("PUT", `content/${name}.json`, payload);
  if (res.status === 200 || res.status === 201) {
    writeLocal(name, items); // keep local dev-fallback cache warm
    return { ok: true };
  }
  if (res.status === 409 || res.status === 422) return { ok: false, conflict: true };

  const detail = (res.body && (res.body.message || JSON.stringify(res.body))) || `status ${res.status}`;
  console.error(`GitHub write to content/${name}.json failed (${res.status}): ${detail}`);
  if (res.status === 401 || res.status === 403) {
    // Never surface GitHub's raw credential/permission error to end users - it's an
    // infra misconfiguration (GITHUB_TOKEN missing/expired/wrong scope for this deploy
    // context), not something a guest or admin can act on. Full detail is logged above.
    return { ok: false, error: "Booking system is temporarily unavailable. Please try again shortly or contact us directly." };
  }
  return { ok: false, error: `GitHub write failed (${res.status})` };
}

// Per-collection-name in-process lock, so concurrent updateCollection() calls in the same
// function container serialize instead of racing each other between their read and write. This
// is what actually protects the local-file dev fallback (which has no CAS of its own); in
// production, GitHub's sha-based PUT below provides real cross-container protection too.
const locks = new Map();
function withLock(name, fn) {
  const prev = locks.get(name) || Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(name, run.then(() => {}, () => {}));
  return run;
}

// Read-modify-write a collection with automatic retry on optimistic-concurrency conflicts.
// This is the DB-transaction stand-in required by NFR-3: two concurrent callers both read the
// current sha, but only the first PUT with that sha succeeds - the second gets a 409 and this
// loop re-reads the now-current state (which includes the first caller's booking) and retries
// its own capacity check against it, so a slot can never be oversold.
//
// `mutator(items)` must return `{ items: newItems, value, message }` or throw an Error to abort
// immediately without retrying (e.g. "slot is full" should not be retried).
function updateCollection(name, mutator, opts) {
  return withLock(name, async () => {
    const maxAttempts = (opts && opts.maxAttempts) || 5;
    let lastConflictError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { sha, items } = await readCollection(name);
      const result = await mutator(items);
      const writeRes = await writeCollection(name, result.items, sha, result.message);
      if (writeRes.ok) return result.value;
      if (writeRes.conflict) {
        lastConflictError = new Error("Too many concurrent updates, please try again");
        continue;
      }
      throw new Error(writeRes.error || "Failed to save");
    }
    throw lastConflictError || new Error("Failed to save after retries");
  });
}

module.exports = { readCollection, writeCollection, updateCollection, githubConfigured };
