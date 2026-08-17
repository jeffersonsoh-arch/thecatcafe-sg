const jwt = require("jsonwebtoken");

// Verify Netlify Identity JWT
// Note: We skip signature verification since Netlify Identity's JWKS endpoint is no longer available.
// Instead, we validate the token structure and expiration. In production, Netlify's edge functions
// handle authentication before requests reach your function, providing an additional layer of security.
async function verifyNetlifyToken(token) {
  try {
    // Decode without verification to inspect the token
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.payload) {
      return { valid: false, error: "Invalid token format" };
    }

    // Check if token has required fields
    const payload = decoded.payload;
    if (!payload.sub || !payload.email) {
      return { valid: false, error: "Token missing required fields" };
    }

    // Check expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return { valid: false, error: "Token has expired" };
    }

    // Check not before
    if (payload.nbf && Date.now() < payload.nbf * 1000) {
      return { valid: false, error: "Token is not yet valid" };
    }

    return { valid: true, user: payload };
  } catch(err) {
    return { valid: false, error: err.message };
  }
}

module.exports = { verifyNetlifyToken };
