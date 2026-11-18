import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from analyze import review
from pilot import RUN, capture, cmd, doc_path, load, publish, save


class PilotTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.addCleanup(os.chdir, Path.cwd())
        os.chdir(temp.name)
        work = Path.cwd()
        env = patch.dict(os.environ, MODE="draft", GITHUB_OUTPUT=str(work / "outputs"), GITHUB_STEP_SUMMARY=str(work / "summary"))
        env.start()
        self.addCleanup(env.stop)
        self.page = "packages/docs/content/docs/example.md"
        self.path = doc_path(self.page)
        self.path.parent.mkdir(parents=True)
        self.path.write_text("---\ntitle: Example\n---\n")
        cmd("git", "init", "-q")
        cmd("git", "add", ".")
        cmd("git", "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "base")
        RUN.mkdir()

    def test_modes_and_review(self):
        plan = dict(outcome="update-docs", summary="Explain the default.", evidence=[self.page + ":2"],
                    pages=[self.page, self.page.replace("example", "other")], questions=[])
        with patch.dict(os.environ, MODE="classify"):
            agent = Mock(return_value=plan)
            review(agent)
            agent.assert_called_once_with("classify")
            self.assertFalse((RUN / "docs.patch").exists())

        def agent(stage, pages=None):
            if stage == "draft":
                self.assertEqual(pages, plan["pages"])
                self.path.write_text(self.path.read_text() + "\nNew behavior.\n")
                return dict(notes="Check rollout.", questions=["Which release?"])
            self.assertEqual(stage, "verify")
            return dict(evidence=[self.page + ":2"], findings=["Check the default."], examplesNeedExecution=True)

        review(agent)
        self.assertIn("+New behavior.", (RUN / "docs.patch").read_text())
        self.assertEqual(len(load("verification.json")["findings"]), 2)
        self.assertTrue(Path(os.environ["GITHUB_OUTPUT"]).read_text().endswith("next=pr\n"))
        save("classification.json", dict(plan, outcome="needs-human", pages=[], questions=["Which default?"]))
        review(Mock(side_effect=AssertionError("Unexpected model call")))
        self.assertTrue(Path(os.environ["GITHUB_OUTPUT"]).read_text().endswith("next=comment\n"))

    def test_write_scope(self):
        (self.path.parent / "link").symlink_to(Path.cwd())
        for name in ["../x.md", "link/x.md", "sdk/x.md", "api/fhir/resources/patient.md"]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                doc_path("packages/docs/content/docs/" + name)
        doc_path("packages/docs/content/docs/api/fhir/resources/_index.md")
        with self.assertRaisesRegex(ValueError, "plan"):
            capture([self.page], True)

    def test_failed_build_and_existing_pr_only_comment(self):
        save("context.json", dict(number=42, base=cmd("git", "rev-parse", "HEAD").strip()))
        (RUN / "review.md").write_text("Review the option.")
        with patch.dict(os.environ, MODE="open-pr", NEXT="pr", BUILD="failure", GITHUB_RUN_ID="1"), \
             patch("pilot.comment") as comment, patch("pilot.api", return_value=[{"html_url": "existing-pr"}]) as api:
            publish(42, "org/repo")
            api.assert_not_called()
            self.assertIn("build failed", comment.call_args.args[2])
            os.environ["BUILD"] = "success"
            publish(42, "org/repo")
            api.assert_called_once_with("repos/org/repo/pulls?state=all&head=org:docs/automated-pr-42")
            self.assertIn("existing-pr", comment.call_args.args[2])
