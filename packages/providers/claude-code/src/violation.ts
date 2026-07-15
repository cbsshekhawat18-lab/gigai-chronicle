/**
 * DELIBERATE ARCHITECTURE VIOLATION — do not merge.
 * M1 DoD #2 proof: a provider importing the Chronicle Store directly must be
 * rejected by CI (pipeline rule, ARCHITECTURE.md §3 / design law 4).
 */
import "@gigaichronicle/core/store";
