const https = require("https");
const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");

// Fetch JWKS from Netlify Identity
async function getNetlifyJWKS() {
  return new Promise((resolve, reject) => {
    https.get("https://netlify-cms-oauth2-production.herokuapp.com/.well-known/jwks.json", (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch(e) {
          reject(new Error("Failed to parse JWKS"));
        }
      });
    }).on("error", reject);
  });
}

// Get PEM key from JWKS
function getPEM(jwks, kid) {
  const key = jwks.keys.find(k => k.kid === kid);
  if (!key) return null;
  return jwkToPem(key);
}

// Verify Netlify Identity JWT
async function verifyNetlifyToken(token) {
  try {
    // First decode without verification to get the kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
      return { valid: false, error: "Invalid token format" };
    }

    const jwks = await getNetlifyJWKS();
    const pem = getPEM(jwks, decoded.header.kid);
    
    if (!pem) {
      return { valid: false, error: "Could not find matching key" };
    }

    // Verify the token
    const verified = jwt.verify(token, pem, {
      algorithms: ["RS256"],
      issuer: "https://netlify-cms-oauth2-production.herokuapp.com"
    });

    return { valid: true, user: verified };
  } catch(err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { verifyNetlifyToken };
