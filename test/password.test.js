import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/password.js";

test("passwords are salted, hashed, and verifiable", async () => {
  const password = "correct horse battery staple";
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.notEqual(firstHash, password);
  assert.notEqual(firstHash, secondHash);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword("wrong password", firstHash), false);
});

test("unknown credential formats do not verify", async () => {
  assert.equal(await verifyPassword("password", "not-a-supported-hash"), false);
  assert.equal(
    await verifyPassword("password", "scrypt$32768$8$3$invalid$invalid"),
    false,
  );
});
