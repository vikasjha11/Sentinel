'use strict';
// Client for the Python AI Engine. If the engine is unreachable the pipeline continues with a minimal,
// clearly labelled fallback so recovery is never blocked on the AI service.
function createAiClient({ url, fetchImpl = fetch, timeoutMs = 20000 }) {
  const base = url ? String(url).replace(/\/$/, '') : null;
  return {
    async diagnose(context) {
      if (!base) return fallback(context, 'AI engine is not configured.');
      try {
        const res = await fetchImpl(`${base}/diagnose`, { method: 'POST', signal: AbortSignal.timeout(timeoutMs), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(context) });
        if (!res.ok) throw new Error(`AI engine returned HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        return fallback(context, `AI engine unavailable: ${e.message}`);
      }
    }
  };
}

function fallback(context, reason) {
  const down = String(context.signals?.status || '').toUpperCase() === 'DOWN';
  return {
    service: context.service, mode: 'fallback', llm: { used: false, error: reason },
    label: 'Fallback suggestion (AI engine not available). Verify before acting.',
    analysis: {
      rootCause: down ? 'The service is not responding.' : 'Unknown.', category: down ? 'process_down' : 'unknown', confidence: down ? 0.6 : 0.1,
      evidence: [reason], otherHypotheses: [],
      suggestions: down ? [{ rank: 1, action: 'restart', confidence: 0.6, rationale: 'Standard first recovery step when a service is down.', params: {} }] : [{ rank: 1, action: 'investigate', confidence: 0.3, rationale: 'Not enough information.', params: {} }]
    }
  };
}
module.exports = { createAiClient, fallback };
