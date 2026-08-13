import connectPgSimple from "connect-pg-simple";
import session from "express-session";

import pool from "./database.js";

export const sessionCookieName = "video_forge.sid";

const sessionSecret = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === "production";
const PostgreSQLSessionStore = connectPgSimple(session);

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required to create login sessions");
}

export const sessionCookieClearOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: isProduction,
};

const sessionMiddleware = session({
  store: new PostgreSQLSessionStore({
    pool,
    tableName: "user_sessions",
    // Runtime replicas must not perform schema changes. The session table is
    // baselined by migration 004 alongside the other application tables.
    createTableIfMissing: false,
  }),
  name: sessionCookieName,
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    ...sessionCookieClearOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
});

export default sessionMiddleware;
