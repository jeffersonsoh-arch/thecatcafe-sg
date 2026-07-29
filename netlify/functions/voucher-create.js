const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
const HITPAY_API_URL = "api.hit-pay.com";
const SITE_URL = process.env.URL || "https://thecatcafe.sg";

const VOUCHERS = {
  "gift-10":    { amount: "10.00",  label: "Gift Voucher",     desc: "S$10 gift voucher redeemable at The Cat Cafe Singapore" },
  "entry-22":   { amount: "22.00",  label: "Entry Ticket",     desc: "Entry ticket (2 hrs) incl. 1 complimentary drink at The Cat Cafe Singapore" }
};

function hitpayPost(path, params) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(params).toString();
    const options = {
      hostname: HITPAY_API_URL,
      path,
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
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("Invalid JSON: " + data)); }
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
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { voucher_type, buyer_name, buyer_email, recipient_name, message } = JSON.parse(event.body);

    if (!VOUCHERS[voucher_type]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid voucher type" }) };
    }
    if (!buyer_email || !buyer_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Name and email required" }) };
    }

    const voucher = VOUCHERS[voucher_type];

    const result = await hitpayPost("/v1/payment-requests", {
      amount:           voucher.amount,
      currency:         "SGD",
      email:            buyer_email,
      name:             buyer_name,
      purpose:          voucher.label + " - The Cat Cafe Singapore",
      reference_number: `VC-${voucher_type}-${Date.now()}`,
      redirect_url:     `${SITE_URL}/voucher-success.html`,
      webhook:          `${SITE_URL}/.netlify/functions/voucher-webhook`,
      // Pass metadata through reference
      send_sms:         false,
      allow_repeated_payments: false
    });

    if (result.status === 200 || result.status === 201) {
      // Store purchase metadata in the payment request reference
      // We encode it in the redirect URL so webhook can pick it up
      const checkoutUrl = result.body.url;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          checkout_url: checkoutUrl,
          reference: result.body.id,
          // Pass buyer info so webhook email works
          meta: { buyer_name, buyer_email, recipient_name: recipient_name || buyer_name, message: message || "", voucher_type, label: voucher.label, amount: voucher.amount }
        })
      };
    } else {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "HitPay error", detail: result.body }) };
    }
  } catch(err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
