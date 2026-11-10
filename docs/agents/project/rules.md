# Calocount rules

These rules add to `AGENTS.md` and `docs/agents/`. The project's own
documents are [decisions](decisions.md) and [setup](setup.md).

## API black-box tests

Some routes have no page: the MCP endpoint, OAuth, the public summary JSON,
`/llms.txt` and the export routes. A black-box test cannot reach them, and an
integration test starts from a UI Logic method. So they have API black-box
tests. Each one does what an outside client does, such as ChatGPT or a
script, and checks only what that client gets back.

- Put each test in `frontend/src/features/<feature>/api-tests/`, in a file
  named `<workflow>.api-spec.ts`.
- Take `test` from `frontend/src/features/core/api-tests/api-test.ts`. Each
  test gets an empty backend with passkey sign-in, on the same
  Worker setup as the black-box tests.
- Call only the routes that the client calls, through `ownerRequest`,
  `anonymousRequest` or `agent` (an MCP client that the owner connected with
  OAuth). Do not read the database, and do not import code of the app.
- Make data the way the client does, or through the UI with the page objects
  of the black-box tests, when a person does that part, such as the consent to
  an app.
- Check the status, the headers and the body that the client reads. Do not
  check a value that the client does not use, such as an internal ID format.
- A behavior that a page shows belongs in a black-box test, not here.
