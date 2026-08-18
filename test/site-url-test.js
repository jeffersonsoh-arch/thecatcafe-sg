// Verifies payment-create.js, voucher-create.js, and donate-create.js build their
// HitPay redirect_url/webhook from the calling request's Host header, not a fixed
// value - so a payment started on a deploy preview redirects back to that same
// preview (not production, which won't have preview-only pages like pay-success.html).
//
// Run with: node test/site-url-test.js

process.env.HITPAY_API_KEY = "test-hitpay-key";

const https = require("https");
const { EventEmitter } = require("events");

let calls = [];

https.request = function (options, cb) {
  const req = new EventEmitter();
  req.write = function (chunk) { req._body = (req._body || "") + chunk; };
  req.end = function () {
    calls.push({ hostname: options.hostname, path: options.path, body: req._body });
    const res = new EventEmitter();
    process.nextTick(() => {
      cb(res);
      process.nextTick(() => {
        res.emit("data", JSON.stringify({ id: "fake-payment-id", url: "https://securecheckout.hit-pay.com/fake" }));
        res.statusCode = 200;
        res.emit("end");
      });
    });
  };
  req.on = function (event, fn) { EventEmitter.prototype.on.call(req, event, fn); return req; };
  return req;
};

function lastHitpayCall() {
  return new URLSearchParams(calls[calls.length - 1].body);
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERTION FAILED: " + msg);
}

async function test1_paymentCreateFollowsDeployPreviewHost() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/payment-create.js")];
  const paymentCreate = require("../netlify/functions/payment-create.js");

  const event = {
    httpMethod: "POST",
    headers: { host: "deploy-preview-24--thecatcafe-sg.netlify.app" },
    body: JSON.stringify({ amount: "22.00", name: "Alex Guest", email: "guest@example.com", purpose: "Cafe entry" })
  };
  await paymentCreate.handler(event);
  const params = lastHitpayCall();

  assert(params.get("redirect_url") === "https://deploy-preview-24--thecatcafe-sg.netlify.app/pay-success.html",
    `redirect_url should point back to the deploy preview, got: ${params.get("redirect_url")}`);
  assert(params.get("webhook") === "https://deploy-preview-24--thecatcafe-sg.netlify.app/.netlify/functions/payment-webhook",
    `webhook should point back to the deploy preview, got: ${params.get("webhook")}`);

  console.log("PASS  test1: payment-create.js redirect/webhook follow the deploy-preview Host header");
}

async function test2_paymentCreateFollowsProductionHost() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/payment-create.js")];
  const paymentCreate = require("../netlify/functions/payment-create.js");

  const event = {
    httpMethod: "POST",
    headers: { host: "thecatcafe-sg.netlify.app" },
    body: JSON.stringify({ amount: "22.00", name: "Alex Guest", email: "guest@example.com", purpose: "Cafe entry" })
  };
  await paymentCreate.handler(event);
  const params = lastHitpayCall();

  assert(params.get("redirect_url") === "https://thecatcafe-sg.netlify.app/pay-success.html",
    `redirect_url should point to production, got: ${params.get("redirect_url")}`);

  console.log("PASS  test2: payment-create.js redirect/webhook follow the production Host header");
}

async function test3_voucherCreateFollowsDeployPreviewHost() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/voucher-create.js")];
  const voucherCreate = require("../netlify/functions/voucher-create.js");

  const event = {
    httpMethod: "POST",
    headers: { host: "deploy-preview-24--thecatcafe-sg.netlify.app" },
    body: JSON.stringify({ voucher_type: "standard-22", buyer_name: "Sam Buyer", buyer_email: "buyer@example.com" })
  };
  await voucherCreate.handler(event);
  const params = lastHitpayCall();

  assert(params.get("redirect_url") === "https://deploy-preview-24--thecatcafe-sg.netlify.app/voucher-success.html",
    `redirect_url should point back to the deploy preview, got: ${params.get("redirect_url")}`);
  assert(params.get("webhook") === "https://deploy-preview-24--thecatcafe-sg.netlify.app/.netlify/functions/voucher-webhook",
    `webhook should point back to the deploy preview, got: ${params.get("webhook")}`);

  console.log("PASS  test3: voucher-create.js redirect/webhook follow the deploy-preview Host header");
}

async function test4_donateCreateFollowsDeployPreviewHost() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/donate-create.js")];
  const donateCreate = require("../netlify/functions/donate-create.js");

  const event = {
    httpMethod: "POST",
    headers: { host: "deploy-preview-24--thecatcafe-sg.netlify.app" },
    body: JSON.stringify({ amount: "50.00" })
  };
  await donateCreate.handler(event);
  const params = lastHitpayCall();

  assert(params.get("redirect_url") === "https://deploy-preview-24--thecatcafe-sg.netlify.app/?donated=true#donate",
    `redirect_url should point back to the deploy preview, got: ${params.get("redirect_url")}`);

  console.log("PASS  test4: donate-create.js redirect/webhook follow the deploy-preview Host header");
}

async function test5_fallsBackWhenNoHostHeader() {
  calls = [];
  delete require.cache[require.resolve("../netlify/functions/payment-create.js")];
  const paymentCreate = require("../netlify/functions/payment-create.js");

  const event = {
    httpMethod: "POST",
    headers: {},
    body: JSON.stringify({ amount: "22.00", name: "Alex Guest", email: "guest@example.com", purpose: "Cafe entry" })
  };
  await paymentCreate.handler(event);
  const params = lastHitpayCall();

  assert(params.get("redirect_url") === "https://thecatcafe-sg.netlify.app/pay-success.html",
    `should fall back to the hardcoded default, got: ${params.get("redirect_url")}`);

  console.log("PASS  test5: falls back to the hardcoded default when Host header is missing");
}

(async () => {
  try {
    await test1_paymentCreateFollowsDeployPreviewHost();
    await test2_paymentCreateFollowsProductionHost();
    await test3_voucherCreateFollowsDeployPreviewHost();
    await test4_donateCreateFollowsDeployPreviewHost();
    await test5_fallsBackWhenNoHostHeader();
    console.log("\nAll tests passed.");
    process.exitCode = 0;
  } catch (err) {
    console.error("\nTEST FAILURE:", err.message);
    console.error(err.stack);
    process.exitCode = 1;
  }
})();
