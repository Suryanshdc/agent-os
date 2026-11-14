export interface DagNode {
  id: string;
  agent: string;
  deps: string[];
  buildInput: (prompt: string, results: Record<string, string>) => string;
}

/** Group nodes into layers; nodes in a layer have no unmet deps and run in parallel. */
export function layers(nodes: DagNode[]): DagNode[][] {
  const done = new Set<string>();
  const remaining = [...nodes];
  const out: DagNode[][] = [];
  while (remaining.length) {
    const ready = remaining.filter((n) => n.deps.every((d) => done.has(d)));
    if (!ready.length) throw new Error("cycle or missing dependency in DAG");
    out.push(ready);
    for (const n of ready) {
      done.add(n.id);
      remaining.splice(remaining.indexOf(n), 1);
    }
  }
  return out;
}

// Phase 1 workflow: retrieval -> research. Phase 2 moves this to LangGraph.js.
export const DEFAULT_WORKFLOW: DagNode[] = [
  { id: "retrieve", agent: "retrieval", deps: [], buildInput: (p) => p },
  {
    id: "research",
    agent: "research",
    deps: ["retrieve"],
    buildInput: (p, r) => `Question: ${p}\n\nContext:\n${r["retrieve"] ?? ""}`,
  },
];
