import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type {
  AuthenticationAnswer,
  AuthenticationOptions,
  PasskeyDescriptor,
  PasskeyServiceInterface,
  RegistrationAnswer,
  RegistrationOptions,
  RelyingParty,
  VerifiedPasskey,
} from "./types.js";

/** The browser waits this long for the owner. A challenge lives five minutes. */
const CEREMONY_TIMEOUT_MS = 3 * 60 * 1000;

function toDescriptor({ id, transports }: PasskeyDescriptor) {
  return { id, transports: transports as AuthenticatorTransport[] };
}

export class SimpleWebAuthnService implements PasskeyServiceInterface {
  createRegistrationOptions({
    relyingParty,
    userHandle,
    existing,
  }: {
    relyingParty: RelyingParty;
    userHandle: string;
    existing: PasskeyDescriptor[];
  }): Promise<RegistrationOptions> {
    return generateRegistrationOptions({
      rpName: relyingParty.rpName,
      rpID: relyingParty.rpId,
      userName: relyingParty.rpName,
      userDisplayName: `${relyingParty.rpName} owner`,
      userID: isoBase64URL.toBuffer(userHandle),
      timeout: CEREMONY_TIMEOUT_MS,
      attestationType: "none",
      excludeCredentials: existing.map(toDescriptor),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });
  }

  async verifyRegistration({
    relyingParty,
    challenge,
    answer,
  }: {
    relyingParty: RelyingParty;
    challenge: string;
    answer: RegistrationAnswer;
  }): Promise<VerifiedPasskey | null> {
    try {
      const { verified, registrationInfo } = await verifyRegistrationResponse({
        response: answer,
        expectedChallenge: challenge,
        expectedOrigin: relyingParty.origin,
        expectedRPID: relyingParty.rpId,
        requireUserVerification: true,
      });
      if (!verified) {
        return null;
      }
      const { credential, credentialDeviceType, credentialBackedUp } =
        registrationInfo;
      return {
        id: credential.id,
        publicKey: isoBase64URL.fromBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      };
    } catch {
      return null;
    }
  }

  createAuthenticationOptions({
    relyingParty,
  }: {
    relyingParty: RelyingParty;
  }): Promise<AuthenticationOptions> {
    return generateAuthenticationOptions({
      rpID: relyingParty.rpId,
      timeout: CEREMONY_TIMEOUT_MS,
      userVerification: "required",
    });
  }

  async verifyAuthentication({
    relyingParty,
    challenge,
    answer,
    passkey,
  }: {
    relyingParty: RelyingParty;
    challenge: string;
    answer: AuthenticationAnswer;
    passkey: {
      id: string;
      publicKey: string;
      counter: number;
      transports: string[];
    };
  }): Promise<{ newCounter: number; backedUp: boolean } | null> {
    try {
      const { verified, authenticationInfo } =
        await verifyAuthenticationResponse({
          response: answer,
          expectedChallenge: challenge,
          expectedOrigin: relyingParty.origin,
          expectedRPID: relyingParty.rpId,
          credential: {
            id: passkey.id,
            publicKey: isoBase64URL.toBuffer(passkey.publicKey),
            counter: passkey.counter,
            transports: passkey.transports as AuthenticatorTransport[],
          },
          requireUserVerification: true,
        });
      return verified
        ? {
            newCounter: authenticationInfo.newCounter,
            backedUp: authenticationInfo.credentialBackedUp,
          }
        : null;
    } catch {
      return null;
    }
  }
}
