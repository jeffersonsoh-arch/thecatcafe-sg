// Self-contained test for the payment/voucher webhook email behavior.
// Run with: node test/webhook-email-test.js
//
// Mocks https.request (no real network calls, no real Resend/HitPay/GitHub
// credentials needed) and mocks the vouchers.json filesystem read/write so
// nothing in content/vouchers.json is ever touched.
//
// Verifies:
//  1. pay.html flow (payment-webhook.js, ref "PAY-...")    -> a receipt email IS sent.
//  2. Gift voucher flow (voucher-webhook.js, ref "VC-...")  -> a voucher email IS sent.
//  3. A pay.html payment that (mis)routes to voucher-webhook.js (ref "PAY-...")
//     -> NO voucher email is sent (guards the fix in this PR).

process.env.RESEND_API_KEY = "test-resend-key";
process.env.RESEND_FROM    = "info@thecatcafe.sg";
process.env.HITPAY_SALT    = ""; // skip HMAC verification in test
process.env.URL            = "https://thecatcafe-sg.netlify.app";
process.env.SITE_URL       = "https://thecatcafe-sg.netlify.app";
// deliberately no GITHUB_REPO/GITHUB_TOKEN -> voucher-webhook saves locally only

const https = require("https");
const fs = require("fs");
const { EventEmitter } = require("events");

let calls = [];

// ── Mock https.request: record outbound calls instead of hitting the network ──
https.request = function (options, cb) {
  const req = new EventEmitter();
  req.write = function (chunk) { req._body = (req._body || "") + chunk; };
  req.end = function () {
    let parsedBody = req._body;
    try { parsedBody = JSON.parse(req._body); } catch (e) { /* form-encoded, leave as string */ }
    calls.push({ hostname: options.hostname, path: options.path, method: options.method, body: parsedBody });

    const res = new EventEmitter();
    process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        if (options.hostname === "api.hit-pay.com" || options.hostname === "api.sandbox.hit-pay.com") {
          res.emit("data", JSON.stringify({ id: "fake-payment-id", url: "https://securecheckout.hit-pay.com/fake" }));
        } else if (options.hostname === "api.resend.com") {
          res.emit("data", JSON.stringify({ id: "fake-email-id" }));
        } else {
          res.emit("data", "{}");
        }
        res.statusCode = 200;
        res.emit("end");
      });
    });
  };
  req.on = function (event, fn) { EventEmitter.prototype.on.call(req, event, fn); return req; };
  return req;
};

// ── Mock the vouchers.json filesystem so real content/vouchers.json is never touched ──
let fakeVouchersStore = "[]";
const realExistsSync   = fs.existsSync;
const realReadFileSync = fs.readFileSync;
const realWriteFileSync = fs.writeFileSync;

fs.existsSync = function (p) {
  if (String(p).endsWith("vouchers.json")) return true;
  return realExistsSync.apply(fs, arguments);
};
fs.readFileSync = function (p, ...rest) {
  if (String(p).endsWith("vouchers.json")) return fakeVouchersStore;
  return realReadFileSync.apply(fs, [p, ...rest]);
};
fs.writeFileSync = function (p, data, ...rest) {
  if (String(p).endsWith("vouchers.json")) { fakeVouchersStore = data; return; }
  return realWriteFileSync.apply(fs, [p, data, ...rest]);
};

function resendEmailCalls() {
  return calls.filter(c => c.hostname === "api.resend.com" && c.path === "/emails");
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

async function test1_payHtmlSendsReceipt() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/payment-webhook.js")];
  const paymentWebhook = require("../netlify/functions/payment-webhook.js");

  const event = {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      status: "completed",
      reference_number: "PAY-1755500000000",
      email: "guest@example.com",
      name: "Alex Guest",
      amount: "44.00",
      purpose: "Cafe entry - The Cat Cafe Singapore"
    })
  };

  const result = await paymentWebhook.handler(event);
  const emails = resendEmailCalls();

  assert(result.statusCode === 200, "payment-webhook should return 200");
  assert(emails.length === 1, `expected exactly 1 receipt email, got ${emails.length}`);
  assert(emails[0].body.to.includes("guest@example.com"), "receipt should go to the payer");
  assert(/Payment confirmed/.test(emails[0].body.subject), "should be a payment receipt, not a voucher email");

  console.log("PASS  test1: pay.html payment -> receipt email sent to payer");
}

async function test2_giftVoucherSendsVoucherEmail() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/voucher-webhook.js")];
  const voucherWebhook = require("../netlify/functions/voucher-webhook.js");

  const event = {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      status: "completed",
      reference_number: `VC-standard-22-qty1-${Date.now()}`,
      email: "buyer@example.com",
      name: "Sam Buyer",
      amount: "22.00",
      payment_request_id: "fake-payment-id",
      custom_fields: JSON.stringify({ recipient_name: "", recipient_email: "", message: "" })
    })
  };

  const result = await voucherWebhook.handler(event);
  const emails = resendEmailCalls();

  assert(result.statusCode === 200, "voucher-webhook should return 200");
  // Not a gift (no recipient_email) -> 1 voucher email to buyer + 1 internal notification
  assert(emails.length === 2, `expected 2 emails (voucher + internal notice), got ${emails.length}`);
  const voucherEmail = emails.find(e => e.body.to.includes("buyer@example.com"));
  assert(voucherEmail, "a voucher email should be sent to the buyer");
  assert(voucherEmail.body.attachments && voucherEmail.body.attachments.length === 1, "voucher email should carry the PDF ticket");

  console.log("PASS  test2: gift voucher purchase -> voucher email + PDF sent to buyer");
}

async function test3_payHtmlMisroutedToVoucherWebhookSendsNoEmail() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/voucher-webhook.js")];
  const voucherWebhook = require("../netlify/functions/voucher-webhook.js");

  const event = {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({
      status: "completed",
      reference_number: "PAY-1755500000001",
      email: "guest2@example.com",
      name: "Jamie Guest",
      amount: "50.00",
      purpose: "Gift voucher - The Cat Cafe Singapore"
    })
  };

  const result = await voucherWebhook.handler(event);
  const emails = resendEmailCalls();

  assert(result.statusCode === 200, "voucher-webhook should still return 200 (no-op)");
  assert(emails.length === 0, `expected 0 emails for a non-voucher reference, got ${emails.length}`);

  console.log("PASS  test3: pay.html payment reaching voucher-webhook -> no voucher email sent (fix verified)");
}

(async () => {
  try {
    await test1_payHtmlSendsReceipt();
    await test2_giftVoucherSendsVoucherEmail();
    await test3_payHtmlMisroutedToVoucherWebhookSendsNoEmail();
    console.log("\nAll tests passed.");
    process.exitCode = 0;
  } catch (err) {
    console.error("\nTEST FAILURE:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    fs.existsSync = realExistsSync;
    fs.readFileSync = realReadFileSync;
    fs.writeFileSync = realWriteFileSync;
  }
})();
