# Aurelin: Agent Prompts

Run in your local repo, one prompt per branch. Always paste the **CLAUDE.md block** first (once, into CLAUDE.md), then paste one phase prompt at a time.

## Skill map (JS Mastery skills)

You said you have 9. I only know these six: **scope, architect, develop, check, test, debug**. Paste me the other three names and I'll slot them in.

| Step | Skill |
|---|---|
| Before a phase: confirm scope vs PLAN.md | scope |
| Design the module/interface | architect |
| Write the code | develop |
| Write/flip tests | test |
| Something fails | debug |
| After the phase: independent review (use a different model than the one that wrote the code) | check |

Rhythm per phase: scope -> architect -> test (write failing) -> develop -> test (green) -> check -> you explain it back -> merge.

---

## CLAUDE.md block (paste once)

```
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
```

---

## P0: Baseline + test harness

```
PHASE 0: BASELINE AND TEST HARNESS for Aurelin.

Read docs/PLAN.md sections 2-6 and CLAUDE.md first.

OBJECTIVE
Create a measurable baseline. NO analyzer behavior changes.

STEP 1: inspect
git status, current commit, package.json scripts, lib/analyzer/*, app/api/analyze-zip/route.ts.
Run: npm install, npm run lint, npm run build. Record results. If build fails on a clean tree, STOP and report.

STEP 2: harness
- Add vitest as devDependency. Add "test": "vitest run" script.
- Place the provided file at test-fixtures/graph/graph.fixtures.ts (do not edit its contents).
- Write tests/graph.scenarios.test.ts:
  * helper that turns a scenario's files into FileResult[] using the REAL pipeline: parseCode -> computeMetrics for js/ts, analyzeText for other languages, then aggregateResults.
  * honor scenario.config (tsconfig.json) only to the extent the current code reads it (today: none). Do not add resolver features.
  * for kind 'control': plain `it`, asserts expectedUnreferenced and expectedCycles.
  * for kind 'gap': `it.fails` with the same assertions.
  * one extra test per scenario asserting measuredToday equals current output (guards the evidence).

STEP 3: verify
npm test must be green. Report counts: controls passing, gaps failing-by-design, measuredToday matches.
If any measuredToday does not match, STOP and report the difference; do not fix the analyzer.

DO NOT
- change anything under lib/ or app/ or convex/
- add other dependencies
- edit the fixtures file
- add CI, Docker, coverage thresholds

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P1A: Identity (P0 security)

```
PHASE 1A: IDENTITY. Fix G9, G11, G12 from docs/PLAN.md.

PROBLEM
Convex functions in convex/scans.ts, convex/user.ts, convex/analytics.ts take userId from the client. Convex URL is public, so anyone can read or delete another user's scans. /api/save-scan trusts body.userId. lib/db/saveScan.ts uses a module-level ConvexHttpClient.

STEP 0: PRE-FLIGHT (read-only)
List every Convex query/mutation and every caller (grep). Produce a table: function, args, who calls it, how identity is used today. Report it before changing anything. Check Convex + Clerk integration docs for the current setup steps and follow them; do not rely on memory.

STEP 1: tests first
Write tests (convex-test or equivalent already installed; if not, ask before adding) that:
 a) call each public function with no identity => must throw/return unauthorized
 b) user A saves a scan, user B tries get/delete => denied
These must FAIL on current code. Show the failure output.

STEP 2: implement
- convex/auth.config.ts for Clerk.
- Every function derives the user from ctx.auth.getUserIdentity(); remove userId args.
- Client: ConvexProviderWithClerk replacing the plain provider in app/ConvexClientProvider.tsx.
- Server routes: create a NEW ConvexHttpClient per request and setAuth(token from Clerk auth()). Never setAuth on a shared module-level client.
- /api/save-scan: derive user from Clerk auth(); ignore body userId; remove the 'guest' default (anonymous = reject, or a separate explicit guest path if the app truly needs one: STOP and ask).
- user creation: derive name/email from identity, not client args.

STEP 3: verify
All new tests pass. npm test, lint, build pass. Previous phase tests unchanged.

HUMAN STEPS (do NOT attempt; list them at the end of the report)
- create Clerk JWT template named "convex"
- set the issuer domain env var in the Convex dashboard
- manual two-account check

DO NOT
- change schema except what auth strictly requires (justify any change)
- touch lib/analyzer/**
- add new Convex features, pagination, indexes
- run `convex deploy` to production

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P1B: Share visibility + IDs

```
PHASE 1B: SHARE VISIBILITY AND SCAN IDS. Fix G10, G13.

STEP 1: tests first
- Non-owner fetch of a scan with summary visibility must NOT include allIssues, architectureInsights, rootCauseClusters, fileResults, topFixes. Fails today; show output.
- Owner fetch returns full data.
- Scan IDs: generated with crypto.randomUUID (test: format + no Math.random in generateScanId).

STEP 2: implement minimal changes in convex/scans.ts and lib/db/saveScan.ts.
Filter on the SERVER (Convex), not in React.

DO NOT change UI layout, schema, or unrelated queries. Do not rename existing scan IDs in the DB.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P2A: Expose the graph

```
PHASE 2A: EXPOSE THE GRAPH. Fix G8. No behavior change.

- Add lib/analyzer/graph.types.ts exactly as in PLAN.md section 2.
- In aggregate.ts, build a Graph from the CURRENT resolver (same edges it uses today) and return it on the aggregate result. Do not change resolution logic.
- Do not persist it yet.

Verification: snapshot test on S0, S5a, C0 proves every existing output field is byte-identical before/after. Fixtures state unchanged (same controls pass, same gaps fail).

DO NOT improve resolution, add edge kinds, change cycle/dead-code logic, touch Convex or UI.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P2B: Import extraction

```
PHASE 2B: IMPORT EXTRACTION. Fix G1, G2. Target: flip S1, S2, C2.

SCOPE
In lib/analyzer/metrics.ts collect, in addition to ImportDeclaration:
- CallExpression require('literal')
- CallExpression import('literal') (ImportExpression in Babel)
- ExportAllDeclaration with source
- ExportNamedDeclaration with source
Non-literal specifiers (template with expressions, variables): record as unresolved, never as edges.
Change FileResult.imports to RawImport[] and update every consumer (compile errors guide you). Quick-mode languages map to kind 'import'.

TESTS
Add unit tests per construct. Flip it.fails -> it for S1, S2, C2 ONLY. Do not flip others.

DO NOT
- change path resolution (that is 2C)
- touch entry-point rules (2D)
- handle JSX string props, require.resolve, webpack magic comments

Acceptance: S1, S2, C2 pass as plain `it`; S0, S5a, C0 still pass; all other gaps still fail-by-design (if one accidentally passes, report it, do not hide it).

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P2C: Resolver

```
PHASE 2C: RESOLVER. Fix G3, G4, G5. Target: flip S3, S4, S5b, S5c, C1.

PRE-FLIGHT
Show how resolveImportPath / matchFileCandidate work today (file + lines). Propose the module layout (lib/analyzer/resolve.ts) in 10 lines before coding.

SCOPE
- Detect wrapper folder: single top-level directory containing all files => strip prefix for node ids, but resolve tsconfig relative to its location.
- Read tsconfig.json / jsconfig.json (comments and trailing commas allowed). Support baseUrl and paths with a single * wildcard. One level of "extends" only if you add a test for it; otherwise report as unresolved.
- './x.js' => try x.ts, x.tsx, x.js; also .mjs/.cjs equivalents.
- directory => index.* candidates.
- Ambiguity (two candidates match): do NOT pick one; put in unresolved.
- Bare specifiers that match no alias are external packages; not edges, not unresolved noise.
- ZIP parsing must make tsconfig content available to the resolver: touch app/api/analyze-zip/route.ts minimally for that.

TESTS
Unit tests per rule. Flip S3, S4, S5b, S5c, C1 only. S5a must stay plain `it` and pass.

DO NOT
- implement full TypeScript module resolution (node_modules, exports maps, project references)
- add dependencies except jsonc-parser IF you justify it (otherwise strip comments yourself)
- change entry-point or dead-code rules

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P2D: Entry points + honest languages

```
PHASE 2D: ENTRY POINTS AND HONEST LANGUAGES. Fix G6 (suppress), G7. Target: flip S7, S6.

SCOPE
1. Entry points (never reported as dead): *.test.*, *.spec.*, __tests__/**, scripts/**, *.config.*, middleware.*, proxy.*, convex/** (functions are called by name), plus existing names (page, layout, route, index, main, App, app, api). Put the list in ONE constant with comments.
2. Languages without graph support (py, go, java, cpp, rust, c#): do not report dead code or cycles for them. Add `unsupportedLanguages` to the Graph. UI: where dead code/cycles show, display "Not analyzed for <languages>" instead of a number. The AI prompt must not receive dead-code/cycle claims for those files.
3. Mixed projects: JS/TS files are analyzed normally; unsupported files excluded from dead-code candidates.

TESTS
Flip S7 and S6. Add a test that a mixed JS+Python project does not flag the .py files.

DO NOT
- implement Python/Go resolution (that is 2E, separate)
- change cycle algorithm or god-file thresholds
- redesign the scan page; only swap the claim for the "not analyzed" notice

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P3: Grounded AI

```
PHASE 3: GROUNDED AI. Fix G14.

PRE-FLIGHT
Show lib/ai/groq.ts explainProject prompt and the analyze-zip code (~L418) that overwrites topFixes. Describe the intended flow in 10 lines.

SCOPE
1. Build a FACTS object from Graph + metrics: file paths, cycles (as arrays of paths), god files, dead files, numbers. This is the only input the prompt gets about structure.
2. Ask the model for JSON. Parse defensively.
3. Grounding check (pure function, own file): every file path, cycle, or count the AI mentions in structured fields must be in FACTS (set membership). Ungrounded items are dropped; keep a counter and log it.
4. Deterministic topFixes are kept. AI suggestions go in a separate field (aiSuggestions). Never overwrite.
5. SPLICE TEST: take a valid AI output, inject a fake path "src/does/not/exist.ts" and a fake cycle; assert the checker drops them and the count increments. Also test that a valid output passes untouched.
6. Do NOT call Groq in tests; mock the client.

DO NOT
- change the model, temperature, or add a new provider
- validate free-text prose with heuristics beyond what's specified (structured fields only)
- change persistence schema except adding aiSuggestions/groundingDrops if required (justify)

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P4A: Graph on canvas

```
PHASE 4A: DEPENDENCY GRAPH ON CANVAS. Fix G16.

PRE-FLIGHT
Persist Graph.edges compactly (indexes into nodes, not repeated strings). Show the proposed Convex schema change BEFORE implementing; it is the only schema change allowed in this phase. Old scans without edges must still open (show "re-scan to see graph").

SCOPE
- Canvas component: pan, zoom, hover tooltip (path + in/out degree), cycle edges and god files highlighted.
- Layout: simple deterministic layout (e.g., layered by depth or force simulation written by hand). Justify any library; measure before adding one.
- Cap: if nodes > 150, show top N by degree with a visible "Showing N of M files" notice.
- Respect summary vs full visibility (graph only for full).

TESTS
Pure layout/data-transform functions unit-tested. Component smoke test only.

ACCEPTANCE (numbers)
Record: node/edge counts for 3 sample scans, render time, and frame rate while panning at 150 nodes. Report as a table.

DO NOT remove the Mermaid view (keep as fallback), redesign the scan page, or add animations.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P4B: Blast radius

```
PHASE 4B: BLAST RADIUS.

SCOPE
- Pure function blastRadius(graph, file) => { direct: string[]; transitive: string[]; paths: Record<string,string[]> } using reverse edges, cycle-safe, deterministic order.
- Unit tests: S0, S1 (through barrel), C0 (cycle terminates), a file with no dependents, a file not in graph (throws a clear error).
- UI: clicking a node in the canvas shows count + list + highlights dependents. Say "N files depend on this (directly or indirectly)".
- Must respect unsupportedLanguages: for those files show "not analyzed".

DO NOT claim "will break". Use "depends on". Don't add AI to this feature.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P5A: Transparency

```
PHASE 5A: SKIPPED FILES TRANSPARENCY. Fix G15.

- In analyze-zip, record every file not analyzed with a reason: too_large (>100KB), unsupported_extension, over_file_cap, binary, parse_error.
- Persist as a compact list (counts by reason + up to 50 paths). Show on the scan page: "Analyzed X of Y files. Skipped: ..."
- AI prompt includes the numbers (analyzed X of Y) so it cannot overclaim.

DO NOT change the 100KB / 150 / 25MB limits.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```

## P5B: README + evals (only after numbers exist)

```
PHASE 5B: README AND EVAL SUMMARY.

Using ONLY numbers from the reports of previous phases (paste them into docs/EVAL.md with the commit they came from):
- fixture table: scenario, before, after
- grounding drop counts
- canvas performance table
- known limits (languages, resolver limits, caps)

Update README: what Aurelin proves vs. what it estimates; how to run npm test; limits section.
Do NOT write any claim without a number or a test behind it. Do NOT add badges, screenshots, or marketing language.

Use the STANDARD REPORT. Do NOT commit. STOP after the report.
```
