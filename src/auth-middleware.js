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

export function requireJournalist(request, response, next) {
  if (!request.isAuthenticated()) {
    return response.status(401).json({ error: "Authentication required" });
  }

  // The journalist role is reloaded from PostgreSQL by Passport. Keeping this
  // check server-side prevents a normal account from enabling the posting UI
  // and then submitting directly to the API; how the role is assigned belongs
  // to the independent account-management workflow.
  if (!request.user?.isJournalist) {
    return response.status(403).json({ error: "Journalist access required" });
  }

  return next();
}
