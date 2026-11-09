import {
  base64URLStringToBuffer,
  bufferToBase64URLString,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type {
  PasskeyRegistrationOptions,
  PasskeyServiceInterface,
  PasskeySignInOptions,
} from "./types.js";

type Bytes = Uint8Array<ArrayBuffer>;

const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_BACKUP_ELIGIBLE = 0x08;
const FLAG_BACKED_UP = 0x10;
const FLAG_ATTESTED_DATA = 0x40;
const P256 = { name: "ECDSA", namedCurve: "P-256" };

/** A passkey as plain data. The backend's test owner has this shape. */
export interface SoftPasskeyData {
  id: string;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}

/** What a test changes in one answer, to make the server refuse it. */
interface PasskeyTweaks {
  /** The origin that the browser reports. */
  origin?: string;
}

interface SoftPasskey extends SoftPasskeyData {
  userHandle: string | null;
}

function fromBase64Url(value: string): Bytes {
  return new Uint8Array(base64URLStringToBuffer(value));
}

function toBase64Url(bytes: Uint8Array): string {
  return bufferToBase64URLString(bytes.slice().buffer);
}

function concat(...parts: Uint8Array[]): Bytes {
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function textBytes(text: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(text));
}

async function sha256(bytes: Bytes): Promise<Bytes> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

type Cbor = number | Uint8Array | string | Map<number | string, Cbor>;

function cborHead({ major, length }: { major: number; length: number }): Bytes {
  if (length < 24) {
    return Uint8Array.of((major << 5) | length);
  }
  if (length < 256) {
    return Uint8Array.of((major << 5) | 24, length);
  }
  return Uint8Array.of((major << 5) | 25, length >> 8, length & 0xff);
}

/** The few CBOR forms that a passkey answer needs: small integers, bytes, text and maps. */
function cborEncode(value: Cbor): Bytes {
  if (typeof value === "number") {
    return value >= 0
      ? cborHead({ major: 0, length: value })
      : cborHead({ major: 1, length: -1 - value });
  }
  if (typeof value === "string") {
    const bytes = textBytes(value);
    return concat(cborHead({ major: 3, length: bytes.length }), bytes);
  }
  if (value instanceof Uint8Array) {
    return concat(cborHead({ major: 2, length: value.length }), value);
  }
  return concat(
    cborHead({ major: 5, length: value.size }),
    ...[...value].flatMap(([key, item]) => [cborEncode(key), cborEncode(item)]),
  );
}

function derInteger(bytes: Bytes): Bytes {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) {
    start += 1;
  }
  let value = bytes.slice(start);
  if ((value[0] ?? 0) & 0x80) {
    value = concat(Uint8Array.of(0), value);
  }
  return concat(Uint8Array.of(0x02, value.length), value);
}

/** WebCrypto signs ECDSA as `r || s`. WebAuthn needs an ASN.1 DER sequence. */
function derSignature(raw: Bytes): Bytes {
  const r = derInteger(raw.slice(0, raw.length / 2));
  const s = derInteger(raw.slice(raw.length / 2));
  return concat(Uint8Array.of(0x30, r.length + s.length), r, s);
}

function clientData({
  type,
  challenge,
  origin,
}: {
  type: string;
  challenge: string;
  origin: string;
}): string {
  return toBase64Url(
    textBytes(JSON.stringify({ type, challenge, origin, crossOrigin: false })),
  );
}

function domError({ name, message }: { name: string; message: string }): Error {
  return Object.assign(new Error(message), { name });
}

/**
 * A real WebAuthn authenticator in software: attestation `none`, ES256 with
 * WebCrypto. The backend checks its answers as it checks those of a phone, so
 * no test replaces the verify step. It stands in for the browser's prompt.
 */
export class SoftPasskeyService implements PasskeyServiceInterface {
  private passkey: SoftPasskey | undefined;
  private refusal: string | undefined;
  private supported = true;
  private tweaks: PasskeyTweaks = {};

  constructor(private readonly deps: { origin: string }) {}

  /** The passkeys that the device already has: the owner's, from the test database. */
  useOwnerPasskey(data: SoftPasskeyData): void {
    this.passkey = { ...data, userHandle: null };
  }

  /** The next ceremony fails with this DOM error, as when the person cancels the prompt. */
  refuseNext(name = "NotAllowedError"): void {
    this.refusal = name;
  }

  /** The next ceremony sends an answer with these changes, as a forged device does. */
  tweakNext(tweaks: PasskeyTweaks): void {
    this.tweaks = tweaks;
  }

  /** The browser has no passkeys, as an old browser. */
  removeSupport(): void {
    this.supported = false;
  }

  isSupported(): boolean {
    return this.supported;
  }

  async register(
    options: PasskeyRegistrationOptions,
  ): Promise<RegistrationResponseJSON> {
    this.throwIfRefusing();
    if (
      this.passkey &&
      (options.excludeCredentials ?? []).some(
        ({ id }) => id === this.passkey?.id,
      )
    ) {
      throw domError({
        name: "InvalidStateError",
        message: "This passkey is already registered",
      });
    }
    const keys = (await crypto.subtle.generateKey(P256, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const id = toBase64Url(crypto.getRandomValues(new Uint8Array(16)));
    const passkey: SoftPasskey = {
      id,
      privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
      publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey),
      userHandle: options.user.id,
    };
    const idBytes = fromBase64Url(id);
    const authData = concat(
      await sha256(
        textBytes(options.rp.id ?? new URL(this.deps.origin).hostname),
      ),
      Uint8Array.of(this.flags() | FLAG_ATTESTED_DATA),
      new Uint8Array(4),
      new Uint8Array(16),
      Uint8Array.of(idBytes.length >> 8, idBytes.length & 0xff),
      idBytes,
      this.cosePublicKey(passkey.publicKey),
    );
    const attestationObject = cborEncode(
      new Map<string, Cbor>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", authData],
      ]),
    );
    this.passkey = passkey;
    return {
      id,
      rawId: id,
      type: "public-key",
      response: {
        clientDataJSON: clientData({
          type: "webauthn.create",
          challenge: options.challenge,
          origin: this.takeTweaks().origin ?? this.deps.origin,
        }),
        attestationObject: toBase64Url(attestationObject),
        transports: ["internal", "hybrid"],
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
    };
  }

  async authenticate(
    options: PasskeySignInOptions,
  ): Promise<AuthenticationResponseJSON> {
    this.throwIfRefusing();
    const { passkey } = this;
    const allowed = options.allowCredentials ?? [];
    if (
      !passkey ||
      (allowed.length > 0 && !allowed.some(({ id }) => id === passkey.id))
    ) {
      throw domError({
        name: "NotAllowedError",
        message: "This device has no passkey for this site",
      });
    }
    const authData = concat(
      await sha256(
        textBytes(options.rpId ?? new URL(this.deps.origin).hostname),
      ),
      Uint8Array.of(this.flags()),
      new Uint8Array(4),
    );
    const clientDataJSON = clientData({
      type: "webauthn.get",
      challenge: options.challenge,
      origin: this.takeTweaks().origin ?? this.deps.origin,
    });
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      passkey.privateKey,
      P256,
      false,
      ["sign"],
    );
    const raw = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        concat(authData, await sha256(fromBase64Url(clientDataJSON))),
      ),
    );
    return {
      id: passkey.id,
      rawId: passkey.id,
      type: "public-key",
      response: {
        clientDataJSON,
        authenticatorData: toBase64Url(authData),
        signature: toBase64Url(derSignature(raw)),
        ...(passkey.userHandle === null
          ? {}
          : { userHandle: passkey.userHandle }),
      },
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
    };
  }

  /** User present and verified, and a synced passkey, as most phones make. */
  private flags(): number {
    return (
      FLAG_USER_PRESENT |
      FLAG_USER_VERIFIED |
      FLAG_BACKUP_ELIGIBLE |
      FLAG_BACKED_UP
    );
  }

  private cosePublicKey(publicKey: JsonWebKey): Bytes {
    return cborEncode(
      new Map<number, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, fromBase64Url(publicKey.x ?? "")],
        [-3, fromBase64Url(publicKey.y ?? "")],
      ]),
    );
  }

  private takeTweaks(): PasskeyTweaks {
    const { tweaks } = this;
    this.tweaks = {};
    return tweaks;
  }

  private throwIfRefusing(): void {
    if (this.refusal !== undefined) {
      const name = this.refusal;
      this.refusal = undefined;
      throw domError({ name, message: "The person cancelled the prompt" });
    }
  }
}
