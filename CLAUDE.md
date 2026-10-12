# Aurelin project rules

Source of truth: docs/PLAN.md. Fixtures: test-fixtures/graph/graph.fixtures.ts.

R1. Never guess an edge. Unprovable imports go to `unresolved`.
R2. Unsupported language => "not analyzed", never "0 problems" or "all dead".
R3. Deterministic output is never overwritten by AI output.
R4. Every AI-named file/cycle/number must exist in the facts it was shown.
R5. Identity comes from Clerk, never from request body or client args.
R6. No new dependency without one-line justification.
R7. Acceptance is numbers (tests/fixtures), not opinions.

STRICT CHANGE POLICY
- Only touch files the phase prompt names or that the phase clearly requires. List any extra file you touched and why.
- Do NOT modify a test to make it pass. If a test is wrong, stop and report.
- Do NOT commit. Do NOT push. Do NOT run migrations on production Convex.
- Do NOT refactor unrelated code, rename things, reformat files, or upgrade dependencies.
- If you find a correctness/security issue outside scope, STOP and report it as a finding. Do not fix it.

OWNERSHIP GATE
After the report, add a section "Explain it back": 5 plain-English sentences of what changed and why, plus 3 questions the owner should be able to answer about the change. Then STOP.

STANDARD REPORT (end of every phase)
1. Summary
2. Baseline before (commands + results)
3. What changed (files added / modified)
4. Tests: before vs after (numbers; fixtures flipped)
5. Findings, ranked P0/P1/P2/P3, each: workload, observed, expected, cause, confidence, action justified?
6. Production code changed: yes/no
7. Dependencies added (with justification)
8. Commands executed
9. git status + current commit
10. What was intentionally NOT changed
11. Explain it back
Do NOT commit. STOP after the report.
