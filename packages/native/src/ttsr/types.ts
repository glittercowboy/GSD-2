/** Input rule for TTSR regex compilation. */
export interface TtsrRuleInput {
  /** Unique rule name. */
  name: string;
  /** Regex condition patterns (any match triggers the rule). */
  conditions: string[];
}

/** Opaque handle to a compiled TTSR rule set. */
export type TtsrHandle = number;
