const https = require("https");

const REPO  = process.env.GITHUB_REPO;   // e.g. "jeffersonsoh-arch/thecatcafe-sg"
const TOKEN = process.env.GITHUB_TOKEN;  // Personal access token with repo scope
const BRANCH = process.env.GITHUB_BRANCH || "main";

function githubGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
      headers: {
        "Authorization": `token ${TOKEN}`,
        "User-Agent": "catcafe-cms",
        "Accept": "application/vnd.github.v3+json"
      }
    };
    https.get(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on("error", reject);
  });
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  try {
    const type = event.queryStringParameters && event.queryStringParameters.type;
    if (!type) return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing type param" }) };

    const validTypes = ["cats", "menu", "settings"];
    if (!validTypes.includes(type)) return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid type" }) };

    const file = await githubGet(`content/${type}.json`);
    const content = Buffer.from(file.content, "base64").toString("utf8");

    return { statusCode: 200, headers, body: content };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
