import type { Generated } from "kysely";

/** The table of the activity feature. The database fills the generated columns. */
export interface ActivityTables {
  activity: {
    id: Generated<string>;
    /** The user who did the action. */
    userId: string;
    /** What the user did, as `<subject>.<verb>`, such as `note.created`. */
    action: string;
    /** The ID of the record that the action changed. */
    subjectId: string;
    createdAt: Generated<Date>;
  };
}
