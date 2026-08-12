const https = require("https");
const crypto = require("crypto");

const HITPAY_SALT    = process.env.HITPAY_SALT;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const GITHUB_REPO    = process.env.GITHUB_REPO;
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH  = process.env.GITHUB_BRANCH || "main";
const FROM_EMAIL     = process.env.RESEND_FROM || "info@thecatcafe.sg";
const SITE_URL       = process.env.URL || "https://thecatcafe-sg.netlify.app";

// ── Voucher type definitions ──
const VOUCHER_DEFS = {
  "standard-22": {
    label:       "Standard Entrance Ticket",
    tier:        "Standard",
    tagline:     "A cosy escape with our resident cats",
    perks: [
      { icon: "🕐", text: "2 hours of cat café access" },
      { icon: "🥤", text: "1 complimentary canned drink" },
      { icon: "🐱", text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#2F8F6E",
    accentLight:   "#E6F5F0",
    badgeGradient: "linear-gradient(135deg, #2F8F6E 0%, #1a6b52 100%)",
    headerBg:      "linear-gradient(160deg, #1a6b52 0%, #2F8F6E 60%, #3aab84 100%)",
    ribbonLabel:   "STANDARD",
    emailSubject:  "Your Standard Entrance Ticket – The Cat Cafe Singapore"
  },
  "premium-30": {
    label:       "Premium Entrance Ticket",
    tier:        "Premium",
    tagline:     "A premium pawsome experience awaits you",
    perks: [
      { icon: "🕐", text: "2 hours of cat café access" },
      { icon: "☕", text: "1 premium upgraded drink of your choice" },
      { icon: "🍰", text: "A delightful dessert of your choice" },
      { icon: "🐱", text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#C4832A",
    accentLight:   "#FDF3E5",
    badgeGradient: "linear-gradient(135deg, #C4832A 0%, #a0641a 100%)",
    headerBg:      "linear-gradient(160deg, #7a4a10 0%, #C4832A 60%, #e0a050 100%)",
    ribbonLabel:   "PREMIUM",
    emailSubject:  "Your Premium Entrance Ticket – The Cat Cafe Singapore"
  },
  "ultimate-40": {
    label:       "Ultimate Entrance Ticket",
    tier:        "Ultimate",
    tagline:     "The full cat café experience, elevated",
    perks: [
      { icon: "🕐", text: "2 hours of cat café access" },
      { icon: "🍹", text: "1 premium upgraded drink of your choice" },
      { icon: "🍰", text: "A delightful dessert of your choice" },
      { icon: "🍽️", text: "1 main course of your choice" },
      { icon: "🐱", text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#7B4FBF",
    accentLight:   "#F2EBF9",
    badgeGradient: "linear-gradient(135deg, #7B4FBF 0%, #5a3490 100%)",
    headerBg:      "linear-gradient(160deg, #3d2166 0%, #7B4FBF 60%, #a07de0 100%)",
    ribbonLabel:   "ULTIMATE",
    emailSubject:  "Your Ultimate Entrance Ticket – The Cat Cafe Singapore"
  }
};

// ── Generate unique voucher code ──
function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TCC";
  for (let i = 0; i < 12; i++) {
    if (i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ── Build Standard tier email ──
function buildStandardEmail(code, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:6px 0;font-size:22px;width:36px;text-align:center;">${p.icon}</td>
      <td style="padding:6px 0 6px 12px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Standard Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:24px 0;background:#f0f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <!-- Header -->
  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-40px;left:-20px;width:90px;height:90px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:10px;">The Cat Cafe Singapore</div>
    <div style="font-size:30px;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-0.5px;">Standard Entrance</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.8);">${def.tagline}</div>
  </div>

  <!-- Body -->
  <div style="background:#ffffff;padding:36px 40px;">

    <!-- Greeting -->
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '20px' : '28px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift
        ? `<em>${buyerName}</em> has gifted you a wonderful cat café experience! 🎁`
        : `Your cat café visit is all set – we can't wait to see you! 🐾`}
    </div>

    ${message ? `
    <!-- Personal Message -->
    <div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">
      "${message}"
    </div>` : ""}

    <!-- Tier Badge -->
    <div style="background:${badgeGradient};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:24px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">${def.ribbonLabel} TIER</span>
    </div>

    <!-- What's Included -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">What's included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">${perksHTML}</table>

    <!-- Voucher Code Box -->
    <div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:10px;">Your Voucher Code</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:14px 28px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;">${code}</div>
      <div style="margin-top:14px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>

    <!-- How to Redeem -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:28px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Our team will verify and mark your ticket as redeemed
    </div>

    <!-- Terms -->
    <div style="background:#f9f9f9;border-radius:8px;padding:14px 18px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:16px;">
      241B Victoria Street, Level 3, Singapore 188030<br>
      +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg" style="color:${accentColor};text-decoration:none;">info@thecatcafe.sg</a>
    </div>
    <div style="font-size:12px;">
      <a href="https://thecatcafe.sg" style="color:${accentColor};text-decoration:none;margin:0 8px;">thecatcafe.sg</a>
      &middot;
      <a href="https://www.instagram.com/sgcatcafe" style="color:${accentColor};text-decoration:none;margin:0 8px;">@sgcatcafe</a>
    </div>
  </div>

</div>
</body></html>`;
}

// ── Build Premium tier email ──
function buildPremiumEmail(code, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:7px 0;font-size:22px;width:36px;text-align:center;">${p.icon}</td>
      <td style="padding:7px 0 7px 12px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Premium Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:24px 0;background:#fef6ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <!-- Header -->
  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:rgba(255,255,255,0.1);border-radius:50%;"></div>
    <div style="position:absolute;top:20px;right:40px;width:50px;height:50px;background:rgba(255,255,255,0.07);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-30px;left:-15px;width:80px;height:80px;background:rgba(255,255,255,0.07);border-radius:50%;"></div>
    <div style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:10px;">The Cat Cafe Singapore</div>
    <div style="font-size:30px;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-0.5px;">Premium Entrance ✨</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.85);">${def.tagline}</div>
  </div>

  <!-- Gold accent bar -->
  <div style="height:4px;background:linear-gradient(90deg,#f5c842,#e09830,#f5c842);"></div>

  <!-- Body -->
  <div style="background:#fff;padding:36px 40px;">

    <!-- Greeting -->
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '20px' : '28px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift
        ? `<em>${buyerName}</em> has sent you a premium cat café gift – how special! 🎁`
        : `Your premium cat café experience awaits — you deserve it! ✨`}
    </div>

    ${message ? `
    <div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">
      "${message}"
    </div>` : ""}

    <!-- Tier Badge -->
    <div style="background:${badgeGradient};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:24px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">✨ ${def.ribbonLabel} TIER</span>
    </div>

    <!-- What's Included -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">Your Premium Inclusions</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:28px;">${perksHTML}</table>

    <!-- Highlight callout -->
    <div style="background:linear-gradient(135deg,#fef3e2,#fde8c0);border-radius:10px;padding:16px 20px;margin-bottom:28px;display:flex;align-items:center;font-size:13px;color:#8a5a00;">
      <span style="font-size:20px;margin-right:12px;">⭐</span>
      <span>Upgrade your experience — choose your drink and dessert when you arrive!</span>
    </div>

    <!-- Voucher Code Box -->
    <div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:28px;text-align:center;margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:10px;">Your Voucher Code</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:14px 28px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;">${code}</div>
      <div style="margin-top:14px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>

    <!-- How to Redeem -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:28px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Choose your premium drink and dessert from our menu<br>
      4. Enjoy your time with our wonderful cats!
    </div>

    <!-- Terms -->
    <div style="background:#f9f9f9;border-radius:8px;padding:14px 18px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:16px;">
      241B Victoria Street, Level 3, Singapore 188030<br>
      +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg" style="color:${accentColor};text-decoration:none;">info@thecatcafe.sg</a>
    </div>
    <div style="font-size:12px;">
      <a href="https://thecatcafe.sg" style="color:${accentColor};text-decoration:none;margin:0 8px;">thecatcafe.sg</a>
      &middot;
      <a href="https://www.instagram.com/sgcatcafe" style="color:${accentColor};text-decoration:none;margin:0 8px;">@sgcatcafe</a>
    </div>
  </div>

</div>
</body></html>`;
}

// ── Build Ultimate tier email ──
function buildUltimateEmail(code, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:8px 0;font-size:22px;width:36px;text-align:center;">${p.icon}</td>
      <td style="padding:8px 0 8px 12px;font-size:14px;color:#2d2d2d;font-weight:600;">${p.text}</td>
    </tr>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Ultimate Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:24px 0;background:#f4eefb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <!-- Header -->
  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:44px 40px 36px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(255,255,255,0.09);border-radius:50%;"></div>
    <div style="position:absolute;top:30px;right:60px;width:60px;height:60px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-50px;left:-25px;width:110px;height:110px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="font-size:13px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:10px;">The Cat Cafe Singapore</div>
    <div style="font-size:32px;font-weight:800;color:#fff;margin-bottom:6px;letter-spacing:-0.5px;">Ultimate Entrance 👑</div>
    <div style="font-size:14px;color:rgba(255,255,255,0.85);font-style:italic;">${def.tagline}</div>
  </div>

  <!-- Shimmer bar -->
  <div style="height:4px;background:linear-gradient(90deg,#c084fc,#a855f7,#7c3aed,#a855f7,#c084fc);"></div>

  <!-- Body -->
  <div style="background:#fff;padding:36px 40px;">

    <!-- Greeting -->
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '20px' : '28px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift
        ? `<em>${buyerName}</em> has gifted you the ultimate cat café experience! 👑 What a treat!`
        : `You've chosen the very best — the full Ultimate Cat Cafe experience is all yours! 🎉`}
    </div>

    ${message ? `
    <div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:28px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">
      "${message}"
    </div>` : ""}

    <!-- Crown badge -->
    <div style="background:${badgeGradient};border-radius:8px;padding:6px 14px;display:inline-block;margin-bottom:24px;box-shadow:0 4px 14px rgba(123,79,191,0.35);">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">👑 ${def.ribbonLabel} TIER</span>
    </div>

    <!-- What's Included -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">Everything That's Included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${perksHTML}</table>

    <!-- Premium callout -->
    <div style="background:linear-gradient(135deg,#f4eefb,#ead6f7);border-radius:10px;padding:18px 20px;margin-bottom:28px;font-size:13px;color:#5a2d8a;line-height:1.7;border:1px solid #d8b4fe;">
      <strong>👑 The Full Experience:</strong> Arrive, settle in, choose your premium drink, pick your dessert, and enjoy a satisfying main course — all while our cats keep you company. This is the cat café experience at its finest.
    </div>

    <!-- Voucher Code Box -->
    <div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:32px;text-align:center;margin-bottom:28px;box-shadow:0 4px 20px rgba(123,79,191,0.1);">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:12px;">👑 Your Voucher Code</div>
      <div style="font-size:30px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:16px 28px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;box-shadow:0 2px 8px rgba(123,79,191,0.15);">${code}</div>
      <div style="margin-top:14px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>

    <!-- How to Redeem -->
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:28px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Choose your premium drink, dessert, and main course from our menu<br>
      4. Sit back, relax, and enjoy the full cat café experience!
    </div>

    <!-- Terms -->
    <div style="background:#f9f9f9;border-radius:8px;padding:14px 18px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <!-- Footer -->
  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;">
    <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:16px;">
      241B Victoria Street, Level 3, Singapore 188030<br>
      +65 6338 6815 &middot; <a href="mailto:info@thecatcafe.sg" style="color:${accentColor};text-decoration:none;">info@thecatcafe.sg</a>
    </div>
    <div style="font-size:12px;">
      <a href="https://thecatcafe.sg" style="color:${accentColor};text-decoration:none;margin:0 8px;">thecatcafe.sg</a>
      &middot;
      <a href="https://www.instagram.com/sgcatcafe" style="color:${accentColor};text-decoration:none;margin:0 8px;">@sgcatcafe</a>
    </div>
  </div>

</div>
</body></html>`;
}

// ── Route to the correct email builder ──
function buildVoucherHTML(code, voucherType, recipientName, buyerName, expiry, message) {
  const def = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
  if (voucherType === "ultimate-40") return buildUltimateEmail(code, def, recipientName, buyerName, expiry, message);
  if (voucherType === "premium-30")  return buildPremiumEmail(code, def, recipientName, buyerName, expiry, message);
  return buildStandardEmail(code, def, recipientName, buyerName, expiry, message);
}

// ── Send email via Resend ──
function sendEmail(to, subject, html) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: `The Cat Cafe <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html
    });
    const options = {
      hostname: "api.resend.com",
      path: "/emails",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        console.log("Resend status:", res.statusCode, data);
        resolve({ status: res.statusCode, body: data });
      });
    });
    req.on("error", (e) => {
      console.error("Resend error:", e.message);
      reject(e);
    });
    req.write(payload);
    req.end();
  });
}

// ── Save voucher to GitHub ──
async function saveVoucher(voucher) {
  const current = await new Promise((resolve) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/content/vouchers.json?ref=${GITHUB_BRANCH}`,
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json"
      }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          const content = Buffer.from(parsed.content, "base64").toString("utf8");
          resolve({ sha: parsed.sha, vouchers: JSON.parse(content) });
        } catch(e) {
          console.log("vouchers.json not found or empty, starting fresh");
          resolve({ sha: null, vouchers: [] });
        }
      });
    }).on("error", () => resolve({ sha: null, vouchers: [] }));
  });

  const vouchers = [...current.vouchers, voucher];
  const newContent = Buffer.from(JSON.stringify(vouchers, null, 2)).toString("base64");
  const body = JSON.stringify({
    message: `New voucher: ${voucher.code}`,
    content: newContent,
    branch: GITHUB_BRANCH,
    ...(current.sha ? { sha: current.sha } : {})
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${GITHUB_REPO}/contents/content/vouchers.json`,
      method: "PUT",
      headers: {
        "Authorization": `token ${GITHUB_TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        console.log("GitHub save status:", res.statusCode);
        resolve(JSON.parse(data));
      });
    });
    req.on("error", (e) => {
      console.error("GitHub save error:", e.message);
      reject(e);
    });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  console.log("Webhook received. Method:", event.httpMethod);
  console.log("Body:", event.body);

  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };

  try {
    const hmac = event.headers["x-hitpay-signature"] || event.headers["X-HITPAY-SIGNATURE"] || "";
    let params;
    try {
      params = JSON.parse(event.body || "{}");
    } catch(e) {
      console.error("Failed to parse JSON body:", event.body);
      return { statusCode: 400, body: "Invalid JSON" };
    }

    console.log("Parsed params:", JSON.stringify(params));
    console.log("HMAC from header:", hmac);

    // Verify HMAC
    if (HITPAY_SALT) {
      const sorted = Object.keys(params).sort().map(k => {
        const v = params[k];
        if (v === null || v === undefined) return null;
        if (typeof v === "object") return null;
        return `${k}=${v}`;
      }).filter(Boolean).join("&");
      console.log("HMAC string:", sorted);
      const computed = crypto.createHmac("sha256", HITPAY_SALT).update(sorted).digest("hex");
      console.log("HMAC computed:", computed);
      console.log("HMAC received:", hmac);
      if (hmac && computed !== hmac) {
        console.error("HMAC verification failed");
        return { statusCode: 401, body: "Invalid signature" };
      }
    }

    // Only process completed payments
    if (params.status !== "completed") {
      console.log("Payment not completed, status:", params.status);
      return { statusCode: 200, body: "OK - status: " + params.status };
    }

    // Parse voucher type from reference — supports all 3 new ticket types
    const ref = params.reference_number || "";
    const typeMatch = ref.match(/^VC-(standard-22|premium-30|ultimate-40)-\d+$/);
    const voucherType = typeMatch ? typeMatch[1] : "standard-22";
    const def = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
    const label = def.label;

    // Use actual paid amount from HitPay (stored in record only, not shown in email)
    let amount;
    if (params.payments && params.payments.length > 0 && params.payments[0].amount) {
      amount = parseFloat(params.payments[0].amount).toFixed(2);
    } else {
      amount = parseFloat(params.amount || 0).toFixed(2);
    }

    const code = generateCode();
    const now    = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryStr = expiry.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

    const buyerEmail    = params.email || (params.payments && params.payments[0] && params.payments[0].buyer_email) || "";
    const buyerName     = params.name  || (params.payments && params.payments[0] && params.payments[0].buyer_name)  || "Customer";
    const recipientName = buyerName;

    // 1. Save voucher record to GitHub
    const voucherRecord = {
      code,
      type:           voucherType,
      label,
      amount,            // stored in record for admin but not shown in customer email
      buyer_name:     buyerName,
      buyer_email:    buyerEmail,
      recipient_name: recipientName,
      issued_at:      now.toISOString(),
      expires_at:     expiry.toISOString(),
      redeemed:       false,
      redeemed_at:    null,
      payment_id:     params.payment_request_id || ref
    };

    console.log("Saving voucher:", JSON.stringify(voucherRecord));
    await saveVoucher(voucherRecord);
    console.log("Voucher saved to GitHub successfully");

    // 2. Send typed customer email (no amount shown)
    if (RESEND_API_KEY && buyerEmail) {
      const html = buildVoucherHTML(code, voucherType, recipientName, buyerName, expiryStr, "");
      await sendEmail(buyerEmail, def.emailSubject, html);
      console.log("Customer email sent to:", buyerEmail);
    } else {
      console.warn("Resend not configured or no buyer email — skipping customer email");
    }

    // 3. Notify cafe (internal only — includes amount for records)
    if (RESEND_API_KEY) {
      await sendEmail(
        FROM_EMAIL,
        `New voucher sold: ${code} (${label})`,
        `<p><strong>Code:</strong> ${code}<br>
         <strong>Type:</strong> ${label}<br>
         <strong>Amount (internal):</strong> S$${amount}<br>
         <strong>Buyer:</strong> ${buyerName} &lt;${buyerEmail}&gt;<br>
         <strong>Payment ID:</strong> ${params.payment_request_id || ref}<br>
         <strong>Issued:</strong> ${now.toLocaleString("en-SG")}<br>
         <strong>Expires:</strong> ${expiryStr}</p>`
      );
      console.log("Cafe notification sent");
    }

    return { statusCode: 200, body: "OK" };

  } catch(err) {
    console.error("Webhook handler error:", err.message, err.stack);
    return { statusCode: 200, body: "Error logged: " + err.message };
  }
};
