"""Run independent Claude sessions. Only the drafter has file edit tools."""
import json
import os
import re

from pilot import CONFIG, HERE, RUN, append, capture, checked_path, cmd, doc_path, load, require, save

TEXT = {"type": "string", "minLength": 1, "maxLength": 1600}
LIST = {"type": "array", "items": TEXT, "maxItems": 8}
FIELDS = {
    "classify": dict(outcome={"type": "string", "enum": ["no-docs", "already-covered", "update-docs", "needs-human"]},
                     summary=TEXT, pages={**LIST, "maxItems": CONFIG["maxDraftFiles"]}, evidence=LIST, questions=LIST),
    "draft": dict(notes=TEXT, questions=LIST),
    "verify": dict(findings=LIST, evidence=LIST, examplesNeedExecution={"type": "boolean"}),
}


def ask(stage, pages=()):
    from jsonschema import Draft7Validator

    fields = FIELDS[stage]
    schema = dict(type="object", properties=fields, required=list(fields), additionalProperties=False)
    tools = ["Read", "Glob", "Grep"]
    allowed = tools + [f"Edit(/{doc_path(page).absolute()})" for page in pages]
    if pages:
        tools += ["Edit", "Write"]
    model, effort = CONFIG["models"][stage], CONFIG["effort"]
    prompt = (HERE / "prompts" / f"{stage}.md").read_text()
    response = cmd("claude", "-p", "--output-format", "json", "--json-schema", json.dumps(schema),
                   "--model", model, "--effort", effort, "--max-turns", str(CONFIG["maxTurns"]),
                   "--max-budget-usd", str(CONFIG["budgetUsd"][stage]), "--tools", ",".join(tools),
                   "--allowedTools", ",".join(allowed), "--disallowedTools", "mcp__*", "--permission-mode", "dontAsk",
                   "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence",
                   "--setting-sources", "user", "--settings", str(HERE / "agent-settings.json"), "--", prompt,
                   cwd=".", timeout=20 * 60)
    result = json.loads(response)
    require(result["subtype"] == "success" and result["is_error"] is False, f"{stage} did not complete")
    value = result["structured_output"]
    Draft7Validator(schema).validate(value)
    append("GITHUB_STEP_SUMMARY", f"- {stage}: {model}, {effort} effort")
    return value


def evidence(citations):
    checked = []
    for citation in citations:
        ref = re.sub(r"^(?:\./)?repo/", "", citation)
        if ref.startswith(".docs-run/"):
            continue
        match = re.fullmatch(r"((?:packages|examples|scripts|charts|terraform|\.github)/[^:]+):([1-9][0-9]*)", ref)
        require(match and int(match[2]) <= len(checked_path(match[1]).read_text().splitlines()), f"Invalid evidence: {ref}")
        checked.append(ref)
    return checked


def classify(result):
    outcome = result["outcome"]
    result["evidence"] = evidence(result["evidence"])
    require((outcome == "needs-human") == bool(result["questions"]), "An unresolved decision needs questions")
    require(outcome == "needs-human" or result["evidence"], "A conclusive decision needs evidence")
    if outcome == "already-covered":
        require(any(p.startswith("packages/docs/") for p in result["evidence"]), "Cite the existing docs")
    pages = [re.sub(r"^(?:\./)?repo/", "", p) for p in result["pages"]]
    require((outcome == "update-docs") == bool(pages) and len(pages) == len(set(pages)), "Invalid page plan")
    for page in pages:
        doc_path(page)
    result["pages"] = pages
    save("classification.json", result)
    return result


def review(agent=ask):
    plan = load("classification.json") if (RUN / "classification.json").exists() else classify(agent("classify"))
    questions = list(plan["questions"])
    details = [plan["summary"], *plan["evidence"], *plan["pages"]]
    next_step = "none"
    if os.environ["MODE"] != "classify" and plan["outcome"] == "update-docs":
        draft = agent("draft", plan["pages"])
        save("draft.json", draft)
        details.append(draft["notes"])
        questions.extend(draft["questions"])
        patch = capture(plan["pages"], bool(draft["questions"]))
        if patch:
            (RUN / "docs.patch").write_text(patch)
            check = agent("verify")
            check["evidence"] = evidence(check["evidence"])
            if not check["evidence"]:
                check["findings"].append("Check the draft against the implementation. The verifier cited no source.")
            if check["examplesNeedExecution"]:
                check["findings"].append("Run the new inline examples before merging.")
            save("verification.json", check)
            questions.extend(check["findings"])
            details.extend(check["evidence"])
            next_step = "pr"
    if questions and next_step != "pr":
        next_step = "comment"
    lines = ["**" + ("needs-human" if questions else plan["outcome"]) + "**"]
    if questions:
        lines.extend(["### Open Questions", "\n".join("- " + q for q in questions)])
    report = "\n\n".join([*lines, *dict.fromkeys(details)]).replace("@", "@\u200b").replace("<", "&lt;") + "\n"
    (RUN / "review.md").write_text(report)
    append("GITHUB_STEP_SUMMARY", "\n" + report)
    append("GITHUB_OUTPUT", "next=" + next_step)


if __name__ == "__main__":
    review()
