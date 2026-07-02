export const BROWSER_PILOT_DEFAULT_POLICY_BUNDLE = {
  schemaVersion: 'symtorch.policyBundle.v1',
  name: 'BrowserPilot Default Policy',
  version: '2026.06.30',
  rules: 'block(X) :- high_risk(X).\nallow(X) :- not high_risk(X).',
  predicates: [
    {
      kind: 'threshold',
      name: 'high_risk',
      valueKey: 'risk',
      threshold: 0.7,
      slope: 10
    }
  ],
  metadata: {
    scenarioId: 'browserpilot-command-gating',
    source: 'browser-pilot'
  },
  hash: 'fnv1a32:770f22e5'
};
