# Plan — the non-visual pieces the booking form needs

Branch `philip/finder-booking-plumbing`, cut from `origin/main` at `df3436dc8`.

**This file is scratch. Delete it in the commit that opens the PR.**

Piece "3" from the MVP ordering: the duration reader, the month availability
scan, and appointment assembly. No UI. Landing it means the only thing left
between `main` and the mock-up is the actor-select field and the single-page
shell.

Everything below was checked against the **PR branches as they stand**, not
against `phil/scheduling-components-v1` and not against the vault. Where those
disagree, the branches win and this file says so.

---

## 1. Status as verified, 2026-08-14

| PR | Branch | State |
| --- | --- | --- |
| #10144 | `philip/pick-lists` @ `226b4be89` | **in the merge queue** |
| #10164 | `philip/appointment-eligibility` @ `21d2099af` | open, reviewed down to hooks only |
| #10127 | `philip/calendar-date-input-range` | draft — **not needed**, see §3 |
| #10044 | `phil/scheduling-components-v1` @ `cc3ef20f5` | source branch, diverged; read it for prose, not for code |

### What #10164 actually contains now

The split note describes piece C as "`AppointmentActorSelect`,
`useEligibleSchedules`". **That is out of date.** Commit `e1e3bdeb7` — *"defer
the actor select field to a follow-up"* — removed the component, its tests and
its stories. #10164 is now `AppointmentFinder.schedules` + two hooks, and its
`index.ts` exports no new component at all.

Consequences worth stating plainly:

- **The actor-select field is unclaimed work.** It is not in any open PR. It
  needs its own PR before the shell can be built, and that PR is now on the
  critical path where the split note has it already done.
- Review also reshaped the module's API. Against the source branch:
  - `excludedByClinic` → `excludedByLocation` (Noah: "clinic" reads too narrow)
  - `ActorSelections` is now `Partial<Record<SchedulingRole, readonly string[]>>`
    — **schedule ids per role** (`a5efaa2c4`), not candidate objects
  - `getCandidateRole` / `getCandidateDisplay` derive from the candidate rather
    than being stored on it (`d3c8c2be9`, answering Noah's "a lot of data
    extracted from `schedule` & `actorResource`")
  - both hooks take `Reference<HealthcareService> | WithId<HealthcareService>`
    (`21d2099af`)
  - per-request failures go through `Promise.allSettled` (`5a5d2d691`, David's note)

Anything ported from the source branch has to be read against those shapes.

---

## 2. Six traps, all verified in the tree

These are the reasons a straight copy of the source-branch files does not
compile or does not belong.

**1. `durationToMinutes` does not exist.** #10124 shipped it as
`schedulingDurationToMinutes` (`packages/core/src/scheduling.ts:302`). The
source branch's `AppointmentFinder.params.ts` imports the old name.

**2. `startOfMonth` is not exported from `@medplum/react`.** David's thread on
#10125 — *"do we need this export?"* — was resolved by dropping it.
`packages/react/src/index.ts:32` exports `CalendarDateInput` but never
`CalendarDateInput.utils`, and `CalendarDateInput.tsx` imports `startOfMonth`
without re-exporting it. The source branch's `useMonthAvailability` imports it
from `@medplum/react` and **will not build**. Commit `ad45887e1` on the source
branch is therefore a dead end.

*Fix:* add a local `startOfMonth` to `AppointmentFinder.times.ts`, directly
above `endOfMonth`. Three lines, and it is where the rest of this package's date
arithmetic already lives (`endOfDay`, `endOfMonth`, `addDays`, `isSameDay`).
Re-exporting the util out of `@medplum/react` reopens a thread that was closed
deliberately; don't.

**3. `addDays` already exists.** `AppointmentFinder.times.ts:317` on `main`.
The source branch's `useMonthAvailability` carries a private copy at the bottom
of the file. Delete it and import.

**4. #10144 already ships half of `params`.** `AppointmentServiceSelect.utils.ts`
on `philip/pick-lists` exports `getServiceDurationMinutes(service)`, already
written against the correct `schedulingDurationToMinutes`. The source branch's
`getConfiguredDurationMinutes` is that function **plus** the Schedule-level
override. Introducing `AppointmentFinder.params.ts` as new code would duplicate
it and trip the Sonar duplication gate, which has already bitten #10144 once.

*Fix:* promote, don't duplicate — see §4.

**5. There is no shared `$find` caller.** `AppointmentFinder.find.ts` exists
only on the source branch. #10164's `useProposedAppointments` builds its request
inline (`buildFindUrl`, returning a *string* so the effect can key on it). The
month scan needs the same request with a different window and count. Two inline
copies is the duplication gate again.

**6. The package's peer deps arrive with #10144.** `main`'s
`packages/react-scheduling/package.json` lists no `@medplum/react` or
`@medplum/react-hooks`, and `useMonthAvailability` needs `useMedplum` from the
latter. #10144 adds both. **Rebase after it merges; do not add them here.**

---

## 3. Scope

### In

| Module | Why |
| --- | --- |
| `AppointmentFinder.find.ts` | one `$find` caller, shared by the day search and the month scan |
| `useMonthAvailability.ts` | marks the calendar — the piece with no owner |
| `AppointmentFinder.params.ts` | duration, with the Schedule override |
| `AppointmentFinder.assemble.ts` | `applyBookingDetails` only |
| `startOfMonth` in `.times.ts` | trap 2 |

### Out, and why

**`buildCustomAppointment` and `findAppointmentAt`.** Both live in
`assemble.ts` on the source branch, and `git grep` finds exactly one caller
each: `AppointmentCustomTimeCard`, which is piece I, deferred on purpose. They
build an Appointment for a time nobody offered — carrying that into a PR whose
job is to book offered times invites the "who is allowed to overrule the
schedule" argument early. **`assemble.ts` reduces to `applyBookingDetails`**,
about 35 lines.

**`useAppointmentFind` (198 lines) and its paging.** Superseded.
`useProposedAppointments` in #10164 does the day search, keyed on request urls
and unioning across combinations. The source branch's fortnight-at-a-time paging
with a "load more" reach has no consumer in a design where the calendar is the
way you move between days. Do not port it. `getFindWindow` and
`DEFAULT_FIND_PAGE_DAYS` go with it.

**#10127, range selection.** The Figma frame is titled *"Find a Time (Single
Date)"*. `CalendarDateInput` on `main` already does single-date selection. The
split note lists #10127 as gating piece F; against this design it gates nothing.

### Correction to my earlier advice

I said the month could be scanned in **one** `$find` because the operation's
limit is 31 days and a month is at most 31. **That is wrong, and the source
branch is right to chunk.** `packages/server/src/fhir/operations/find.ts:85-87`
computes `diffDays = diffMilliseconds / 86_400_000` and rejects `> 31`. `endOfMonth`
returns the *close* of the last day, so a 31-day month spans 31 days less 1 ms —
and a fall-back DST transition inside that window adds an hour, putting it over.
31-day months containing a fall-back exist (Europe/London, late October). A
single request would 400 there, seasonally, in one timezone and not another:
about the worst failure mode available.

The 1000-result cap is a second, independent reason. A 15-minute alignment
interval over an 8-hour day is 32 offers per day per combination — ~700 a month,
and higher for a service with several eligible schedules. Reachable.

So the 16-day chunk stays. What I would still change is the *comment*, which
currently gives the cap as the reason and mentions the 31-day limit only in
passing; the DST edge is the sharper one and is not written down anywhere.

---

## 4. File by file

### `AppointmentFinder.times.ts` — add `startOfMonth`

Above `endOfMonth`, same doc-comment shape:

```ts
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
```

### `AppointmentFinder.find.ts` — new, ~70 lines

Extracted from #10164's inline helpers so both searches ask identically.

- `buildFindUrl(medplum, service, schedules, start, end, count): string` —
  lifted from `useProposedAppointments.ts:117`, widened from `ActorCombination`
  to a plain `readonly Reference<Schedule>[]` so the month scan can call it.
  **Keep it returning a string** — that is what lets `useProposedAppointments`
  key its effect on the request rather than on an array identity, and the same
  trick is what keeps the month scan from rescanning on every render.
- `runFind(medplum, url, signal): Promise<{ appointments, truncated }>` — the
  fetch plus `truncated`, read off `_count` in the url so the caller does not
  have to pass it twice.
- `DEFAULT_FIND_COUNT = 500`, `MONTH_SCAN_COUNT = 1000`.

Then **`useProposedAppointments` moves onto it** — `buildFindUrl` and its
`request` helper come out of that file. This is a real edit to a PR under
review; see §6 on sequencing.

### `useMonthAvailability.ts` — ported, ~170 lines

From the source branch, with: the local `addDays` deleted, `startOfMonth`
imported from `.times`, `findAppointments` replaced by `buildFindUrl` +
`runFind`, and the chunking comment rewritten around the DST edge.

Keep `checkedThrough`. A truncated scan that silently leaves later days
unmarked is a calendar that lies about a clinic being empty, and the marking is
the only way to move between days.

One thing to settle: the hook takes `service: Reference<HealthcareService>`
while #10164's hooks now take `Reference | WithId`. **Match #10164** — a caller
holding the resolved service should not have to wrap it.

### `AppointmentFinder.params.ts` — promoted, ~45 lines

Not new code. Move `getServiceDurationMinutes` out of
`AppointmentServiceSelect.utils.ts` (landing with #10144) into
`AppointmentFinder.params.ts`, and add the Schedule-level override beside it:

```ts
export function getConfiguredDurationMinutes(
  service: WithId<HealthcareService> | undefined,
  schedule?: Schedule
): number | undefined
```

The precedence — a Schedule's parameters for the service beat the service's own
— is the same order the server applies, and `getScheduleParameters`
(`core/src/scheduling.ts:123`) already encodes the matching. `getServiceDurationMinutes`
stays exported and becomes the service-only half; `AppointmentServiceSelect`
updates its import and nothing else. Delete `AppointmentServiceSelect.utils.ts`
and move its test file with it.

If that touches #10144 too soon after it merges, the alternative is to leave
`AppointmentServiceSelect.utils.ts` alone and have `params.ts` import from it —
but a component-scoped util file feeding the booking flow is backwards, and it
will need moving eventually anyway.

### `AppointmentFinder.assemble.ts` — new, ~35 lines

`applyBookingDetails(appointment, { patient, comment, patientInstruction })`
only. Copies the proposal, adds the patient as a participant if absent, trims
notes to `undefined`, leaves `contained` Slots untouched because the server
validates its own proposal on the way back through `$book`.

Two notes for the PR body, both from the requirements rather than the code:

- `comment` / `patientInstruction` are the "internal notes vs. patient
  instructions" split §4.3 asks for. Worth naming in the description so the
  reviewer sees it is a requirement, not a guess.
- §4.3 also wants **CPT and ICD-10 codes on the appointment**, and there is no
  field for them here. That is a deliberate gap, not an oversight — the RCM
  team has asked for them to become discrete and validated, which is an open
  question in PRD V5, and guessing the shape now is how you build the wrong one.
  `Appointment.reasonCode` is the obvious home if it stays free-form.

### `index.ts`

Export `AppointmentFinder.find`, `AppointmentFinder.params`,
`AppointmentFinder.assemble`, `useMonthAvailability` — matching how #10164
exports its modules whole.

---

## 5. Tests

`test.setup.ts` already indexes the search parameter bundle on `main`.
`useMonthAvailability` calls `$find` through `medplum.get`, which `MockClient`
does not answer, so the fetch is stubbed as `useProposedAppointments.test.tsx`
does — copy that harness rather than inventing a second one.

| File | Covers |
| --- | --- |
| `AppointmentFinder.find.test.ts` | url shape: one `schedule` param per schedule, `service-type-reference`, `_count`; `truncated` exactly at the count |
| `useMonthAvailability.test.tsx` | a month becomes ≥2 requests; a truncated leg sets `checkedThrough` to its last start; abort on criteria change; empty schedules asks nothing; a month wholly before `from` asks nothing |
| `AppointmentFinder.params.test.ts` | service-only; Schedule override wins; unusable unit → `undefined`; no service → `undefined` |
| `AppointmentFinder.assemble.test.ts` | patient added once, not twice; whitespace-only note dropped; `contained` untouched |

Port the source branch's `params` (59 lines) and `assemble` (111) tests, minus
the `buildCustomAppointment` / `findAppointmentAt` cases.

**Watch the coverage gate.** It has bitten #10144 once and
`AppointmentSlotGroupCard` merged with no test file at all — that debt is still
outstanding and a thin PR is where it resurfaces.

---

## 6. Sequencing

1. **Wait for #10144 to clear the queue**, then rebase. It brings the peer deps
   (trap 6) and `AppointmentServiceSelect.utils.ts` (trap 4); both change what
   gets written here.
2. **Land `find.ts` + `useMonthAvailability` against #10164, not `main`.**
   `buildFindUrl` is being extracted *out of* a file under review. Two options:
   - push the extraction into #10164 as one more review commit, and cut this PR
     from `main` afterwards — cleaner history, costs #10164 another round;
   - or cut this branch from `philip/appointment-eligibility` and rebase when it
     merges.

   Prefer the first. #10164 has been through four rounds of shaping already and
   one mechanical extraction with no behaviour change is a cheap addition;
   stacking is what made #10127 stale.
3. `params` + `assemble` are independent of both and can be written now.

**What this unblocks, and what it does not.** After this lands, the shell needs
one more thing that nobody is building: the actor-select field #10164 deferred.
Worth deciding now whether it comes back as its own PR or goes straight into the
shell — the shell is the only caller, and the review appetite for a standalone
multi-row select was visibly low.

---

## 7. To settle before writing the shell

- **The actor field.** Own PR, or inline in the shell? See above.
- **Date & Time in the mock** — read-only display of the current selection, or
  typeable? Typeable is `allowCustomTime`, deferred. Ask Kevin.
- **Class comes out of the mock.** Per Finn's Figma feedback, visit status,
  class and care template are Provider-app concepts. Free-text note and
  diagnosis codes take its place, and those are §4.3 scope rather than
  consumer-supplied extras.
