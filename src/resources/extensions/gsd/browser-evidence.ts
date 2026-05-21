// Project/App: GSD-2
// File Purpose: Shared browser-observable UAT requirement and evidence detection.

export const BROWSER_REQUIREMENT_RE = /\b(?:browser|file:\/\/|localhost|dom|localstorage|click(?:ing|ed)?|button|visible|screenshot|snapshot|reload(?:ed)?|page refresh|user-visible|strikethrough|search box)\b/i;
export const NO_BROWSER_EVIDENCE_RE = /\b(?:no|without|not|wasn'?t|isn'?t)\s+(?:automated\s+)?(?:live\s+)?browser(?:\s+(?:session|test|uat))?|\bno\s+automated\s+browser\b|\bnot\s+conducted\b/i;
export const BROWSER_RUNTIME_RE = /\b(?:browser|playwright|chrome|camoufox|browser_(?:assert|batch|find|verify|snapshot_refs)|screenshot|snapshot|file:\/\/|localhost)\b/i;
export const BROWSER_ACTION_RE = /\b(?:open(?:ed)?|navigate(?:d)?|click(?:ed)?|type(?:d)?|reload(?:ed)?|capture(?:d)?|screenshot|snapshot)\b/i;
export const BROWSER_ASSERTION_RE = /\b(?:assert(?:ed|ion)?|observed|confirmed|verified|expected|visible|text|count|label|strikethrough|localstorage|screenshot|snapshot|passed)\b/i;

export function compactTextParts(parts: Array<string | string[] | null | undefined>): string {
  return parts.flatMap((part) => Array.isArray(part) ? part : [part])
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join("\n");
}

export function hasBrowserRequiredText(text: string): boolean {
  return BROWSER_REQUIREMENT_RE.test(text);
}

export function hasBrowserEvidenceText(text: string): boolean {
  if (!text.trim()) return false;
  return text.split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .some((chunk) => !NO_BROWSER_EVIDENCE_RE.test(chunk) &&
      BROWSER_RUNTIME_RE.test(chunk) &&
      BROWSER_ACTION_RE.test(chunk) &&
      BROWSER_ASSERTION_RE.test(chunk));
}
