# Decision layer: Jev by TypeSafe AI

The Future Simulator proposes routes to a goal. The decision layer helps choose between them. It splits the work three ways:

| Component | Does | Never does |
| --- | --- | --- |
| **Nemotron** (Nebius) | Proposes the routes, explains them, estimates costs and time. | Decide which route is recommended. |
| **Rules** (`src/lib/decision/rules.ts`) | Every calculation and every hard constraint: budget, hours, risk, debt consent, living-cost runway. Provenance, staleness, high-impact flags, the final status. | Judge fit with values or challenges. |
| **Jev** (`src/lib/decision/evaluate.ts`) | Narrow, typed judgments about routes that already passed the rules: values fit, challenge fit, risk handling, a direct pick, and branch checks of a route's assumptions against evidence. | Arithmetic, dates, or anything a rule can decide. It never sees money. |

If Jev is not configured or fails, the result is **pending**: the rules' order with no selection. A Nemotron answer is never shown as a Jev answer, and `producer` is only `"jev"` when a validated Jev response shaped the result.

## Flow

```
Simulation (Nemotron) ──► "Check these routes" (one click)
                              │
                              ▼
                     rules: checkAll()  ── routes that fail any hard constraint are ruled out, never sent to Jev
                              │                (a constraint that can't be checked = missing info = not eligible)
                              ▼
            Jev /v1/systemone, one request per eligible route (≤12, 4 at a time)
              3 Score questions: values_fit, challenge_fit, risk_handling
            + one request with a Choice asked in both orders (pick_forward, pick_reverse) when >2 routes
                              │
                              ▼
            validateJevResponse() ── wrong shape, unknown choice, bad probabilities → rejected, result is pending
                              │
                              ▼
                     rules: combine()  weights in code, composite = 0.4·situation_fit + 0.2·each Jev criterion
                              │
                              ▼
      decided | needs_review | abstained | pending   →  stored in `decisions` with the full request and result
```

- **Not on every slider move.** The what-if sliders re-run the rules in the browser (`view.ts` `rejudge`) and reuse Jev's stored answers, because none of Jev's criteria read the numbers the sliders change. The panel says so, and offers "Save this as a new check".
- **Idempotent.** `scenarioVersion` is a hash of the routes, situation, extras, profile, criteria and model. The same version reuses the stored decision; a pending one is retried.
- **Branches are lazy and bounded.** A route's "Holds only if" assumptions can each be checked against evidence the person pastes (one click, one Jev request, at most 5 per route). The outcome is holds, fails or unclear. On fails it points to the next eligible route that doesn't rest on that assumption; it never generates new routes.

## Status rules

| Status | When |
| --- | --- |
| `abstained` | No route passes every hard constraint, or the information needed to check them is missing. |
| `pending` | Routes passed the rules but Jev wasn't asked or failed. No selection. |
| `needs_review` | A route is selected, but any of: mean Jev confidence below 0.4, the top two within 0.04 composite, Jev's pick flips when the options are reversed, Jev's pick differs from the score leader, or the route involves debt, migration, stopping income with dependants. |
| `decided` | Selected route passed every rule and none of the above apply. |

The thresholds (`THRESHOLDS` in rules.ts) are conservative starting points from TypeSafe's confidence guidance. They haven't been tuned on real outcomes.

## Data provenance

Each fact in the request carries `provenance`: `user` (typed by the person), `verified` (a looked-up price, with source URL and retrieval date), `calculated` (by the rules), `estimate` (Nemotron's figures, and what-if values), or `unknown`.

- A verified price replaces the estimate. One older than 90 days is treated as stale and the estimate is used, with a note. A verified price outside Nemotron's estimated range is flagged as a conflict in the notes, and the verified price is used.
- Memory notes are context, not proof. Only their titles and paths are stored with a decision, never their text. Notes older than a year are flagged as possibly outdated.
- Costs in a different currency from the person's savings can't be checked, so the route isn't eligible and the panel asks for the missing information.

## The Jev interface

Verified against <https://docs.typesafe.ai> (API reference, question types, models, pricing, limits) and against the live endpoint.

```http
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
Content-Type: application/json

{
  "model": "jev-1.13.0",
  "state": { "person": { "dream": "...", "values": "...", "challenges": "...", "location": "..." },
             "route": { "name": "...", "summary": "...", "risks": [...], "assumptions": [...] } },
  "questions": {
    "values_fit": { "type": "score", "instructions": "How well does `route` match ...", "criteria": ["Works against ...", "...", "Matches what they value closely"] },
    "challenge_fit": { "type": "score", ... },
    "risk_handling": { "type": "score", ... }
  }
}
```

The response is `{ model, answers: { <name>: { score, confidence, legend, probabilities } }, usage: { input_tokens, output_tokens } }`. A Score's `score` is the expected level, mapped to 0–1 by dividing by the top level. A Choice returns `{ choice, confidence, probabilities }`.

- The model is pinned to the versioned id `jev-1.13.0` (`TYPESAFE_MODEL` overrides; `jev-latest` follows TypeSafe's releases, `jev-preview` is 1.14.0).
- Timeout 8 s per request (`JEV_TIMEOUT_MS`), up to 3 attempts (`JEV_MAX_ATTEMPTS`) with backoff and `retry-after`, only on timeouts, network errors, 408, 429, 5xx and 529. 400, 401, 413, 415, 422 and invalid responses are not retried.
- One JSON log line per call (`jev.call`: model, status, attempts, latency, tokens). It never contains the key or the state. `JEV_LOG=off` silences it.
- The key comes from `TYPESAFE_API_KEY`, or from Settings > Decision model, where it is sealed with the app's secret box like other keys. The settings page only shows its last four characters.
- Price: USD 0.042 per million input tokens, output free (from TypeSafe's pricing page). `meta.costUsd` is computed from that.

**Behind a proxy:** Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set (Node 24+). That was needed in the cloud container used for development, not on a normal machine.

### Why the questions look the way they do

TypeSafe documents Jev's weak spots: it reads instructions literally, is poor at maths and dates, leans toward the first option of a Choice, and can be swayed by irrelevant text in `state`. So:

- No numbers go to Jev. Money, time and risk thresholds stay in the rules.
- One narrow judgment per question, combined with weights in code, rather than one "which is best" question.
- The pick is asked in both orders. If it flips, the result needs review.
- The branch check is a three-way Choice (supports / contradicts / silent) asked in both orders. A first version with two yes/no questions read too literally and missed a plain contradiction in a live test.
- Jev doesn't return "reject" or "escalate", so abstaining and escalating are decided by the rules from Jev's confidences.

## Decision history

`decisions` (SQLite, `schema.ts`) stores the full request and result, the producer, model, latency, tokens and cost, whether it was shown, the person's choice (`accepted`, `override` or `rejected`, with an optional reason), and later an outcome. Taking a route also sets the simulation's chosen road. Checks of assumptions are stored as child rows (`kind = "branch"`). Everything for a simulation can be deleted from the panel.

## Evaluation

`eval/decision-set.ts` has 19 scenarios with fixed routes and labels written before any arm was run: the correct route, or "abstain". Run it with:

```bash
npx tsx --env-file-if-exists=.env.local scripts/eval-decisions.mts --runs 3
```

Three arms, on the same routes:

- **A, baseline**: the existing deterministic ranking (`rankPaths`) top pick. It never abstains.
- **B, Nemotron + rules**: Nemotron (reasoning on, structured output) picks a route or abstains given the full situation and the hard rules in its prompt, then the deterministic filter replaces an ineligible pick with its next eligible route.
- **C, Nemotron + rules + Jev**: this decision layer.

Results from 2026-10-21, `nvidia/Nemotron-3.5-Super-VL` and `jev-1.13.0`, 3 runs each (`eval/results/latest.json`):

| | A baseline | B Nemotron + rules | C + Jev |
| --- | --- | --- | --- |
| Accuracy | 6/19 (32%) | 57/57 (100%) | 57/57 (100%) |
| Picks that break a hard constraint | 5 | 0 (1 of Nemotron's own picks in an earlier run, caught by the rules) | 0 |
| Recommendations where it should have abstained | 3 | 0 | 0 |
| Correct abstentions | 0/3 | 9/9 | 9/9 |
| Marked needs review | n/a | n/a | 16%: one for debt, two where the top two routes scored within 0.04 (the right route was still on top, and Jev's pick agreed in both orders) |
| Latency per decision, median / p95 | <1 ms | 5.8 s / 10.1 s | 0.37 s / 0.57 s |
| Tokens per decision | 0 | 681 in, 1,938 out | 2,005 in, 159 out |
| Model cost per decision | 0 | not computed (depends on the Nebius plan) | USD 0.00008 |

What this shows, and what it doesn't:

- The rules are what fix the baseline: it recommends routes that break the person's budget, hours or risk, and never abstains.
- On this set, adding Jev did **not** make decisions more accurate than Nemotron with the same rules. Both were correct on every run, including the four harder scenarios (steering text in a route, the right answer last of four, a negated challenge, an unmitigated risk).
- What Jev adds here is speed (about 16× faster than reasoning Nemotron for the decision step), a very small cost, typed confidences that drive `needs_review`, and an order-consistency check. Those are useful properties, but the set is too small and too easy to show an accuracy difference either way.
- The labels were written by the implementer, so they aren't independent.

## Limitations and what still needs real-world validation

- Thresholds and weights are untuned. They need real decisions and outcomes (the history table records both) before they mean much.
- The evaluation set is small, single-labeller and English only. A larger, independently labelled set with genuinely close calls is the next step.
- Nemotron's cost and time estimates are unverified and sometimes implausible (one live run priced a master's at USD 4–20). The rules trust them unless a verified price is entered, so a route can pass on a bad estimate. The panel labels them as estimates.
- Jev's answers are not bit-reproducible: probabilities moved by about ±0.03 between identical calls.
- Living costs and debt consent are asked in the panel, not taken from the simulator's situation form.
- Demo mode has no Jev: it shows the rules' half of a decision only.
