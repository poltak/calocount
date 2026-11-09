import type { $ZodRawIssue } from "zod/v4/core";

const FORMAT_MESSAGES: Record<string, string> = {
  email: "Enter a valid email address",
  url: "Enter a valid web address",
};

/**
 * The message a user sees for a value that broke a validation rule. Every rule
 * gets its message here, by the kind of rule, so no rule is without one.
 *
 * A schema gives a rule its own message when this one is not clear enough for
 * that field: `z.string().min(1, "Enter a title")`.
 */
export function userMessage(issue: $ZodRawIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.input === undefined
        ? "Enter a value"
        : "This value has the wrong type";
    case "too_small":
      if (issue.origin === "string") {
        return issue.minimum === 1
          ? "Enter a value"
          : `Use at least ${issue.minimum} characters`;
      }
      return issue.origin === "array" || issue.origin === "set"
        ? `Select at least ${issue.minimum}`
        : `Use a value of ${issue.minimum} or more`;
    case "too_big":
      if (issue.origin === "string") {
        return `Use ${issue.maximum} characters or fewer`;
      }
      return issue.origin === "array" || issue.origin === "set"
        ? `Select ${issue.maximum} or fewer`
        : `Use a value of ${issue.maximum} or less`;
    case "invalid_format":
      return (
        FORMAT_MESSAGES[issue.format] ??
        "This value does not have the correct format"
      );
    default:
      return "This value is not valid";
  }
}
