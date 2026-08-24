const crypto = require("crypto");
const { readCollection, updateCollection } = require("./lib/data-store");
const {
  isValidDateStr, resolveDayWindow, getActiveTables, getFreeTables, chooseTables, getSlotById,
  MAX_PARTY_SIZE, WHATSAPP_NUMBER, WHATSAPP_URL
} = require("./lib/availability");
const { timeToMinutes, slotDateTimes } = require("./lib/time-utils");
const { sendBookingConfirmation, sendAdminBookingAlert } = require("./lib/booking-mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(headers, message, extra) {
  return { statusCode: 400, headers, body: JSON.stringify(Object.assign({ error: message }, extra)) };
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return badRequest(headers, "Invalid JSON body");
  }

  const date = body.date;
  const slot_id = body.slot_id;
  const guest_name = (body.guest_name || "").trim();
  const guest_email = (body.guest_email || "").trim();
  const guest_phone = (body.guest_phone || "").trim();
  const notes = (body.notes || "").trim().slice(0, 500);
  const party_size = parseInt(body.party_size, 10);

  if (!isValidDateStr(date)) return badRequest(headers, "date is required, format YYYY-MM-DD");
  if (!slot_id) return badRequest(headers, "slot_id is required");
  if (!guest_name) return badRequest(headers, "guest_name is required");
  if (!EMAIL_RE.test(guest_email)) return badRequest(headers, "A valid guest_email is required for your confirmation");
  if (!Number.isInteger(party_size) || party_size < 1) return badRequest(headers, "party_size must be a positive number");
  if (party_size > MAX_PARTY_SIZE) {
    return badRequest(
      headers,
      `Online bookings are limited to ${MAX_PARTY_SIZE} guests. For a larger group, please WhatsApp us at ${WHATSAPP_NUMBER} to arrange your visit.`,
      { too_large: true, whatsapp_url: WHATSAPP_URL, whatsapp_number: WHATSAPP_NUMBER }
    );
  }

  try {
    const slot = await getSlotById(slot_id);
    if (!slot || !slot.active) return badRequest(headers, "That time slot does not exist");

    const window = await resolveDayWindow(date);
    if (!window.isOpen) return badRequest(headers, "The cafe is closed on that date");

    const startMins = timeToMinutes(slot.start_time);
    const endMins = startMins + slot.duration_minutes;
    if (startMins < timeToMinutes(window.openTime) || endMins > timeToMinutes(window.closeTime)) {
      return badRequest(headers, "That time slot is not available on that date");
    }

    const { start: slotStart } = slotDateTimes(date, slot);
    const { items: settings } = await readCollection("settings");
    const cutoffMinutes = (settings && settings.booking && settings.booking.booking_cutoff_minutes) || 0;
    const cutoffDeadline = new Date(Date.now() + cutoffMinutes * 60000);
    if (slotStart < cutoffDeadline) {
      return badRequest(headers, `Bookings must be made at least ${cutoffMinutes} minutes before the slot starts`);
    }

    const activeTables = await getActiveTables();

    const booking = await updateCollection("bookings", (items) => {
      const freeTables = getFreeTables(date, slot_id, items, activeTables);
      const chosen = chooseTables(freeTables, party_size);

      if (!chosen) {
        const err = new Error("That time slot no longer has a table free for your party size");
        err.statusCode = 409;
        throw err;
      }

      const now = new Date().toISOString();
      const newBooking = {
        id: crypto.randomUUID(),
        date,
        slot_id,
        guest_name,
        guest_email,
        guest_phone,
        party_size,
        notes,
        table_ids: chosen.map((t) => t.id),
        status: "confirmed",
        manage_token: crypto.randomBytes(24).toString("hex"),
        created_at: now,
        updated_at: now
      };

      return {
        items: [...items, newBooking],
        value: newBooking,
        message: `Booking: ${guest_name} - ${date} ${slot.start_time}`
      };
    });

    try {
      await sendBookingConfirmation(booking, slot);
      await sendAdminBookingAlert(booking, slot);
    } catch (emailErr) {
      console.error("Failed to send booking emails:", emailErr.message);
    }

    // table_ids is an internal seating detail, not shown to guests (only in the admin dashboard).
    const { table_ids, ...guestBooking } = booking;
    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, booking: guestBooking }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers, body: JSON.stringify({ error: err.message }) };
  }
};
