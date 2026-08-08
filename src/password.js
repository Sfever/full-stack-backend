import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const algorithm = "scrypt";
const cost = 2 ** 15;
const blockSize = 8;
const parallelization = 3;
const keyLength = 64;
const maxmem = 64 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derivedKey = await scrypt(password, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem,
  });

  // Keeping the algorithm parameters beside the hash permits safe upgrades later.
  return [
    algorithm,
    cost,
    blockSize,
    parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password, storedCredential) {
  const credentialParts = storedCredential.split("$");

  if (credentialParts.length !== 6) {
    return false;
  }

  const [
    storedAlgorithm,
    storedCost,
    storedBlockSize,
    storedParallelization,
    salt,
    hash,
  ] = credentialParts;

  if (
    storedAlgorithm !== algorithm ||
    Number(storedCost) !== cost ||
    Number(storedBlockSize) !== blockSize ||
    Number(storedParallelization) !== parallelization ||
    !salt ||
    !hash
  ) {
    return false;
  }

  const saltBuffer = Buffer.from(salt, "base64url");
  const expectedHash = Buffer.from(hash, "base64url");

  if (saltBuffer.length !== 16 || expectedHash.length !== keyLength) {
    return false;
  }

  const actualHash = await scrypt(
    password,
    saltBuffer,
    keyLength,
    {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem,
    },
  );

  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
}
