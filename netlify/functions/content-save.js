const https = require("https");

const REPO   = process.env.GITHUB_REPO;
const TOKEN  = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || "main";

function githubRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/contents/${path}`,
      method,
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getFileSha(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json"
      }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.sha || null);
        } catch(e) { resolve(null); }
      });
    }).on("error", () => resolve(null));
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  // Verify Netlify Identity JWT
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { type, data } = JSON.parse(event.body);
    const validTypes = ["cats", "menu", "settings"];
    if (!type || !validTypes.includes(type)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid type" }) };
    }

    const filePath = `content/${type}.json`;
    const sha = await getFileSha(filePath);
    const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

    const payload = {
      message: `CMS: update ${type}.json`,
      content,
      branch: BRANCH
    };
    if (sha) payload.sha = sha;

    const result = await githubRequest("PUT", filePath, payload);

    if (result.status === 200 || result.status === 201) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: `${type} saved` }) };
    } else {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GitHub write failed", detail: result.body }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
