const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";

const VOUCHER_LABELS = {
  "standard-22": "Standard Entrance Ticket",
  "premium-30":  "Premium Entrance Ticket",
  "ultimate-40": "Ultimate Entrance Ticket"
};

const VOUCHER_AMOUNTS = {
  "standard-22": "22.00",
  "premium-30":  "30.00",
  "ultimate-40": "40.00"
};

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TCC";
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function getVouchers() {
  return new Promise((resolve) => {
    // First, try to read from local file (works in development and as fallback)
    const localPath = path.join(__dirname, "../../content/vouchers.json");
    let localVouchers = [];
    try {
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, "utf8");
        localVouchers = JSON.parse(content);
      }
    } catch(e) {
      console.warn("Could not read local vouchers.json:", e.message);
    }
    
    // If GitHub credentials are configured, fetch from GitHub (source of truth)
    if (!GITHUB_REPO || !GITHUB_TOKEN) {
      console.warn("GITHUB_REPO or GITHUB_TOKEN not configured in Netlify env vars, using local file");
      return resolve({ sha: null, vouchers: localVouchers });
    }
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
        } catch(e) { 
          console.warn("GitHub API error, falling back to local file:", e.message);
          resolve({ sha: null, vouchers: localVouchers }); 
        }
      });
    }).on("error", (err) => {
      console.warn("GitHub request failed, falling back to local file:", err.message);
      resolve({ sha: null, vouchers: localVouchers });
    });
  });
}

async function saveVouchers(vouchers, sha) {
  const content = JSON.stringify(vouchers, null, 2);
  const localPath = path.join(__dirname, "../../content/vouchers.json");
  
  // Always save to local file first (for immediate effect and as backup)
  try {
    fs.writeFileSync(localPath, content, "utf8");
    console.log("Vouchers saved to local file:", localPath);
  } catch(e) {
    console.error("Failed to save local vouchers.json:", e.message);
  }
  
  // If GitHub credentials are configured, also push to GitHub
  if (!GITHUB_REPO || !GITHUB_TOKEN) {
    console.warn("GITHUB_REPO or GITHUB_TOKEN not configured - vouchers saved locally only");
    return { saved: true, local: true };
  }
  
  const base64Content = Buffer.from(content).toString("base64");
  const body = JSON.stringify({ message: "CMS: update vouchers database", content: base64Content, branch: GITHUB_BRANCH, ...(sha ? { sha } : {}) });

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

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Missing token" }) };
  }

  const token = authHeader.slice(7);
  const { verifyNetlifyToken } = require("./lib/auth");
  const authResult = await verifyNetlifyToken(token);
  
  if (!authResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Invalid token: " + authResult.error }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action, code } = body;
    const { sha, vouchers } = await getVouchers();

    if (action === "lookup") {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Voucher code required" }) };
      const v = vouchers.find(v => v.code === code.toUpperCase().trim());
      if (!v) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "Voucher not found in system" }) };
      const expired = new Date(v.expires_at) < new Date();
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, voucher: v, expired }) };
    }

    if (action === "redeem") {
      if (!code) return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Voucher code required" }) };
      const idx = vouchers.findIndex(v => v.code === code.toUpperCase().trim());
      if (idx === -1) return { statusCode: 404, headers, body: JSON.stringify({ ok: false, error: "Voucher not found" }) };
      if (vouchers[idx].redeemed) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Already redeemed on " + new Date(vouchers[idx].redeemed_at).toLocaleDateString("en-SG") }) };
      }
      if (new Date(vouchers[idx].expires_at) < new Date()) {
        return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Voucher expired" }) };
      }

      vouchers[idx].redeemed = true;
      vouchers[idx].redeemed_at = new Date().toISOString();
      await saveVouchers(vouchers, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "Voucher redeemed successfully", voucher: vouchers[idx] }) };
    }

    if (action === "create") {
      const { voucher_type = "standard-22", buyer_name = "Walk-in Customer", buyer_email = "", recipient_name, custom_amount } = body;
      const typeKey = VOUCHER_LABELS[voucher_type] ? voucher_type : "standard-22";
      const label = VOUCHER_LABELS[typeKey];
      const amount = custom_amount || VOUCHER_AMOUNTS[typeKey];

      const newCode = generateCode();
      const now = new Date();
      const expiry = new Date(now);
      expiry.setFullYear(expiry.getFullYear() + 1);

      const newVoucher = {
        code:           newCode,
        type:           typeKey,
        label,
        amount,
        buyer_name,
        buyer_email,
        recipient_name: recipient_name || buyer_name,
        issued_at:      now.toISOString(),
        expires_at:     expiry.toISOString(),
        redeemed:       false,
        redeemed_at:    null,
        payment_id:     "CMS-MANUAL-" + Date.now()
      };

      const updatedList = [...vouchers, newVoucher];
      await saveVouchers(updatedList, sha);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, message: "Voucher issued successfully", voucher: newVoucher }) };
    }

    if (action === "list") {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, vouchers, envConfigured: Boolean(GITHUB_REPO && GITHUB_TOKEN) }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
