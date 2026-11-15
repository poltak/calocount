import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";

export type PasskeyRegistrationOptions = PublicKeyCredentialCreationOptionsJSON;
export type PasskeySignInOptions = PublicKeyCredentialRequestOptionsJSON;

/** The browser's passkey prompt. The test root gives a software authenticator. */
export interface PasskeyServiceInterface {
  /** False in a browser with no passkeys. */
  isSupported(): boolean;
  /** Make a new passkey. Rejects when the person cancels the prompt. */
  register(
    options: PasskeyRegistrationOptions,
  ): Promise<RegistrationResponseJSON>;
  /** Sign with a stored passkey. Rejects when the person cancels the prompt. */
  authenticate(
    options: PasskeySignInOptions,
  ): Promise<AuthenticationResponseJSON>;
}
