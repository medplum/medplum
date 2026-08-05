---
name: comment-compactor
description: Review and rewrite every comment a diff adds so it is insightful, durable, and compact. Use as the final step before pushing, submitting, or finalizing a PR — after tests and lint pass, before `git push` / `gh pr create`. Also use when asked to "clean up the comments", "check the comments", or when a review flags a comment as stale, obvious, or conversation-bound.
user_invocable: true
---

# comment-compactor

A dedicated pass over the comments a diff adds, run as its own step — not folded into writing
the code, and not folded into a general code review.

**Why this is a separate step:** comments are the only part of a diff that no tool checks. eslint,
prettier, tsc, and the test suite all pass whether a comment is useful, bloated, or already false.
They also have the longest half-life in the file: code gets refactored away, but a stale comment
survives and actively misleads the next reader — human or agent.

The dominant failure mode is comments that narrate _the session that produced them_ rather than the
code that shipped: "the pre-rework shape", "the old recompute we removed", "unlike the previous
approach", "as discussed". Those read fine during the PR and are meaningless a year later, because
the reader has no access to the thing being contrasted against.

## When to run

Run this **immediately before pushing** a PR — after the mechanical gates (tests, eslint, prettier,
`tsc --noEmit`) are green, and before `git push` or `gh pr create`. Re-run it after any round of
review feedback that touches comments or restructures code.

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

Widen the pathspec for other languages, and add their comment syntax to the regex (`#` for shell,
Python, and YAML). Keep the pathspec narrow: without it, markdown headings and generated SVG paths
bury the real hits.

This is a candidate net, not a precise one — it still catches the odd string literal and misses
comments whose opening line was unchanged. Treat the output as a worklist of locations to open, then
read each one **in its surrounding context**, because the judgment below depends on the code the
comment sits on.

Also check comments the diff did _not_ touch but whose code it changed: an untouched comment sitting
on rewritten code is the most likely place for an outright false statement.

### 2. Judge each comment

For every added or newly-adjacent comment, ask in order:

- **Insightful?** Does it explain something the code cannot say itself — a _why_, an invariant, a
  non-obvious constraint, a rejected alternative and the reason it was rejected? If it restates the
  statement below it, delete it.
- **Durable?** Would it still read correctly to someone who never saw this PR, this branch, or the
  conversation that produced it? Strip references to prior iterations, removed code, review
  feedback, and "we changed / we decided". State the invariant that holds now, not the history of
  arriving at it.
- **Compact?** Cut hedging, repetition, and anything a nearby comment already says. Long is fine
  when the content earns it — a subtle concurrency invariant deserves a paragraph; a getter does
  not. Prefer one dense paragraph to three loose ones.
- **Correctly placed?** A rule that governs a whole module belongs once at the top of the module,
  not repeated at each call site.
- **Still true?** Verify the claim against the code as it now stands. A comment that was accurate
  three commits ago is worse than no comment.

### 3. Apply the edits

Edit in place. Deleting a comment is a normal outcome and usually the right one for restatement.
Re-run prettier on touched files if the project formats comments.

## The high-value case

Watch especially for comments explaining _why the code is not something else_. That is often the
most valuable kind — it prevents a future regression — but only if it names the invariant rather
than the diff:

- Durable: `MUST stay synchronous: an await here lets two workers dispatch the same partition out of order.`
- Not durable: `this used to have an await before the rework.`

Both point at the same hazard. Only the first survives the loss of the surrounding context.

## Rewrite patterns

| Smell                       | Example                                                    | Fix                                            |
| --------------------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Restatement                 | `// increment the counter` above `counter++`               | Delete                                         |
| Session-bound               | `// unlike the old approach, we now batch`                 | State the current invariant, or delete         |
| Hedged                      | `// this might possibly need to be checked here, probably` | Assert the constraint, or delete               |
| Diffed against removed code | `// no longer calls refreshCache()`                        | Delete; the reader cannot see what was removed |
| Scattered rule              | Same caveat repeated at five call sites                    | One module-level comment                       |
| Stale                       | Comment names a parameter that was renamed                 | Update, or delete if now obvious               |

## Related conventions

Pairs with the pre-commit gate (tests + eslint + prettier + `tsc --noEmit`), which is mechanical;
this pass is the judgment one. It applies the same "cut it down" instinct that simplifying a large
diff does, but to prose rather than code.
