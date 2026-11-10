import { MemoryLoggerService } from "@app/common/features/core/services/memory-logger-service";
import { sessionCookie } from "../../auth/handlers/session-cookies.js";
import { SimpleWebAuthnService } from "../../auth/services/simple-webauthn-service.js";
import { composeApp } from "../compose-app.js";
import {
  createDatabase as createD1Database,
  type Database,
} from "../database/database.js";
import { findStandardColumnProblems } from "../database/standard-columns.js";
import { readLiveConfig } from "../live/config.js";
import { CloudflareImagesService } from "../services/cloudflare-images-service.js";
import { FetchPhotoDownloadService } from "../services/fetch-photo-download-service.js";
import { FakeClockService } from "../services/fake-clock-service.js";
import type { App, AppConfig, BackendServices } from "../types.js";
import { randomToken, sha256Base64Url, sha256Hex } from "../utils/crypto.js";
import { SESSION_IDLE_TTL_MS } from "../../auth/utils/session-times.js";
import { MemoryPhotoBucket } from "./memory-photo-bucket.js";
import { NodeSqliteD1, openDatabase } from "./node-sqlite-d1.js";
import { createSoftPasskeyData, type SoftPasskeyData } from "./soft-passkey.js";

/**
 * A test database as plain data, because the test runner hands it to each test
 * file. SQLite makes a byte copy of the whole database.
 */
export type DatabaseSnapshot = ArrayBuffer;

/** The value of `CALOCOUNT_SETUP_CODE` in each test app. */
const TEST_SETUP_CODE = "test-setup-code-for-passkeys";

// The binding under each test database. `api.ts` comes from the template, and
// passes only the query builder around, so the test root finds the binding of
// a builder here. `atomic` needs the binding.
const bindings = new WeakMap<Database, NodeSqliteD1>();

function openAround(binding: NodeSqliteD1): Database {
  const db = createD1Database({ binding });
  bindings.set(db, binding);
  return db;
}

function bindingOf(db: Database): NodeSqliteD1 {
  const binding = bindings.get(db);
  if (!binding) {
    throw new Error("This database did not come from createDatabase");
  }
  return binding;
}

// `api.ts` comes from the template, and takes the test database and the test
// sign-in from this file. So a project on another engine or sign-in method
// changes this file and not `api.ts`.
/**
 * Give one test its own database: empty, or with the contents of a snapshot.
 * It is async to match the seam, but SQLite in memory opens at once.
 */
export function createDatabase({
  snapshot,
}: { snapshot?: DatabaseSnapshot } = {}): Promise<Database> {
  return Promise.resolve(
    openAround(openDatabase(snapshot ? { snapshot } : {})),
  );
}

export async function createDatabaseSnapshot({
  from,
  prepare,
}: {
  from?: DatabaseSnapshot;
  prepare: (db: Database) => Promise<void>;
}): Promise<DatabaseSnapshot> {
  const binding = openDatabase(from ? { snapshot: from } : {});
  const db = openAround(binding);
  try {
    await prepare(db);
    return binding.snapshot();
  } finally {
    await db.destroy();
  }
}

export interface TestApp extends App {
  db: Database;
  services: BackendServices & {
    logger: MemoryLoggerService;
    clock: FakeClockService;
  };
  /** The bucket of the entry photos, in memory. A test reads it, ages an object, or makes it fail. */
  photoBucket: MemoryPhotoBucket;
  /** For the test of the schema. */
  schemaTools: {
    findStandardColumnProblems: typeof findStandardColumnProblems;
  };
}

export type AccountMode = "singleOwner" | "openSignUp";

/**
 * What `createTestOwner` and `signInTestOwner` take for the owner account.
 * Passkeys have no password, and the owner has one name, so only `name` has an
 * effect: it is the name of the owner's passkey.
 */
export interface TestOwnerCredentials {
  email: string;
  name: string;
  password: string;
}

/** The owner account that a test database holds, as plain data. */
export interface TestOwner {
  ownerKey: string;
  /** The key pair of the owner's passkey, for the software authenticator. */
  passkey: SoftPasskeyData;
}

export function createApp({
  db,
  trustedOrigins = [],
  config = {},
}: {
  db: Database;
  /** The relying party comes from the request URL, so the test root has no use for it. */
  authBaseUrl?: string;
  trustedOrigins?: string[];
  /** The app has one owner and passkeys, so this input has no effect. */
  accountMode?: AccountMode;
  /** The app keeps no secret for its sessions, so this input has no effect. */
  secret?: string;
  /** Settings for one test, such as another setup code. */
  config?: Partial<AppConfig>;
}): TestApp {
  const services = {
    logger: new MemoryLoggerService(),
    clock: new FakeClockService(),
    passkeys: new SimpleWebAuthnService(),
    images: new CloudflareImagesService(undefined),
    photoDownload: new FetchPhotoDownloadService(),
  };
  const photoBucket = new MemoryPhotoBucket();
  const app = composeApp({
    binding: bindingOf(db),
    db,
    photoBucket,
    services,
    config: {
      ...readLiveConfig({ CALOCOUNT_SETUP_CODE: TEST_SETUP_CODE }),
      trustedOrigins,
      ...config,
    },
  });
  return {
    ...app,
    db,
    services,
    photoBucket,
    schemaTools: { findStandardColumnProblems },
  };
}

/** Give a new test database the schema of the application. */
export function migrateTestDatabase({ app }: { app: TestApp }): Promise<void> {
  bindingOf(app.db).migrate();
  return Promise.resolve();
}

/**
 * Make the owner's first passkey with a trusted write, as the registration
 * leaves it. The UI Logic tests of the registration go through its routes.
 */
export async function createTestOwner({
  app,
  credentials,
}: {
  app: TestApp;
  credentials: TestOwnerCredentials;
}): Promise<TestOwner> {
  const { ownerKey } = app.config;
  const passkey = await createSoftPasskeyData({
    userHandle: await sha256Base64Url({ value: `calocount:${ownerKey}` }),
  });
  await app.db.executeQuery(
    app.storage.auth.planInsertPasskey({
      id: passkey.id,
      ownerKey,
      publicKey: passkey.cosePublicKey,
      counter: 0,
      transportsJson: JSON.stringify(["internal", "hybrid"]),
      deviceType: "multiDevice",
      backedUp: 1,
      name: credentials.name,
      createdAt: app.services.clock.now(),
    }).compiled,
  );
  return { ownerKey, passkey };
}

/**
 * Start a session for the owner, with a trusted write, and return the
 * `Set-Cookie` values of that session. No ceremony runs, so each test that
 * starts signed in has a small cost.
 */
export async function signInTestOwner({
  app,
  owner,
}: {
  app: TestApp;
  owner: TestOwner;
  credentials: TestOwnerCredentials;
}): Promise<string[]> {
  const token = randomToken();
  const now = app.services.clock.now();
  await app.db.executeQuery(
    app.storage.auth.planInsertSession({
      id: await sha256Hex({ value: token }),
      ownerKey: owner.ownerKey,
      passkeyId: owner.passkey.id,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_IDLE_TTL_MS,
    }).compiled,
  );
  return [sessionCookie({ url: new URL("http://app.test"), token })];
}
