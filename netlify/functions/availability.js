const { isValidDateStr, getAvailability } = require("./lib/availability");

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const date = event.queryStringParameters && event.queryStringParameters.date;
  if (!isValidDateStr(date)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "date query param is required, format YYYY-MM-DD" }) };
  }

  try {
    const result = await getAvailability(date);
    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
