const https = require("https");

const HITPAY_API_KEY = process.env.HITPAY_API_KEY;
const SITE_URL = process.env.SITE_URL || "https://thecatcafe-sg.netlify.app";

// Use sandbox or live based on env var
const HITPAY_HOST = process.env.HITPAY_ENV === "live"
  ? "api.hit-pay.com"
  : "api.sandbox.hit-pay.com";

const VOUCHERS = {
  "gift-10":  { amount: "10.00", label: "Gift Voucher",  desc: "S$10 gift voucher redeemable at The Cat Cafe Singapore" },
  "entry-22": { amount: "22.00", label: "Entry Ticket",  desc: "Entry ticket (2 hrs) incl. 1 complimentary drink at The Cat Cafe Singapore" }
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
        console.log("HitPay status:", res.statusCode);
        console.log("HitPay response:", data);
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("HitPay returned non-JSON: " + data)); }
      });
    });
    req.on("error", (e) => {
      console.error("HitPay request error:", e.message);
      reject(e);
    });
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

  // Check API key is set
  if (!HITPAY_API_KEY) {
    console.error("HITPAY_API_KEY not set");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Payment gateway not configured" }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { voucher_type, buyer_name, buyer_email, recipient_name, message, quantity, unit_amount, total_amount } = body;

    if (!VOUCHERS[voucher_type]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid voucher type" }) };
    }
    if (!buyer_email || !buyer_name) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Name and email required" }) };
    }

    // Use dynamic quantity and amounts if provided, otherwise fall back to defaults
    const qty = quantity || 1;
    const amt = unit_amount || parseFloat(VOUCHERS[voucher_type].amount);
    const total = total_amount || (amt * qty);
    
    const voucher = VOUCHERS[voucher_type];
    const reference = `VC-${voucher_type}-${Date.now()}`;

    const result = await hitpayPost({
      amount:                  total.toFixed(2),
      currency:                "SGD",
      email:                   buyer_email,
      name:                    buyer_name,
      purpose:                 `${voucher.label} (${qty}x S$${amt.toFixed(2)}) - The Cat Cafe Singapore`,
      reference_number:        reference,
      redirect_url:            `${SITE_URL}/voucher-success.html`,
      webhook:                 `${SITE_URL}/.netlify/functions/voucher-webhook`,
      send_sms:                "false",
      allow_repeated_payments: "false"
    });

    if (result.status === 200 || result.status === 201) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          checkout_url: result.body.url,
          reference
        })
      };
    } else {
      console.error("HitPay error response:", JSON.stringify(result.body));
      // Surface HitPay's actual error message
      const hitpayError = result.body.message || result.body.error || JSON.stringify(result.body);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Payment gateway error: " + hitpayError })
      };
    }
  } catch(err) {
    console.error("voucher-create error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
