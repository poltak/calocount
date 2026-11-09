import type { webcrypto } from "node:crypto";
import { isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

type JsonWebKey = webcrypto.JsonWebKey;

const P256 = { name: "ECDSA", namedCurve: "P-256" };

/** COSE key of an ES256 public key: type EC2, algorithm ES256, curve P-256. */
const COSE_ES256 = new Map<number, number>([
  [1, 2],
  [3, -7],
  [-1, 1],
]);

/** A software passkey as plain data, so that a database template can hold it. */
export interface SoftPasskeyData {
  id: string;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
  /** Base64url of the COSE public key, as the `passkeys` table holds it. */
  cosePublicKey: string;
  /** The user ID of the passkey, as the registration options set it. */
  userHandle: string;
}

/**
 * A new ES256 key pair for the owner of a test database. The frontend test
 * root holds the software authenticator that signs with it.
 */
export async function createSoftPasskeyData({
  userHandle,
}: {
  userHandle: string;
}): Promise<SoftPasskeyData> {
  const keys = (await crypto.subtle.generateKey(P256, true, [
    "sign",
    "verify",
  ])) as webcrypto.CryptoKeyPair;
  const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const cose = new Map<number, number | Uint8Array>(COSE_ES256);
  cose.set(-2, isoBase64URL.toBuffer(publicKey.x ?? ""));
  cose.set(-3, isoBase64URL.toBuffer(publicKey.y ?? ""));
  return {
    id: isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16))),
    privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
    publicKey,
    cosePublicKey: isoBase64URL.fromBuffer(isoCBOR.encode(cose)),
    userHandle,
  };
}
