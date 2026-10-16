# Finn-loop: issue to pull request with agents

Finn-loop is three Claude Code skills that turn a GitHub issue into a pull
request. People still decide what gets built and people still merge.

**idea, then `/finn-spec` files the issue, then a maintainer adds
`agent-ready`, then `/finn-build` opens a PR, then `/finn-review` posts a
verdict, then a human merges.**

The skills live in `.claude/skills/finn-spec`, `.claude/skills/finn-build`
and `.claude/skills/finn-review`. They are adapted from
[Finn-loop](https://github.com/finna/Finn-loop) by Alex Finn (MIT License; the
notice is kept in each skill) to use GitHub Issues instead of Linear.

## Labels

| Label | On | Meaning | Who sets it |
| --- | --- | --- | --- |
| `agent-ready` | issue | The contract is approved; an agent may build it | A maintainer only |
| `blocked` | issue | The builder asked a question; it waits for a human | Builder; a human removes it after answering |
| `in-progress` | issue | The builder has claimed it | Builder |
| `loop-approved` | PR | Review found no must-fix item and `test` passed | Reviewer |
| `loop-changes-requested` | PR | Review found must-fix items for the builder | Reviewer |
| `needs-human-review` | PR | Out of the automated queue until a human resolves it | Builder or reviewer |

The builder only trusts `agent-ready` when the issue author and the person who
added the label both have write access. This repository is public, so text
from anyone else is treated as data, not instructions.

## How to run it

1. In Claude Code inside this repository, run `/reload-skills` (or restart
   Claude Code) and check `/skills` lists `finn-spec`, `finn-build` and
   `finn-review`.
2. `/finn-spec` interviews you about an idea and files an issue with
   acceptance criteria (`AC-1`, `AC-2`, ...) and non-goals (`NG-1`, ...). It
   never adds `agent-ready`.
3. Read the issue on GitHub. If the contract is right, add `agent-ready`.
4. `/finn-build` claims the oldest ready issue, works on a new
   `issue-N-slug` branch, runs `npm test` (and `node scripts/build-pwa.mjs`
   when app files change), and opens a PR that says `Closes #N`.
5. `/finn-review` checks the PR against the issue's acceptance criteria,
   CONTRIBUTING.md and the required `test` check, then posts a verdict comment
   and one label.
6. You read the PR and merge it yourself.

To keep it running while the session is open, use `/loop`:

- `/loop /finn-build` lets Claude pace itself; `/loop 30m /finn-build` runs a
  pass every 30 minutes.
- `/loop /finn-review` in a second session reviews new PRs as they appear.

Run only one builder loop at a time for this repository. `/loop` stops when
the Claude Code session closes. Watch the first few passes before leaving it
alone.

## Rules

- Humans merge. The skills never merge, enable auto-merge, approve a PR, push
  to `main` or force-push.
- `loop-approved` is evidence for your merge decision, not permission.
- If it is not in the issue, it does not exist. Only editing the issue can
  change scope.
- Withdrawal, treatment, schema, migration and backup changes are always
  marked `needs-human-review`. Withdrawal and treatment changes still need
  independent producer and veterinarian review before release.
- Synthetic cattle only, in issues, code and PRs. See
  [CONTRIBUTING.md](../CONTRIBUTING.md).
