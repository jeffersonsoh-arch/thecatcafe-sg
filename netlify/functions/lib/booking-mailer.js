const https = require("https");
const { fmtDate, fmtTime, slotLabel } = require("./time-utils");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM || "info@thecatcafe.sg";
const SITE_URL = process.env.URL || "https://thecatcafe-sg.netlify.app";
const CAFE_ADDRESS = "241B Victoria Street, Level 3, Singapore 188030";
const CAFE_PHONE = "+65 6338 6815";

function sendEmail(to, subject, html) {
  return new Promise((resolve, reject) => {
    if (!RESEND_API_KEY) {
      console.log("RESEND_API_KEY not configured, skipping email to", to);
      return resolve({ skipped: true });
    }
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
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function wrapEmail(bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px 0;background:#f5f0ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<div style="max-width:560px;margin:0 auto;">
  <div style="background:#D85A30;border-radius:16px 16px 0 0;padding:24px 32px;text-align:center;">
    <div style="font-size:12px;font-weight:700;letter-spacing:0.16em;color:rgba(255,255,255,0.8);text-transform:uppercase;margin-bottom:6px;">The Cat Cafe Singapore</div>
    <div style="font-size:22px;font-weight:800;color:#fff;">Booking Confirmation</div>
  </div>
  <div style="background:#fff;padding:28px 32px;">
    ${bodyHtml}
  </div>
  <div style="background:#1a1a1a;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
    <div style="font-size:13px;color:#888;line-height:1.9;">
      ${CAFE_ADDRESS}<br>
      ${CAFE_PHONE} &middot; <a href="mailto:info@thecatcafe.sg" style="color:#D85A30;text-decoration:none;">info@thecatcafe.sg</a>
    </div>
  </div>
</div>
</body></html>`;
}

async function sendBookingConfirmation(booking, slot) {
  const manageUrl = `${SITE_URL}/booking-manage.html?id=${booking.id}&token=${booking.manage_token}`;
  const html = wrapEmail(`
    <p style="font-size:15px;color:#444;margin:0 0 20px;">Hi ${escapeHTML(booking.guest_name)}, your visit is confirmed! We can't wait to see you and the cats.</p>
    <div style="background:#FAECE7;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${fmtDate(booking.date)}</div>
      <div style="font-size:14px;color:#555;">${slotLabel(slot)}</div>
      <div style="font-size:14px;color:#555;margin-top:8px;">Party size: <strong>${booking.party_size}</strong></div>
      ${booking.notes ? `<div style="font-size:13px;color:#777;margin-top:8px;">Notes: ${escapeHTML(booking.notes)}</div>` : ""}
    </div>
    <p style="font-size:13px;color:#666;margin-bottom:20px;">Booking reference: <strong>${booking.id}</strong></p>
    <a href="${manageUrl}" style="display:inline-block;background:#D85A30;color:#fff;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;font-weight:600;">View or cancel booking</a>
    <p style="font-size:12px;color:#999;margin-top:24px;">Need to make changes? Use the link above, or call us at ${CAFE_PHONE}.</p>
  `);
  return sendEmail(booking.guest_email, `Booking confirmed - ${fmtDate(booking.date)} at ${fmtTime(slot.start_time)}`, html);
}

async function sendBookingCancellation(booking, slot) {
  const html = wrapEmail(`
    <p style="font-size:15px;color:#444;margin:0 0 20px;">Hi ${escapeHTML(booking.guest_name)}, your booking has been cancelled as requested.</p>
    <div style="background:#f5f0ec;border-radius:10px;padding:18px 20px;margin-bottom:20px;">
      <div style="font-size:16px;font-weight:700;color:#1a1a1a;margin-bottom:4px;">${fmtDate(booking.date)}</div>
      <div style="font-size:14px;color:#555;">${slotLabel(slot)}</div>
    </div>
    <p style="font-size:13px;color:#666;">We hope to see you and the cats another time!</p>
  `);
  return sendEmail(booking.guest_email, `Booking cancelled - ${fmtDate(booking.date)}`, html);
}

async function sendAdminBookingAlert(booking, slot) {
  const html = `<p><strong>New booking:</strong> ${escapeHTML(booking.guest_name)} (${escapeHTML(booking.guest_email)}${booking.guest_phone ? ", " + escapeHTML(booking.guest_phone) : ""})</p>
  <p>${fmtDate(booking.date)}, ${slotLabel(slot)}, party of ${booking.party_size}</p>
  ${booking.notes ? `<p>Notes: ${escapeHTML(booking.notes)}</p>` : ""}
  <p>Booking ID: ${booking.id}</p>`;
  return sendEmail(FROM_EMAIL, `New booking: ${booking.guest_name} - ${fmtDate(booking.date)}`, html);
}

function escapeHTML(str) {
  return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

module.exports = {
  sendBookingConfirmation,
  sendBookingCancellation,
  sendAdminBookingAlert
};
