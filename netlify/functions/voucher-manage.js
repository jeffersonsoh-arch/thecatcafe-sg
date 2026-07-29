const https = require("https");

const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

async function getVouchers() {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/content/vouchers.json?ref=${GITHUB_BRANCH}`,
      headers: { "Authorization": `token ${GITHUB_TOKEN}`, "User-Agent": "catcafe-cms", "Accept": "application/vnd.github.v3+json" }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const content = Buffer.from(parsed.content, "base64").toString("utf8");
          resolve({ sha: parsed.sha, vouchers: JSON.parse(content) });
        } catch(e) { resolve({ sha: null, vouchers: [] }); }
      });
    }).on("error", () => resolve({ sha: null, vouchers: [] }));
  });
}

async function saveVouchers(vouchers, sha) {
  const content = Buffer.from(JSON.stringify(vouchers, null, 2)).toString("base64");
  const body = JSON.stringify({ message: "CMS: update voucher", content, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/content/vouchers.json`,
      method: "PUT",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  // Auth check
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized" }) };
  }

  try {
    const { action, code } = JSON.parse(event.body);
    const { sha, vouchers } = await getVouchers();

    if (action === "lookup") {
      const v = vouchers.find(v => v.code === code.toUpperCase().trim());
      if (!v) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "Voucher not found" }) };
      const expired = new Date(v.expires_at) < new Date();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, voucher: v, expired }) };
    }

    if (action === "redeem") {
      const idx = vouchers.findIndex(v => v.code === code.toUpperCase().trim());
      if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "Voucher not found" }) };
      if (vouchers[idx].redeemed) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Already redeemed on " + new Date(vouchers[idx].redeemed_at).toLocaleDateString("en-SG") }) };
      if (new Date(vouchers[idx].expires_at) < new Date()) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Voucher expired" }) };

      vouchers[idx].redeemed = true;
      vouchers[idx].redeemed_at = new Date().toISOString();
      await saveVouchers(vouchers, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "Voucher redeemed successfully", voucher: vouchers[idx] }) };
    }

    if (action === "list") {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, vouchers }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
