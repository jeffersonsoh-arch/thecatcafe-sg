// Post-merge verification for PR #24 (the voucher-webhook guard + Host-derived
// redirect/webhook URLs). Confirms, against the actual merged code:
//
//   1. Gift vouchers ARE sent for every real voucher purchase:
//        - buy-for-self: buyer gets the voucher email (with PDF ticket).
//        - true gift (recipient != buyer): buyer gets a receipt-only email,
//          recipient gets the voucher email (with PDF ticket).
//   2. Vouchers are NEVER sent for pay.html payments or donations, whether
//      they reach voucher-webhook.js directly or via their own dedicated
//      webhook (payment-webhook.js / donate-webhook.js).
//
// Mocks https.request (no real network calls) and the vouchers.json
// filesystem (no real content/vouchers.json is touched).
//
// Run with: node test/post-merge-verification-test.js

process.env.RESEND_API_KEY = "test-resend-key";
process.env.RESEND_FROM    = "info@thecatcafe.sg";
process.env.HITPAY_SALT    = "";
process.env.URL            = "https://thecatcafe-sg.netlify.app";
process.env.SITE_URL       = "https://thecatcafe-sg.netlify.app";

const https = require("https");
const fs = require("fs");
const { EventEmitter } = require("events");

let calls = [];

https.request = function (options, cb) {
  const req = new EventEmitter();
  req.write = function (chunk) { req._body = (req._body || "") + chunk; };
  req.end = function () {
    let parsedBody = req._body;
    try { parsedBody = JSON.parse(req._body); } catch (e) { /* form-encoded */ }
    calls.push({ hostname: options.hostname, path: options.path, body: parsedBody });
    const res = new EventEmitter();
    process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        res.emit("data", JSON.stringify({ id: "fake-id", url: "https://securecheckout.hit-pay.com/fake" }));
        res.statusCode = 200;
        res.emit("end");
      });
    });
  };
  req.on = function (event, fn) { EventEmitter.prototype.on.call(req, event, fn); return req; };
  return req;
};

let fakeVouchersStore = "[]";
const realExistsSync   = fs.existsSync;
const realReadFileSync = fs.readFileSync;
const realWriteFileSync = fs.writeFileSync;
fs.existsSync = function (p) { return String(p).endsWith("vouchers.json") ? true : realExistsSync.apply(fs, arguments); };
fs.readFileSync = function (p, ...rest) { return String(p).endsWith("vouchers.json") ? fakeVouchersStore : realReadFileSync.apply(fs, [p, ...rest]); };
fs.writeFileSync = function (p, data, ...rest) {
  if (String(p).endsWith("vouchers.json")) { fakeVouchersStore = data; return; }
  return realWriteFileSync.apply(fs, [p, data, ...rest]);
};

function resendEmailCalls() { return calls.filter(c => c.hostname === "api.resend.com" && c.path === "/emails"); }
function assert(cond, msg) { if (!cond) throw new Error("ASSERTION FAILED: " + msg); }
function freshRequire(relPath) {
  const full = require.resolve(relPath);
  delete require.cache[full];
  return require(full);
}

async function test1_selfPurchaseVoucherSent() {
  calls = [];
  const voucherWebhook = freshRequire("../netlify/functions/voucher-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({
      status: "completed",
      reference_number: `VC-standard-22-qty1-${Date.now()}`,
      email: "buyer@example.com", name: "Sam Buyer", amount: "22.00",
      payment_request_id: "fake-id",
      custom_fields: JSON.stringify({ recipient_name: "", recipient_email: "", message: "" })
    })
  };
  const result = await voucherWebhook.handler(event);
  const emails = resendEmailCalls();

  assert(result.statusCode === 200, "voucher-webhook should return 200");
  const voucherEmail = emails.find(e => e.body.to.includes("buyer@example.com") && e.body.attachments && e.body.attachments.length);
  assert(voucherEmail, "buyer should receive the voucher email with a PDF ticket");
  assert(/Standard Entrance Ticket/.test(voucherEmail.body.subject), `expected voucher subject, got: ${voucherEmail.body.subject}`);

  console.log("PASS  test1: buy-for-self voucher purchase -> voucher email + PDF sent to buyer");
}

async function test2_trueGiftSendsReceiptToBuyerAndVoucherToRecipient() {
  calls = [];
  const voucherWebhook = freshRequire("../netlify/functions/voucher-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({
      status: "completed",
      reference_number: `VC-premium-30-qty1-${Date.now()}`,
      email: "buyer@example.com", name: "Sam Buyer", amount: "30.00",
      payment_request_id: "fake-id",
      custom_fields: JSON.stringify({ recipient_name: "Robin Recipient", recipient_email: "recipient@example.com", message: "Enjoy!" })
    })
  };
  const result = await voucherWebhook.handler(event);
  const emails = resendEmailCalls();

  assert(result.statusCode === 200, "voucher-webhook should return 200");

  const receiptEmail = emails.find(e => e.body.to.includes("buyer@example.com"));
  assert(receiptEmail, "buyer should receive a receipt email");
  assert(!receiptEmail.body.attachments || receiptEmail.body.attachments.length === 0, "buyer's receipt email should NOT carry the voucher PDF");
  assert(/Order Confirmation/.test(receiptEmail.body.subject), `expected a receipt subject for buyer, got: ${receiptEmail.body.subject}`);

  const voucherEmail = emails.find(e => e.body.to.includes("recipient@example.com"));
  assert(voucherEmail, "recipient should receive the voucher email");
  assert(voucherEmail.body.attachments && voucherEmail.body.attachments.length === 1, "recipient's email should carry the voucher PDF ticket");

  console.log("PASS  test2: true gift purchase -> receipt to buyer, voucher email + PDF to recipient");
}

async function test3_payHtmlNeverTriggersVoucherWebhook() {
  calls = [];
  const voucherWebhook = freshRequire("../netlify/functions/voucher-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({ status: "completed", reference_number: `PAY-${Date.now()}`, email: "guest@example.com", name: "Guest", amount: "44.00", purpose: "Cafe entry" })
  };
  const result = await voucherWebhook.handler(event);
  assert(result.statusCode === 200, "should return 200 (no-op)");
  assert(resendEmailCalls().length === 0, "no voucher email should be sent for a pay.html reference");
  console.log("PASS  test3: pay.html payment reaching voucher-webhook.js -> no voucher sent");
}

async function test4_payHtmlOwnWebhookSendsReceiptOnly() {
  calls = [];
  const paymentWebhook = freshRequire("../netlify/functions/payment-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({ status: "completed", reference_number: `PAY-${Date.now()}`, email: "guest@example.com", name: "Guest", amount: "44.00", purpose: "Cafe entry" })
  };
  const result = await paymentWebhook.handler(event);
  const emails = resendEmailCalls();
  assert(result.statusCode === 200, "should return 200");
  assert(emails.length === 1, `expected exactly 1 email, got ${emails.length}`);
  assert(!emails[0].body.attachments || emails[0].body.attachments.length === 0, "receipt should carry no voucher PDF");
  assert(/Payment confirmed/.test(emails[0].body.subject), `expected a receipt subject, got: ${emails[0].body.subject}`);
  console.log("PASS  test4: pay.html payment via payment-webhook.js -> plain receipt only, no voucher");
}

async function test5_donationNeverTriggersVoucherWebhook() {
  calls = [];
  const voucherWebhook = freshRequire("../netlify/functions/voucher-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({ status: "completed", reference_number: `DON-${Date.now()}`, email: "donor@example.com", name: "Donor", amount: "50.00" })
  };
  const result = await voucherWebhook.handler(event);
  assert(result.statusCode === 200, "should return 200 (no-op)");
  assert(resendEmailCalls().length === 0, "no voucher email should be sent for a donation reference");
  console.log("PASS  test5: donation reaching voucher-webhook.js -> no voucher sent");
}

async function test6_donationOwnWebhookSendsThankYouOnly() {
  calls = [];
  const donateWebhook = freshRequire("../netlify/functions/donate-webhook.js");
  const event = {
    httpMethod: "POST", headers: {},
    body: JSON.stringify({ status: "completed", reference_number: `DON-${Date.now()}`, email: "donor@example.com", name: "Donor", amount: "50.00" })
  };
  const result = await donateWebhook.handler(event);
  const emails = resendEmailCalls();
  assert(result.statusCode === 200, "should return 200");
  const donorEmail = emails.find(e => e.body.to.includes("donor@example.com"));
  assert(donorEmail, "donor should receive a thank-you email");
  assert(!donorEmail.body.attachments || donorEmail.body.attachments.length === 0, "thank-you email should carry no voucher PDF");
  assert(/[Tt]hank you/.test(donorEmail.body.subject), `expected a thank-you subject, got: ${donorEmail.body.subject}`);
  console.log("PASS  test6: donation via donate-webhook.js -> thank-you only, no voucher");
}

(async () => {
  try {
    await test1_selfPurchaseVoucherSent();
    await test2_trueGiftSendsReceiptToBuyerAndVoucherToRecipient();
    await test3_payHtmlNeverTriggersVoucherWebhook();
    await test4_payHtmlOwnWebhookSendsReceiptOnly();
    await test5_donationNeverTriggersVoucherWebhook();
    await test6_donationOwnWebhookSendsThankYouOnly();
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
