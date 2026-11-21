'use strict';
// Executor registry. A service declares which platform runs it ("docker" or "kubernetes"); the registry picks
// the matching executor. Every executor implements:  { name, supports(action), execute({service, action, params, dryRun, ...}) }.
function createExecutorRegistry(executors) {
  const byName = new Map(executors.map((e) => [e.name, e]));
  return {
    for(platform) {
      const e = byName.get(platform);
      if (!e) throw Object.assign(new Error(`No executor is configured for platform "${platform}".`), { code: 'NOT_CONFIGURED' });
      return e;
    },
    has: (platform) => byName.has(platform),
    names: () => [...byName.keys()]
  };
}
module.exports = { createExecutorRegistry };
