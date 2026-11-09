/**
 * Who can have an account. A project selects one mode in its configuration,
 * and the live composition root passes it to the auth Logic classes.
 *
 * - `singleOwner`: one account exists, for `ownerEmail`. An operator creates
 *   it with the `auth:setup-owner` command, and nobody can sign up.
 * - `openSignUp`: a visitor makes an account on the sign-up page, and every
 *   account is admitted.
 */
export type AccountPolicy =
  { mode: "singleOwner"; ownerEmail: string } | { mode: "openSignUp" };
