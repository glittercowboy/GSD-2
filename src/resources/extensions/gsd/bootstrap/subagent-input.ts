export function extractSubagentAgentClasses(input: unknown): string[] {
  if (!input || typeof input !== "object") return [];

  const agentClasses: string[] = [];
  const visited = new WeakSet<object>();
  const addAgentClass = (value: unknown): void => {
    if (typeof value !== "string") return;
    const normalized = value.trim().replace(/\.md$/i, "");
    if (normalized.length > 0) agentClasses.push(normalized);
  };

  const visitItems = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    for (const item of value) {
      visit(item);
    }
  };

  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);
    const record = value as Record<string, unknown>;
    addAgentClass(record.agent);
    visitItems(record.tasks);
    visitItems(record.chain);
    visitItems(record.parallel);
  };

  visit(input);
  return agentClasses;
}
