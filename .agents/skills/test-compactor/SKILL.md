---
name: test-compactor
description: Cut the tests a diff adds down to the ones that each catch a bug no other test catches, and tighten the survivors. Use after tests pass and before comment-compactor, `git push`, or `gh pr create`. Also use when asked to "trim the tests", "dedupe the tests", "compact the tests", or when a review says a PR has too many, redundant, or overly long tests.
user_invocable: true
---

# test-compactor

A separate pass over the tests a diff adds. Don't fold it into writing the tests or into a general
code review.

**Every test has to justify itself.** A test stays only if you can name a plausible bug in the code
under test that makes it fail and that no remaining test would catch. If you can't name one, the test
is redundant. If you name one and can't show another test catches it, the test stays.

**Why this is a separate step:** a redundant test passes, lints, and adds coverage, so no gate flags
it. Line coverage is also the wrong tool for finding redundancy. Two tests can execute the same lines
and check different things, and a suite cut down to preserve coverage can lose a lot of its ability
to find faults. Judge redundancy by what each test checks, not only by what it runs.

**Tests stay green.** The pass finishes with every test in the touched files passing, and nothing
else changed. If a merged, strengthened, or tightened test fails, the edit is wrong. Fix it or put back
the original test. Never change the assertion to match what the code does, and never skip or delete a
test to make the suite pass.

## Scope

- Only tests **the diff adds or rewrites**: `git diff --merge-base main -- '*.test.ts' '*.test.tsx'`.
  Leave pre-existing tests alone unless the diff made them redundant, and then name that in the
  report instead of deleting them silently.
- Never change production code in this pass.

## When to run

After tests, eslint, prettier, and `tsc --noEmit` pass. **Before** comment-compactor, because
deleting tests deletes their comments too.

## Procedure

### 0. Baseline

Run the touched test files. If anything fails, stop: the suite has to be green before this pass
starts. Then record for each file:

- the number of `it`/`test` blocks and the wall time (`npx vitest run <file>`)
- coverage of **the source files the diff changes**:
  `npx vitest run <test files> --coverage --coverage.include=<changed src files>`
- a fingerprint of everything that isn't a test file, which should be unchanged at the end:
  `git diff HEAD -- . ':(exclude)*.test.ts' ':(exclude)*.test.tsx' | shasum`

### 1. Inventory: one line per test

For each added test, write one row:

| test | behavior (one clause) | setup (fixture/mocks) | action | what it asserts | bug it catches |

The last column matters most. Describe the bug as a mutation of the source, for example "`<` becomes
`<=` in the overlap check", "the permission guard is dropped", or "the returned array is empty". If the
only honest entry is "none" or "the component renders at all", the row is already a deletion
candidate.

### 2. Group and decide

Sort rows by (behavior, action). Within each group, apply these rules in order:

| Pattern                             | Signal                                                                                                              | Action                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Subsumed**                        | Same setup and action; A's assertions are a subset of B's                                                           | Delete A                                                                            |
| **Same partition**                  | Different inputs from the same equivalence class (two valid dates, three ordinary names)                            | Keep one                                                                            |
| **Parameter sweep**                 | Tests differ only in input and expected value                                                                       | Merge into one `it.each` table; each row stays a case                               |
| **Smoke-only**                      | "renders without crashing" / `toBeDefined` / `toBeInTheDocument` on a component another test renders and asserts on | Delete                                                                              |
| **Assert-the-mock**                 | Only checks that a mock was called with what the test just gave it, or that a mock returns its stub                 | Delete, or rewrite to assert an observable outcome                                  |
| **Framework behavior**              | Tests Mantine, React Router, TS types, or `@medplum/core` rather than this code                                     | Delete                                                                              |
| **Same arrange+act, split asserts** | N tests share setup and action and each asserts one field                                                           | Merge into one test with N asserts, but only if the test name still says what fails |
| **Weak oracle**                     | Only non-null, truthy, or called-with checks, but the path is unique                                                | **Keep and strengthen** the assertion to a value check. Don't delete.               |

### 3. Never delete

- A regression test for a filed bug or issue.
- The **only** test of an error, rejection, or permission path. These are the cases agents skip most
  often, so the ones that exist matter most.
- The only test that covers a changed line or branch in this diff.
- Security and access-policy tests, even when they look like duplicates of each other at a glance.

### 4. Prove each deletion

For every test you delete or merge away, whose "bug it catches" column isn't "none":

1. Apply that mutation to the source by hand.
2. Run the **remaining** tests for that file.
3. At least one must fail. Revert the mutation, then confirm the source is clean
   (`git diff --quiet -- <src file>`) and the file's tests pass again before you check the next
   mutation. These are the only intended failures in the whole pass.

If none fails, the test wasn't redundant. Restore it. Don't skip this step: a claim that "this is
covered elsewhere" that hasn't been checked against a mutant is exactly the unverified reasoning this
skill exists to remove.

### 5. Tighten the survivors (DAMP, not DRY)

Tests should read top to bottom without jumping to helpers. Compact without hiding what matters:

- Remove assertions a later assertion implies (`expect(x).toBeDefined()` followed by `expect(x.id).toBe(...)`).
- Remove `act()` around `fireEvent`, which already wraps it.
- Move setup that is **identical and irrelevant to the behavior** into a local builder or `beforeEach`.
  Keep setup that _is_ the point of the test inline, even if it repeats.
- Don't invent a generic `renderAndAssert(opts)` helper. A reader shouldn't have to decode an
  options bag to see what a test checks.
- Test names state behavior and condition: `rejects a slot that overlaps a busy period`, not
  `test 3` or `should work correctly`.

Run the file's tests after each merge or strengthened assertion, not only at the end, so a failure
points to the edit that caused it.

### 6. Re-measure and report

Re-run the step 0 measurements. All touched test files **must pass**, and the non-test fingerprint
must match step 0, so no source edit from a mutation was left behind. Coverage of the changed source
files **must be identical**. That is necessary but not sufficient, which is why step 4 exists. Then
report in this shape:

```
test-compactor: <before> → <after> tests, <lines> → <lines>, <time> → <time>; all passing; changed-file coverage unchanged
  deleted  "renders the form"                      smoke-only; subsumed by "submits override"
  merged   3× "formats <x> duration"               → it.each (3 rows)
  kept     "rejects when user lacks write access"  only permission-path test
  strengthened "calls onSubmit"                    now asserts payload, not just called
  mutants checked: 5, all killed by remaining tests
```

## Optional: `--mutation` for large test diffs

For diffs that add more than ~20 tests, run Stryker scoped to the changed source files before and
after. The mutation score must not drop:

```bash
npx -y -p @stryker-mutator/core -p @stryker-mutator/vitest-runner stryker run \
  --testRunner vitest --mutate '<changed src files>'
```

## Related

Pairs with comment-compactor, which runs after this. Neither replaces the mechanical gate.
