# Plan and build with Medplum decision guides

Use these instructions to plan a Medplum application or a substantial feature, then carry the decisions into implementation. Keep plans and decisions in the application's repository, using its existing conventions where available.

Keep the work proportional to the change. A single feature may only need an update to one decision record. Routine fixes do not need a new application plan or a full interview.

## 0. Read the project instructions on first use

- Identify the application's repository and the Medplum reference clone. If only the Medplum clone is open and the application location is unclear, ask where to save the application's files before writing them. Adjust the paths below to the actual clone location.
- Read the application's existing project instructions and `medplum-link/packages/docs/static/ai/medplum-rules.md`, or https://www.medplum.com/ai/medplum-rules.md with web access. If the source is inaccessible, say so instead of claiming the rules have been loaded.
- If the project's instructions already reference the Medplum rules, verify the reference instead of adding another copy. Read the rules for this task without changing project instructions. Offer persistent setup after saving the plan, as described in section 3, so the user can review a snippet with the actual file paths.

## 1. Understand the application

- Read the project's instructions, existing code, requirements, and saved decisions before asking questions. Reuse explicit requirements already supplied by the user; flag conflicts instead of silently replacing earlier decisions.
- Establish the users, workflows, scope, and boundaries of the application or feature. For an existing app, identify what is changing.
- Check the application's Medplum package versions and target server version where known. Use compatible reference docs and code; flag version differences before relying on newer APIs or proposing an upgrade.
- Read `medplum-link/packages/docs/docs/decision-guides/index.md` and select the relevant guides. Include shared concerns such as authentication and access control when they affect the work. Focus on the applicable sections rather than interviewing the user about every guide.
- Read the linked technical docs before recommending a Medplum data model or implementation. Docs may use `.md`, `.mdx`, or an `index` file. If the clone is elsewhere, adjust the paths. Without a clone, use https://www.medplum.com/docs/decision-guides and its linked docs. Say when a needed source is unavailable.

## 2. Interview the user

- Use the guide's own questions and section headings. Ask a small batch of consequential questions at a time, explaining the tradeoffs in plain language.
- Do not answer discovery questions from a vague app description. A guide's recommendation is a candidate approach, not evidence that the user has chosen it.
- Give each decision one of three statuses: `confirmed` for an explicit user requirement or agreed choice, `proposed` for a recommendation awaiting a decision, or `open` for an unanswered question. Include the reason and source for the answer.
- Record consequential product and architecture choices, not every implementation detail. Make routine technical choices consistent with confirmed requirements and the Medplum docs without asking for approval of each one. A guide section can contain several decisions with different statuses.
- For each open question, name the work it blocks, or state that it blocks none. If a human is unavailable, leave the question open and continue work that does not depend on the answer.

## 3. Save the plan and decisions

Update existing planning files where they serve this purpose. For a new application, create the files below. For a focused feature, update or create only the relevant decision record unless the change also needs an application-wide plan.

- `docs/application-plan.md`: scope and exclusions, users, workflows, high-level architecture (main resources, UI components, services, and integration boundaries), links to the relevant decision records, open questions, and an implementation sequence with acceptance checks. Keep this short; put detailed answers in the decision records.
- `docs/decisions/<guide>.md`: one record per guide used, for example `docs/decisions/charting.md`. Use the guide's section numbers and titles as headings. Under each applicable section, record the status, answer or question, rationale, implementation implications, and relevant acceptance checks. Identify sections deliberately excluded from scope instead of inventing answers for them. Link shared decisions from other records rather than duplicating them.

At the top of each decision record, include the guide's source path and public URL, the date consulted, and the source revision when available. For a clone linked as `medplum-link`, obtain the revision with `git -C medplum-link rev-parse HEAD` and note any local changes to the guide. For web-only access, record the URL and date; do not invent a version. Preserve this reference until the decisions have been reviewed against a newer guide.

Offer to connect the rules and saved decisions to the instruction file the current tool loads, such as `AGENTS.md`, `CLAUDE.md`, or an existing editor rule file. Show the proposed filename and exact addition, then ask for permission before creating or changing that file. An explicit approval already given for the same change is sufficient. The short Medplum section should require reading the rules and relevant saved decisions before implementation, using working local paths or the public rules URL. Reference only files or directories that exist; do not copy the full plan or guides into the instruction file.

If approved, preserve existing instructions, apply only the agreed changes, and verify that the references can be read. Report the changes and suggest checking them in a fresh session. If the user declines, is unavailable, or the files cannot be edited, leave project instructions unchanged and continue planning. Include the rule and decision paths in the handoff for future tasks; do not claim persistent setup is complete.

Summarize the proposed plan for the user, clearly separating confirmed decisions from proposals and open questions. Do not mark an agent-generated recommendation as confirmed without supporting user input.

## 4. Implement and maintain the decisions

- At the start of each implementation task, read the application plan, the relevant decision records, and their technical references. After context compaction, reload the relevant files.
- Implement against confirmed decisions. If a proposed or open decision affects the task, get the missing answer before implementing the affected behavior; continue independent work where possible.
- Reuse Medplum examples and components where appropriate. Translate the decisions into task-specific acceptance checks, then type-check, test, and review the work against those checks and the technical docs.
- If a feature request conflicts with a saved decision, explain what changes and ask only about requirements that remain unclear. A clear new user instruction can supersede an earlier choice; do not ask for the same approval again. Update the decision record and affected plan alongside the implementation for review.

For an automated coding system, provide these instructions, the relevant guides and technical docs at a pinned revision, and the current application plan and decision records to each planning, implementation, or review job. Return blocking questions to the person responsible for the application; never treat an unanswered question as approval.
