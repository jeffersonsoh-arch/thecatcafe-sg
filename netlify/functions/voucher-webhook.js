const https = require("https");
const crypto = require("crypto");

const HITPAY_SALT    = process.env.HITPAY_SALT;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH  = process.env.GITHUB_BRANCH || "main";
const FROM_EMAIL     = "info@thecatcafe.sg";
const SITE_URL       = process.env.URL || "https://thecatcafe-sg.netlify.app";

// ── Verify HitPay HMAC ──
function verifyHitPay(params, hmacReceived) {
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join("&");
  const computed = crypto.createHmac("sha256", HITPAY_SALT).update(sorted).digest("hex");
  console.log("HMAC computed:", computed);
  console.log("HMAC received:", hmacReceived);
  return computed === hmacReceived;
}

// ── Generate unique voucher code ──
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TCC";
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Build voucher email HTML ──
function buildVoucherHTML(code, label, amount, recipientName, buyerName, expiry, message) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><style>
  body{margin:0;padding:20px;background:#f5efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;}
  .header{background:#D85A30;padding:36px 40px;text-align:center;}
  .header h1{color:#fff;font-size:26px;font-weight:700;margin:0 0 4px;}
  .header p{color:rgba(255,255,255,0.85);font-size:13px;margin:0;}
  .body{padding:32px 40px;}
  .to{font-size:14px;color:#555;margin-bottom:20px;}
  .voucher-box{background:#f5efe8;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;}
  .vtype{font-size:12px;font-weight:700;color:#D85A30;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;}
  .vamount{font-size:44px;font-weight:700;color:#1a1a1a;margin-bottom:4px;}
  .vdesc{font-size:13px;color:#555;margin-bottom:20px;}
  .code-label{font-size:11px;font-weight:600;color:#999;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px;}
  .code{font-size:24px;font-weight:700;letter-spacing:0.15em;color:#1a1a1a;font-family:monospace;background:#fff;padding:12px 24px;border-radius:8px;border:2px dashed #D85A30;display:inline-block;}
  .expiry{font-size:12px;color:#999;margin-top:10px;}
  .msg-box{background:#EEEDFE;border-radius:8px;padding:14px 18px;margin-bottom:20px;font-size:14px;color:#3C3489;font-style:italic;line-height:1.6;}
  .instructions{font-size:13px;color:#555;line-height:1.9;margin-bottom:20px;}
  .footer{background:#1a1a1a;padding:24px 40px;text-align:center;}
  .footer p{color:#aaa;font-size:12px;margin:0;line-height:1.8;}
  .footer a{color:#D85A30;text-decoration:none;}
</style></head>
<body>
<div class="wrap">
  <div class="header">
    <h1>The Cat Cafe</h1>
    <p>241B Victoria Street, Level 3, Singapore 188030</p>
  </div>
  <div class="body">
    <div class="to">Dear <strong>${recipientName}</strong>${buyerName !== recipientName ? `, <em>${buyerName}</em> has sent you a gift!` : `, thank you for your purchase!`}</div>
    ${message ? `<div class="msg-box">"${message}"</div>` : ""}
    <div class="voucher-box">
      <div class="vtype">${label}</div>
      <div class="vamount">S$${amount}</div>
      <div class="vdesc">Redeemable at The Cat Cafe Singapore, Bugis</div>
      <div class="code-label">Your voucher code</div>
      <div class="code">${code}</div>
      <div class="expiry">Valid until ${expiry}</div>
    </div>
    <div class="instructions">
      <strong>How to redeem:</strong><br>
      1. Visit us at 241B Victoria Street, Level 3, Bugis (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Staff will verify and mark it as redeemed — one use only<br><br>
      <strong>Terms:</strong> Valid 12 months from purchase. Non-refundable. Cannot be exchanged for cash.
    </div>
  </div>
  <div class="footer">
    <p>The Cat Cafe Singapore &middot; <a href="https://thecatcafe.sg">thecatcafe.sg</a><br>
    +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg">info@thecatcafe.sg</a><br>
    <a href="https://www.instagram.com/sgcatcafe">@sgcatcafe</a></p>
  </div>
</div>
</body></html>`;
}

// ── Send email via Resend ──
function sendEmail(to, subject, html) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: `The Cat Cafe <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html
    });
    const options = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        console.log("Resend status:", res.statusCode, data);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on("error", (e) => {
      console.error("Resend error:", e.message);
      reject(e);
    });
    req.write(payload);
    req.end();
  });
}

// ── Save voucher to GitHub ──
async function saveVoucher(voucher) {
  // Get current file + SHA
  const current = await new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/content/vouchers.json?ref=${GITHUB_BRANCH}`,
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json"
      }
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
          console.log("vouchers.json not found or empty, starting fresh");
          resolve({ sha: null, vouchers: [] });
        }
      });
    }).on("error", () => resolve({ sha: null, vouchers: [] }));
  });

  const vouchers = [...current.vouchers, voucher];
  const newContent = Buffer.from(JSON.stringify(vouchers, null, 2)).toString("base64");
  const body = JSON.stringify({
    message: `New voucher: ${voucher.code}`,
    content: newContent,
    branch: GITHUB_BRANCH,
    ...(current.sha ? { sha: current.sha } : {})
  });

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
      res.on("end", () => {
        console.log("GitHub save status:", res.statusCode);
        resolve(JSON.parse(data));
      });
    });
    req.on("error", (e) => {
      console.error("GitHub save error:", e.message);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log("Webhook received. Method:", event.httpMethod);
  console.log("Body:", event.body);

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    // Parse form-encoded body
    const params = {};
    (event.body || "").split("&").forEach(pair => {
      const [k, v] = pair.split("=");
      if (k) params[decodeURIComponent(k)] = decodeURIComponent((v || "").replace(/\+/g, " "));
    });

    console.log("Parsed params:", JSON.stringify(params));

    // Extract and verify HMAC
    const hmac = params.hmac;
    delete params.hmac;

    if (HITPAY_SALT && !verifyHitPay(params, hmac)) {
      console.error("HMAC verification failed");
      return { statusCode: 401, body: "Invalid signature" };
    }

    // Only process completed payments
    if (params.status !== "completed") {
      console.log("Payment not completed, status:", params.status);
      return { statusCode: 200, body: "OK - status: " + params.status };
    }

    // Parse voucher type from reference
    const ref = params.reference_number || "";
    const typeMatch = ref.match(/^VC-(gift-10|entry-22)-\d+$/);
    const voucherType = typeMatch ? typeMatch[1] : "gift-10";
    const label  = voucherType === "entry-22" ? "Entry Ticket" : "Gift Voucher";
    const amount = voucherType === "entry-22" ? "22.00" : "10.00";

    const code = generateCode();
    const now    = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryStr = expiry.toLocaleDateString("en-SG", { day:"numeric", month:"long", year:"numeric" });

    const buyerEmail    = params.email || "";
    const buyerName     = params.name  || "Customer";
    const recipientName = buyerName;

    // 1. Save voucher to GitHub first (most important)
    const voucherRecord = {
      code,
      type:           voucherType,
      label,
      amount,
      buyer_name:     buyerName,
      buyer_email:    buyerEmail,
      recipient_name: recipientName,
      issued_at:      now.toISOString(),
      expires_at:     expiry.toISOString(),
      redeemed:       false,
      redeemed_at:    null,
      payment_id:     params.payment_request_id || ref
    };

    console.log("Saving voucher:", JSON.stringify(voucherRecord));
    await saveVoucher(voucherRecord);
    console.log("Voucher saved to GitHub successfully");

    // 2. Send customer email
    if (RESEND_API_KEY && buyerEmail) {
      const html = buildVoucherHTML(code, label, amount, recipientName, buyerName, expiryStr, "");
      await sendEmail(buyerEmail, `Your ${label} – The Cat Cafe Singapore`, html);
      console.log("Customer email sent to:", buyerEmail);
    } else {
      console.warn("Resend not configured or no buyer email — skipping customer email");
    }

    // 3. Notify cafe
    if (RESEND_API_KEY) {
      await sendEmail(
        FROM_EMAIL,
        `New voucher sold: ${code} (${label} S$${amount})`,
        `<p><strong>Code:</strong> ${code}<br>
         <strong>Type:</strong> ${label} (S$${amount})<br>
         <strong>Buyer:</strong> ${buyerName} &lt;${buyerEmail}&gt;<br>
         <strong>Payment ID:</strong> ${params.payment_request_id || ref}<br>
         <strong>Issued:</strong> ${now.toLocaleString("en-SG")}<br>
         <strong>Expires:</strong> ${expiryStr}</p>`
      );
      console.log("Cafe notification sent");
    }

    return { statusCode: 200, body: "OK" };

  } catch(err) {
    console.error("Webhook handler error:", err.message, err.stack);
    // Return 200 so HitPay doesn't keep retrying on our errors
    return { statusCode: 200, body: "Error logged: " + err.message };
  }
};
