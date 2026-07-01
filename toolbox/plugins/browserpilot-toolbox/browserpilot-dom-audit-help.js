export default async function browserpilotDomAuditHelp() {
  return {
    success: true,
    command: 'AGNT_EXEC: [{"kind":"domAudit","includeResources":true}]',
    safety:
      'Diagnostic only. Does not bypass challenges, extract cookies/tokens, spoof fingerprints, or modify the page.',
    outputSchema: 'browserpilot.domAudit.v1',
  };
}
