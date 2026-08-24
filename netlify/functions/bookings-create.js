const crypto = require("crypto");
const { readCollection, updateCollection } = require("./lib/data-store");
const { isValidDateStr, resolveDayWindow, totalSeats, getSlotById } = require("./lib/availability");
const { timeToMinutes, slotDateTimes } = require("./lib/time-utils");
const { sendBookingConfirmation, sendAdminBookingAlert } = require("./lib/booking-mailer");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function badRequest(headers, message) {
  return { statusCode: 400, headers, body: JSON.stringify({ error: message }) };
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

    const capacity = await totalSeats();
    if (party_size > capacity) return badRequest(headers, `Party size exceeds our total seating of ${capacity}`);

    const booking = await updateCollection("bookings", (items) => {
      const bookedSoFar = items
        .filter((b) => b.date === date && b.slot_id === slot_id && b.status === "confirmed")
        .reduce((sum, b) => sum + Number(b.party_size || 0), 0);

      if (party_size > capacity - bookedSoFar) {
        const err = new Error("That time slot no longer has enough seats available");
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

    return { statusCode: 201, headers, body: JSON.stringify({ ok: true, booking }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers, body: JSON.stringify({ error: err.message }) };
  }
};
