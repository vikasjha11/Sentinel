"""Sentinel AI Engine.

POST /diagnose turns incident context (health history, metrics, logs, events, dependencies) into a ranked
root-cause hypothesis list with confidence and evidence, plus ranked recovery suggestions.

Approach
  1. Rule and statistical analysis always runs and is the authority (no network, no API key needed).
  2. If LLM_PROVIDER and LLM_API_KEY are set, an LLM adds a plain-language narrative and may re-rank the rule-based
     suggestions. It can never introduce an action the rules did not allow. Any LLM failure falls back to rules only.

Every response is labelled as a suggestion. Confidence is a heuristic score, not a calibrated probability.
Standard library only.
"""
import json
import os
import re
import statistics
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

LABEL = "AI-generated suggestion. Confidence is a heuristic score, not a guarantee. Verify before acting."
ALLOWED_ACTIONS = ("restart", "scale", "rollback", "investigate")
MAX_LOG_LINES = 60
BEARER_RE = re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]+")
SECRET_RE = re.compile(r"(?i)(authorization|token|secret|password|api[_-]?key)(\"?\s*[:=]\s*\"?)[^\s\",;]+")


def _num(v, default=None):
    try:
        f = float(v)
        return f if f == f else default
    except (TypeError, ValueError):
        return default


def _parse_time(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def latency_shift(series):
    """Compare the newest third of a latency series with its baseline. Returns (ratio, zscore) or None."""
    values = [v for v in (_num(x) for x in series or []) if v is not None]
    if len(values) < 9:
        return None
    cut = max(3, int(len(values) * 0.7))
    base, recent = values[:cut], values[cut:]
    mean_b = statistics.fmean(base)
    std_b = statistics.pstdev(base) or max(mean_b * 0.05, 1.0)
    mean_r = statistics.fmean(recent)
    return (mean_r / mean_b if mean_b else None, (mean_r - mean_b) / std_b)


def _hit(patterns, lines):
    rx = re.compile(patterns, re.I)
    return [ln for ln in lines if rx.search(ln)]


def analyse(ctx):
    signals = ctx.get("signals") or {}
    metrics = ctx.get("metrics") or {}
    logs = [str(l.get("message") or l.get("raw") or "") if isinstance(l, dict) else str(l) for l in ctx.get("logs") or []]
    events = ctx.get("events") or []
    deps = ctx.get("dependencies") or []
    history = ctx.get("healthHistory") or []
    last_error = str(signals.get("lastError") or "")
    restarts_hour = int(_num(signals.get("restartsLastHour"), 0))
    hypotheses = []

    def add(category, cause, confidence, evidence, suggestions):
        hypotheses.append({"category": category, "rootCause": cause, "confidence": round(min(confidence, 0.95), 2),
                           "evidence": evidence, "suggestions": suggestions})

    def sug(action, confidence, rationale, **params):
        return {"action": action, "confidence": round(min(confidence, 0.95), 2), "rationale": rationale, "params": params}

    oom = _hit(r"out of memory|\boom\b|heap out of memory|cannot allocate memory|killed process", logs)
    if oom or signals.get("oomKilled") or signals.get("exitCode") == 137:
        ev = ["Container was OOM-killed (exit code 137)." if signals.get("oomKilled") or signals.get("exitCode") == 137 else None]
        ev = [e for e in ev if e] + [f"Log: {l[:160]}" for l in oom[:3]]
        add("memory_exhaustion", "The service ran out of memory.", 0.55 + 0.12 * len(ev), ev, [
            sug("restart", 0.75, "A restart releases leaked memory and restores service quickly."),
            sug("investigate", 0.6, "Raise the memory limit or find the leak, otherwise this will recur.")])

    failing_deps = [d for d in deps if str(d.get("status", "")).lower() in ("down", "unhealthy", "unreachable")]
    if failing_deps and not oom:
        names = ", ".join(d.get("service", "?") for d in failing_deps)
        ev = [f"Dependency {d.get('service')} is {d.get('status')}." for d in failing_deps]
        if re.search(r"503|upstream|econnrefused|timed out", last_error, re.I):
            ev.append(f"Last error points to a downstream call: {last_error[:140]}")
        add("dependency_failure", f"A dependency of this service is failing ({names}).", 0.5 + 0.1 * len(ev), ev, [
            sug("investigate", 0.8, f"Fix {names} first. Restarting this service will not help while the dependency is down."),
            sug("restart", 0.25, "Only restart this service after the dependency is healthy, if it does not recover on its own.")])

    if restarts_hour >= 3:
        deploys = [e for e in events if re.search(r"deploy|image|rollout|version", str(e.get("type", "")) + " " + str(e.get("message", "")), re.I)]
        ev = [f"{restarts_hour} restarts in the last hour."] + ([f"Recent change: {str(deploys[0].get('message'))[:140]}"] if deploys else [])
        if deploys:
            add("bad_deploy", "A recent deployment is likely crash-looping.", 0.6 + 0.1 * len(ev), ev, [
                sug("rollback", 0.75, "Roll back to the previous revision, then investigate the new release."),
                sug("investigate", 0.5, "Read the crash logs before retrying.")])
        else:
            add("crash_loop", "The service keeps crashing and restarting.", 0.55 + 0.05 * restarts_hour, ev, [
                sug("investigate", 0.8, "Repeated restarts are not fixing this. Inspect the logs and recent configuration changes."),
                sug("restart", 0.2, "Another restart is unlikely to help.")])

    shift = latency_shift(metrics.get("latencySeries") or [_h.get("latencyMs") for _h in history])
    if shift and shift[0] and shift[0] >= 2.0 and shift[1] >= 3.0:
        add("overload", "Response time has degraded sharply compared with its baseline.", 0.45 + min(shift[0], 6) * 0.07, [
            f"Recent latency is {shift[0]:.1f}x the baseline (z-score {shift[1]:.1f})."], [
            sug("scale", 0.7, "Add capacity if the load is genuine.", replicas="+1"),
            sug("restart", 0.4, "Restart if the slowdown is caused by a stuck process.")])

    err = _num(metrics.get("errorRate"), 0)
    if err >= 0.05:
        add("application_errors", "A high share of requests are failing inside the service.", 0.45 + min(err, 0.5), [
            f"{round(err * 100)}% of recent requests returned 5xx."], [
            sug("investigate", 0.65, "Read the error logs to find the failing code path."),
            sug("restart", 0.4, "A restart can clear a bad internal state.")])

    refused = re.search(r"refused|dns lookup failed|not running|exited", last_error, re.I)
    status = str(signals.get("status", "")).upper()
    if (refused or status == "DOWN") and not hypotheses:
        ev = [f"Health check error: {last_error[:160]}"] if last_error else ["The health endpoint does not respond."]
        if signals.get("containerRunning") is False:
            ev.append("The container is not running.")
        add("process_down", "The service process is not running or not reachable.", 0.6 + 0.1 * len(ev), ev, [
            sug("restart", 0.8, "The process is down. A restart is the standard first recovery step.")])

    if not hypotheses:
        add("unknown", "There is not enough evidence to name a cause.", 0.2,
            ["No rule matched the available signals, logs and metrics."], [
            sug("investigate", 0.5, "Collect logs and metrics for this service.")])

    hypotheses.sort(key=lambda h: h["confidence"], reverse=True)
    top = hypotheses[0]
    suggestions = sorted(top["suggestions"], key=lambda s: s["confidence"], reverse=True)
    for rank, s in enumerate(suggestions, 1):
        s["rank"] = rank
    return {
        "rootCause": top["rootCause"], "category": top["category"], "confidence": top["confidence"],
        "evidence": top["evidence"], "suggestions": suggestions,
        "otherHypotheses": [{k: h[k] for k in ("category", "rootCause", "confidence")} for h in hypotheses[1:4]],
    }


def sanitise(text):
    text = BEARER_RE.sub("Bearer [redacted]", text)
    return SECRET_RE.sub(lambda m: f"{m.group(1)}{m.group(2)}[redacted]", text)


def llm_narrative(ctx, result):
    """Ask an OpenAI-compatible or Anthropic endpoint for a narrative. Returns (dict|None, error|None)."""
    provider = os.environ.get("LLM_PROVIDER", "").strip().lower()
    key = os.environ.get("LLM_API_KEY", "").strip()
    if not provider or not key:
        return None, "LLM not configured"
    model = os.environ.get("LLM_MODEL", "")
    logs = [sanitise(str(l.get("message") or l.get("raw") or l))[:300] for l in (ctx.get("logs") or [])[-MAX_LOG_LINES:]]
    prompt = ("You assist an SRE. Given this incident analysis and context, reply with JSON only: "
              '{"narrative": "<=80 words plain-language explanation", "preferredAction": "restart|scale|rollback|investigate"}. '
              "Do not invent facts beyond the evidence.\n" + json.dumps({"analysis": result, "service": ctx.get("service"), "logs": logs}))
    try:
        timeout = float(os.environ.get("LLM_TIMEOUT_SECONDS", "15"))
        if provider == "anthropic":
            url = os.environ.get("LLM_BASE_URL", "https://api.anthropic.com").rstrip("/") + "/v1/messages"
            headers = {"x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json"}
            body = {"model": model, "max_tokens": 400, "messages": [{"role": "user", "content": prompt}]}
        elif provider in ("openai", "openai-compatible"):
            url = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/") + "/chat/completions"
            headers = {"authorization": f"Bearer {key}", "content-type": "application/json"}
            body = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0}
        else:
            return None, f"Unknown LLM_PROVIDER '{provider}'"
        req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
        text = data["content"][0]["text"] if provider == "anthropic" else data["choices"][0]["message"]["content"]
        parsed = json.loads(text[text.index("{"): text.rindex("}") + 1])
        return {"narrative": str(parsed.get("narrative", ""))[:600], "preferredAction": parsed.get("preferredAction")}, None
    except Exception as exc:  # any provider problem must degrade to rules
        return None, f"{type(exc).__name__}: {exc}"[:200]


def diagnose(ctx):
    if not isinstance(ctx, dict) or not ctx.get("service"):
        raise ValueError("'service' is required")
    result = analyse(ctx)
    llm, error = llm_narrative(ctx, result)
    mode = "rules"
    if llm:
        mode = "rules+llm"
        result["narrative"] = llm["narrative"]
        preferred = llm.get("preferredAction")
        allowed = [s for s in result["suggestions"] if s["action"] == preferred]
        if preferred in ALLOWED_ACTIONS and allowed:
            result["suggestions"].sort(key=lambda s: s["action"] != preferred)
            for rank, s in enumerate(result["suggestions"], 1):
                s["rank"] = rank
    return {"service": ctx["service"], "incidentId": (ctx.get("incident") or {}).get("id"),
            "analysedAt": datetime.now(timezone.utc).isoformat(), "mode": mode,
            "llm": {"used": bool(llm), "error": None if llm else error}, "label": LABEL, "analysis": result}


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            return self._send(200, {"service": "ai-engine", "status": "ok",
                                    "llmConfigured": bool(os.environ.get("LLM_PROVIDER") and os.environ.get("LLM_API_KEY"))})
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        if self.path != "/diagnose":
            return self._send(404, {"error": "not_found"})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length > 1_000_000:
                return self._send(413, {"error": "payload too large"})
            self._send(200, diagnose(json.loads(self.rfile.read(length) or b"{}")))
        except (ValueError, json.JSONDecodeError) as exc:
            self._send(400, {"error": str(exc)})

    def log_message(self, *args):
        pass


def main():
    port = int(os.environ.get("PORT", 4002))
    print(json.dumps({"service": "ai-engine", "event": "started", "port": port}), flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
