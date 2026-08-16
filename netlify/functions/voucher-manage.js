const https = require("https");
const fs = require("fs");
const path = require("path");

const GITHUB_REPO   = process.env.GITHUB_REPO;
const GITHUB_TOKEN  = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const VOUCHER_LABELS = {
  "standard-22": "Standard Entrance Ticket",
  "premium-30":  "Premium Entrance Ticket",
  "ultimate-40": "Ultimate Entrance Ticket",
  "artjam-unguided-40": "Unguided Art Jamming Session",
  "artjam-semi-55": "Semi-Guided Art Jamming Session"
};

const VOUCHER_AMOUNTS = {
  "standard-22": "22.00",
  "premium-30":  "30.00",
  "ultimate-40": "40.00",
  "artjam-unguided-40": "40.00",
  "artjam-semi-55": "55.00"
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

async function sendVoucherEmail(voucher, personal_message) {
  if (!RESEND_API_KEY) {
    console.log("Resend API key not configured, skipping email send");
    return;
  }
  
  const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #D85A30; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border: 1px solid #e0dbd5; }
    .voucher-box { background: white; border: 2px dashed #D85A30; padding: 25px; margin: 20px 0; border-radius: 8px; text-align: center; }
    .voucher-code { font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #D85A30; margin: 15px 0; font-family: monospace; }
    .voucher-amount { font-size: 32px; font-weight: bold; color: #3C3489; margin: 10px 0; }
    .personal-message { background: #EEEDFE; padding: 15px; border-radius: 6px; margin: 20px 0; font-style: italic; }
    .footer { background: #333; color: #fff; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
    .details { text-align: left; margin: 20px 0; }
    .details p { margin: 8px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎁 Your Gift Voucher from The Cat Cafe!</h1>
    </div>
    <div class="content">
      <p>Dear ${voucher.recipient_name},</p>
      <p>You've received a gift voucher from <strong>${voucher.buyer_name}</strong>!</p>
      
      ${personal_message ? `<div class="personal-message"><strong>Personal Message:</strong><br>${personal_message}</div>` : ''}
      
      <div class="voucher-box">
        <div style="font-size: 14px; color: #666;">${voucher.label}</div>
        <div class="voucher-amount">S$${voucher.amount}</div>
        <div class="voucher-code">${voucher.code}</div>
        <div style="font-size: 12px; color: #999;">Valid until: ${new Date(voucher.expires_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
      </div>
      
      <div class="details">
        <p><strong>Voucher Details:</strong></p>
        <p>Type: ${voucher.label}</p>
        <p>Amount: S$${voucher.amount}</p>
        <p>Code: <span style="font-family: monospace;">${voucher.code}</span></p>
        <p>Valid Until: ${new Date(voucher.expires_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      
      <p style="margin-top: 25px;"><strong>How to Redeem:</strong></p>
      <p>Simply present this voucher code at The Cat Cafe when you visit. You can show this email or mention the code to our staff.</p>
      
      <p style="margin-top: 25px;">We look forward to seeing you at The Cat Cafe!</p>
      <p>Warm regards,<br><strong>The Cat Cafe Team</strong></p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>&copy; ${new Date().getFullYear()} The Cat Cafe. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
  
  const plainTextContent = `
Dear ${voucher.recipient_name},

You've received a gift voucher from ${voucher.buyer_name}!

${personal_message ? `Personal Message: ${personal_message}` : ''}

VOUCHER DETAILS:
Type: ${voucher.label}
Amount: S$${voucher.amount}
Code: ${voucher.code}
Valid Until: ${new Date(voucher.expires_at).toLocaleDateString('en-SG', { year: 'numeric', month: 'long', day: 'numeric' })}

How to Redeem:
Simply present this voucher code at The Cat Cafe when you visit.

We look forward to seeing you at The Cat Cafe!

Warm regards,
The Cat Cafe Team
  `.trim();

  const requestBody = {
    from: "noreply@catcafe.com",
    to: [voucher.recipient_email],
    subject: `🎁 You've received a gift voucher from ${voucher.buyer_name}!`,
    html: emailContent,
    text: plainTextContent
  };

  return new Promise((resolve, reject) => {
    const body = JSON.stringify(requestBody);
    const options = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log("Voucher email sent successfully to", voucher.recipient_email);
          resolve({ ok: true });
        } else {
          reject(new Error(`Resend API error: ${res.statusCode} - ${data}`));
        }
      });
    });
    
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function getVouchers() {
  return new Promise((resolve) => {
    // Use absolute path that works in both local development and Netlify deployment
    const localPath = path.resolve(__dirname, '../../content/vouchers.json');
    let localVouchers = [];
    try {
      if (fs.existsSync(localPath)) {
        const content = fs.readFileSync(localPath, "utf8");
        localVouchers = JSON.parse(content);
        console.log("Loaded", localVouchers.length, "vouchers from local file");
      } else {
        console.warn("Local vouchers.json not found at:", localPath);
      }
    } catch(e) {
      console.error("Could not read local vouchers.json:", e.message);
    }
    
    // If GitHub credentials are configured, fetch from GitHub (source of truth)
    if (!GITHUB_REPO || !GITHUB_TOKEN) {
      console.log("GitHub credentials not configured, using local file with", localVouchers.length, "vouchers");
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
  const localPath = path.resolve(__dirname, '../../content/vouchers.json');
  
  // Always save to local file first (for immediate effect and as backup)
  try {
    fs.writeFileSync(localPath, content, "utf8");
    console.log("Vouchers saved to local file:", localPath, "- Total:", vouchers.length);
  } catch(e) {
    console.error("Failed to save local vouchers.json:", e.message);
  }
  
  // If GitHub credentials are configured, also push to GitHub
  if (!GITHUB_REPO || !GITHUB_TOKEN) {
    console.log("GitHub credentials not configured - vouchers saved locally only");
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
      const { voucher_type = "standard-22", buyer_name = "Walk-in Customer", buyer_email = "", recipient_name, recipient_email, personal_message, custom_amount } = body;
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
        recipient_email: recipient_email || "",
        personal_message: personal_message || "",
        issued_at:      now.toISOString(),
        expires_at:     expiry.toISOString(),
        redeemed:       false,
        redeemed_at:    null,
        payment_id:     "CMS-MANUAL-" + Date.now()
      };

      const updatedList = [...vouchers, newVoucher];
      await saveVouchers(updatedList, sha);
      
      // Send email to recipient if recipient email is provided
      if (recipient_email) {
        try {
          await sendVoucherEmail(newVoucher, personal_message);
        } catch (emailErr) {
          console.error("Failed to send voucher email:", emailErr.message);
          // Don't fail the request, just log the error
        }
      }
      
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
