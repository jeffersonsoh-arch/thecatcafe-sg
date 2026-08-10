const https  = require("https");
const crypto = require("crypto");

const HITPAY_SALT = process.env.HITPAY_SALT;
const RESEND_KEY  = process.env.RESEND_API_KEY;
const FROM_EMAIL  = process.env.RESEND_FROM || "info@thecatcafe.sg";
const CAFE_EMAIL  = "info@thecatcafe.sg";

function sendThankYou(to, name, amount) {
  if (!RESEND_KEY || !to) return Promise.resolve(null);
  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  body{margin:0;padding:20px;background:#f5efe8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}
  .wrap{max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;}
  .top{background:#1a1a1a;padding:32px 36px;text-align:center;}
  .top h1{color:#fff;font-size:22px;font-weight:700;margin:0 0 4px;}
  .top p{color:rgba(255,255,255,0.5);font-size:13px;margin:0;}
  .body{padding:32px 36px;text-align:center;}
  .paw{font-size:44px;margin-bottom:16px;}
  .amount{font-size:48px;font-weight:700;color:#D85A30;margin-bottom:8px;}
  .title{font-size:20px;font-weight:600;color:#1a1a1a;margin-bottom:12px;}
  .msg{font-size:14px;color:#555;line-height:1.8;margin-bottom:24px;}
  .cats{background:#f5efe8;border-radius:10px;padding:20px;font-size:13px;color:#555;line-height:1.8;}
  .footer{background:#1a1a1a;padding:20px 36px;text-align:center;}
  .footer p{color:#aaa;font-size:12px;margin:0;line-height:1.8;}
  .footer a{color:#D85A30;text-decoration:none;}
</style></head>
<body><div class="wrap">
  <div class="top"><h1>The Cat Cafe</h1><p>241B Victoria Street, Level 3, Singapore 188030</p></div>
  <div class="body">
    <div class="paw">🐾</div>
    <div class="amount">S$${parseFloat(amount).toFixed(2)}</div>
    <div class="title">Thank you${name ? ", " + name : ""}!</div>
    <div class="msg">Your generous donation goes directly towards the daily care of our 13 rescued cats — their vet bills, food, medicine and everything they need to live their best lives.<br><br>Because of people like you, they have a safe and loving home.</div>
    <div class="cats">🐱 Missy &nbsp; 🐈 Jimmy &nbsp; 🐈‍⬛ Tommy &nbsp; 🐱 Oreo &nbsp; 🐾 Marshmellow<br>🐱 Marmite &nbsp; 🐈 Bobo &nbsp; 🐱 Mochi &nbsp; 🐾 Sushi &nbsp; 🐱 Miso<br>🐈 Shoyu &nbsp; 🐱 Momo &nbsp; 🐈‍⬛ Toby</div>
  </div>
  <div class="footer">
    <p>The Cat Cafe Singapore &middot; <a href="https://thecatcafe.sg">thecatcafe.sg</a><br>
    +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg">info@thecatcafe.sg</a></p>
  </div>
</div></body></html>`;

  return new Promise((resolve) => {
    const payload = JSON.stringify({
      from: `The Cat Cafe <${FROM_EMAIL}>`,
      to: [to],
      subject: `Thank you for your donation – The Cat Cafe Singapore`,
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
      res.on("end", () => { console.log("Resend donate:", res.statusCode); resolve(d); });
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

    console.log("Donate webhook:", JSON.stringify(params));

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

    const email  = params.email  || (params.payments && params.payments[0] && params.payments[0].buyer_email) || "";
    const name   = params.name   || (params.payments && params.payments[0] && params.payments[0].buyer_name)  || "";
    const amount = params.amount || "0";
    const ref    = params.reference_number || params.id || "";

    console.log(`Donation received: S$${amount} from ${name} <${email}> ref:${ref}`);

    // Send thank you to donor
    if (email) await sendThankYou(email, name, amount);

    // Notify cafe
    if (RESEND_KEY) {
      const payload = JSON.stringify({
        from: `The Cat Cafe <${FROM_EMAIL}>`,
        to: [CAFE_EMAIL],
        subject: `New donation: S$${parseFloat(amount).toFixed(2)}${name ? " from " + name : ""}`,
        html: `<p><strong>Amount:</strong> S$${parseFloat(amount).toFixed(2)}<br><strong>Donor:</strong> ${name || "Anonymous"} &lt;${email || "no email"}&gt;<br><strong>Ref:</strong> ${ref}</p>`
      });
      const opts = {
        hostname: "api.resend.com", path: "/emails", method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
      };
      await new Promise(r => { const q = https.request(opts, res => { res.on("data",()=>{}); res.on("end", r); }); q.on("error", r); q.write(payload); q.end(); });
    }

    return { statusCode: 200, body: "OK" };
  } catch(err) {
    console.error("donate-webhook error:", err.message);
    return { statusCode: 200, body: "Error logged" };
  }
};
