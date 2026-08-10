export function requireAuthentication(request, response, next) {
  if (request.isAuthenticated()) {
    return next();
  }

  return response.status(401).json({ error: "Authentication required" });
}
