import json
import os
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import app  # noqa: E402


def ctx(**kw):
    base = {"service": "products", "incident": {"id": "i1"}, "signals": {"status": "DOWN"}, "metrics": {}, "logs": [], "events": [], "dependencies": []}
    base.update(kw)
    return base


class RuleTests(unittest.TestCase):
    def setUp(self):
        for k in ("LLM_PROVIDER", "LLM_API_KEY"):
            os.environ.pop(k, None)

    def test_process_down_suggests_restart(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "lastError": "Connection refused - nothing is listening", "containerRunning": False}))
        self.assertEqual(r["analysis"]["category"], "process_down")
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "restart")
        self.assertEqual(r["mode"], "rules")
        self.assertFalse(r["llm"]["used"])
        self.assertIn("suggestion", r["label"].lower())

    def test_oom_detected_from_logs_and_exit_code(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "exitCode": 137}, logs=[{"message": "FATAL heap out of memory"}]))
        self.assertEqual(r["analysis"]["category"], "memory_exhaustion")
        self.assertGreaterEqual(len(r["analysis"]["evidence"]), 2)

    def test_dependency_failure_discourages_restart(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "lastError": "upstream 503"}, dependencies=[{"service": "auth", "status": "DOWN"}]))
        a = r["analysis"]
        self.assertEqual(a["category"], "dependency_failure")
        self.assertEqual(a["suggestions"][0]["action"], "investigate")
        restart = [s for s in a["suggestions"] if s["action"] == "restart"][0]
        self.assertLess(restart["confidence"], 0.4)

    def test_crash_loop_without_deploy_prefers_investigate(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "restartsLastHour": 5}))
        self.assertEqual(r["analysis"]["category"], "crash_loop")
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "investigate")

    def test_recent_deploy_suggests_rollback(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "restartsLastHour": 4}, events=[{"type": "deploy", "message": "image updated to v2"}]))
        self.assertEqual(r["analysis"]["category"], "bad_deploy")
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "rollback")

    def test_latency_shift_is_statistical(self):
        series = [20, 22, 21, 19, 20, 23, 21, 20, 22, 21, 90, 95, 100]
        r = app.diagnose(ctx(signals={"status": "DEGRADED"}, metrics={"latencySeries": series}))
        self.assertEqual(r["analysis"]["category"], "overload")
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "scale")

    def test_steady_latency_does_not_trigger(self):
        self.assertIsNone(app.latency_shift([20] * 5))
        shift = app.latency_shift([20, 21, 19, 20, 22, 21, 20, 19, 21, 20, 21, 22])
        self.assertLess(shift[0], 1.2)

    def test_unknown_is_low_confidence_not_a_guess(self):
        r = app.diagnose(ctx(signals={"status": "DEGRADED"}))
        self.assertEqual(r["analysis"]["category"], "unknown")
        self.assertLessEqual(r["analysis"]["confidence"], 0.3)

    def test_confidence_never_reaches_one(self):
        r = app.diagnose(ctx(signals={"status": "DOWN", "oomKilled": True, "exitCode": 137}, logs=[{"message": "out of memory"}] * 10))
        self.assertLess(r["analysis"]["confidence"], 1.0)

    def test_requires_service(self):
        with self.assertRaises(ValueError):
            app.diagnose({})

    def test_sanitise_redacts_secrets(self):
        out = app.sanitise('Authorization: Bearer abc123 password="hunter2" ok')
        self.assertNotIn("abc123", out)
        self.assertNotIn("hunter2", out)


class FakeLLM(BaseHTTPRequestHandler):
    reply = {"narrative": "The container ran out of memory.", "preferredAction": "restart"}

    def do_POST(self):
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        body = json.dumps({"choices": [{"message": {"content": json.dumps(self.reply)}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class LlmTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = HTTPServer(("127.0.0.1", 0), FakeLLM)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def tearDown(self):
        for k in ("LLM_PROVIDER", "LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL"):
            os.environ.pop(k, None)

    def test_llm_adds_narrative_but_cannot_add_actions(self):
        os.environ.update(LLM_PROVIDER="openai-compatible", LLM_API_KEY="k", LLM_BASE_URL=f"http://127.0.0.1:{self.srv.server_port}/v1", LLM_MODEL="m")
        FakeLLM.reply = {"narrative": "n", "preferredAction": "delete_everything"}
        r = app.diagnose(ctx(signals={"status": "DOWN", "oomKilled": True}))
        self.assertEqual(r["mode"], "rules+llm")
        self.assertEqual({s["action"] for s in r["analysis"]["suggestions"]} - set(app.ALLOWED_ACTIONS), set())
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "restart")

    def test_llm_can_rerank_among_allowed(self):
        os.environ.update(LLM_PROVIDER="openai", LLM_API_KEY="k", LLM_BASE_URL=f"http://127.0.0.1:{self.srv.server_port}/v1")
        FakeLLM.reply = {"narrative": "Raise the limit.", "preferredAction": "investigate"}
        r = app.diagnose(ctx(signals={"status": "DOWN", "oomKilled": True}))
        self.assertEqual(r["analysis"]["suggestions"][0]["action"], "investigate")
        self.assertEqual(r["analysis"]["suggestions"][0]["rank"], 1)

    def test_unreachable_llm_falls_back_to_rules(self):
        os.environ.update(LLM_PROVIDER="openai", LLM_API_KEY="k", LLM_BASE_URL="http://127.0.0.1:9/v1", LLM_TIMEOUT_SECONDS="1")
        r = app.diagnose(ctx(signals={"status": "DOWN", "oomKilled": True}))
        self.assertEqual(r["mode"], "rules")
        self.assertFalse(r["llm"]["used"])
        self.assertTrue(r["llm"]["error"])


if __name__ == "__main__":
    unittest.main()
