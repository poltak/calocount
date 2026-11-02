# The notes example

This feature, with the backend features `notes` and `activity`, is the model
for a new feature. The `remove-example` skill removes it, so the documents that
come from the template do not name its files. This file names them, and it
leaves with the example.

## What each file is a model of

| To see                                         | Read                                                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A feature with its own table and pages         | `backend/src/features/notes/`, `frontend/src/features/notes/`                                        |
| A LogicPlugin that two Logic classes share     | `frontend/src/features/notes/ui/note-draft-plugin.ts`                                                |
| A Logic that reacts to another Logic's event   | `frontend/src/features/auth/ui/auth-logic.ts`, `frontend/src/features/notes/ui/note-draft-plugin.ts` |
| A frontend Storage class                       | `frontend/src/features/notes/storage/notes-draft-storage.ts`                                         |
| A write across two features in one transaction | `backend/src/features/notes/logic/notes-logic.ts`                                                    |
| Queries limited to the signed-in user          | `backend/src/features/notes/storage/notes-storage.ts`                                                |
| The check of the pages in a real browser       | `frontend/src/features/core/tests/browser/example-pages.spec.ts`                                     |

## The model tests

[`notes-logic.test.ts`](ui/notes-logic.test.ts) is the model for an integration
test. Copy its shape. Its test "should afford creating a note from the draft,
and empty the draft" is the model for a success case. The tests of `create`
after it are the model for failure cases. The file also shows how to seed rows
through the API.

[`note-edit-logic.test.ts`](ui/note-edit-logic.test.ts) shows a Logic whose
`deps` name a record: its `setupTest` seeds the record in an async
`createLogic`.

[`note-draft-plugin.test.ts`](ui/note-draft-plugin.test.ts) shows the test file
of a LogicPlugin, and a test of what a Logic does when the user signs out.

## Choices in this example

- **The `activity` feature shows a write across two features.** Each change to
  a note and its activity record are one transaction in `NotesLogic`.
- **The example keeps unsaved text in `localStorage`.** `NoteDraftPlugin` holds
  the fields of a note form, and the create form and the edit form each own an
  instance. Each user and each form has a separate entry, so one user does not
  get another user's draft on a shared browser.
- **Sign-out removes that text, and a session that expires does not.**
  `AuthLogic` sends a `signedOut` event, and the `NoteDraftPlugin` of the open
  page removes each draft of that user. A user who signs out on a shared
  browser then leaves no text there. A session that the backend ends sends no
  event, so the text is there after the next sign-in. This is also the example
  of one Logic that reacts to another through an event. Only a Logic on the
  open page hears the event. That is sufficient here, because each page behind
  the session gate has a note form. A project with other pages must listen in
  a Logic that lives as long as the session.
