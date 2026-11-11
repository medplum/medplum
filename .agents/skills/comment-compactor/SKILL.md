---
name: comment-compactor
description: Delete the comments a diff adds unless they earn their place, and condense the few that do. Use as the final step before pushing, submitting, or finalizing a PR — after tests and lint pass, before `git push` / `gh pr create`. Also use when asked to "clean up the comments", "check the comments", or when a review flags a comment as stale, obvious, or conversation-bound.
user_invocable: true
---

# comment-compactor

A dedicated pass over the comments a diff adds, run as its own step — not folded into writing the
code, and not folded into a general code review.

**The default is deletion.** Treat every comment an AI wrote while producing this diff as noise
until it proves otherwise. The burden of proof is on keeping a comment, not on removing it. Most
comments generated alongside code are narration of the work, written for the reviewer who is about
to read the PR — an audience that stops existing the moment it merges.

**Why this is a separate step:** comments are the only part of a diff that no tool checks — eslint,
prettier, tsc, and the tests all pass whether a comment is useful, bloated, or already false — and
they have the longest half-life in the file.

## When to run

Run this **immediately before pushing** — after the mechanical gates (tests, eslint, prettier,
`tsc --noEmit`) are green, and before `git push` or `gh pr create`. Re-run after any round of review
feedback that touches comments or restructures code.

## Procedure

### 1. Collect the added comments

Determine the base ref (usually `main`, or the PR's target branch), then surface candidate comment
lines the diff adds:

```bash
git diff --merge-base main -U0 -- '*.ts' '*.tsx' |
  awk '
    /^\+\+\+ b\// { file = substr($0, 7); next }
    /^@@/         { match($0, /\+[0-9]+/); n = substr($0, RSTART + 1, RLENGTH - 1); next }
    /^\+/         { line = substr($0, 2)
                    if (line ~ /(^|[^:"'"'"'])\/\/|\/\*|^[[:space:]]*\*/)
                      printf "%s:%d:%s\n", file, n, line
                    n++ }
  '
```

Widen the pathspec for other languages and add their comment syntax (`#` for shell, Python, YAML).
Keep the pathspec narrow, or markdown headings and generated SVG paths bury the real hits.

This is a candidate net, not a precise one. Treat it as a worklist of locations to open, and read
each one **in its surrounding context**. Also check comments the diff did _not_ touch but whose code
it changed — an untouched comment on rewritten code is the likeliest place for an outright false
statement.

### 2. Split every comment into sentences

Do not judge a comment as a block. Split it into individual sentences (or clauses) and put each one
on trial separately. This step is not optional and it is where most of the work happens: a
four-sentence comment collapsing to a single clause is the normal, correct outcome. The
non-obvious _why_ is typically one sentence buried inside setup, restatement, and hedging that all
need to go.

### 3. Apply the audience test to each sentence

The reader is a human opening this file months from now with no knowledge of the session, the PR, or
the conversation that produced it. For each sentence, ask: **is this useful to that person?**

Delete the sentence if it is any of:

- **Narration of the change** — "we now batch these", "this replaces the old recompute", "as
  requested", "note that the signature changed".
- **Aimed at a reviewer** — justifying a decision, pre-empting an objection, explaining why the
  approach was chosen over one the reader cannot see.
- **Restatement** — says what the code plainly says. `// increment the counter` above `counter++`.
- **Hedging or filler** — "this might possibly need", "for now", "basically", a lead-in sentence
  whose only job is to introduce the next sentence.
- **False** — verify each surviving claim against the code as it now stands.

### 4. Keep only what survives, condensed

A sentence survives only if it is one of:

- **Non-obvious _why_ the code cannot express**: a subtle invariant, a required ordering, a
  concurrency hazard, a choice that looks wrong and is deliberate.
- **An external requirement**: a spec or protocol rule, a workaround for a third-party bug (name it,
  and link it if there is a URL).
- **Public contract**: JSDoc/TSDoc on exported APIs — params, returns, thrown errors, usage.

Then condense it to the shortest form that still carries the information. Surviving does not mean
surviving verbatim. If a rule governs a whole module, state it once at the top rather than at each
call site.

### 5. Apply the edits

Edit in place. Re-run prettier on touched files.

## Examples

**Multi-sentence comment collapsing to one clause.** Three of the four sentences fail: the first
restates the line below it, the second justifies the change to a reviewer, the fourth contrasts
against code the reader cannot see.

```ts
// Cache access policy results per (author, channel type) for this evaluation.
// Without this we were calling satisfiesAccessPolicy() once per subscription, which showed up in profiling.
// Channel type is part of the key because satisfiesAccessPolicy() is hardcoded to return true for rest-hook subs.
// The previous version of this cache keyed on author alone.
const accessPolicyCache = new Map<string, boolean>();
```

```ts
// Channel type is in the key: satisfiesAccessPolicy() always returns true for rest-hook subs, so a
// cached `true` would otherwise bypass the real check for a websocket sub with the same author.
const accessPolicyCache = new Map<string, boolean>();
```

**Deleted outright.** The first sentence restates the expression; the second is an artifact of the
session. Nothing is left.

```ts
// Compute the reconnect delay with exponential backoff, capped at the maximum.
// This replaces the fixed 1s retry we had before.
const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
```

```ts
const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
```

## The one comment worth fighting for

Comments explaining _why the code is not something else_ prevent future regressions — but only when
they name the invariant instead of the diff:

- Keep: `MUST stay synchronous: an await here lets two workers dispatch the same partition out of order.`
- Delete: `this used to have an await before the rework.`

Both point at the same hazard. Only the first survives the loss of the surrounding context.

## Rewrite patterns

| Smell                       | Example                                                    | Fix                                            |
| --------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Restatement                 | `// increment the counter` above `counter++`               | Delete                                         |
| Session-bound               | `// unlike the old approach, we now batch`                 | Delete; keep the invariant only if non-obvious |
| Reviewer-facing             | `// as requested, this is now extracted into a helper`     | Delete                                         |
| Hedged                      | `// this might possibly need to be checked here, probably` | Assert the constraint, or delete               |
| Diffed against removed code | `// no longer calls refreshCache()`                        | Delete; the reader cannot see what was removed |
| Preamble sentence           | Sentence whose only job is to introduce the next one       | Delete; keep the payload sentence              |
| Scattered rule              | Same caveat repeated at five call sites                    | One module-level comment                       |
| Stale                       | Comment names a parameter that was renamed                 | Update, or delete if now obvious               |

## Related conventions

Pairs with the pre-commit gate (tests + eslint + prettier + `tsc --noEmit`), which is mechanical;
this pass is the judgment one.
