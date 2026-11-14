# Project hooks

A project can run its own hook before each tool call of an agent. The
template files `.claude/settings.json`, `.codex/hooks.json`, and
`.agents/hooks/` come from the template, so a project does not change them.
One template hook, `.agents/hooks/run-project-hooks.ts`, runs the hooks that
the project lists in `.agents/project-hooks/`.

## The contract

A project puts its hooks in `.agents/project-hooks/`. The template has no such
folder. `hooks.json` in it lists the hooks:

```json
{
  "preToolUse": [
    { "name": "secret-files", "tools": ["Read"], "script": "guard-secret.ts" }
  ]
}
```

- `name`: required. The runner puts it before each reason, as `[secret-files]`.
- `script`: required. A file path relative to `.agents/project-hooks/`. It
  must stay inside that folder.
- `tools`: optional. The exact tool names that the agent gives in `tool_name`,
  such as `Bash`, `Read`, or `apply_patch`. Without `tools`, the hook runs for
  each tool that reaches the runner.
- An unknown key is an error.

The runner starts a hook with the pinned Node (`process.execPath`), in list
order. The hook gets:

- the raw event JSON of the agent on stdin,
- the agent name, `claude` or `codex`, as its first argument,
- the repository root as the working directory.

A hook allows a call when it prints nothing and exits with 0. A hook refuses
a call when it prints one JSON object and exits with 0:

```json
{ "decision": "deny", "reason": "Do not read files under secret/." }
```

`decision` is `deny` or `ask`. `reason` is text for the agent and the person.

An example, `.agents/project-hooks/guard-secret.ts`:

```ts
const event = JSON.parse(await new Response(process.stdin).text());
const file = event.tool_input?.file_path;
if (typeof file === "string" && file.includes("/secret/")) {
  console.log(
    JSON.stringify({ decision: "deny", reason: "Do not read secret/." }),
  );
}
```

## Rules

- The runner stops at the first `deny`. Else it asks if a hook asked. Else it
  prints nothing.
- Codex does not support `ask`, and Claude Code modes `bypassPermissions` and
  `dontAsk` show no prompt. In these cases `ask` becomes `deny`.
- The folder is in `personOnly` of `scripts/template-paths.json`. A hook can be
  a guard, so an agent must not loosen it. A person changes the folder.
- The runner fails closed. It denies the call when `hooks.json` is not valid,
  a script is outside the folder or missing, a hook exits with an error, a
  hook takes more than 8 s, or a hook prints other output. The reason names
  the hook and the first line of its stderr. It never has the event.
- The settings give the runner 10 s in all. When an agent stops a runner
  that takes longer, the runner gives no decision, so it does not deny the
  call. Keep the sum of the hooks of one tool under 10 s.
- Claude Code runs the runner for `Bash`, `Read`, `Grep`, `Glob`, `Edit`,
  `Write`, and `NotebookEdit`. Codex runs it for `Bash` and `apply_patch`.
  Other tools do not reach a project hook.
- Cost: each matched tool call starts one pnpm and Node process, also when
  the project has no `hooks.json`. A hook command through pnpm took about
  76 ms, against 33 ms with `node` alone, when the hooks moved to pnpm. Each
  hook that runs adds one more Node process.

## Choices

- A folder in `personOnly`, as with `lint.project.json`: the project adds
  rules, and the template files stay the same, so a sync has no conflict.
- Fail closed: the project relies on its guards. A guard that is broken must
  not let a call through.
- One runner, not a registration for each project: the settings files stay
  template-owned and equal in each project. A project edits one list.
