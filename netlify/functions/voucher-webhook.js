const https = require("https");
const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

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
      { text: "Unlimited time with our cats" }
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
      { text: "Unlimited time with our cats" }
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
      { text: "Unlimited time with our cats" }
    ],
    accentColor:   "#7B4FBF",
    accentLight:   "#F2EBF9",
    darkColor:     "#5a3490",
    badgeGradient: "linear-gradient(135deg, #7B4FBF 0%, #5a3490 100%)",
    headerBg:      "linear-gradient(160deg, #3d2166 0%, #7B4FBF 60%, #a07de0 100%)",
    ribbonLabel:   "ULTIMATE",
    emailSubject:  "Your Ultimate Entrance Ticket – The Cat Cafe Singapore"
  },
  "artjam-unguided-40": {
    label:         "Unguided Art Jamming Session",
    tier:          "Art Jamming",
    tagline:       "Express yourself with free-flow creativity and feline friends",
    perks: [
      { text: "2 hours of art jamming session" },
      { text: "Free upgraded drinks" },
      { text: "All art materials provided" },
      { text: "Unlimited time with our cats" }
    ],
    accentColor:   "#E85D75",
    accentLight:   "#FDE8EC",
    darkColor:     "#c4455a",
    badgeGradient: "linear-gradient(135deg, #E85D75 0%, #c4455a 100%)",
    headerBg:      "linear-gradient(160deg, #a8324a 0%, #E85D75 60%, #f08a9e 100%)",
    ribbonLabel:   "ART JAMMING",
    emailSubject:  "Your Unguided Art Jamming Session – The Cat Cafe Singapore"
  },
  "artjam-semi-55": {
    label:         "Semi-Guided Art Jamming Session",
    tier:          "Art Jamming Premium",
    tagline:       "Elevated creativity with guidance, treats, and purrs",
    perks: [
      { text: "3 hours of guided art jamming session" },
      { text: "Free upgraded drinks" },
      { text: "A slice of cake" },
      { text: "All art materials provided" },
      { text: "Unlimited time with our cats" }
    ],
    accentColor:   "#6B5B95",
    accentLight:   "#F0EDF7",
    darkColor:     "#524575",
    badgeGradient: "linear-gradient(135deg, #6B5B95 0%, #524575 100%)",
    headerBg:      "linear-gradient(160deg, #3d2f66 0%, #6B5B95 60%, #9a8abf 100%)",
    ribbonLabel:   "ART JAMMING PREMIUM",
    emailSubject:  "Your Semi-Guided Art Jamming Session – The Cat Cafe Singapore"
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

// ── Generate QR Code Buffer for PDF ──
async function generateQRCodeBuffer(url) {
  return await QRCode.toBuffer(url, {
    margin: 1,
    width: 250,
    color: { dark: "#1a1a1a", light: "#ffffff" }
  });
}

// ── Generate QR Code Data URL for HTML Email (fallback) ──
async function generateQRCodeDataURL(url) {
  return await QRCode.toDataURL(url, {
    margin: 1,
    width: 200,
    color: { dark: "#1a1a1a", light: "#ffffff" }
  });
}

// ── Generate QR Code as inline attachment object for email ──
async function generateQRCodeInline(url, index) {
  const buffer = await QRCode.toBuffer(url, {
    margin: 2,
    width: 250,
    color: { dark: "#000000", light: "#ffffff" }
  });
  return {
    filename: `qr-code-${index}.png`,
    content: buffer.toString("base64"),
    contentType: "image/png",
    disposition: "inline",
    cid: `qr-code-${index}@catcafe`
  };
}

// ── Generate a styled PDF ticket with embedded QR Code ──
function generateTicketPDF(code, voucherType, recipientName, expiry, qrBuffer) {
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

      // Decorative circle
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

      // ── BODY ──
      const footerH = 80;
      const bodyStart = 130;
      const bodyEnd = H - footerH;

      doc.rect(0, bodyStart, W, bodyEnd - bodyStart).fill("#ffffff");

      // Greeting
      doc.font("Helvetica-Bold")
         .fontSize(10)
         .fillColor("#333333")
         .text(`Dear ${recipientName},`, pad, bodyStart + 14);

      doc.font("Helvetica")
         .fontSize(8.5)
         .fillColor("#888888")
         .text("Present this ticket or scan the QR code below on arrival.", pad, bodyStart + 28, { width: W - pad * 2 });

      // Perks box
      const perksBoxY = bodyStart + 46;
      const perksLineH = 15;
      const perksBoxH = 22 + def.perks.length * perksLineH + 6;

      doc.roundedRect(pad, perksBoxY, W - pad * 2, perksBoxH, 5).fill(accentLight);

      doc.font("Helvetica-Bold")
         .fontSize(7)
         .fillColor(accent)
         .text("WHAT'S INCLUDED", pad + 12, perksBoxY + 8, { characterSpacing: 1.5 });

      def.perks.forEach((perk, i) => {
        const py = perksBoxY + 22 + i * perksLineH;
        doc.font("Helvetica")
           .fontSize(9)
           .fillColor("#333333")
           .text(`\u2022  ${perk.text}`, pad + 12, py, { width: W - pad * 2 - 24 });
      });

      // Voucher Code & QR Code Box
      const codeSectionY = perksBoxY + perksBoxH + 14;

      doc.font("Helvetica-Bold")
         .fontSize(7.5)
         .fillColor("#bbbbbb")
         .text("VOUCHER CODE & SCANNABLE QR", 0, codeSectionY, { align: "center", width: W, characterSpacing: 1.5 });

      // Dashed code box container
      const boxH = 104;
      doc.roundedRect(pad, codeSectionY + 12, W - pad * 2, boxH, 6)
         .strokeColor(accent)
         .lineWidth(1.5)
         .dash(4, { space: 3 })
         .stroke();

      // Render Code text on Left, QR Code on Right
      doc.undash();

      // Code string
      doc.font("Courier-Bold")
         .fontSize(17)
         .fillColor("#1a1a1a")
         .text(code, pad + 14, codeSectionY + 34, { width: W - pad * 2 - 120 });

      doc.font("Helvetica")
         .fontSize(8)
         .fillColor("#888888")
         .text(`Valid until ${expiry}`, pad + 14, codeSectionY + 62);

      doc.font("Helvetica-Oblique")
         .fontSize(7.5)
         .fillColor(accent)
         .text("One-time scan redemption", pad + 14, codeSectionY + 76);

      // Embed QR Code image on right side of dashed box
      if (qrBuffer) {
        doc.image(qrBuffer, W - pad - 92, codeSectionY + 18, { width: 80, height: 80 });
      }

      // Divider
      const sepY = codeSectionY + boxH + 16;
      doc.moveTo(pad, sepY).lineTo(W - pad, sepY).strokeColor("#eeeeee").lineWidth(0.5).stroke();

      // Redemption instructions
      doc.font("Helvetica")
         .fontSize(8)
         .fillColor("#888888")
         .text("Show code or let staff scan QR code at 241B Victoria Street, Level 3, Bugis.", pad, sepY + 8, { width: W - pad * 2, align: "center" });

      // ── FOOTER ──
      doc.rect(0, H - footerH, W, footerH).fill("#1a1a1a");

      doc.font("Helvetica-Bold")
         .fontSize(8.5)
         .fillColor("#ffffff")
         .text("The Cat Cafe Singapore", 0, H - footerH + 12, { align: "center", width: W });

      doc.font("Helvetica")
         .fontSize(7.5)
         .fillColor("#888888")
         .text("241B Victoria Street, Level 3, Singapore 188030", 0, H - footerH + 26, { align: "center", width: W });

      doc.text("+65 6338 6815  \u2022  info@thecatcafe.sg", 0, H - footerH + 40, { align: "center", width: W });

      doc.text("thecatcafe.sg  \u2022  @sgcatcafe", 0, H - footerH + 54, { align: "center", width: W });

      doc.end();

    } catch (err) {
      reject(err);
    }
  });
}

// ── Build Standard tier email ──
function buildStandardEmail(tickets, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg, label, ribbonLabel } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = tickets.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:6px 0;font-size:18px;width:28px;text-align:center;color:${accentColor};">&#x2713;</td>
      <td style="padding:6px 0 6px 8px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = tickets.map((t, i) => `
    <div style="background:${accentLight};border:2px dashed ${accentColor};border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      ${isMulti ? `<div style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin-bottom:6px;">Ticket ${i + 1} of ${tickets.length}</div>` : `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:6px;">Your Voucher Code</div>`}
      <div style="font-size:26px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:10px 20px;border-radius:8px;border:1.5px solid ${accentColor};display:inline-block;margin-bottom:12px;">${t.code}</div>
      <div style="margin-top:8px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${label} – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#f0f7f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">${label}</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);">${def.tagline}</div>
  </div>

  <div style="background:#ffffff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has gifted you a wonderful cat café experience! 🎁` : `Your cat café visit is all set – we can't wait to see you! 🐾`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">${ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">What's included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">${perksHTML}</table>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code on arrival<br>
      3. Staff will instantly verify and mark your ticket as redeemed<br>
    </div>

    <div style="background:${accentLight};border-radius:8px;padding:12px 16px;font-size:13px;color:${accentColor};font-weight:600;text-align:center;margin-bottom:16px;">
      📅 Booking recommended
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
function buildPremiumEmail(tickets, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = tickets.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:7px 0;font-size:18px;width:28px;text-align:center;color:${accentColor};">&#x2713;</td>
      <td style="padding:7px 0 7px 8px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = tickets.map((t, i) => `
    <div style="background:${accentLight};border:2px dashed ${accentColor};border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      ${isMulti ? `<div style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin-bottom:6px;">Ticket ${i + 1} of ${tickets.length}</div>` : `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:6px;">Your Voucher Code</div>`}
      <div style="font-size:26px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:10px 20px;border-radius:8px;border:1.5px solid ${accentColor};display:inline-block;margin-bottom:12px;">${t.code}</div>
      <div style="margin-top:8px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Premium Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#fef6ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">Premium Entrance ✨</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);">${def.tagline}</div>
  </div>

  <div style="height:4px;background:linear-gradient(90deg,#f5c842,#e09830,#f5c842);"></div>

  <div style="background:#fff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has sent you a premium cat café gift – how special! 🎁` : `Your premium cat café experience awaits — you deserve it! ✨`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">✨ ${def.ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">Your Premium Inclusions</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">${perksHTML}</table>

    <div style="background:linear-gradient(135deg,#fef3e2,#fde8c0);border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:13px;color:#8a5a00;">
      <span style="font-size:18px;margin-right:10px;">⭐</span>
      <span>Choose your drink and dessert when you arrive!</span>
    </div>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code on arrival<br>
      3. Choose your premium drink and dessert from our menu<br>
      4. Enjoy your time with our wonderful cats!<br>
    </div>

    <div style="background:${accentLight};border-radius:8px;padding:12px 16px;font-size:13px;color:${accentColor};font-weight:600;text-align:center;margin-bottom:16px;">
      📅 Booking recommended
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
function buildUltimateEmail(tickets, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = tickets.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:8px 0;font-size:18px;width:28px;text-align:center;color:${accentColor};">&#x2713;</td>
      <td style="padding:8px 0 8px 8px;font-size:14px;color:#2d2d2d;font-weight:600;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = tickets.map((t, i) => `
    <div style="background:${accentLight};border:2px dashed ${accentColor};border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      ${isMulti ? `<div style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin-bottom:6px;">Ticket ${i + 1} of ${tickets.length}</div>` : `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:6px;">👑 Your Voucher Code</div>`}
      <div style="font-size:26px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:10px 20px;border-radius:8px;border:1.5px solid ${accentColor};display:inline-block;margin-bottom:12px;">${t.code}</div>
      <div style="margin-top:8px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Ultimate Entrance Ticket – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#f4eefb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">Ultimate Entrance 👑</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.85);font-style:italic;">${def.tagline}</div>
  </div>

  <div style="height:4px;background:linear-gradient(90deg,#c084fc,#a855f7,#7c3aed,#a855f7,#c084fc);"></div>

  <div style="background:#fff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has gifted you the ultimate cat café experience! 👑` : `You've chosen the very best — the full Ultimate experience is all yours! 🎉`}
    </div>

    ${message ? `<div style="background:${accentLight};border-left:4px solid ${accentColor};border-radius:0 8px 8px 0;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#333;line-height:1.6;font-style:italic;">"${message}"</div>` : ""}

    <div style="background:${badgeGradient};border-radius:8px;padding:5px 12px;display:inline-block;margin-bottom:20px;box-shadow:0 4px 14px rgba(123,79,191,0.35);">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.14em;color:#fff;text-transform:uppercase;">👑 ${def.ribbonLabel} TIER</span>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:10px;">Everything That's Included</div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;">${perksHTML}</table>

    <div style="background:linear-gradient(135deg,#f4eefb,#ead6f7);border-radius:10px;padding:16px 18px;margin-bottom:24px;font-size:13px;color:#5a2d8a;line-height:1.7;border:1px solid #d8b4fe;">
      <strong>👑 The Full Experience:</strong> Arrive, settle in, choose your premium drink, pick your dessert, and enjoy a satisfying main course — all while our cats keep you company.
    </div>

    ${codeSection}

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:#999;margin-bottom:8px;">How to Redeem</div>
    <div style="font-size:13px;color:#555;line-height:2.0;margin-bottom:24px;">
      1. Visit us at <strong>241B Victoria Street, Level 3, Bugis</strong> (near Bugis MRT)<br>
      2. Show this email or your voucher code on arrival<br>
      3. Choose your premium drink, dessert, and main course from our menu<br>
      4. Sit back, relax, and enjoy the full cat café experience!<br>
    </div>

    <div style="background:${accentLight};border-radius:8px;padding:12px 16px;font-size:13px;color:${accentColor};font-weight:600;text-align:center;margin-bottom:16px;">
      📅 Booking recommended
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

// ── Build Art Jamming email ──
function buildArtjamEmail(tickets, def, recipientName, buyerName, expiry, message) {
  const { accentColor, accentLight, badgeGradient, headerBg } = def;
  const isGift = buyerName !== recipientName;
  const isMulti = tickets.length > 1;
  const perksHTML = def.perks.map(p =>
    `<tr>
      <td style="padding:7px 0;font-size:18px;width:28px;text-align:center;color:${accentColor};">&#x2713;</td>
      <td style="padding:7px 0 7px 8px;font-size:14px;color:#2d2d2d;font-weight:500;">${p.text}</td>
    </tr>`
  ).join("");

  const codeSection = tickets.map((t, i) => `
    <div style="background:${accentLight};border:2px dashed ${accentColor};border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;">
      ${isMulti ? `<div style="font-size:11px;font-weight:700;color:${accentColor};text-transform:uppercase;margin-bottom:6px;">Ticket ${i + 1} of ${tickets.length}</div>` : `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:${accentColor};margin-bottom:6px;">Your Voucher Code</div>`}
      <div style="font-size:26px;font-weight:800;letter-spacing:0.18em;color:#1a1a1a;font-family:'Courier New',Courier,monospace;background:#fff;padding:10px 20px;border-radius:8px;border:1.5px solid ${accentColor};display:inline-block;margin-bottom:12px;">${t.code}</div>
      <div style="margin-top:8px;font-size:12px;color:#888;">Valid until <strong style="color:#555;">${expiry}</strong></div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${def.label} – The Cat Cafe</title>
</head>
<body style="margin:0;padding:16px 0;background:#fde8ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:${headerBg};border-radius:16px 16px 0 0;padding:20px 40px 20px;text-align:center;position:relative;overflow:hidden;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.18em;color:rgba(255,255,255,0.75);text-transform:uppercase;margin-bottom:8px;">The Cat Cafe Singapore</div>
    <div style="font-size:26px;font-weight:800;color:#fff;margin-bottom:4px;letter-spacing:-0.5px;">${def.label}</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.8);">${def.tagline}</div>
  </div>

  <div style="background:#ffffff;padding:24px 40px;">
    <div style="font-size:15px;color:#444;margin-bottom:${message ? '18px' : '24px'};">
      Dear <strong style="color:#1a1a1a;">${recipientName}</strong>,<br>
      ${isGift ? `<em>${buyerName}</em> has gifted you a creative cat café experience! 🎁🎨` : `Your art jamming cat café visit is all set – get ready to create! 🎨🐾`}
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
      2. Show this email or your voucher code on arrival<br>
      3. Staff will verify and prepare your art materials<br>
      4. Let your creativity flow with our cats by your side!<br>
    </div>

    <div style="background:${accentLight};border-radius:8px;padding:12px 16px;font-size:13px;color:${accentColor};font-weight:600;text-align:center;margin-bottom:16px;">
      📅 Booking recommended
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

// ── Route to correct email builder ──
function buildVoucherHTML(tickets, voucherType, recipientName, buyerName, expiry, message) {
  const def = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
  if (voucherType === "ultimate-40") return buildUltimateEmail(tickets, def, recipientName, buyerName, expiry, message);
  if (voucherType === "premium-30")  return buildPremiumEmail(tickets, def, recipientName, buyerName, expiry, message);
  if (voucherType === "artjam-semi-55") return buildArtjamEmail(tickets, def, recipientName, buyerName, expiry, message);
  if (voucherType === "artjam-unguided-40") return buildArtjamEmail(tickets, def, recipientName, buyerName, expiry, message);
  // Standard vouchers use the standard email template
  return buildStandardEmail(tickets, def, recipientName, buyerName, expiry, message);
}

// ── Send email via Resend ──
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

// ── Batch save multiple voucher records to GitHub ──
async function saveVouchers(newVouchers) {
  const localPath = path.resolve(__dirname, '../../content/vouchers.json');
  
  // Read current vouchers from local file first
  let currentVouchers = [];
  try {
    if (fs.existsSync(localPath)) {
      const content = fs.readFileSync(localPath, "utf8");
      currentVouchers = JSON.parse(content);
      console.log("Loaded", currentVouchers.length, "existing vouchers from local file");
    }
  } catch(e) {
    console.warn("Could not read local vouchers.json:", e.message);
  }
  
  const merged = [...currentVouchers, ...newVouchers];
  const newContent = JSON.stringify(merged, null, 2);
  
  // Always save to local file first
  try {
    fs.writeFileSync(localPath, newContent, "utf8");
    console.log("Vouchers saved to local file:", localPath, "- Total:", merged.length);
  } catch(e) {
    console.error("Failed to save local vouchers.json:", e.message);
  }
  
  // If GitHub credentials are configured, also push to GitHub
  if (!GITHUB_REPO || !GITHUB_TOKEN) {
    console.warn("GITHUB_REPO or GITHUB_TOKEN not configured - vouchers saved locally only");
    return { saved: true, local: true };
  }
  
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

  const mergedGitHub = [...current.vouchers, ...newVouchers];
  const base64Content = Buffer.from(JSON.stringify(mergedGitHub, null, 2)).toString("base64");
  const summary = newVouchers.map(v => v.code).join(", ");
  const body = JSON.stringify({
    message: `New voucher${newVouchers.length > 1 ? "s" : ""}: ${summary}`,
    content: base64Content,
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

    const ref = params.reference_number || "";
    const typeMatch = ref.match(/^VC-(standard-22|premium-30|ultimate-40|artjam-unguided-40|artjam-semi-55)(?:-qty(\d+))?-\d+$/);
    const voucherType = typeMatch ? typeMatch[1] : (ref.includes("artjam-semi") ? "artjam-semi-55" : ref.includes("artjam-unguided") ? "artjam-unguided-40" : "standard-22");
    const qty         = typeMatch && typeMatch[2] ? parseInt(typeMatch[2], 10) : 1;
    const def         = VOUCHER_DEFS[voucherType] || VOUCHER_DEFS["standard-22"];
    const label       = def.label;

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
    
    // Extract custom fields from HitPay webhook
    let recipientName = buyerName;
    let recipientEmail = "";
    let personalMessage = "";
    
    try {
      if (params.custom_fields) {
        const customData = JSON.parse(params.custom_fields);
        if (customData.recipient_name) recipientName = customData.recipient_name;
        if (customData.recipient_email) recipientEmail = customData.recipient_email;
        if (customData.message) personalMessage = customData.message;
      }
    } catch(e) {
      console.log("No custom fields or failed to parse:", e.message);
    }

    console.log(`Generating ${qty} ticket(s) of type "${voucherType}"...`);

    // 1. Generate N codes + N QR codes (inline for email) + N PDF buffers
    const tickets = [];
    for (let i = 0; i < qty; i++) {
      const code = generateCode();
      const redeemUrl = `${SITE_URL}/admin?redeem=${code}`;
      console.log(`Generating QR code & PDF for ticket ${i + 1}/${qty}: ${code} (${redeemUrl})`);

      const qrBuffer     = await generateQRCodeBuffer(redeemUrl);
      const qrInlineObj  = await generateQRCodeInline(redeemUrl, i);
      const pdfBuffer    = await generateTicketPDF(code, voucherType, recipientName, expiryStr, qrBuffer);

      tickets.push({ code, redeemUrl, qrBuffer, qrInlineObj, pdfBuffer });
    }

    // 2. Save all N voucher records to GitHub in one write
    const voucherRecords = tickets.map(t => ({
      code:             t.code,
      type:             voucherType,
      label,
      amount,
      buyer_name:       buyerName,
      buyer_email:      buyerEmail,
      recipient_name:   recipientName,
      recipient_email:  recipientEmail,
      personal_message: personalMessage,
      issued_at:        now.toISOString(),
      expires_at:       expiry.toISOString(),
      redeemed:         false,
      redeemed_at:      null,
      payment_id:       params.payment_request_id || ref
    }));

    try {
      await saveVouchers(voucherRecords);
      console.log(`${qty} voucher record(s) saved to GitHub`);
    } catch(saveErr) {
      console.error("Failed to save vouchers to GitHub:", saveErr.message);
      // Continue with email sending even if GitHub save fails
    }

    // 3. Send customer email with PDF attachments (no inline QR codes as they don't render in emails)
    if (RESEND_API_KEY && buyerEmail) {
      // Build attachments array: PDF files only (QR codes kept in PDFs, not as separate inline images)
      const attachments = [];
      
      // Add PDF attachments
      tickets.forEach((t, i) => {
        attachments.push({
          filename: qty > 1
            ? `cat-cafe-ticket-${i + 1}-of-${qty}.pdf`
            : `cat-cafe-ticket-${t.code}.pdf`,
          content: t.pdfBuffer.toString("base64")
        });
      });

      const html = buildVoucherHTML(tickets, voucherType, recipientName, buyerName, expiryStr, personalMessage);
      
      // Send email to buyer
      await sendEmail(buyerEmail, def.emailSubject, html, attachments);
      console.log(`Customer email sent to ${buyerEmail} with ${attachments.length} PDF attachment(s)`);
      
      // If recipient email is different from buyer email, also send to recipient
      if (recipientEmail && recipientEmail !== buyerEmail) {
        const recipientHtml = buildVoucherHTML(tickets, voucherType, recipientName, buyerName, expiryStr, personalMessage);
        await sendEmail(recipientEmail, `You've received a gift voucher from ${buyerName}!`, recipientHtml, attachments);
        console.log(`Gift voucher email sent to recipient ${recipientEmail}`);
      }
    } else {
      console.warn("Resend not configured or no buyer email — skipping customer email");
    }

    // 4. Internal cafe notification
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
