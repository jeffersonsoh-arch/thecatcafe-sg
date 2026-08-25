const { readCollection } = require("./data-store");
const { timeToMinutes } = require("./time-utils");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Online bookings are capped at 10 guests; bigger groups are asked to WhatsApp so staff can
// arrange seating manually.
const MAX_PARTY_SIZE = 10;
const WHATSAPP_NUMBER = "8080 8719";
const WHATSAPP_URL = "https://wa.me/6580808719";

function isValidDateStr(dateStr) {
  return typeof dateStr === "string" && DATE_RE.test(dateStr) && !isNaN(new Date(dateStr + "T00:00:00+08:00").getTime());
}

// Resolve the open/close window for a given date: a SpecialDate override always wins over the
// regular WeeklySchedule for that date only (FR-13/FR-14), and never affects any other date.
async function resolveDayWindow(dateStr) {
  const { items: specialDates } = await readCollection("special-dates");
  const special = specialDates.find((s) => s.date === dateStr);
  if (special) {
    if (special.is_closed) return { isOpen: false, source: "special" };
    return { isOpen: true, openTime: special.open_time, closeTime: special.close_time, source: "special" };
  }

  const { items: schedule } = await readCollection("schedule");
  const dayOfWeek = new Date(`${dateStr}T12:00:00+08:00`).getDay(); // noon SGT avoids any rollover
  const day = schedule.find((d) => d.day_of_week === dayOfWeek);
  if (!day || !day.is_open) return { isOpen: false, source: "schedule" };
  return { isOpen: true, openTime: day.open_time, closeTime: day.close_time, source: "schedule" };
}

async function getActiveTables() {
  const { items: tables } = await readCollection("tables");
  return tables.filter((t) => t.active);
}

// Tables currently assigned to a confirmed booking for this date+slot are occupied for the
// whole slot - a table can only serve one party at a time.
function getOccupiedTableIds(dateStr, slotId, bookings) {
  const occupied = new Set();
  bookings.forEach((b) => {
    if (b.date === dateStr && b.slot_id === slotId && b.status === "confirmed") {
      (b.table_ids || []).forEach((id) => occupied.add(id));
    }
  });
  return occupied;
}

function getFreeTables(dateStr, slotId, bookings, activeTables) {
  const occupied = getOccupiedTableIds(dateStr, slotId, bookings);
  return activeTables.filter((t) => !occupied.has(t.id));
}

// Picks which table(s) to seat a party at, from the tables currently free for that slot.
// All tables are mergeable, so the rule is: prefer the single smallest table that already fits
// the party (a party of 3 gets the smallest table seating >= 3, e.g. a 4-seater, before anything
// is merged); only when no single free table is big enough does it merge multiple free tables,
// preferring the fewest tables and least wasted seats. Returns the chosen tables (>=1) or null if
// nothing free can seat the party.
function chooseTables(freeTables, partySize) {
  const sorted = [...freeTables].sort((a, b) => a.seats - b.seats);

  const singleFit = sorted.find((t) => t.seats >= partySize);
  if (singleFit) return [singleFit];

  // Merge search: smallest-seats-first combination whose total meets the party size. Depth is
  // capped at MAX_PARTY_SIZE tables - since every table seats at least 1, no valid combination
  // for a party at or under the cap ever needs more tables than that, so this bound never misses
  // a real fit while still keeping the search small (at most a few thousand combinations).
  const maxDepth = Math.min(sorted.length, MAX_PARTY_SIZE);
  let best = null;
  function search(startIdx, combo, total) {
    if (total >= partySize) {
      if (!best || combo.length < best.length) best = combo.slice();
      return; // adding more tables to a satisfied combo only adds waste - stop this branch
    }
    if (combo.length >= maxDepth) return;
    for (let i = startIdx; i < sorted.length; i++) {
      combo.push(sorted[i]);
      search(i + 1, combo, total + sorted[i].seats);
      combo.pop();
    }
  }
  search(0, [], 0);
  return best;
}

// Returns the bookable TimeSlots for a date (active, and fully within the resolved open/close
// window per FR-12), each annotated with remaining capacity = total seats of tables not already
// assigned to a confirmed booking in that slot (an upper bound - actual bookability for a given
// party size is decided by chooseTables() at booking time, since free seats can be split across
// tables that don't merge into a single party's needs).
async function getAvailability(dateStr) {
  const window = await resolveDayWindow(dateStr);
  const activeTables = await getActiveTables();
  const capacity = activeTables.reduce((sum, t) => sum + Number(t.seats || 0), 0);

  if (!window.isOpen) {
    return { date: dateStr, is_open: false, capacity, max_party_size: MAX_PARTY_SIZE, slots: [] };
  }

  const { items: allSlots } = await readCollection("timeslots");
  const { items: bookings } = await readCollection("bookings");

  const openMins = timeToMinutes(window.openTime);
  const closeMins = timeToMinutes(window.closeTime);

  const slots = allSlots
    .filter((s) => s.active)
    .filter((s) => {
      const startMins = timeToMinutes(s.start_time);
      const endMins = startMins + s.duration_minutes;
      return startMins >= openMins && endMins <= closeMins;
    })
    .map((s) => {
      const freeTables = getFreeTables(dateStr, s.id, bookings, activeTables);
      const remaining = freeTables.reduce((sum, t) => sum + Number(t.seats || 0), 0);
      return {
        id: s.id,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        capacity,
        remaining_capacity: remaining
      };
    })
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  return {
    date: dateStr,
    is_open: true,
    open_time: window.openTime,
    close_time: window.closeTime,
    capacity,
    max_party_size: MAX_PARTY_SIZE,
    slots
  };
}

async function getSlotById(slotId) {
  const { items } = await readCollection("timeslots");
  return items.find((s) => s.id === slotId) || null;
}

module.exports = {
  isValidDateStr,
  resolveDayWindow,
  getActiveTables,
  getOccupiedTableIds,
  getFreeTables,
  chooseTables,
  getAvailability,
  getSlotById,
  MAX_PARTY_SIZE,
  WHATSAPP_NUMBER,
  WHATSAPP_URL
};
