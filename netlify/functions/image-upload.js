const https = require("https");

const REPO   = process.env.GITHUB_REPO;
const TOKEN  = process.env.GITHUB_TOKEN;
const BRANCH = process.env.GITHUB_BRANCH || "main";

function githubPut(path, content, sha) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      message: `CMS: upload image ${path}`,
      content,
      branch: BRANCH,
      ...(sha ? { sha } : {})
    });
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/contents/${path}`,
      method: "PUT",
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getSha(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      headers: { "Authorization": `token ${TOKEN}`, "User-Agent": "catcafe-cms", "Accept": "application/vnd.github.v3+json" }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { try { resolve(JSON.parse(data).sha || null); } catch(e) { resolve(null); } });
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

  const authHeader = event.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { filename, folder, base64 } = JSON.parse(event.body);
    // folder: "cats" | "artjam" | "events"
    const validFolders = ["cats", "artjam", "events"];
    if (!validFolders.includes(folder)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid folder" }) };
    }

    const safeName = filename.replace(/[^a-z0-9._-]/gi, "").toLowerCase();
    const filePath = `images/${folder}/${safeName}`;
    const sha = await getSha(filePath);
    const result = await githubPut(filePath, base64, sha);

    if (result.status === 200 || result.status === 201) {
      const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${filePath}`;
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, url }) };
    } else {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Upload failed", detail: result.body }) };
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
