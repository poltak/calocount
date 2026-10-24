// A software passkey for tests. It makes the same registration and sign-in
// answers as a phone with a synced passkey: an ES256 key, "none" attestation,
// user verification, and a sign counter that stays at zero.

const encoder = new TextEncoder();

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

async function sha256(bytes) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function cborHead(major, value) {
  if (value < 24) return [(major << 5) | value];
  if (value < 256) return [(major << 5) | 24, value];
  if (value < 65536) return [(major << 5) | 25, value >> 8, value & 255];
  return [(major << 5) | 26, (value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** CBOR for the value types that WebAuthn uses: integers, text, bytes and maps. */
function cbor(value) {
  if (typeof value === "number") return value >= 0 ? cborHead(0, value) : cborHead(1, -1 - value);
  if (typeof value === "string") {
    const bytes = encoder.encode(value);
    return [...cborHead(3, bytes.length), ...bytes];
  }
  if (value instanceof Uint8Array) return [...cborHead(2, value.length), ...value];
  if (value instanceof Map) {
    const out = cborHead(5, value.size);
    for (const [key, item] of value) out.push(...cbor(key), ...cbor(item));
    return out;
  }
  throw new Error(`no CBOR encoding for ${typeof value}`);
}

/** WebCrypto signs ECDSA as r and s side by side. WebAuthn wants the DER form. */
function derSignature(raw) {
  const integer = (bytes) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
    let value = bytes.slice(start);
    if (value[0] & 0x80) value = Uint8Array.of(0, ...value);
    return [0x02, value.length, ...value];
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32));
  return Uint8Array.of(0x30, r.length + s.length, ...r, ...s);
}

const USER_PRESENT = 0x01;
const USER_VERIFIED = 0x04;
const BACKUP_ELIGIBLE = 0x08;
const BACKED_UP = 0x10;
const ATTESTED_DATA = 0x40;

export async function createAuthenticator() {
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const id = base64Url(credentialId);

  async function authenticatorData(rpId, attested = null) {
    const flags = USER_PRESENT | USER_VERIFIED | BACKUP_ELIGIBLE | BACKED_UP | (attested ? ATTESTED_DATA : 0);
    return Uint8Array.of(...(await sha256(encoder.encode(rpId))), flags, 0, 0, 0, 0, ...(attested ?? []));
  }

  return {
    id,
    /** Answer `generateRegistrationOptions()` output, as `navigator.credentials.create()` would. */
    async register({ options, origin }) {
      const clientDataJSON = encoder.encode(JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin, crossOrigin: false }));
      const coseKey = new Uint8Array(cbor(new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, new Uint8Array(Buffer.from(jwk.x, "base64url"))],
        [-3, new Uint8Array(Buffer.from(jwk.y, "base64url"))],
      ])));
      const attested = Uint8Array.of(...new Uint8Array(16), credentialId.length >> 8, credentialId.length & 255, ...credentialId, ...coseKey);
      const authData = await authenticatorData(options.rp.id, attested);
      const attestationObject = new Uint8Array(cbor(new Map([["fmt", "none"], ["attStmt", new Map()], ["authData", authData]])));
      return {
        id,
        rawId: id,
        type: "public-key",
        response: { clientDataJSON: base64Url(clientDataJSON), attestationObject: base64Url(attestationObject), transports: ["internal", "hybrid"] },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
    /** Answer `generateAuthenticationOptions()` output. `tamper` breaks the signature. */
    async signIn({ options, origin, tamper = false }) {
      const clientDataJSON = encoder.encode(JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin, crossOrigin: false }));
      const authData = await authenticatorData(options.rpId);
      const signed = Uint8Array.of(...authData, ...(await sha256(clientDataJSON)));
      const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signed));
      if (tamper) raw[10] ^= 1;
      return {
        id,
        rawId: id,
        type: "public-key",
        response: { clientDataJSON: base64Url(clientDataJSON), authenticatorData: base64Url(authData), signature: base64Url(derSignature(raw)) },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}
