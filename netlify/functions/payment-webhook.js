const https   = require("https");
const crypto  = require("crypto");

const HITPAY_SALT  = process.env.HITPAY_SALT;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const FROM_EMAIL   = process.env.RESEND_FROM || "info@thecatcafe.sg";

function sendReceipt(to, name, amount, purpose, reference) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body{margin:0;padding:20px;background:#f5efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;}
  .top{background:#D85A30;padding:32px 36px;text-align:center;}
  .top h1{color:#fff;font-size:22px;font-weight:700;margin:0 0 4px;}
  .top p{color:rgba(255,255,255,0.85);font-size:13px;margin:0;}
  .body{padding:28px 36px;}
  .greeting{font-size:15px;color:#555;margin-bottom:20px;}
  .receipt-box{background:#f5efe8;border-radius:10px;padding:24px;text-align:center;margin-bottom:24px;}
  .receipt-label{font-size:12px;font-weight:600;color:#D85A30;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;}
  .receipt-amount{font-size:44px;font-weight:700;color:#1a1a1a;margin-bottom:8px;}
  .receipt-purpose{font-size:14px;color:#555;margin-bottom:16px;}
  .receipt-ref{font-size:11px;color:#999;font-family:monospace;}
  .footer{background:#1a1a1a;padding:20px 36px;text-align:center;}
  .footer p{color:#aaa;font-size:12px;margin:0;line-height:1.8;}
  .footer a{color:#D85A30;text-decoration:none;}
</style></head>
<body><div class="wrap">
  <div class="top"><h1>The Cat Cafe</h1><p>241B Victoria Street, Level 3, Singapore 188030</p></div>
  <div class="body">
    <div class="greeting">Dear <strong>${name}</strong>, thank you for your payment!</div>
    <div class="receipt-box">
      <div class="receipt-label">Payment receipt</div>
      <div class="receipt-amount">S$${parseFloat(amount).toFixed(2)}</div>
      <div class="receipt-purpose">${purpose}</div>
      <div class="receipt-ref">Ref: ${reference}</div>
    </div>
    <p style="font-size:13px;color:#555;line-height:1.8;">Please show this email to our staff as proof of payment. We hope you enjoy your visit with our cats!</p>
  </div>
  <div class="footer">
    <p>The Cat Cafe Singapore &middot; <a href="https://thecatcafe.sg">thecatcafe.sg</a><br>
    +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg">info@thecatcafe.sg</a></p>
  </div>
</div></body></html>`;

  return new Promise((resolve) => {
    if (!RESEND_KEY) { console.log("No Resend key, skipping email"); resolve(null); return; }
    const payload = JSON.stringify({
      from: `The Cat Cafe <${FROM_EMAIL}>`,
      to: [to],
      subject: `Payment confirmed – S$${parseFloat(amount).toFixed(2)} – The Cat Cafe`,
      html
    });
    const options = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { console.log("Resend:", res.statusCode, d); resolve(d); });
    });
    req.on("error", e => { console.error("Resend error:", e.message); resolve(null); });
    req.write(payload); req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    const hmac = event.headers["x-hitpay-signature"] || event.headers["X-HITPAY-SIGNATURE"] || "";
    let params;
    try { params = JSON.parse(event.body || "{}"); }
    catch(e) { return { statusCode: 400, body: "Invalid JSON" }; }

    console.log("Payment webhook received:", JSON.stringify(params));

    // Verify HMAC
    if (HITPAY_SALT && hmac) {
      const sorted = Object.keys(params).sort().map(k => {
        const v = params[k];
        if (v === null || v === undefined || typeof v === "object") return null;
        return `${k}=${v}`;
      }).filter(Boolean).join("&");
      const computed = crypto.createHmac("sha256", HITPAY_SALT).update(sorted).digest("hex");
      if (computed !== hmac) {
        console.error("HMAC mismatch");
        return { statusCode: 401, body: "Invalid signature" };
      }
    }

    if (params.status !== "completed") {
      return { statusCode: 200, body: "OK - " + params.status };
    }

    const email     = params.email || (params.payments && params.payments[0] && params.payments[0].buyer_email) || "";
    const name      = params.name  || (params.payments && params.payments[0] && params.payments[0].buyer_name)  || "Guest";
    const amount    = params.amount || "0";
    const purpose   = params.purpose || "Cafe payment";
    const reference = params.reference_number || params.id || "";

    if (email) {
      await sendReceipt(email, name, amount, purpose, reference);
      console.log("Receipt sent to:", email);
    }

    return { statusCode: 200, body: "OK" };
  } catch(err) {
    console.error("payment-webhook error:", err.message);
    return { statusCode: 200, body: "Error logged" };
  }
};
