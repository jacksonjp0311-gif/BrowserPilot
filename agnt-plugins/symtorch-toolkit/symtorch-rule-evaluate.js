import path from 'path';

function toFileUrl(p) {
  const normalized = p.replace(/\\/g, '/');
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`;
}

function uniq(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function inferPredicateNames(ruleText) {
  // Heuristic: collect tokens like foo( ... )
  const names = [];
  const re = /([a-z][a-z0-9_]*)\s*\(/gi;
  let m;
  while ((m = re.exec(ruleText)) !== null) {
    const name = m[1];
    if (!name) continue;
    // exclude common operators/keywords if they ever appear (keep list small)
    if (name.toLowerCase() === 'not') continue;
    names.push(name);
  }
  return uniq(names);
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

class SymTorchRuleEvaluateTool {
  constructor() {
    this.name = 'symtorch-rule-evaluate';
  }

  async execute(params) {
    const symtorchRoot = params.symtorchRoot || 'C:\\Users\\jacks\\OneDrive\\Desktop\\SymTorch';
    const ruleText = params.ruleText || '';
    const entityId = params.entityId || 'entity-1';
    const threshold = typeof params.threshold === 'number' ? params.threshold : 0.5;
    const createdAtIso = params.createdAtIso;

    try {
      if (!ruleText.trim()) throw new Error('ruleText is required');

      let facts;
      try {
        facts = JSON.parse(params.factsJson || '{}');
      } catch (e) {
        throw new Error(`factsJson must be valid JSON: ${e.message}`);
      }

      const { logic, agent } = await loadSymTorch(symtorchRoot);
      const {
        RuleProgram,
        PredicateRegistry,
        FactPredicate,
        FuzzyRuleEngine
      } = logic;
      const {
        RuleAgent,
        DecisionLedger,
        createDecisionTraceSnapshot
      } = agent;

      const program = new RuleProgram(ruleText);

      const explicit = (params.predicateNames || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      const inferred = inferPredicateNames(ruleText);
      const predicateNames = explicit.length ? uniq(explicit) : inferred;

      if (!predicateNames.length) {
        throw new Error('No predicates found. Provide predicateNames (one per line) or include predicates in ruleText like high_risk(X).');
      }

      const registry = new PredicateRegistry();
      for (const name of predicateNames) registry.register(new FactPredicate(name));

      const engine = new FuzzyRuleEngine(registry);
      const ruleAgent = new RuleAgent(program, engine, threshold);

      // deterministic timestamp support
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
        predicates: { predicateNames },
        success: true,
        error: null
      };
    } catch (error) {
      console.error('[symtorch-rule-evaluate] Error:', error);
      return {
        decision: null,
        traceSnapshot: null,
        predicates: null,
        success: false,
        error: error?.message || String(error)
      };
    }
  }
}

export default new SymTorchRuleEvaluateTool();
