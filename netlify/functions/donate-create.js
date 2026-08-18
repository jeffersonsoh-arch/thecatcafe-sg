const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
const HITPAY_HOST    = process.env.HITPAY_ENV === "live"
  ? "api.hit-pay.com"
  : "api.sandbox.hit-pay.com";

// DEPLOY_PRIME_URL/URL are build-time-only Netlify variables and are not injected
// into Functions at runtime, so they can't be used here. Instead, derive the site's
// origin from the incoming request's Host header - the donate form calls this
// function via a relative fetch(), so Host always reflects whichever domain actually
// served the page (production, a deploy preview, or a branch deploy).
function resolveSiteUrl(event) {
  const host = event.headers && (event.headers.host || event.headers.Host);
  if (host) return `https://${host}`;
  return process.env.SITE_URL || "https://thecatcafe-sg.netlify.app";
}

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
        console.log("HitPay donate status:", res.statusCode, data);
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

  if (!HITPAY_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway not configured" }) };
  }

  try {
    const { amount } = JSON.parse(event.body);

    if (!amount || parseFloat(amount) < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Minimum donation is S$1" }) };
    }

    const SITE_URL = resolveSiteUrl(event);
    const reference = `DON-${Date.now()}`;

    const result = await hitpayPost({
      amount:                  parseFloat(amount).toFixed(2),
      currency:                "SGD",
      purpose:                 "Cat welfare donation - The Cat Cafe Singapore",
      reference_number:        reference,
      redirect_url:            `${SITE_URL}/?donated=true#donate`,
      webhook:                 `${SITE_URL}/.netlify/functions/donate-webhook`,
      send_sms:                "false",
      allow_repeated_payments: "false",
      // Allow donor to enter their own email on HitPay checkout
      email:                   ""
    });

    if (result.status === 200 || result.status === 201) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, checkout_url: result.body.url, reference })
      };
    } else {
      const err = result.body.message || result.body.error || JSON.stringify(result.body);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment error: " + err }) };
    }
  } catch(err) {
    console.error("donate-create error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
