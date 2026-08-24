const { readCollection, updateCollection } = require("./lib/data-store");
const { getSlotById, getActiveTables, isValidDateStr } = require("./lib/availability");
const { sendBookingCancellation } = require("./lib/booking-mailer");
const { verifyNetlifyToken } = require("./lib/auth");

function requireAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) return { ok: false, error: "Unauthorized - Missing token" };
  return { ok: true, token: authHeader.slice(7) };
}

async function listForDate(date) {
  const { items: bookings } = await readCollection("bookings");
  const { items: slots } = await readCollection("timeslots");
  const { items: tables } = await readCollection("tables");
  const slotById = {};
  slots.forEach((s) => (slotById[s.id] = s));
  const tableById = {};
  tables.forEach((t) => (tableById[t.id] = t));
  return bookings
    .filter((b) => b.date === date)
    .map((b) => ({
      ...b,
      manage_token: undefined,
      slot: slotById[b.slot_id] || null,
      tables: (b.table_ids || []).map((id) => tableById[id] || { id, name: id, seats: null })
    }))
    .sort((a, b) => {
      const aStart = a.slot ? a.slot.start_time : "";
      const bStart = b.slot ? b.slot.start_time : "";
      return aStart.localeCompare(bStart);
    });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const auth = requireAuth(event);
  if (!auth.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: auth.error }) };
  const authResult = await verifyNetlifyToken(auth.token);
  if (!authResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Invalid token: " + authResult.error }) };
  }

  try {
    if (event.httpMethod === "GET") {
      const date = event.queryStringParameters && event.queryStringParameters.date;
      if (!isValidDateStr(date)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "date query param is required, format YYYY-MM-DD" }) };
      }
      const bookings = await listForDate(date);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, bookings }) };
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}");
      const { action, id } = body;
      if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: "id is required" }) };

      if (action === "cancel") {
        const finalBooking = await updateCollection("bookings", (items) => {
          const idx = items.findIndex((b) => b.id === id);
          if (idx === -1) { const err = new Error("Booking not found"); err.statusCode = 404; throw err; }
          if (items[idx].status !== "confirmed") {
            const err = new Error("Only confirmed bookings can be cancelled"); err.statusCode = 400; throw err;
          }
          const updated = { ...items[idx], status: "cancelled", updated_at: new Date().toISOString() };
          const newItems = items.slice();
          newItems[idx] = updated;
          return { items: newItems, value: updated, message: `Admin cancelled booking: ${id}` };
        });

        const slot = await getSlotById(finalBooking.slot_id);
        if (slot) {
          try { await sendBookingCancellation(finalBooking, slot); }
          catch (e) { console.error("Failed to send cancellation email:", e.message); }
        }
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, booking: finalBooking }) };
      }

      if (action === "reassign_tables") {
        const table_ids = Array.isArray(body.table_ids) ? [...new Set(body.table_ids)] : null;
        if (!table_ids || table_ids.length === 0) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "table_ids must be a non-empty array" }) };
        }
        const activeTables = await getActiveTables();
        const activeIds = new Set(activeTables.map((t) => t.id));
        const unknown = table_ids.filter((tid) => !activeIds.has(tid));
        if (unknown.length) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown or inactive table(s): " + unknown.join(", ") }) };
        }

        const finalBooking = await updateCollection("bookings", (items) => {
          const idx = items.findIndex((b) => b.id === id);
          if (idx === -1) { const err = new Error("Booking not found"); err.statusCode = 404; throw err; }
          const target = items[idx];
          if (target.status !== "confirmed") {
            const err = new Error("Only confirmed bookings can be reassigned"); err.statusCode = 400; throw err;
          }

          const conflicting = items.find((b) =>
            b.id !== id && b.date === target.date && b.slot_id === target.slot_id && b.status === "confirmed" &&
            (b.table_ids || []).some((tid) => table_ids.includes(tid))
          );
          if (conflicting) {
            const err = new Error(`One or more of those tables is already assigned to another booking in this slot (${conflicting.guest_name})`);
            err.statusCode = 409;
            throw err;
          }

          const updated = { ...target, table_ids, updated_at: new Date().toISOString() };
          const newItems = items.slice();
          newItems[idx] = updated;
          return { items: newItems, value: updated, message: `Booking ${id} reassigned to tables ${table_ids.join(", ")}` };
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, booking: finalBooking }) };
      }

      if (action === "status") {
        const status = body.status;
        if (!["completed", "no_show"].includes(status)) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "status must be completed or no_show" }) };
        }
        const finalBooking = await updateCollection("bookings", (items) => {
          const idx = items.findIndex((b) => b.id === id);
          if (idx === -1) { const err = new Error("Booking not found"); err.statusCode = 404; throw err; }
          if (items[idx].status !== "confirmed") {
            const err = new Error("Only confirmed bookings can be updated"); err.statusCode = 400; throw err;
          }
          const updated = { ...items[idx], status, updated_at: new Date().toISOString() };
          const newItems = items.slice();
          newItems[idx] = updated;
          return { items: newItems, value: updated, message: `Booking ${id} marked ${status}` };
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, booking: finalBooking }) };
      }

      return { statusCode: 400, headers, body: JSON.stringify({ error: "Unknown action" }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return { statusCode, headers, body: JSON.stringify({ error: err.message }) };
  }
};
