/** The fields of a note form that the user has not saved yet. */
export interface NoteDraft {
  title: string;
  body: string;
}

/** Which form a draft belongs to. Each user has separate drafts. */
export interface NoteDraftOwner {
  userId: string;
  /** The note that the form changes, or `null` for the form that creates one. */
  noteId: string | null;
}
