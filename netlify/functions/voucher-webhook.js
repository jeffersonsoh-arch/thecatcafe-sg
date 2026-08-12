const https = require("https");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");

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
    label:         "Standard Entrance Ticket",
    tier:          "Standard",
    tagline:       "A cosy escape with our resident cats",
    perks: [
      { text: "2 hours of cat café access" },
      { text: "1 complimentary canned drink" },
      { text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#2F8F6E",
    accentLight:   "#E6F5F0",
    darkColor:     "#1a6b52",
    badgeGradient: "linear-gradient(135deg, #2F8F6E 0%, #1a6b52 100%)",
    headerBg:      "linear-gradient(160deg, #1a6b52 0%, #2F8F6E 60%, #3aab84 100%)",
    ribbonLabel:   "STANDARD",
    emailSubject:  "Your Standard Entrance Ticket – The Cat Cafe Singapore"
  },
  "premium-30": {
    label:         "Premium Entrance Ticket",
    tier:          "Premium",
    tagline:       "A premium pawsome experience awaits you",
    perks: [
      { text: "2 hours of cat café access" },
      { text: "1 premium upgraded drink of your choice" },
      { text: "A delightful dessert of your choice" },
      { text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#C4832A",
    accentLight:   "#FDF3E5",
    darkColor:     "#a0641a",
    badgeGradient: "linear-gradient(135deg, #C4832A 0%, #a0641a 100%)",
    headerBg:      "linear-gradient(160deg, #7a4a10 0%, #C4832A 60%, #e0a050 100%)",
    ribbonLabel:   "PREMIUM",
    emailSubject:  "Your Premium Entrance Ticket – The Cat Cafe Singapore"
  },
  "ultimate-40": {
    label:         "Ultimate Entrance Ticket",
    tier:          "Ultimate",
    tagline:       "The full cat café experience, elevated",
    perks: [
      { text: "2 hours of cat café access" },
      { text: "1 premium upgraded drink of your choice" },
      { text: "A delightful dessert of your choice" },
      { text: "1 main course of your choice" },
      { text: "Unlimited cuddles with our cats" }
    ],
    accentColor:   "#7B4FBF",
    accentLight:   "#F2EBF9",
    darkColor:     "#5a3490",
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

// ── Generate a styled PDF ticket for one code ──
function generateTicketPDF(code, voucherType, recipientName, expiry) {
  return new Promise((resolve, reject) => {
    try {
      const def = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
      const doc = new PDFDocument({
        size: "A5",
        margin: 0,
        info: {
          Title: `The Cat Cafe – ${def.label}`,
          Author: "The Cat Cafe Singapore",
          Subject: code
        }
      });

      const chunks = [];
      doc.on("data", c => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const W = doc.page.width;   // 419.53 pts
      const H = doc.page.height;  // 595.28 pts
      const pad = 36;
      const accent = def.accentColor;
      const accentLight = def.accentLight;
      const darkColor = def.darkColor;

      // ── HEADER (0 → 130) ──
      doc.rect(0, 0, W, 130).fill(accent);

      // Subtle decorative circle
      doc.save();
      doc.opacity(0.12);
      doc.roundedRect(W - 90, -10, 120, 100, 50).fill("#ffffff");
      doc.restore();

      // Cafe name
      doc.save();
      doc.opacity(0.75);
      doc.font("Helvetica")
         .fontSize(8)
         .fillColor("#ffffff")
         .text("THE CAT CAFE SINGAPORE", 0, 18, { align: "center", width: W, characterSpacing: 1.8 });
      doc.restore();

      // Ticket label
      doc.font("Helvetica-Bold")
         .fontSize(17)
         .fillColor("#ffffff")
         .text(def.label.toUpperCase(), 0, 38, { align: "center", width: W });

      // Tagline
      doc.save();
      doc.opacity(0.85);
      doc.font("Helvetica-Oblique")
         .fontSize(9)
         .fillColor("#ffffff")
         .text(def.tagline, 0, 68, { align: "center", width: W });
      doc.restore();

      // Tier badge strip
      doc.rect(0, 104, W, 26).fill(darkColor);
      doc.font("Helvetica-Bold")
         .fontSize(8)
         .fillColor("#ffffff")
         .text(`${def.ribbonLabel} TIER`, 0, 111, { align: "center", width: W, characterSpacing: 2.5 });

      // ── BODY (130 → footer) ──
      const footerH = 92;
      const bodyStart = 130;
      const bodyEnd = H - footerH;

      doc.rect(0, bodyStart, W, bodyEnd - bodyStart).fill("#ffffff");

      // Greeting
      doc.font("Helvetica-Bold")
         .fontSize(10.5)
         .fillColor("#333333")
         .text(`Dear ${recipientName},`, pad, bodyStart + 16);

      doc.font("Helvetica")
         .fontSize(9)
         .fillColor("#999999")
         .text("Your entrance ticket is confirmed. Present the code below on arrival.", pad, bodyStart + 32, { width: W - pad * 2 });

      // Perks box
      const perksBoxY = bodyStart + 60;
      const perksLineH = 17;
      const perksBoxH = 28 + def.perks.length * perksLineH + 10;

      doc.roundedRect(pad, perksBoxY, W - pad * 2, perksBoxH, 5).fill(accentLight);

      doc.font("Helvetica-Bold")
         .fontSize(7.5)
         .fillColor(accent)
         .text("WHAT'S INCLUDED", pad + 14, perksBoxY + 10, { characterSpacing: 1.5 });

      def.perks.forEach((perk, i) => {
        const py = perksBoxY + 26 + i * perksLineH;
        doc.font("Helvetica")
           .fontSize(9.5)
           .fillColor("#333333")
           .text(`\u2022  ${perk.text}`, pad + 14, py, { width: W - pad * 2 - 28 });
      });

      // Voucher code section
      const codeSectionY = perksBoxY + perksBoxH + 18;

      doc.font("Helvetica-Bold")
         .fontSize(7.5)
         .fillColor("#bbbbbb")
         .text("YOUR VOUCHER CODE", 0, codeSectionY, { align: "center", width: W, characterSpacing: 2 });

      // Dashed code box
      doc.roundedRect(pad, codeSectionY + 14, W - pad * 2, 48, 5)
         .strokeColor(accent)
         .lineWidth(1.5)
         .dash(4, { space: 3 })
         .stroke();

      doc.font("Courier-Bold")
         .fontSize(21)
         .fillColor("#1a1a1a")
         .text(code, 0, codeSectionY + 24, { align: "center", width: W });

      // Expiry
      doc.undash()
         .font("Helvetica")
         .fontSize(8)
         .fillColor("#aaaaaa")
         .text(`Valid until ${expiry}  \u2022  One use only  \u2022  Non-transferable`, 0, codeSectionY + 70, { align: "center", width: W });

      // Divider
      const sepY = codeSectionY + 86;
      doc.moveTo(pad, sepY).lineTo(W - pad, sepY).strokeColor("#eeeeee").lineWidth(0.5).stroke();

      // Redemption note
      doc.font("Helvetica")
         .fontSize(8.5)
         .fillColor("#999999")
         .text("Show this ticket at 241B Victoria Street, Level 3, Bugis (near Bugis MRT).", pad, sepY + 10, { width: W - pad * 2, align: "center" });

      // ── FOOTER ──
      doc.rect(0, H - footerH, W, footerH).fill("#1a1a1a");

      doc.font("Helvetica-Bold")
         .fontSize(9)
         .fillColor("#ffffff")
         .text("The Cat Cafe Singapore", 0, H - footerH + 14, { align: "center", width: W });

      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor("#888888")
         .text("241B Victoria Street, Level 3, Singapore 188030", 0, H - footerH + 30, { align: "center", width: W });

      doc.text("+65 6338 6815  \u2022  info@thecatcafe.sg", 0, H - footerH + 44, { align: "center", width: W });

      doc.text("thecatcafe.sg  \u2022  @sgcatcafe", 0, H - footerH + 58, { align: "center", width: W });

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

// ── Build Standard tier email ──
function buildStandardEmail(codes, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = codes.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:6px 0;font-size:20px;width:32px;text-align:center;">&#x2022;</td>
      <td style="padding:6px 0 6px 10px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = isMulti
    ? `<div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">Your Voucher Codes (${codes.length} tickets)</div>
        ${codes.map((c, i) => `
          <div style="background:${accentLight};border:1.5px dashed ${accentColor};border-radius:8px;padding:12px 20px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:#999;">Ticket ${i + 1}</span>
            <span style="font-size:20px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;">${c}</span>
          </div>`).join("")}
        <div style="font-size:12px;color:#999;margin-top:8px;text-align:center;">&#128206; Your individual PDF tickets are attached to this email.</div>
      </div>`
    : `<div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:10px;">Your Voucher Code</div>
        <div style="font-size:28px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:12px 24px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;">${codes[0]}</div>
        <div style="margin-top:12px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
        <div style="font-size:11px;color:#bbb;margin-top:6px;">&#128206; Your PDF ticket is also attached to this email.</div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Standard Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#f0f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:rgba(255,255,255,0.08);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-40px;left:-20px;width:90px;height:90px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">Standard Entrance</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);">${def.tagline}</div>
  </div>

  <div style="background:#ffffff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has gifted you a wonderful cat café experience! &#127873;` : `Your cat café visit is all set – we can't wait to see you! &#128062;`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">${def.ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">What's included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${perksHTML}</table>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Our team will verify and mark your ticket as redeemed
    </div>

    <div style="background:#f9f9f9;border-radius:8px;padding:12px 16px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:12px;">
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
function buildPremiumEmail(codes, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = codes.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:7px 0;font-size:18px;width:32px;text-align:center;">&#x2022;</td>
      <td style="padding:7px 0 7px 10px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = isMulti
    ? `<div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">Your Voucher Codes (${codes.length} tickets)</div>
        ${codes.map((c, i) => `
          <div style="background:${accentLight};border:1.5px dashed ${accentColor};border-radius:8px;padding:12px 20px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:#999;">Ticket ${i + 1}</span>
            <span style="font-size:20px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;">${c}</span>
          </div>`).join("")}
        <div style="font-size:12px;color:#999;margin-top:8px;text-align:center;">&#128206; Your individual PDF tickets are attached to this email.</div>
      </div>`
    : `<div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:10px;">Your Voucher Code</div>
        <div style="font-size:28px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:12px 24px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;">${codes[0]}</div>
        <div style="margin-top:12px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
        <div style="font-size:11px;color:#bbb;margin-top:6px;">&#128206; Your PDF ticket is also attached to this email.</div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Premium Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#fef6ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:rgba(255,255,255,0.1);border-radius:50%;"></div>
    <div style="position:absolute;top:20px;right:40px;width:50px;height:50px;background:rgba(255,255,255,0.07);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-30px;left:-15px;width:80px;height:80px;background:rgba(255,255,255,0.07);border-radius:50%;"></div>
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">Premium Entrance &#10024;</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);">${def.tagline}</div>
  </div>

  <div style="height:4px;background:linear-gradient(90deg,#f5c842,#e09830,#f5c842);"></div>

  <div style="background:#fff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has sent you a premium cat café gift – how special! &#127873;` : `Your premium cat café experience awaits — you deserve it! &#10024;`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">&#10024; ${def.ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">Your Premium Inclusions</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${perksHTML}</table>

    <div style="background:linear-gradient(135deg,#fef3e2,#fde8c0);border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#8a5a00;">
      <span style="font-size:18px;margin-right:10px;">&#11088;</span>
      <span>Choose your drink and dessert when you arrive!</span>
    </div>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Choose your premium drink and dessert from our menu<br>
      4. Enjoy your time with our wonderful cats!
    </div>

    <div style="background:#f9f9f9;border-radius:8px;padding:12px 16px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:12px;">
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
function buildUltimateEmail(codes, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = codes.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:8px 0;font-size:18px;width:32px;text-align:center;">&#x2022;</td>
      <td style="padding:8px 0 8px 10px;font-size:14px;color:#2d2d2d;font-weight:600;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = isMulti
    ? `<div style="margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:12px;">Your Voucher Codes (${codes.length} tickets)</div>
        ${codes.map((c, i) => `
          <div style="background:${accentLight};border:1.5px dashed ${accentColor};border-radius:8px;padding:12px 20px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:11px;color:#999;">Ticket ${i + 1}</span>
            <span style="font-size:20px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;">${c}</span>
          </div>`).join("")}
        <div style="font-size:12px;color:#999;margin-top:8px;text-align:center;">&#128206; Your individual PDF tickets are attached to this email.</div>
      </div>`
    : `<div style="background:${accentLight};border:2px solid ${accentColor};border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;box-shadow:0 4px 20px rgba(123,79,191,0.1);">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:10px;">&#128081; Your Voucher Code</div>
        <div style="font-size:28px;font-weight:800;letter-spacing:0.2em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:12px 24px;border-radius:8px;border:2px dashed ${accentColor};display:inline-block;">${codes[0]}</div>
        <div style="margin-top:12px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
        <div style="font-size:11px;color:#bbb;margin-top:6px;">&#128206; Your PDF ticket is also attached to this email.</div>
      </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Ultimate Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#f4eefb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-30px;right:-30px;width:140px;height:140px;background:rgba(255,255,255,0.09);border-radius:50%;"></div>
    <div style="position:absolute;top:30px;right:60px;width:60px;height:60px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="position:absolute;bottom:-50px;left:-25px;width:110px;height:110px;background:rgba(255,255,255,0.06);border-radius:50%;"></div>
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">Ultimate Entrance &#128081;</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);font-style:italic;">${def.tagline}</div>
  </div>

  <div style="height:4px;background:linear-gradient(90deg,#c084fc,#a855f7,#7c3aed,#a855f7,#c084fc);"></div>

  <div style="background:#fff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has gifted you the ultimate cat café experience! &#128081;` : `You've chosen the very best — the full Ultimate experience is all yours! &#127881;`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;box-shadow:0 4px 14px rgba(123,79,191,0.35);">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">&#128081; ${def.ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">Everything That's Included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">${perksHTML}</table>

    <div style="background:linear-gradient(135deg,#f4eefb,#ead6f7);border-radius:10px;padding:16px 18px;margin-bottom:24px;font-size:13px;color:#5a2d8a;line-height:1.7;border:1px solid #d8b4fe;">
      <strong>&#128081; The Full Experience:</strong> Arrive, settle in, choose your premium drink, pick your dessert, and enjoy a satisfying main course — all while our cats keep you company.
    </div>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code to our staff on arrival<br>
      3. Choose your premium drink, dessert, and main course from our menu<br>
      4. Sit back, relax, and enjoy the full cat café experience!
    </div>

    <div style="background:#f9f9f9;border-radius:8px;padding:12px 16px;font-size:12px;color:#888;line-height:1.8;">
      <strong style="color:#666;">Terms & Conditions:</strong> Valid for 12 months from date of purchase. Non-transferable. Non-refundable. Cannot be exchanged for cash. One redemption per code. Subject to availability.
    </div>
  </div>

  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
    <div style="font-size:15px;font-weight:700;color:#fff;margin-bottom:4px;">The Cat Cafe Singapore</div>
    <div style="font-size:12px;color:#888;line-height:2.0;margin-bottom:12px;">
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

// ── Route to correct email builder (codes = array) ──
function buildVoucherHTML(codes, voucherType, recipientName, buyerName, expiry, message) {
  const def = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
  if (voucherType === "ultimate-40") return buildUltimateEmail(codes, def, recipientName, buyerName, expiry, message);
  if (voucherType === "premium-30")  return buildPremiumEmail(codes, def, recipientName, buyerName, expiry, message);
  return buildStandardEmail(codes, def, recipientName, buyerName, expiry, message);
}

// ── Send email via Resend (with optional PDF attachments) ──
function sendEmail(to, subject, html, attachments = []) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      from: `The Cat Cafe <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {})
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

// ── Batch save multiple voucher records to GitHub in one API call ──
async function saveVouchers(newVouchers) {
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

  const merged = [...current.vouchers, ...newVouchers];
  const newContent = Buffer.from(JSON.stringify(merged, null, 2)).toString("base64");
  const summary = newVouchers.map(v => v.code).join(", ");
  const body = JSON.stringify({
    message: `New voucher${newVouchers.length > 1 ? "s" : ""}: ${summary}`,
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

    // Verify HMAC
    if (HITPAY_SALT) {
      const sorted = Object.keys(params).sort().map(k => {
        const v = params[k];
        if (v === null || v === undefined) return null;
        if (typeof v === "object") return null;
        return `${k}=${v}`;
      }).filter(Boolean).join("&");
      const computed = crypto.createHmac("sha256", HITPAY_SALT).update(sorted).digest("hex");
      console.log("HMAC computed:", computed, " | received:", hmac);
      if (hmac && computed !== hmac) {
        console.error("HMAC verification failed");
        return { statusCode: 401, body: "Invalid signature" };
      }
    }

    if (params.status !== "completed") {
      console.log("Payment not completed, status:", params.status);
      return { statusCode: 200, body: "OK - status: " + params.status };
    }

    // Parse voucher type AND quantity from reference
    // Format: VC-{type}-qty{n}-{timestamp}  (new)
    // Format: VC-{type}-{timestamp}          (legacy, qty defaults to 1)
    const ref = params.reference_number || "";
    const typeMatch = ref.match(/^VC-(standard-22|premium-30|ultimate-40)(?:-qty(\d+))?-\d+$/);
    const voucherType = typeMatch ? typeMatch[1] : "standard-22";
    const qty         = typeMatch && typeMatch[2] ? parseInt(typeMatch[2], 10) : 1;
    const def         = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
    const label       = def.label;

    // Amount stored for internal records only — not shown in customer email
    let amount;
    if (params.payments && params.payments.length > 0 && params.payments[0].amount) {
      amount = parseFloat(params.payments[0].amount).toFixed(2);
    } else {
      amount = parseFloat(params.amount || 0).toFixed(2);
    }

    const now    = new Date();
    const expiry = new Date(now);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const expiryStr = expiry.toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" });

    const buyerEmail    = params.email || (params.payments && params.payments[0] && params.payments[0].buyer_email) || "";
    const buyerName     = params.name  || (params.payments && params.payments[0] && params.payments[0].buyer_name)  || "Customer";
    const recipientName = buyerName;

    console.log(`Generating ${qty} ticket(s) of type "${voucherType}"...`);

    // 1. Generate N codes + N PDF buffers
    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const code = generateCode();
      console.log(`Generating PDF for ticket ${i + 1}/${qty}: ${code}`);
      const pdfBuffer = await generateTicketPDF(code, voucherType, recipientName, expiryStr);
      tickets.push({ code, pdfBuffer });
    }

    // 2. Save all N voucher records to GitHub in one write
    const voucherRecords = tickets.map(t => ({
      code:           t.code,
      type:           voucherType,
      label,
      amount,
      buyer_name:     buyerName,
      buyer_email:    buyerEmail,
      recipient_name: recipientName,
      issued_at:      now.toISOString(),
      expires_at:     expiry.toISOString(),
      redeemed:       false,
      redeemed_at:    null,
      payment_id:     params.payment_request_id || ref
    }));

    await saveVouchers(voucherRecords);
    console.log(`${qty} voucher record(s) saved to GitHub`);

    // 3. Send customer email with PDF attachments (one PDF per ticket)
    if (RESEND_API_KEY && buyerEmail) {
      const codes = tickets.map(t => t.code);
      const attachments = tickets.map((t, i) => ({
        filename: qty > 1
          ? `cat-cafe-ticket-${i + 1}-of-${qty}.pdf`
          : `cat-cafe-ticket-${t.code}.pdf`,
        content: t.pdfBuffer.toString("base64")
      }));
      const html = buildVoucherHTML(codes, voucherType, recipientName, buyerName, expiryStr, "");
      await sendEmail(buyerEmail, def.emailSubject, html, attachments);
      console.log(`Customer email sent to ${buyerEmail} with ${attachments.length} PDF attachment(s)`);
    } else {
      console.warn("Resend not configured or no buyer email — skipping customer email");
    }

    // 4. Internal cafe notification (includes amount for records)
    if (RESEND_API_KEY) {
      const codeList = tickets.map((t, i) => `<br>&nbsp;&nbsp;&nbsp;${i + 1}. ${t.code}`).join("");
      await sendEmail(
        FROM_EMAIL,
        `New voucher${qty > 1 ? "s" : ""} sold: ${qty}x ${label}`,
        `<p>
          <strong>Type:</strong> ${label} (x${qty})<br>
          <strong>Amount (internal):</strong> S$${amount}<br>
          <strong>Codes:</strong>${codeList}<br>
          <strong>Buyer:</strong> ${buyerName} &lt;${buyerEmail}&gt;<br>
          <strong>Payment ID:</strong> ${params.payment_request_id || ref}<br>
          <strong>Issued:</strong> ${now.toLocaleString("en-SG")}<br>
          <strong>Expires:</strong> ${expiryStr}
        </p>`
      );
      console.log("Cafe notification sent");
    }

    return { statusCode: 200, body: "OK" };

  } catch(err) {
    console.error("Webhook handler error:", err.message, err.stack);
    return { statusCode: 200, body: "Error logged: " + err.message };
  }
};
