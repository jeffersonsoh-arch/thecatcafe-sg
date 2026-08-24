const { readCollection } = require("./lib/data-store");
const { getSlotById } = require("./lib/availability");
const { slotDateTimes } = require("./lib/time-utils");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const params = event.queryStringParameters || {};
  const { id, token } = params;
  if (!id || !token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "id and token are required" }) };
  }

  try {
    const { items: bookings } = await readCollection("bookings");
    const booking = bookings.find((b) => b.id === id);
    if (!booking || booking.manage_token !== token) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: "Booking not found" }) };
    }

    const slot = await getSlotById(booking.slot_id);
    const { items: settings } = await readCollection("settings");
    const cancellationCutoffMinutes = (settings && settings.booking && settings.booking.cancellation_cutoff_minutes) || 0;

    let canCancel = booking.status === "confirmed";
    if (canCancel && slot) {
      const { start } = slotDateTimes(booking.date, slot);
      canCancel = Date.now() + cancellationCutoffMinutes * 60000 <= start.getTime();
    }

    const { manage_token, ...publicBooking } = booking;
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ booking: publicBooking, slot, can_cancel: canCancel })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
