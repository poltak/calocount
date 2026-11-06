# Agent review of pull requests

The "Agent review" workflow of CI gives each pull request to two models,
Claude Code and Codex. Each one reports rule violations that no lint
rule or test can check. An example is a doc's content that the change made no longer valid.
The script also reports each new document in `docs/agents/`.
[`scripts/agent-review.mjs`](../../scripts/agent-review.mjs) describes each
step.

- The general rules are in
  [`.agents/review/prompt.md`](../../.agents/review/prompt.md), which comes
  from the template.
- A project adds its own rules in `.agents/review/project-rules.md`. The
  project owns this file, and a sync never changes it. Without the file, the
  review uses only the general rules.

In `.agents/review/project-rules.md`, give each rule a heading such as
`### release-note`. Start its body with `Resolution: fix-required` or
`Resolution: maintainer-approval`. A missing or invalid policy requires a fix.
A project rule cannot replace a general rule with the same name.
Below the policy, say what to report, and give one example, as the rules in `prompt.md` do. The model gets the file from its
first `###` heading to its end. The review deletes a finding whose rule
is in neither file. For example:

```md
### release-note

Resolution: fix-required

The pull request changes text that a user sees, and its description has no
line that starts with "Release note:". Quote the changed text.
```

The rules `decision-change`, `new-document`, and `comment-restates-code` permit
maintainer approval. All other general rules require a fix. The script reads
the policy from the rules, not from model output. Findings that require a fix
have no acceptance checkbox. A later review reopens an earlier acceptance
when the rule no longer permits it. Nonblocking notes can still be accepted.

The check works as follows:

- The models report two kinds of issue. A rule violation breaks a rule. Its
  ID is such as `F3`, and it fails the check while it is open. An other
  issue is a problem that no rule covers, such as a likely bug. Its ID is
  such as `N2`, and it does not fail the check. Each model gives up to three
  other issues in a review. The ID of an issue does not change in later
  reviews. The job deletes each issue whose quote is not in the file that it
  names.
- The first review posts the master comment of the pull request. The master
  comment shows each issue under "Open issues" or "Addressed issues", and it
  stores the issues for the next review. It also has a table of the reviews,
  and the input and output tokens that each model used in the newest review.
  For Claude, it also gives the turns and the cost at API prices. Codex
  gives no cost.
- Each later review gives the open issues of the master comment to the
  models, which say for each one if it is addressed. The models also get what
  a maintainer wrote about the issue: a reply to its line comment, or a comment
  on the pull request that names its ID. Only comments from persons in
  `TEMPLATE_MAINTAINERS` count, as with checkboxes and the acceptance label.
  GitHub's author association does not grant this authority.
  Replies help the models locate and verify fixes or incorrect findings.
  They cannot approve a violation, even for a rule that permits approval.
  Code comments can explain why a finding is incorrect, but cannot grant an
  exception. An issue is addressed when its quote is not in its file now, or
  when each model that answered says so. An issue that a model reports again stays open. An
  addressed issue that a model reports again is open again. The review edits
  the master comment. Under each issue that the models checked, the master
  comment
  shows the status that each model gave, with the reason of the model, so a
  person sees where the models disagree. The summary does not repeat them.
- Each later review also posts a summary comment, so GitHub sends a
  notification. The summary gives the result of the check. It lists the
  issues that the review addressed, the new issues, the issues that are open
  again, and the issues where the models disagree. Each issue links to its
  entry in the master comment. The review hides the summary of the review
  before it as outdated. If GitHub refuses that to the token of the workflow,
  the job logs a warning.
- A maintainer accepts a finding only when its rule permits approval, with
  its checkbox in the master comment or in its line comment. The next review
  moves the issue to the addressed issues, and each later review keeps it accepted. To take the
  acceptance back, a maintainer clears the box, and the next review opens the
  issue again. GitHub keeps each version of a comment with the person who
  made it. So the review counts only a box that a person in
  `TEMPLATE_MAINTAINERS` checked or cleared after the newest edit of the
  review. An issue that is fixed is addressed, also when a maintainer
  accepted it. A box changes the check at the next review, so to pass the
  check now, a maintainer adds the label.
- The master comment also stores the newest commit that each model read.
  When the pull request only adds commits after it, the models look for new
  problems only in those commits, and the summary links to them. The models
  can read the earlier changes when a rule needs them. When a model fails,
  the next review starts again from the newest commit that each model read.
  Each change gets a new review after a rebase, a force push, or a merge of
  the base branch, after a change in `.agents/review/`, and after an edit of
  the title or the description.
- Each new issue on lines that the pull request adds also gets a comment on
  those lines, in a review of the type "Comment". The line comment links to
  the issue in the master comment, and the master comment links to the line
  comment. The review does not request changes, because the check already
  fails. An issue on other lines is only in the master comment. When a later
  review verifies a fix, it removes the acceptance box from the line comment
  and adds the reason. Only accepted issues have checked boxes. A person
  resolves the conversation, because
  GitHub can refuse that to the token of a workflow. GitHub sends the lines
  around a line comment by email, so an issue in a file with a `secret` or
  `private-data` rule violation gets no line comment.
- The rules `secret` and `private-data` look at each commit, not only at the
  diff, because a value that a later commit deletes stays on GitHub. The
  quote of their rule violation can be in any commit. GitHub can send a
  comment by email, so the comments show no quote from a file that has such
  a rule violation.
- The models get the title and the description of the pull request, and they
  can read its commit messages, so a rule can ask for a reason there. An edit
  of the title or the description starts a new review. When that review
  stops the Claude job of a review of the same head, the stopped review posts
  nothing and fails, and the new review gives the result.
- The job fails while a rule violation is open, and when a configured model
  fails. A configured maintainer can add `agent-review-accepted` to accept
  approval-permitted findings for the reviewed head. Findings that require a
  fix and failed review jobs still fail the check. The label does not change
  stored issue statuses. A later review with open findings removes it.
  Checkboxes keep eligible issues accepted across reviews. A review without
  stored issue details must run again before the label can accept findings.
- A pull request with a comment of a review from before the master comment
  gets a master comment at its next review. That review takes the open
  findings of the newest old comment, and gives them the IDs `F1` and up. A
  box that a maintainer checked in the old comment after its review does not
  count.
- Each pull request gets the review, also one that a maintainer opened. A
  draft gets its review when its author marks it as ready. A dependency update
  from Renovate or Dependabot gets no review.
- The models, their versions, and their effort are in `env` at the top of
  `.github/workflows/agent-review.yml`.
- Each model runs on the subscription of a person, and not on an API key. The
  reviews count against the usage limits of that subscription.
- A model without its secret does not run. With no secret, the workflow reviews nothing and passes.

The review uses `TEMPLATE_MAINTAINERS` from the
[template-owned check](setup.md#files-that-come-from-the-template). Make the label one
time:

```sh
gh label create agent-review-accepted --repo <owner>/<repo> --color 0e8a16 \
  --description "A maintainer accepted the findings of the agent review"
```

## The Claude Code secret

Run `claude setup-token`, and sign in with a Claude Pro or Max account. It
shows a token that starts with `sk-ant-oat01-`. Save it, and paste the token
when `gh` asks for the value:

```sh
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo <owner>/<repo>
```

## The Codex secrets

Codex keeps its login in a file, `auth.json`. When the login is about 8 days
old, Codex refreshes it during a run, and the old refresh token then stops
working. So the workflow saves the new file in the secret after each run, and
one Codex job runs at a time in the repository.

Make a separate login for CI. Do not copy your own `~/.codex/auth.json`. When
CI refreshes the copy, the login on your computer stops working.

```sh
mkdir -m 700 /tmp/codex-ci
printf 'cli_auth_credentials_store = "file"\n' > /tmp/codex-ci/config.toml
CODEX_HOME=/tmp/codex-ci codex login
jq '{auth_mode, has_refresh_token: (.tokens.refresh_token != null)}' \
  /tmp/codex-ci/auth.json
```

Sign in with a ChatGPT account that has Codex. The last command must show
`"auth_mode": "chatgpt"` and `"has_refresh_token": true`. Then save the file,
and delete the folder:

```sh
gh secret set CODEX_AUTH_JSON --repo <owner>/<repo> < /tmp/codex-ci/auth.json
rm -rf /tmp/codex-ci
```

The token of a workflow cannot write a secret, so the workflow needs a
personal access token to save the refreshed login:

1. Open https://github.com/settings/personal-access-tokens/new.
2. Set the resource owner to the owner of the repository, and "Repository
   access" to this repository only.
3. Under "Repository permissions", set "Secrets" to "Read and write".
4. Set an expiry, such as one year, and renew the token before that date.
5. Run `gh secret set CODEX_AUTH_WRITE_TOKEN --repo <owner>/<repo>`, and paste
   the token. If GitHub says that the organization must approve the token, an
   owner approves it under "Personal access tokens" in the settings of the
   organization.

When Codex refreshes the login and the job cannot save it, the job fails, and
`CODEX_AUTH_JSON` then has a login that does not work. Make a new login with
the steps above.
