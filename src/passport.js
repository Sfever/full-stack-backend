import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";

import pool from "./database.js";
import { verifyPassword } from "./password.js";

async function findUserByEmail(email) {
  const normalizedEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  const result = await pool.query(
    `
      SELECT
        id,
        username,
        email,
        credential
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
    `,
    [normalizedEmail],
  );

  return result.rows[0] ?? null;
}

passport.use(
  new LocalStrategy(
    { usernameField: "email" },
    async (email, password, done) => {
      try {
        const row = await findUserByEmail(email);

        if (!row || !(await verifyPassword(password, row.credential))) {
          // Deliberately keep both failure cases indistinguishable to clients.
          return done(null, false, {
            message: "Wrong email or password",
          });
        }

        return done(null, {
          id: row.id,
          username: row.username,
          email: row.email,
        });
      } catch (error) {
        return done(error);
      }
    },
  ),
);

passport.serializeUser((user, done) => {
  // Keep sessions small and reload mutable roles from PostgreSQL on each request.
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await pool.query(
      `
        SELECT
          id,
          username,
          email,
          admin,
          journalist
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [id],
    );
    const row = result.rows[0];

    if (!row) {
      return done(null, false);
    }

    // This object is internal request state. API serializers decide which of
    // these fields, if any, are safe to return to the browser.
    return done(null, {
      id: row.id,
      username: row.username,
      email: row.email,
      isAdmin: row.admin,
      isJournalist: row.journalist,
    });
  } catch (error) {
    return done(error);
  }
});

export default passport;
