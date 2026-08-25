const { readCollection, updateCollection } = require("./lib/data-store");
const { getSlotById } = require("./lib/availability");
const { slotDateTimes } = require("./lib/time-utils");
const { sendBookingCancellation } = require("./lib/booking-mailer");

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
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { id, token } = body;
  if (!id || !token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "id and token are required" }) };
  }

  try {
    // Fast validation pass (no write) so we can look up the slot and check the cutoff
    // before touching bookings.json.
    const { items: existing } = await readCollection("bookings");
    const target = existing.find((b) => b.id === id);
    if (!target || target.manage_token !== token) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Booking not found" }) };
    }
    if (target.status !== "confirmed") {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "This booking is no longer active and cannot be cancelled" }) };
    }

    const slot = await getSlotById(target.slot_id);
    if (slot) {
      const { items: settings } = await readCollection("settings");
      const cancellationCutoffMinutes = (settings && settings.booking && settings.booking.cancellation_cutoff_minutes) || 0;
      const { start } = slotDateTimes(target.date, slot);
      if (Date.now() + cancellationCutoffMinutes * 60000 > start.getTime()) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Cancellations must be made at least ${cancellationCutoffMinutes} minutes before the slot starts` })
        };
      }
    }

    const finalBooking = await updateCollection("bookings", (items) => {
      const idx = items.findIndex((b) => b.id === id);
      if (idx === -1 || items[idx].manage_token !== token) {
        const err = new Error("Booking not found");
        err.statusCode = 404;
        throw err;
      }
      if (items[idx].status !== "confirmed") {
        const err = new Error("This booking is no longer active and cannot be cancelled");
        err.statusCode = 400;
        throw err;
      }
      const updated = { ...items[idx], status: "cancelled", updated_at: new Date().toISOString() };
      const newItems = items.slice();
      newItems[idx] = updated;
      return { items: newItems, value: updated, message: `Booking cancelled: ${id}` };
    });

    if (slot) {
      try {
        await sendBookingCancellation(finalBooking, slot);
      } catch (emailErr) {
        console.error("Failed to send cancellation email:", emailErr.message);
      }
    }

    const { manage_token: _mt, table_ids: _ti, ...guestBooking } = finalBooking;
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, booking: guestBooking }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers, body: JSON.stringify({ error: err.message }) };
  }
};
