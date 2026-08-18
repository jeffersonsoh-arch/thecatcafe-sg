const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
// DEPLOY_PRIME_URL is Netlify's own context-aware URL: the deploy-preview/branch
// subdomain when running there, and the production URL in production. Falling back
// to SITE_URL/the hardcoded default only for non-Netlify (e.g. local) environments
// keeps redirects pointing back to whichever site actually served the payment.
const SITE_URL       = process.env.DEPLOY_PRIME_URL || process.env.SITE_URL || "https://thecatcafe-sg.netlify.app";

// Use sandbox or live based on env var
const HITPAY_HOST = process.env.HITPAY_ENV === "live"
  ? "api.hit-pay.com"
  : "api.sandbox.hit-pay.com";

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

  if (!HITPAY_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway not configured" }) };
  }

  try {
    const { amount, name, email, purpose } = JSON.parse(event.body);

    if (!amount || parseFloat(amount) < 1) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid amount" }) };
    }
    if (!name || !email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Name and email required" }) };
    }

    const reference = `PAY-${Date.now()}`;

    const result = await hitpayPost({
      amount:                  parseFloat(amount).toFixed(2),
      currency:                "SGD",
      email,
      name,
      purpose:                 `${purpose || "Cafe payment"} - The Cat Cafe Singapore`,
      reference_number:        reference,
      redirect_url:            `${SITE_URL}/pay-success.html`,
      webhook:                 `${SITE_URL}/.netlify/functions/payment-webhook`,
      send_sms:                "false",
      allow_repeated_payments: "false"
    });

    if (result.status === 200 || result.status === 201) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true, checkout_url: result.body.url, reference })
      };
    } else {
      const err = result.body.message || result.body.error || JSON.stringify(result.body);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway error: " + err }) };
    }
  } catch(err) {
    console.error("payment-create error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
