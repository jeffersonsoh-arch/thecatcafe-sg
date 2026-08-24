const { readCollection } = require("./data-store");
const { timeToMinutes } = require("./time-utils");

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// Booking is seating-based and venue-wide: total capacity for any slot is the sum of active
// tables' seats (14 tables seating 2-3 each by default), not a per-slot fixed number, so admin
// changes to the table list immediately apply to every slot's capacity.
async function totalSeats() {
  const { items: tables } = await readCollection("tables");
  return tables.filter((t) => t.active).reduce((sum, t) => sum + Number(t.seats || 0), 0);
}

// Returns the bookable TimeSlots for a date (active, and fully within the resolved open/close
// window per FR-12), each annotated with remaining capacity = total seats - confirmed party sizes.
async function getAvailability(dateStr) {
  const window = await resolveDayWindow(dateStr);
  const capacity = await totalSeats();

  if (!window.isOpen) {
    return { date: dateStr, is_open: false, capacity, slots: [] };
  }

  const { items: allSlots } = await readCollection("timeslots");
  const { items: bookings } = await readCollection("bookings");

  const openMins = timeToMinutes(window.openTime);
  const closeMins = timeToMinutes(window.closeTime);

  const bookedBySlot = {};
  bookings.forEach((b) => {
    if (b.date === dateStr && b.status === "confirmed") {
      bookedBySlot[b.slot_id] = (bookedBySlot[b.slot_id] || 0) + Number(b.party_size || 0);
    }
  });

  const slots = allSlots
    .filter((s) => s.active)
    .filter((s) => {
      const startMins = timeToMinutes(s.start_time);
      const endMins = startMins + s.duration_minutes;
      return startMins >= openMins && endMins <= closeMins;
    })
    .map((s) => {
      const booked = bookedBySlot[s.id] || 0;
      return {
        id: s.id,
        start_time: s.start_time,
        duration_minutes: s.duration_minutes,
        capacity,
        remaining_capacity: Math.max(0, capacity - booked)
      };
    })
    .sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time));

  return { date: dateStr, is_open: true, open_time: window.openTime, close_time: window.closeTime, capacity, slots };
}

async function getSlotById(slotId) {
  const { items } = await readCollection("timeslots");
  return items.find((s) => s.id === slotId) || null;
}

module.exports = { isValidDateStr, resolveDayWindow, totalSeats, getAvailability, getSlotById };
