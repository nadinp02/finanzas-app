import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Parámetros recomendados por OWASP para scrypt. Formato guardado:
// scrypt$N$r$p$salt$hash (base64url), así se pueden endurecer en el futuro sin migrar.
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 256 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallel: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      length,
      { N: cost, r: blockSize, p: parallel, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION, KEY_LENGTH);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, blockSize, parallel, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !cost || !blockSize || !parallel || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(
    password,
    Buffer.from(salt, "base64url"),
    Number(cost),
    Number(blockSize),
    Number(parallel),
    expected.length,
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/** Iguala el tiempo de respuesta cuando el email no existe, para no revelar qué cuentas hay. */
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummyHash);
  return false;
}
