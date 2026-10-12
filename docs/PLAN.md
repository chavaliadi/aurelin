# Aurelin: Plan, Architecture, Phases

Baseline: repo HEAD 7913893. Measured 2026-10-12 by running the real analyzer on synthetic fixtures (`test-fixtures/graph/graph.fixtures.ts`). Fixtures are synthetic, not real-world repos. Python was the only quick-mode language tested.

## 1. Goal

Make Aurelin's claims **provable**. Every "dead file", "cycle", "god file" and AI sentence should trace back to a parser-proven fact. Then use that graph for the features young devs actually feel: a visible dependency graph, blast radius ("if I change this, what breaks?"), and AI that can only talk about things the parser showed it.

Order of work: **trust the data -> trust the owner -> show the graph -> ground the AI**.

## 2. Target architecture

```
ZIP upload
  -> extract (caps: 150 files / 25MB; record every skipped file + reason)
  -> per-file analysis (Babel deep | tree-sitter/regex quick)
        -> FileResult { metrics, issues, imports: RawImport[] }
  -> resolver (NEW, one module)
        input: files[], tsconfig paths, wrapper-folder prefix
        output: Graph { nodes: FileId[], edges: {from,to,kind}[], unresolved: RawImport[] }
  -> graph analysis (pure functions over Graph)
        cycles (Tarjan) | dead code | god files | blast radius | entry points
  -> AI layer: receives ONLY facts from Graph; output passes grounding check
  -> persist (Convex): scan + compact edge list
  -> UI: summary view, canvas graph, blast-radius panel
```

### Data contracts (write these first, in `lib/analyzer/graph.types.ts`)

```ts
type EdgeKind = 'import' | 'require' | 'dynamic' | 'reexport';
interface RawImport { specifier: string; kind: EdgeKind }
interface GraphEdge { from: string; to: string; kind: EdgeKind }
interface Graph {
  nodes: string[];                 // normalized paths, wrapper folder stripped
  edges: GraphEdge[];
  unresolved: { from: string; specifier: string }[];  // external packages excluded
  unsupportedLanguages: string[];  // languages with no graph support
}
```

`FileResult.imports` changes from `string[]` to `RawImport[]`. Migration lives in Phase 2B only.

## 3. Rules (copied into CLAUDE.md)

- R1. Never guess an edge. If the resolver cannot prove it, the edge goes to `unresolved`, not to `edges`.
- R2. If a language has no graph support, say "not analyzed" for dead code and cycles. Never report "0 problems" or "everything is dead".
- R3. Deterministic output is never overwritten by AI output. AI adds prose, it does not replace `topFixes`.
- R4. Every AI-named file, cycle or number must exist in the facts it was shown (set membership check).
- R5. Identity comes from Clerk, never from request body or client arguments.
- R6. No new dependency without a one-line justification and an entry in the allowlist below.
- R7. Acceptance = numbers (fixtures flipped, tests passing), never "looks right".

## 4. Gap register (measured)

| ID | Gap | Evidence | Severity | Phase |
|---|---|---|---|---|
| G1 | Barrel re-exports (`export * from`) not collected | S1: greet.ts, math.ts falsely dead; C2: real cycle missed | P1 | 2B |
| G2 | `require()`, `import()` not collected | S2: a.js, b.js falsely dead | P1 | 2B |
| G3 | `./x.js` imported from TS not resolved to x.ts | S3: util.ts falsely dead | P1 | 2C |
| G4 | tsconfig `paths` ignored; only `@/` -> root works | S4: y.ts, z.ts falsely dead | P1 | 2C |
| G5 | `@/` breaks with ZIP wrapper folder or `src/` | S5b, S5c: x.tsx falsely dead; C1: real cycle missed | P1 | 2C |
| G6 | Python/quick languages: imports can't be resolved | S6: all 4 files flagged dead | P1 | 2D (suppress), 2E (optional real fix) |
| G7 | Framework/tooling entry files flagged dead | S7: 6 false positives (proxy, middleware, convex/**, next.config, tests, scripts) | P2 | 2D |
| G8 | Adjacency list never returned or persisted | read of aggregate.ts | P2 | 2A |
| G9 | Convex functions trust client `userId`, no `ctx.auth` | read of convex/*.ts, `NEXT_PUBLIC_CONVEX_URL` is public | P0 | 1A |
| G10 | `getScanById` returns insights/issues regardless of share visibility | read of convex/scans.ts | P0 | 1B |
| G11 | `/api/save-scan` is behind Clerk, but trusts body `userId` (default `'guest'`) | read of route | P1 | 1A |
| G12 | Module-level `ConvexHttpClient` in saveScan.ts (unsafe if `setAuth` is added) | read | P1 | 1A |
| G13 | `generateScanId` uses `Math.random` | read | P2 | 1B |
| G14 | AI `topFixes` overwrites deterministic fixes; no grounding check | analyze-zip route ~L418 | P1 | 3 |
| G15 | Files >100KB silently skipped | analyze-zip route | P2 | 5A |
| G16 | Mermaid output only shows cycles + god files + top 10 | aggregate.ts | P3 | 4A |

Note: an earlier claim that `/api/save-scan` has no auth was wrong. Clerk middleware protects it. The real problem is G9/G11: the *identity used* comes from the body.

## 5. Fixture -> phase map (the progress meter)

| Phase | Flips from `it.fails` to `it` |
|---|---|
| 2B | S1, S2, C2 |
| 2C | S3, S4, S5b, S5c, C1 |
| 2D | S6, S7 |
| controls (always `it`) | S0, S5a, C0 |

Start of Phase 2: 10 failing-by-design, 3 passing controls. End: 0 failing-by-design.

## 6. Phases

Each phase: one branch, one PR, one report. Do not start the next until the human gate passes.

### Phase 0: Baseline + harness
- **Does:** install Vitest, add `npm test`, load the fixtures file, write one runner test that feeds each scenario through the real pipeline, wraps gaps in `it.fails`, controls in `it`.
- **Not allowed:** changing any analyzer behavior.
- **Done when:** `npm test` green; 3 controls pass; 10 gap scenarios are `it.fails`; `npm run build` and lint unchanged from before.
- **Needs from you:** confirm Vitest is OK (new dev dependency).

### Phase 1A: Identity (P0)
- **Does:** Clerk JWT template for Convex, `convex/auth.config.ts`, `ctx.auth.getUserIdentity()` in every query/mutation, delete `userId` args, `ConvexProviderWithClerk` in the provider, per-request `ConvexHttpClient` with `setAuth(token)` in server routes, `save-scan` reads user from `auth()`.
- **Not allowed:** schema changes beyond what auth needs; touching analyzer code.
- **Done when:** a test calling every public Convex function without identity is rejected; user A cannot read/delete user B's scan (test); no function accepts `userId` from the client.
- **Needs from you:** Clerk dashboard step (create "convex" JWT template), set `CLERK_JWT_ISSUER_DOMAIN` in Convex env. The agent cannot do this.

### Phase 1B: Share visibility
- **Does:** `getScanById` returns only summary fields to non-owners unless visibility allows more; `generateScanId` uses `crypto.randomUUID()`.
- **Done when:** non-owner fetch of a summary-visibility scan contains no `allIssues`/`architectureInsights`; test proves it.

### Phase 2A: Expose the graph
- **Does:** add `graph.types.ts`, make `aggregateResults` build and return `Graph`, no behavior change to current outputs.
- **Done when:** existing outputs byte-identical on S0/S5a/C0 (snapshot); `Graph.edges` present.

### Phase 2B: Import extraction
- **Does:** collect `require('x')`, `import('x')` (string literal only), `export * from`, `export {..} from`; `imports` becomes `RawImport[]`.
- **Not allowed:** resolving non-literal specifiers (those go to `unresolved`).
- **Flips:** S1, S2, C2. Done when all three are `it` and controls still pass.

### Phase 2C: Resolver
- **Does:** one `resolveImports()` module: wrapper-folder detection, read `tsconfig.json` (`baseUrl`, `paths`; tolerate comments), `.js`->`.ts/.tsx` mapping, index files, extensions.
- **Not allowed:** guessing when two files match (put in `unresolved`); executing tsconfig `extends` chains beyond one level unless tested.
- **Flips:** S3, S4, S5b, S5c, C1.

### Phase 2D: Entry points + honest languages
- **Does:** entry-point rules (tests, scripts, configs, middleware/proxy, `convex/**`, framework files); for languages without graph support, return `unsupportedLanguages` and suppress dead-code/cycle claims in UI and AI prompt.
- **Flips:** S7, S6. S6 passes because Aurelin says "not analyzed" instead of "all dead".

### Phase 2E (optional): Python resolution
- Only if you want Python in the pitch. Separate branch. Needs its own fixtures first.

### Phase 3: Grounded AI
- **Does:** AI prompt receives facts built from `Graph`; output parsed as JSON; grounding check: every file path / cycle in the AI output must be in the facts set, otherwise dropped and counted; deterministic `topFixes` kept, AI text added alongside; a splice test that injects a fake file name into the AI output and proves the checker drops it.
- **Done when:** splice test passes; grounding drop count is logged per scan.

### Phase 4A: Graph on canvas
- Render `Graph` (not Mermaid) on a canvas with pan/zoom, highlight cycles and god files. Cap node count with an explicit "showing N of M" message.
- **Done when:** a 150-file scan renders at usable frame rate on your machine (record number).

### Phase 4B: Blast radius
- Reverse reachability from a selected file; show direct and transitive dependents, count, and the path. Pure function with unit tests.
- **Done when:** tests on fixtures pass; UI shows count + list.

### Phase 5A: Transparency
- List every skipped file with the reason (size, extension, cap) on the scan page.

### Phase 5B: README + evals
- Only after numbers exist: README states measured fixture results and known limits. Resume bullets must quote real numbers.

### Phase 6 (menu, deferred)
Ideas from `aurelin_feature_ideas.md` revisited only after 4B ships and you have measured something.

## 7. Dependency allowlist

Allowed without asking: `vitest`, `@vitest/coverage-v8` (dev). Candidates to justify individually: `jsonc-parser` (tsconfig with comments), a canvas graph lib (only if hand-rolled canvas proves too slow; measure first). Everything else: ask.

## 8. Human gates

1. After Phase 0: you run `npm test` yourself and read the output.
2. After 1A: you do the Clerk dashboard steps and sign in with two accounts to try cross-access.
3. After each 2x: you explain, in your own words, what the phase changed (ownership gate: if you can't, the agent explains again before the next phase).
4. Before any README/resume claim: numbers come from a report, not from memory.

## 9. Honest limits

- Fixtures are synthetic. Run Aurelin on 3 real repos (one yours, two public) before and after Phase 2 and record the dead-code false-positive count by hand.
- I did not modify your repo. Everything here is plan + prompts + fixtures.
- `ConvexClientProvider.tsx` currently has no Clerk integration, so 1A touches the provider.