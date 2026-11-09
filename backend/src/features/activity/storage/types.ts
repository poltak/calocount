import type { AppendOnlyTable } from "../../core/database/standard-columns.js";

interface ActivityTable extends AppendOnlyTable {
  userId: string;
  /** What the user did, as `<subject>.<verb>`, such as `note.created`. */
  action: string;
  /** The ID of the record that the action changed. */
  subjectId: string;
}

export interface ActivityTables {
  activity: ActivityTable;
}
