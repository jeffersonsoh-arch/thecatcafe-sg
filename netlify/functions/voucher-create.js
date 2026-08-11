const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
const SITE_URL       = process.env.SITE_URL || "https://thecatcafe-sg.netlify.app";
const HITPAY_HOST    = process.env.HITPAY_ENV === "live"
  ? "api.hit-pay.com"
  : "api.sandbox.hit-pay.com";

const VOUCHER_LABELS = {
  "gift-10":  "Gift Voucher",
  "entry-22": "Entry Ticket"
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
    const { voucher_type, quantity = 1, unit_amount, total_amount, buyer_name, buyer_email, recipient_name, message } = body;

    if (!VOUCHER_LABELS[voucher_type]) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid voucher type" }) };
    if (!buyer_email || !buyer_name)   return { statusCode: 400, headers, body: JSON.stringify({ error: "Name and email required" }) };

    const label = VOUCHER_LABELS[voucher_type];
    const qty   = Math.max(1, parseInt(quantity) || 1);

    // Use total_amount from frontend — it already reflects qty × unit price
    let chargeAmount;
    if (total_amount && parseFloat(total_amount) > 0) {
      chargeAmount = parseFloat(total_amount).toFixed(2);
    } else if (unit_amount && parseFloat(unit_amount) > 0) {
      chargeAmount = (parseFloat(unit_amount) * qty).toFixed(2);
    } else {
      chargeAmount = ((voucher_type === "entry-22" ? 22 : 10) * qty).toFixed(2);
    }

    console.log(`Voucher: ${qty}x ${label} total=S$${chargeAmount}`);

    const reference = `VC-${voucher_type}-${Date.now()}`;
    const purpose   = `${qty > 1 ? qty + "x " : ""}${label} - The Cat Cafe Singapore`;

    const result = await hitpayPost({
      amount:                  chargeAmount,
      currency:                "SGD",
      email:                   buyer_email,
      name:                    buyer_name,
      purpose,
      reference_number:        reference,
      redirect_url:            `${SITE_URL}/voucher-success.html`,
      webhook:                 `${SITE_URL}/.netlify/functions/voucher-webhook`,
      send_sms:                "false",
      allow_repeated_payments: "false"
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
