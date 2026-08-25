// Verify Netlify Identity authentication for a function invocation.
//
// Netlify's platform verifies the Identity JWT's signature at the edge and,
// only for requests it has verified, populates context.clientContext.user
// with the decoded claims before the function ever runs. We rely on that
// verified value rather than decoding the Authorization header ourselves —
// a self-decoded JWT has no signature check, so anyone could forge a token
// with an arbitrary email/sub and pass it straight through.
function getIdentityUser(context) {
  const user = context && context.clientContext && context.clientContext.user;
  if (!user) {
    return { valid: false, error: "Missing or unverified Identity token" };
  }
  return { valid: true, user };
}

module.exports = { getIdentityUser };
