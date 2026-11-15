import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";

/** The site that a passkey belongs to. A passkey made on one host name does not work on another. */
export interface RelyingParty {
  rpId: string;
  rpName: string;
  origin: string;
}

export interface PasskeyDescriptor {
  id: string;
  transports: string[];
}

export interface VerifiedPasskey {
  id: string;
  /** Base64url of the COSE public key bytes. */
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: "singleDevice" | "multiDevice";
  backedUp: boolean;
}

export type RegistrationOptions = PublicKeyCredentialCreationOptionsJSON;
export type AuthenticationOptions = PublicKeyCredentialRequestOptionsJSON;
export type RegistrationAnswer = RegistrationResponseJSON;
export type AuthenticationAnswer = AuthenticationResponseJSON;

/**
 * The sign-in method: WebAuthn. Each verify method returns `null` for an answer
 * that fails, and never gives a library's message, because it can hold the
 * challenge or the origin. Both verify methods require user verification.
 */
export interface PasskeyServiceInterface {
  createRegistrationOptions(props: {
    relyingParty: RelyingParty;
    /** Base64url. A stable value lets a device replace its old passkey for this site. */
    userHandle: string;
    existing: PasskeyDescriptor[];
  }): Promise<RegistrationOptions>;
  verifyRegistration(props: {
    relyingParty: RelyingParty;
    challenge: string;
    answer: RegistrationAnswer;
  }): Promise<VerifiedPasskey | null>;
  /** Every passkey is a resident key, so the browser finds it without a list. */
  createAuthenticationOptions(props: {
    relyingParty: RelyingParty;
  }): Promise<AuthenticationOptions>;
  verifyAuthentication(props: {
    relyingParty: RelyingParty;
    challenge: string;
    answer: AuthenticationAnswer;
    passkey: {
      id: string;
      publicKey: string;
      counter: number;
      transports: string[];
    };
  }): Promise<{ newCounter: number; backedUp: boolean } | null>;
}
