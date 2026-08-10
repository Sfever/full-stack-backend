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

    // This project does not have a migration runner yet. Letting the store create
    // its small table keeps local setup reproducible; production can replace this
    // with an explicit deployment migration once schema permissions are locked down.
    createTableIfMissing: true,
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
