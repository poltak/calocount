# CI

How the GitHub Actions workflows of the template check a pull request, and
why. `ci.yml` has the jobs, and its comments say what each step does.

## Runners

The jobs of `ci.yml` and `start-project.yml` run on the runners that the
GitHub variable `CI_RUNNER` names, and on GitHub's runners when it is not
set. The label `railway` names the self-hosted runners of
[WorldBrain/ci-runner](https://github.com/WorldBrain/ci-runner), which run
on Railway. Its README tells how they work and how to change them. A
WorldBrain repository turns them on with a variable, and goes back to
GitHub's runners when it deletes the variable:

```sh
gh variable set CI_RUNNER --body railway
gh variable delete CI_RUNNER
```

The jobs on one Railway runner share its disk, so a job that gets a secret,
or a token that can write, must stay on GitHub's runners. The agent review
and the "Template-owned files" check stay there for that reason. Do not give
`vars.CI_RUNNER` to a job that gets one.

## Decisions

- **CI runs on self-hosted runners on Railway, and the agent review stays
  on GitHub.** The organization used its 2,000 free minutes of November 2026
  in seven days, and the minutes after that cost about $50 to $80 a month.
  Railway bills the CPU and memory that the jobs use, an estimated $15 a
  month, and the team already has a Railway workspace. Managed runners from
  Ubicloud or Blacksmith cost less or about the same, but those companies get
  admin access to the repositories and see each secret. A VPS costs about the
  same as Railway and needs upkeep. The jobs of one Railway runner share its
  disk, so only jobs that get no secret run there. The variable `CI_RUNNER`
  chooses the runners, so a change of one variable gives a project GitHub's
  runners again.
- **CI installs the test browser without its system packages, and without a
  cache.** On the GitHub runner, `--with-deps` took 21 of the step's 26
  seconds and added only fonts, which no test needs. The download takes 4
  seconds, and a cache of that size takes as long to restore.
- **CI has no step that sets up Node, and no dependency cache.** pnpm
  downloads the pinned Node by itself, so a setup step downloaded Node a
  second time and took about 10 seconds. That step also kept the dependency
  cache. The cache gave nothing: a run with a cache hit and a run that
  downloaded each package took the same time.
- **CI runs its jobs at the same time: the checks, four jobs of tests, and
  the browser tests with the live start.** With one job, a run took the sum of
  the three. The tests have four jobs, because the runner of a private
  repository has one core with two threads, and a second Vitest worker made 538
  tests only 4% faster there. Vitest splits the files into shards by a hash of
  each path, which can put the two largest files in one shard. Each test takes
  about the same time, so `vite.config.ts` splits the files by size instead. A
  shard has only part of the coverage, so it does not check the thresholds. The
  "Test coverage" job waits for the four test jobs, merges their results, and
  checks them. The cost is more billed minutes, because each job repeats the
  setup and GitHub rounds each job up to a full minute.
- **CI skips a draft pull request.** Its author still changes a draft, and a
  run for each push used billed minutes for results that nobody needed yet.
  The jobs run when the author marks the pull request as ready, and for each
  push after that. The "Template-owned files" check still runs for a draft.
  It takes seconds, and when a push to a draft changes an approved file from
  the template, the check must remove the approval at that push.
- **A pull request skips the tests when the same files passed before.** The
  key is a hash of each file of the checkout, without the Markdown files
  outside `frontend`, `backend`, and `common`. A
  run that passes saves an empty marker with that key in the GitHub cache,
  and the next run of the pull request looks for it. When the marker is
  there, the four test jobs, the coverage job, and the browser job skip. The
  checks job still runs, because it checks the format of Markdown files. A
  change of one character in a code file, also in a comment, makes a new
  key, so that change gets the full run. A comment can change what a check
  does, for example `@ts-expect-error` or a `v8 ignore` comment for coverage.
  A list of paths that the tests read would skip a run after a change to a
  file that someone forgot to put in the list. The full key has no such list,
  only the one exclusion, and no test, build, or live start reads a Markdown
  file outside the app folders. A Markdown file in an app folder still counts,
  because a page can import one. In the first project, no Markdown file is in
  an app folder, so this costs no skip there. A key with no exclusion would skip 5
  of the 130 runs in place of 20, and the plan job would then cost more
  minutes than it saves. A pull request also finds the markers of `main`, so a pull request
  that changes only Markdown files skips the tests from its first run. A push
  to `main` runs every job. A second attempt of a run does not look for a
  marker, so that "Re-run all jobs" runs every job. From 16 October to 4
  November 2026, up to 20 of 130 CI runs of the first project's pull requests had
  files that had passed before. In the first project, the skipped jobs are 19 of the 22 billed
  minutes of a run, and in the template 6 of 10. The cost is the new plan
  job: one billed minute for each run, and about 12 seconds more before the
  tests start.
