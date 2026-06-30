import path from 'path';

function toFileUrl(p) {
  const normalized = p.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

async function loadSymTorch(symtorchRoot) {
  const logicPath = path.join(symtorchRoot, 'packages', 'logic', 'dist', 'index.js');
  const agentPath = path.join(symtorchRoot, 'packages', 'agent', 'dist', 'index.js');

  const [logic, agent] = await Promise.all([
    import(toFileUrl(logicPath)),
    import(toFileUrl(agentPath))
  ]);

  return { logic, agent };
}

class SymTorchPolicyBundleEvaluateTool {
  constructor() {
    this.name = 'symtorch-policy-bundle-evaluate';
  }

  async execute(params) {
    const symtorchRoot = params.symtorchRoot || 'C:\\Users\\jacks\\OneDrive\\Desktop\\SymTorch';
    const entityId = params.entityId || 'entity-1';
    const threshold = typeof params.threshold === 'number' ? params.threshold : 0.5;
    const runAdmission = typeof params.runAdmission === 'boolean' ? params.runAdmission : true;
    const createdAtIso = params.createdAtIso;

    try {
      let bundle;
      try {
        bundle = JSON.parse(params.policyBundleJson || '{}');
      } catch (e) {
        throw new Error(`policyBundleJson must be valid JSON: ${e.message}`);
      }

      let facts;
      try {
        facts = JSON.parse(params.factsJson || '{}');
      } catch (e) {
        throw new Error(`factsJson must be valid JSON: ${e.message}`);
      }

      const { logic, agent } = await loadSymTorch(symtorchRoot);
      const {
        loadPolicyBundle,
        admitPolicyBundle,
        FuzzyRuleEngine
      } = logic;

      const {
        RuleAgent,
        DecisionLedger,
        createDecisionTraceSnapshot
      } = agent;

      const loaded = loadPolicyBundle(bundle);

      const admission = runAdmission
        ? admitPolicyBundle(bundle, { profile: 'production-default' })
        : null;

      if (admission && admission.ok === false) {
        return {
          decision: null,
          traceSnapshot: null,
          admission,
          bundleMeta: { name: bundle?.name, version: bundle?.version, hash: bundle?.hash },
          success: false,
          error: 'Policy bundle admission failed'
        };
      }

      const engine = loaded.engine ?? new FuzzyRuleEngine(loaded.registry);
      const ruleAgent = new RuleAgent(loaded.program, engine, threshold);
      const createdAt = createdAtIso ? new Date(createdAtIso) : new Date();

      const ledger = new DecisionLedger();
      ruleAgent.memory.observeEntity(entityId, facts);
      const decision = ruleAgent.decideEntityTrace(entityId);
      ledger.append(
        { kind: 'entity', context: ruleAgent.memory.entitySnapshot(entityId), decision },
        createdAt
      );

      const traceSnapshot = createDecisionTraceSnapshot(decision, { ledger, createdAt });

      return {
        decision,
        traceSnapshot,
        admission,
        bundleMeta: { name: bundle?.name, version: bundle?.version, hash: bundle?.hash },
        success: true,
        error: null
      };
    } catch (error) {
      console.error('[symtorch-policy-bundle-evaluate] Error:', error);
      return {
        decision: null,
        traceSnapshot: null,
        admission: null,
        bundleMeta: null,
        success: false,
        error: error?.message || String(error)
      };
    }
  }
}

export default new SymTorchPolicyBundleEvaluateTool();
