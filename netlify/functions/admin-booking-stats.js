const { readCollection } = require("./lib/data-store");
const { verifyNetlifyToken } = require("./lib/auth");

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

// Sunday-start week (matches schedule.json's day_of_week convention: 0=Sunday..6=Saturday).
function weekRange(anchorDateStr) {
  const anchor = new Date(`${anchorDateStr}T12:00:00+08:00`);
  const start = new Date(anchor);
  start.setDate(start.getDate() - anchor.getDay());
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(toDateStr(d));
  }
  return days;
}

function todaySG() {
  const now = new Date();
  const sg = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Singapore" }));
  return toDateStr(sg);
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Missing token" }) };
  }
  const authResult = await verifyNetlifyToken(authHeader.slice(7));
  if (!authResult.valid) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "Unauthorized - Invalid token: " + authResult.error }) };
  }

  try {
    const anchor = (event.queryStringParameters && event.queryStringParameters.week) || todaySG();
    const days = weekRange(anchor);
    const { items: bookings } = await readCollection("bookings");

    const byDate = {};
    days.forEach((d) => (byDate[d] = { bookings: 0, guests: 0 }));

    let totalBookings = 0;
    let totalGuests = 0;
    bookings.forEach((b) => {
      if (b.status === "cancelled") return;
      if (!byDate[b.date]) return;
      byDate[b.date].bookings += 1;
      byDate[b.date].guests += Number(b.party_size || 0);
      totalBookings += 1;
      totalGuests += Number(b.party_size || 0);
    });

    const daily = days.map((d, i) => ({
      date: d,
      day_name: DAY_NAMES[i],
      bookings: byDate[d].bookings,
      guests: byDate[d].guests
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        week_start: days[0],
        week_end: days[6],
        total_bookings: totalBookings,
        total_guests: totalGuests,
        daily
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
