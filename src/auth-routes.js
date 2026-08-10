import { Router } from "express";

import { requireAuthentication } from "./auth-middleware.js";
import passport from "./passport.js";
import {
  sessionCookieClearOptions,
  sessionCookieName,
} from "./session.js";

function serializeAuthenticatedUser(user) {
  // Role flags stay server-side. Authorization must never depend on fields that
  // a browser can edit or on a frontend route guard.
  return {
    id: user.id,
    username: user.username,
    email: user.email,
  };
}

const router = Router();

router.post("/login", (request, response, next) => {
  passport.authenticate("local", (error, user) => {
    if (error) {
      return next(error);
    }

    if (!user) {
      // Use one response for unknown emails and incorrect passwords so the API
      // does not disclose which email addresses have registered accounts.
      return response.status(401).json({ error: "Wrong email or password" });
    }

    // A custom Passport callback must call logIn itself. This establishes the
    // session and invokes passport.serializeUser before the response is sent.
    return request.logIn(user, (loginError) => {
      if (loginError) {
        return next(loginError);
      }

      return response.json({ user: serializeAuthenticatedUser(user) });
    });
  })(request, response, next);
});

router.get("/me", requireAuthentication, (request, response) => {
  return response.json({ user: serializeAuthenticatedUser(request.user) });
});

router.post("/logout", (request, response, next) => {
  // Passport removes its login state first; destroying the Express session then
  // removes all remaining server-side data associated with the same cookie.
  request.logout((logoutError) => {
    if (logoutError) {
      return next(logoutError);
    }

    return request.session.destroy((sessionError) => {
      if (sessionError) {
        return next(sessionError);
      }

      response.clearCookie(sessionCookieName, sessionCookieClearOptions);
      return response.status(204).end();
    });
  });
});

export default router;
