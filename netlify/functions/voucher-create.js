const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
const HITPAY_HOST    = process.env.HITPAY_ENV === "live"
  ? "api.hit-pay.com"
  : "api.sandbox.hit-pay.com";

// DEPLOY_PRIME_URL/URL are build-time-only Netlify variables and are not injected
// into Functions at runtime, so they can't be used here. Instead, derive the site's
// origin from the incoming request's Host header - the voucher form calls this
// function via a relative fetch(), so Host always reflects whichever domain actually
// served the page (production, a deploy preview, or a branch deploy).
function resolveSiteUrl(event) {
  const host = event.headers && (event.headers.host || event.headers.Host);
  if (host) return `https://${host}`;
  return process.env.SITE_URL || "https://thecatcafe-sg.netlify.app";
}

const VOUCHERS = {
  "standard-22": { amount: "22.00", label: "Standard Entrance Ticket",  desc: "Entry ticket (2 hrs) incl. 1 complimentary drink at The Cat Cafe Singapore" },
  "premium-30":  { amount: "30.00", label: "Premium Entrance Ticket",  desc: "Entry ticket (2 hrs) incl. 1 upgraded drink and a choice of dessert at The Cat Cafe Singapore" },
  "ultimate-40": { amount: "40.00", label: "Ultimate Entrance Ticket", desc: "Entry ticket (2 hrs) incl. 1 upgraded drink, dessert and 1 main course at The Cat Cafe Singapore" },
  "artjam-unguided-40": { amount: "40.00", label: "Unguided Art Jamming Session", desc: "2 hours art jamming with free upgraded drinks and all materials at The Cat Cafe Singapore" },
  "artjam-semi-55": { amount: "55.00", label: "Semi-Guided Art Jamming Session", desc: "3 hours guided art jamming with free upgraded drinks, slice of cake and all materials at The Cat Cafe Singapore" }
};

const VOUCHER_LABELS = {
  "gift-10":  "Gift Voucher",
  "entry-22": "Entry Ticket",
  "standard-22": "Standard Entrance Ticket",
  "premium-30": "Premium Entrance Ticket",
  "ultimate-40": "Ultimate Entrance Ticket",
  "artjam-unguided-40": "Unguided Art Jamming Session",
  "artjam-semi-55": "Semi-Guided Art Jamming Session"
};

function hitpayPost(params) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString();
    const options = {
      hostname: HITPAY_HOST,
      path: "/v1/payment-requests",
      method: "POST",
      headers: {
        "X-BUSINESS-API-KEY": HITPAY_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        console.log("HitPay status:", res.statusCode, data);
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("HitPay non-JSON: " + data)); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST")    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  if (!HITPAY_API_KEY)                return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway not configured" }) };

  try {
    const body = JSON.parse(event.body);
    const { voucher_type, buyer_name, buyer_email, recipient_name, recipient_email, message, quantity = 1, unit_amount, total_amount } = body;

    if (!VOUCHER_LABELS[voucher_type]) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid voucher type" }) };
    if (!buyer_email || !buyer_name)   return { statusCode: 400, headers, body: JSON.stringify({ error: "Name and email required" }) };

    // Determine quantity, unit amount and total; support both new VOUCHERS and legacy VOUCHER_LABELS
    const qty = Math.max(1, parseInt(quantity) || 1);
    let amountNum;
    let label;
    if (VOUCHERS && VOUCHERS[voucher_type]) {
      const unit = unit_amount ? parseFloat(unit_amount) : parseFloat(VOUCHERS[voucher_type].amount);
      amountNum = total_amount ? parseFloat(total_amount) : (unit * qty);
      label = VOUCHERS[voucher_type].label;
    } else {
      // fallback to legacy behaviour
      const legacyUnit = (voucher_type === "entry-22" ? 22 : 10);
      amountNum = total_amount ? parseFloat(total_amount) : (legacyUnit * qty);
      label = VOUCHER_LABELS[voucher_type] || voucher_type;
    }
    const chargeAmount = amountNum.toFixed(2);
    const SITE_URL = resolveSiteUrl(event);

    console.log(`Voucher: ${qty}x ${label} total=S$${chargeAmount}`);

    const reference = `VC-${voucher_type}-qty${qty}-${Date.now()}`;
    const purpose = (VOUCHERS && VOUCHERS[voucher_type])
      ? `${label} (${qty}x S$${(unit_amount ? parseFloat(unit_amount).toFixed(2) : parseFloat(VOUCHERS[voucher_type].amount).toFixed(2))}) - The Cat Cafe Singapore`
      : `${qty > 1 ? qty + "x " : ""}${label} - The Cat Cafe Singapore`;

    const result = await hitpayPost({
      amount:                  chargeAmount,
      currency:                "SGD",
      email:                   buyer_email,
      name:                    buyer_name,
      purpose,
      reference_number:        reference,
      redirect_url:            `${SITE_URL}/voucher-success.html`,
      cancel_url:              `${SITE_URL}/index.html`,
      webhook:                 `${SITE_URL}/.netlify/functions/voucher-webhook`,
      send_sms:                "false",
      allow_repeated_payments: "false",
      custom_fields:           JSON.stringify({ recipient_name, recipient_email, message })
    });

    if (result.status === 200 || result.status === 201) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, checkout_url: result.body.url, reference, amount: chargeAmount, qty }) };
    }
    const err = result.body.message || result.body.error || JSON.stringify(result.body);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway error: " + err }) };

  } catch(err) {
    console.error("voucher-create error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
