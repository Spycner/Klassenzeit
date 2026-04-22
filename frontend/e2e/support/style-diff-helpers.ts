export type State = "hover" | "focus" | "active";

export type StateSnapshot = Record<string, string>;

export type Finding = {
  route: string;
  signature: string;
  tag: string;
  classes: readonly string[];
  state: State;
  property: string;
  base: string;
  stateValue: string;
};

export function signatureOf(tag: string, classes: readonly string[]): string {
  const unique = Array.from(new Set(classes)).sort();
  return `${tag.toLowerCase()}.${unique.join(".")}`;
}

export function computeDiff(args: {
  route: string;
  signature: string;
  tag: string;
  classes: readonly string[];
  state: State;
  base: StateSnapshot;
  stateSnapshot: StateSnapshot;
  allowlist: readonly string[];
}): Finding[] {
  const { route, signature, tag, classes, state, base, stateSnapshot, allowlist } = args;
  const allowed = new Set(allowlist);
  const findings: Finding[] = [];
  for (const property of Object.keys(base)) {
    if (allowed.has(property)) continue;
    const baseValue = base[property] ?? "";
    const stateValue = stateSnapshot[property] ?? "";
    if (baseValue !== stateValue) {
      findings.push({
        route,
        signature,
        tag,
        classes,
        state,
        property,
        base: baseValue,
        stateValue,
      });
    }
  }
  return findings;
}

export function dedupeFindings(findings: readonly Finding[]): Finding[] {
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const finding of findings) {
    const key = `${finding.signature}::${finding.state}::${finding.property}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(finding);
  }
  return result;
}
