export function requireAuthentication(request, response, next) {
  if (request.isAuthenticated()) {
    return next();
  }

  return response.status(401).json({ error: "Authentication required" });
}

export function requireAdmin(request, response, next) {
  if (!request.isAuthenticated()) {
    return response.status(401).json({ error: "Authentication required" });
  }

  // Passport reloads this database-controlled flag for each authenticated
  // request, so authorization never trusts a role submitted by the browser.
  if (!request.user?.isAdmin) {
    return response.status(403).json({ error: "Administrator access required" });
  }

  return next();
}
