import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PasskeyRegistrationOptions,
  PasskeyServiceInterface,
  PasskeySignInOptions,
} from "./types.js";

export class BrowserPasskeyService implements PasskeyServiceInterface {
  isSupported(): boolean {
    return browserSupportsWebAuthn();
  }

  register(
    optionsJSON: PasskeyRegistrationOptions,
  ): Promise<RegistrationResponseJSON> {
    return startRegistration({ optionsJSON });
  }

  authenticate(
    optionsJSON: PasskeySignInOptions,
  ): Promise<AuthenticationResponseJSON> {
    return startAuthentication({ optionsJSON });
  }
}
