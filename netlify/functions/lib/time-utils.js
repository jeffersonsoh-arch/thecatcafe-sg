function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-SG", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function slotLabel(slot) {
  const endMins = timeToMinutes(slot.start_time) + slot.duration_minutes;
  return `${fmtTime(slot.start_time)} - ${fmtTime(minutesToTime(endMins))}`;
}

// Returns { start, end } as real Date objects for a date + slot, used for cutoff comparisons
// (booking creation cutoff, cancellation cutoff, past-slot checks). The cafe is single-venue
// in Singapore, so civil times are always interpreted as Singapore time (UTC+8, no DST) via an
// explicit offset - Netlify functions run in UTC, so this avoids an 8-hour bug if left implicit.
function slotDateTimes(dateStr, slot) {
  const start = new Date(`${dateStr}T${slot.start_time}:00+08:00`);
  const end = new Date(start.getTime() + slot.duration_minutes * 60000);
  return { start, end };
}

module.exports = { timeToMinutes, minutesToTime, fmtTime, fmtDate, slotLabel, slotDateTimes };
