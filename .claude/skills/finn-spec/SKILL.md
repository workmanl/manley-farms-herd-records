---
name: finn-spec
description: Interview the user about a raw idea until confident, then file a build-ready GitHub issue with AC-N acceptance criteria and NG-N non-goals. Use when asked to run Finn-loop's spec interview, draft a queue-ready issue, or plan a feature. Interactive; requires the user present; never run unattended.
---

# Finn-loop spec interview (GitHub Issues edition)

Turns a raw idea into a GitHub issue on this repository so complete that a
build agent needs nothing beyond the issue. Works like plan mode: research the
codebase, interview the user in rounds until confident, draft, confirm, file.
The user is the product brain; you are the codebase brain. Never guess product
decisions.

This repository is public. Everything you file is visible to everyone.

## 1. Research before asking

Read `CONTRIBUTING.md` and the relevant code first. Find which files are
involved, what patterns already exist, and what constraints apply (data
safety, stable IDs, migrations, withdrawal rules, copy rules). Never ask the
user something the codebase can answer.

## 2. Interview in rounds

Ask 1-4 questions per round, each with concrete options and your recommended
option first. Ask only genuine product decisions:

- Behavior forks: who sees it, what exactly happens, where does it live
- Scope boundaries: what is explicitly out of this issue
- Edge cases that change acceptance criteria: empty states, offline, failure
  handling
- Data implications: existing records, schema, migrations, old backups

After each round, fold the answers in and apply the confidence test:

> Could two different engineers read this spec and ship the same observable
> behavior?

If any fork remains, ask another round. There is no cap on rounds: a small fix
might need two questions; a big feature legitimately needs 10-20+. Never stop
early because it feels like a lot of questions. Once the test passes, stop. No
filler questions.

## 3. Draft the issue

Use exactly this shape:

```md
## Problem

What user or farm problem does this solve? One or two sentences.

## Acceptance Criteria

- [ ] AC-1 - Observable, testable outcome one
- [ ] AC-2 - Observable, testable outcome two

## Non-goals

- NG-1 - What must NOT change in this task
- NG-2 - What is explicitly excluded or saved for later

## Relevant files

- path/to/file.js - why it matters

## Test expectations

- What should be tested, manually or automatically (`npm test` at minimum)

## How to verify

1. Numbered manual steps anyone can follow to confirm the work: where to
   go, what to do, exactly what should happen. Cover every AC.

## Blocked by

None. (Or a list of `#N` issues that must be closed first.)
```

Rules for the draft:

- Every acceptance criterion is an observable outcome with a stable `AC-N`
  id. Every non-goal has a stable `NG-N` id. These ids are the contract the
  build and review skills enforce.
- No acceptance criterion may require a non-goal. If one does, resolve it
  with the user before filing.
- Size the issue to one day of agent work or less. Bigger work becomes a
  chain of small issues, each listing the earlier ones under `Blocked by`, so
  each is buildable using only merged code from the ones before it.
- Synthetic examples only. Never put real herd records, animal names, farm
  names, destinations, clinical records, backups or identifying screenshots in
  an issue.
- Do not use em dashes (CONTRIBUTING.md copy rule).
- If the work touches withdrawal or treatment logic, or the database schema,
  say so in the Problem section. Those PRs always need human review and, for
  withdrawal or treatment, independent producer and veterinarian review before
  release.

## 4. Confirm and file

Show the full draft in chat and get the user's go-ahead. Then write the body
to a temporary file outside the repository and create the issue:

```bash
gh issue create --title "TITLE" --body-file /path/to/body.md
```

You may add descriptive labels such as `documentation`, `bug` or
`enhancement`. Report the exact issue number and URL that `gh` returns; later
skills use that number rather than guessing it.

## Hard rule

Never apply the `agent-ready` label. The user applies it on GitHub after a
final read. That label is the approval gate between "idea" and "an agent
builds it". The builder only trusts `agent-ready` when a repository
maintainer applied it.

## Attribution

Adapted from Finn-loop by Alex Finn (https://github.com/finna/Finn-loop,
commit 7941b62), changed to use GitHub Issues and labels instead of Linear and
to follow this repository's CONTRIBUTING.md. Original license:

MIT License

Copyright (c) 2026 Alex Finn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
