# Auralis

> See what hearing sounds like.

## What Auralis is

Auralis turns an audiogram into a guided listening comparison. A user chooses an illustrative hearing profile, enters the same 64-second family scene, compares the source reference with a deterministic profile result, and then tries changes such as reducing television sound or moving the important speaker closer.

Auralis is an educational, non-clinical experience. It does not diagnose hearing, reproduce an individual person's perception exactly, fit a hearing aid, prescribe treatment, or predict benefit.

The product is designed for a family member, partner, or friend who wants to understand why an everyday conversation may become difficult. Its core proof is deliberately simple: keep the people, words, timing, and source scene the same, then change only the illustrated listening conditions. The person can hear both perspectives and describe the difference in ordinary language.

- **Original Build Week production:** [auralis-build-week-2026.vercel.app](https://auralis-build-week-2026.vercel.app), sourced from the pre-WebMCP `main` history
- **Pre-WebMCP public baseline:** [`53fa83e188a0c5e076c5a0f651f2d937b167954d`](https://github.com/OnFiala/auralis-build-week-2026/commit/53fa83e188a0c5e076c5a0f651f2d937b167954d); the original runtime implementation was established at [`384ece76a29ab4f3c82e69e1bc1c585044d82c29`](https://github.com/OnFiala/auralis-build-week-2026/commit/384ece76a29ab4f3c82e69e1bc1c585044d82c29)
- **WebMCP implementation checkpoint:** [`2a856f0783a1cef5bb3552720249ae03ae171dc2`](https://github.com/OnFiala/auralis-build-week-2026/commit/2a856f0783a1cef5bb3552720249ae03ae171dc2) on [`feat/webmcp-live-session-v1-6`](https://github.com/OnFiala/auralis-build-week-2026/tree/feat/webmcp-live-session-v1-6)
- **WebMCP Preview:** [immutable candidate deployment](https://auralis-build-week-2026-jnqqycexk-build-week2026.vercel.app), owner-observed as functional on September 2, 2026; production promotion and final judge-access verification remain separate gates
- **OpenAI API key:** optional; the complete deterministic journey works without one

## Two development eras

Auralis has two deliberately separate development eras:

### Original Auralis — OpenAI Build Week 2026

The July 2026 project created the complete human-controlled foundation:

- a seven-step guided browser journey;
- predefined profiles and exact manual bilateral audiogram entry;
- one validated 64-second synthetic family scene built from four synchronized stems;
- deterministic same-source A/B rendering in the browser;
- one-sided and bilateral illustrative support, television on/off, and speaker-position comparisons;
- explicit volume, playback, Stop, safety, privacy, and evidence boundaries;
- one optional sanitized GPT-5.6 Terra explanation that never controls the audio;
- automated validation, public deployment, and the original governance and design history.

That original application is preserved on `main` through `53fa83e`. Its immutable Build Week documents remain historical provenance. Their dates, category, `/feedback` field, and submission rules do not govern the later WebMCP Challenge.

### Auralis WebMCP — WebMCP Challenge

The later work turns the same trusted listening core into a shared human-agent experience. The current competition period began on August 25, 2026. Owner records place WebMCP work no later than August 28; public Git evidence begins with [`8af992e`](https://github.com/OnFiala/auralis-build-week-2026/commit/8af992e8d9454060d07979eae9c6c9a23fc64bb2) on August 29, directly above the preserved `53fa83e` baseline.

The new public feature history adds:

- seven semantic WebMCP tools instead of DOM automation;
- one shared, revisioned session state for page actions and agent actions;
- agent-only activation and a full visual Agent Reveal;
- a deliberately different agent-guided interface while retaining the complete human interface;
- click, typed-agent, and voice-agent control over the same live session;
- bounded active waiting for human decisions without model polling;
- two formal human gates for consent and comfortable physical volume, plus a separate optional grant for agent-started playback;
- deterministic agent playback with a quiet lead-in, immediate human Stop, and reference-A replay;
- everyday-language observations mapped into bounded non-diagnostic evidence;
- a guided listen-observe-adapt loop with television-off and left-ear support as the preferred first changes;
- one deterministic agent summary and versioned visual/media provenance;
- stale-revision, idempotency, request-replay, failure, reset, and rollback protection.

The WebMCP work is additive and traceable. It does not rewrite or pretend to recreate the original Auralis history.

The current competition authority is the [WebMCP Challenge Official Rules](https://webmcp.devpost.com/rules), rechecked September 2, 2026. The exact product, evidence, rollback, and release boundary for the new work lives in [`docs/WEBMCP_PLAN.md`](docs/WEBMCP_PLAN.md).

## The signature WebMCP experience

The central product idea is not merely that an agent can click the existing website. Auralis exposes the meaning of the experience—state, choices, human gates, playback authority, observations, and evidence—through WebMCP. The agent works through those semantic tools while the person remains in control of the live page.

### A human page that transforms only for an agent

The landing page is always human-first. Merely browsing or clicking never enters agent mode. Its `Agentic ready` badge only explains that the site can be used with an agent.

When a compatible agent discovers the Site Tools and starts the guided session, the page performs a prominent full-surface **Agent Reveal**. The light human journey becomes a dark, cinematic agent-guided system with its own information hierarchy, progress spine, controls, and final summary. This is a different presentation of the same `ExperienceState`, not a second product state machine.

### Two entry paths, three control channels

A person can begin in either direction:

1. Ask an agent to find and open Auralis—for example, “Help me understand why my father struggles to hear in a family conversation.” The agent discovers WebMCP and starts the guided session.
2. Open Auralis normally, then ask an agent already connected to the page to summarize it or guide the comparison. The first valid start tool activates Agent Reveal.

After activation, the person can mix three complementary control channels where the host and current phase support them:

- click a visible page control;
- type an instruction or answer to the agent;
- speak to the agent in voice mode.

The page and agent always read and update the same revisioned session. A direct click is therefore a real session event, not an action the agent must imitate through Computer Use.

### One continuing session that waits for the person

The defining orchestration feature is `wait_for_session_change`. After the agent explains a human step, it can keep one read-only WebMCP call pending against the exact session and revision. Consent, scene preparation, volume confirmation, direct playback, and observations use a four-minute human window. The optional profile override uses a deliberate 15-second window.

While the person reads, listens, clicks, types, or speaks, no model polling is required. When the page revision changes, the pending tool returns the new semantic state and the same active agent run can explain and perform the next allowed step. A timeout changes no state and grants no authority. This approximates an event-driven live session over ordinary WebMCP tool calls; it is not a WebSocket and the page cannot revive an agent turn that the host has already ended.

### Human authority inside an agent-first flow

The agent actively explains the profiles, selects or honors the chosen demonstration, prepares comparisons, starts authorized playback, asks what the person heard, translates only that stated meaning into bounded fields, and proposes the next useful change. It never diagnoses hearing or invents an observation.

The person always retains the consequential controls:

- consent cannot be supplied by a WebMCP tool;
- comfortable physical listening level must be confirmed visibly;
- agent-started audio requires a separate visible grant;
- Stop remains directly available during interruptible playback, while reset remains a visible bounded control and may be disabled during a busy state or modal;
- interrupted audio never counts as heard;
- the person can override profile and adaptation choices by click, text, or voice when that channel and choice are currently available.

If the person hears no clear difference, the agent is instructed to explain what to listen for and replay the comparison instead of fabricating a conclusion. After the bounded adaptation loop, the session opens a deterministic, non-clinical summary of what was compared and what the person actually reported.

### Guided agent path

1. **Discover and reveal** — the agent reads the available WebMCP capabilities and starts the session; the human landing transforms into Agent Reveal.
2. **Explain and wait for consent** — the agent states the illustrative limitation, then waits for the person's visible confirmation.
3. **Explain and choose a demo profile** — the agent grounds all three choices in Auralis-provided descriptions, recommends the asymmetric profile for the clearest demo contrast, and gives the person 15 seconds to override it by click, text, or voice.
4. **Load the scene and wait for listening authority** — Auralis loads the fixed scene automatically; the agent explains the screen and waits for comfortable-volume confirmation. If agent-started playback is desired, the person also enables the separate grant; otherwise playback remains available through the page controls.
5. **Run the first A/B comparison** — the agent starts the authorized reference and illustrative sequence without talking over the audio, then asks what the person noticed.
6. **Interpret only the stated observation** — the agent converts ordinary language into the bounded evidence fields or guides and replays when there was no clear difference.
7. **Try one useful change at a time** — television off is the preferred first adaptation, followed by left-ear support; speaker position and bilateral support remain available on explicit request.
8. **Complete with attributable meaning** — after the bounded loop, Auralis presents one deterministic summary of the actual comparisons, observations, limitation, and safe future directions.

## WebMCP implementation details

This feature branch adds the deterministic WebMCP foundation for an agent-guided Auralis session while preserving the complete human journey.

The implemented foundation includes:

- the strict `auralis-webmcp-v1.10` contract with seven narrow semantic tools for state, synthetic-profile staging, one-variable comparison preparation, agent-authorized listening, structured observations, minimized session evidence, and bounded read-only waiting for a shared-session revision;
- twelve explicit phases and two human-authority gates;
- stale-revision and request-replay protection;
- feature-detected browser registration through the application's existing state and validation logic;
- focused domain and browser-adapter tests.

Pure human browsing remains on the human landing page. Agent Reveal can begin only through `stage_demo_session` with `action: start`, which opens the session without a preselected profile. Consent remains human-only. After consent, the agent explains the same three grounded profile descriptions exposed on the page and proposes the asymmetric profile as the clearest left-right demo contrast, never as an inference about the person. A 15-second revision wait lets the person choose another profile by click, text, or voice before the agent commits that default; a near-boundary human choice wins through the existing expected-revision fence. The family scene then loads automatically and presents a visible human confirmation for a comfortable listening level plus a separate, unchecked agent-playback grant. That confirmation atomically prepares the fixed baseline, so the session cannot stall on an invisible agent action. With the separate grant, `play_listening_comparison` may start A, B, or the bounded A-then-B sequence; without it, playback remains click-only. Stop and reset remain visible human controls and a stopped clip never counts as heard.

The final valid observation atomically completes the session and opens one deterministic comparison summary. No separate finish gate or GPT request is required. The summary restates only the person's bounded observations, explains the synthetic purpose and limitation, presents general non-prescriptive correction information, marks hearing-technology education as a future function, and keeps the audiologist locator visibly disabled until a separately governed integration exists.

`allowedNextTools` is the sole current-executability authority. The V1.10 `continuation` projection is the orchestration directive: it identifies whether the current agent run must explain and wait, call a deterministic tool, ask for an observation, or stop, and includes the exact revision-bound wait input when applicable. Required guidance is channel-aware: the host writes it in text mode or speaks it in voice mode before the related wait or deterministic action. The explicit playback-silence directive overrides that guidance through the page-owned quiet lead-in and audio. `continuation` never grants new authority or changes state. The capabilities projection reports `agenticActivationTool` only while initial activation is actually possible and separately reports the current `stageDemoSessionAction` as `start`, `select-profile`, or `null`. Tool descriptions instruct compatible agents to follow `continuation` in the same run and use a matching WebMCP tool before Computer Use. Computer Use remains a fallback for an explicitly approved visible human gate or when no matching WebMCP tool is available; the page cannot globally disable a host's normal browser controls while retaining accessible human controls.

During an active agent session, `wait_for_session_change` may hold one read-only call only while `allowedNextTools` says the session is waiting for human or automatic progress. The canonical bound is four minutes for consent, scene loading, volume, direct-human playback, and observations, and 15 seconds only for the profile recommendation window carried in `continuation.waitInput`. Compatible callers should send that exact input; if a host omits the optional `timeoutMs`, the executor derives the same canonical duration from the current phase. An explicitly mismatched duration fails closed. A same-revision call outside waiting states fails immediately with `INVALID_PHASE`, while a call bound to an older revision can still return the newer state as `changed`. Timeout, abort, reset/session replacement, and completion are explicit outcomes. While required playback evidence is still pending, an explicit agent-playback grant instead makes `play_listening_comparison` the sole progression tool, so the agent cannot substitute a wait timeout for an already-authorized playback. V1.10 retains the V1.9 playback rule: the host calls playback without a spoken or written preface, then the page inserts a quiet eight-second lead-in before audio begins; the call remains pending until the complete sequence ends, fails, or the person presses Stop. During an observation phase the same tool can replay source reference A on an explicit human request without creating a new comparison or observation. Waiting never changes revision, evidence, playback, profile, or human authority. This is a bounded revision wait over the existing in-page controller, not a WebSocket, background service, or second state machine. Owner-observed native text and voice walkthroughs reached completion before the narrow `712606a` playback-ownership wording hardening. The exact `2a856f0` Preview was subsequently owner-observed as functional. A post-hardening benchmark on the owner-selected model remains a separate release-candidate gate.

The active synthetic preset set is `auralis-synthetic-presets-v2`. It moves every approved threshold 10 dB HL lower on the displayed audiogram (numerically +10 dB HL) than the retained v1 fixture basis. The accessible SVG plots and deterministic audio transformation both read the same versioned source values, so the visuals and audible simulation cannot drift independently. Raw thresholds remain browser-memory-only and are not exposed in WebMCP state or evidence.

The family mix uses the versioned `auralis-family-mix-v3` plan. While the television is on, its unchanged stem receives one bounded +8 dB broadband gain in the same A/B source mix before the per-ear profile filters; the complete mix reserves deterministic -1.5 dB headroom, and turning the television off removes that contribution completely. Keeping the gain identical in A and B preserves the same-source comparison while making television masking more audible once the synthetic profile reduces speech detail. The preferred adaptation order is TV off, then left-ear support. Moving the speaker closer and bilateral support remain available only when the person explicitly requests another option. The session remains bounded to two adaptations.

The structural Agent Reveal UI and selected `Resonant Canvas` agent-mode visual layer are versioned in `8711001`, with the V1.4 television-masking and adaptation-order delta in `6b93385`. The public-safe design history is recorded in [`docs/DESIGN_QA.md`](docs/DESIGN_QA.md). The current text/voice evidence and owner-observed Preview result are recorded as owner evidence rather than inferred from automated tests. Dependency remediation, the final model benchmark, production promotion, video, and submission remain separate gates. See [`docs/WEBMCP_PLAN.md`](docs/WEBMCP_PLAN.md) for the canonical current status.

## Original human experience

The pre-WebMCP Build Week baseline provides this complete human-guided journey, which remains available when no compatible agent is present:

1. **Welcome** — introduces the comparison and recommends comfortable stereo headphones.
2. **Profile** — offers three immutable illustrative profiles plus exact manual bilateral entry.
3. **Scene** — loads and verifies the synthetic family scene, presents its transcript, and requires a comfortable-listening-level acknowledgement.
4. **Listening** — compares A, the source reference, with B, the current illustrative result.
5. **Interventions** — compares television on/off and the important speaker at the original position or closer and in front.
6. **Explanation** — keeps the deterministic result primary and optionally requests a grounded GPT-5.6 Terra explanation.
7. **Completion** — summarizes the attributable result, downloads sanitized evidence, or starts another comparison.

The audio comparison, intervention logic, safety checks, completion path, and evidence export are deterministic. GPT does not create, alter, or control the audio.

## Fork and run locally

### Prerequisites

- Node.js **22.x** (the version required by `package.json`)
- npm
- a current browser with Web Audio and Web Crypto support
- stereo headphones for the clearest comparison

No database, account, cloud storage, separate media setup, or OpenAI credential is required for the deterministic experience.

### 1. Clone your fork

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/auralis-build-week-2026.git
cd auralis-build-week-2026
npm ci
```

All predefined profiles, the synthetic scene manifest, four WAV stems, transcript data, and visual assets are already included in the repository.

### 2. Start without an OpenAI API key

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

This is the default evaluator path. The complete deterministic comparison remains available. If the user explicitly asks for the optional explanation, Auralis returns a truthful **Degraded** result and still permits completion.

Use `localhost`, `127.0.0.1`, or HTTPS. Do not substitute an unsecured LAN origin such as `http://192.168.x.x`: the browser must expose Web Crypto so Auralis can verify the approved media digests before decoding audio.

### 3. Optionally enable the live Terra explanation

Create a local `.env.local` file containing your own server-side key:

```text
OPENAI_API_KEY=replace_with_your_own_server_side_key
```

Then restart the development server. Auralis uses the existing server route and fixed `gpt-5.6-terra` configuration. Generating an explanation may create paid OpenAI API usage on your account.

Security requirements:

- never commit the local environment file or key;
- never prefix the key with `NEXT_PUBLIC_`;
- never place the key in browser code, a URL, or the Auralis UI;
- keep the request server-side, as implemented by `src/app/api/model/route.ts` and `src/server/openai.ts`.

OpenAI likewise requires standard API keys to remain secret and to be loaded from a server-side environment variable or key-management service. See [OpenAI API authentication](https://developers.openai.com/api/reference/overview#authentication).

The key is optional. With no key, an invalid response, a timeout, a refusal, malformed output, or failed grounding, Auralis fails closed to Degraded while preserving the deterministic comparison.

For your own hosted fork, configure the same variable as a server-side secret in the hosting platform. Do not add it to the repository or expose it to client-side JavaScript.

### Environment variables

| Variable | Required | Scope | Purpose |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | No | Server runtime only | Enables the explicit Live GPT explanation request. Without it, the deterministic journey uses the supported Degraded outcome. |
| `PLAYWRIGHT_BASE_URL` | No | Test process only | Points Playwright at an already-running deployment; otherwise the config starts the locally built application on `127.0.0.1:3000`. |

No other application-specific environment variable is required to run Auralis.

### 4. Run the production build locally

```bash
npm run build
npm run start -- --hostname 127.0.0.1 --port 3000
```

Check the bounded runtime health endpoint at [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health). The endpoint is deliberately small and uses `Cache-Control: no-store`.

## Runtime contract

| Concern | Canonical implementation | Runtime behavior |
| --- | --- | --- |
| Guided product state | `src/core/experience.ts` | `ExperienceState` is the single product-state authority; guards and invalidation are reducer-driven. |
| Audiogram data | `src/core/profile.ts` | Three immutable versioned predefined fixtures (`auralis-synthetic-presets-v2`) and one manual bilateral draft; browser-memory only. |
| Deterministic processing | `src/core/transformation.ts` | Produces the bounded profile, support, television, and speaker-position plan. |
| Browser audio | `src/browser/audio.ts` | Verifies the manifest and SHA-256 digests, decodes the four stems, renders A/B, supports the bounded eight-second agent sequence, and owns immediate Stop. |
| Scene package | `public/media/family-dinner/` | One approved 64-second synthetic scene with focused speech, overlapping speech, television, and kitchen/room stems. |
| Optional model request | `src/app/api/model/route.ts`, `src/server/model.ts`, `src/server/openai.ts` | One explicit server request per user action, at most three attempts per browser session, no automatic retry. |
| Runtime contracts | `src/contracts/runtime.ts` | Validates the sanitized request, structured response, grounding identities, field bounds, and Live/Degraded classification. |
| Evidence export | `src/browser/evidence.ts` | Exports only the explicit attributable allowlist; no raw provider payload or secret material. |

### State and privacy boundaries

- Product state lives in browser memory and resets through the existing comparison reset action.
- There is no account, database, analytics pipeline, or persistence service.
- Raw audiogram thresholds are not sent to the model. The request contains a bounded, sanitized description of the confirmed deterministic result.
- The optional GPT explanation model receives no tools and cannot alter support, interventions, playback, safety, or completion state. WebMCP agent actions remain constrained by the separate typed browser contract.
- Model responses use structured output, are grounded back to the current result, and are rendered as plain text.
- The provider request uses `store: false`; the application route and browser client use no-store behavior.

## Validation

Install the pinned dependencies and the Chromium binary required by Playwright:

```bash
npm ci
npx playwright install chromium
```

Run the complete repository check:

```bash
npm run check
```

The aggregate command includes the deterministic WebMCP unit and browser-adapter suite plus the automated Chromium WebMCP journey. The narrower `npm run test:webmcp` and `npm run test:webmcp:journey` commands remain available for focused diagnosis.

`npm run check` runs, in order:

1. `npm run typecheck`
2. `npm run check:deps`
3. `npm run test:core`
4. `npm run test:webmcp`
5. `npm run test:model`
6. `npm run build`
7. `npm run test:smoke`
8. `npm run test:journey`
9. `npm run test:webmcp:journey`

The Playwright configuration starts the already-built production application on `127.0.0.1:3000` when `PLAYWRIGHT_BASE_URL` is unset. Run `npm run build` first when invoking a Playwright script individually against that local server.

The model tests use an injected provider and both browser journeys intercept `/api/model`. The checked-in automated suite is designed to make **zero paid OpenAI API requests** and must not require a real key.

To run only the public smoke test against a deployed URL:

```bash
PLAYWRIGHT_BASE_URL=https://auralis-build-week-2026.vercel.app npm run test:smoke
```

## Agent handoff

An automated coding agent should follow this order before making changes:

1. Read the repository-wide [`AGENTS.md`](AGENTS.md).
2. For current WebMCP work, read [`docs/WEBMCP_PLAN.md`](docs/WEBMCP_PLAN.md) and bind claims to the current runtime, tests, branch, and evidence layer.
3. Read the three immutable Build Week documents only when original product intent or historical provenance is relevant; do not apply their competition requirements to the WebMCP Challenge.
4. Preserve those snapshots, protected history, and tags.
5. Verify the current branch, base commit, index, accessible working tree, scope, and rollback before editing.
6. Never read, print, stage, or commit credentials or local environment contents.
7. Use a short-lived branch, make the smallest approved change, and run validation proportional to that change.

For runtime work, the important authority split is simple: `ExperienceState` owns product truth, deterministic browser code owns audio and safety, and GPT is an optional explanatory layer.

## How Codex and GPT-5.6 were used

### Original Auralis / OpenAI Build Week 2026

Codex was the primary engineering environment for Auralis. It accelerated three concrete stages: converting the frozen product intent and Build Week rules into a risk map, vertical slice, system design, and dependency boundaries; implementing the reducer-driven seven-screen journey and deterministic Web Audio pipeline; and running unit, dependency, build, Playwright, accessibility, production, and rollback validation.

The owner retained product authority and made the key decisions: focus on family understanding rather than diagnosis; use same-source deterministic A/B as the core proof; keep GPT limited to a sanitized explanatory layer; support truthful Degraded completion without a shared public key; and approve the final guided flow and visual direction. Every phase, scope change, and publication remained behind an explicit human review gate.

GPT-5.6 Terra is used only in the optional Explanation step. After an explicit user action, the server sends a sanitized description of the current deterministic comparison and asks for four structured fields: scene framing, audible change, what stayed unchanged, and the fixed limitation. Server validation rejects the wrong model, stale or mismatched grounding, forbidden clinical claims, malformed output, refusals, and provider failures.

This division is intentional:

- deterministic code is the reliable product proof;
- GPT adds a warmer family-facing explanation when available;
- Degraded is a supported completion outcome, not failure of the comparison;
- automated journeys intercept the model route rather than spending API credits;
- live Terra quality was separately reviewed by the owner in a controlled local environment.

### WebMCP Challenge extension

Codex was then used as the owner-controlled engineering and review environment for the later WebMCP extension. The work added the public tool contract, shared `ExperienceState` transitions, revision and replay guards, browser registration, bounded session waiting, agent-only reveal, channel-aware guidance, playback custody, agent-mode visual design, generated-asset provenance, focused automated tests, independent reviews, and rollback checkpoints. The owner retained every human gate and separately validated native text, voice, listening, Stop, and Preview behavior.

GPT-5.6 Terra remains only the optional server-side explanation layer in the original human flow. The WebMCP-guided session uses the model in the external compatible host as an agent consuming page-owned semantic tools; Auralis does not send its raw audiograms to that host, give the host control over deterministic DSP, or replace consent, physical-volume acknowledgement, playback grant, and Stop with model decisions.

## Repository map

```text
src/app/                     Next.js UI, metadata, and API routes
src/core/                    Product state, profiles, transformations, projections
src/browser/                 Web Audio, model client, evidence download
src/contracts/               Runtime request and response schemas
src/server/                  Grounding, provider adapter, model tests
public/media/family-dinner/  Approved synthetic manifest and four WAV stems
tests/                       Intercepted smoke and full Live/Degraded journeys
docs/                        Current WebMCP contract plus preserved historical Build Week records
```

## Known boundaries

- Auralis is illustrative and non-clinical; individual perception can differ.
- A digital check cannot guarantee the user's physical headphone level.
- The public deployment intentionally provides no shared OpenAI API key. Its deterministic journey remains complete and usable.
- The supported minimum viewport recorded for the original Build Week release is **390 px**. At 320 px, the original Listening family-scene strip has a known 41 px horizontal overflow accepted for that release; 320 px is not a technical pass.
- Auralis is primarily intended for laptop and desktop use.
- Local media verification requires Web Crypto, so use a trusted localhost origin or HTTPS.
- The automated test browser is Chromium. Wider hardware, browser, assistive-technology, and output-device matrices are bounded owner validation rather than universal certification.
- A formal 20-run live-model reliability batch was not executed. Runtime Live GPT reliability is therefore not claimed as an empirical pass; the deterministic/Degraded path is the reliable boundary.

## Current public state

- **Original production:** `main` remains at the pre-WebMCP public baseline `53fa83e`; [https://auralis-build-week-2026.vercel.app](https://auralis-build-week-2026.vercel.app) remains the canonical production URL until a separately authorized promotion.
- **WebMCP implementation checkpoint:** `2a856f0` contains the current runtime, 27 linear commits above `53fa83e`. Documentation-only commits above that checkpoint do not change the runtime candidate. The WebMCP work has not been merged to `main`.
- **Last verified public refs:** at the pre-publication check on September 2, 2026 at 17:00 UTC, `feat/webmcp-live-session-v1-6` resolved to `2a856f0` and `main` resolved to `53fa83e`. This is dated external evidence, not a self-updating branch-status claim; every later publication or release gate must re-read the live refs.
- **Preview:** the immutable `2a856f0` Preview was owner-observed as functional on September 2, 2026. It is access-protected; final evaluator access or submission credentials must be verified separately.
- **Current source validation:** on September 2, 2026, `npm run typecheck`, all 80 focused WebMCP unit/adapter tests, and `npm run build` passed at `2a856f0` before this docs-only repair.
- **Remaining owner-gated release sequence:** bind and verify the exact public feature ref, freeze an exact release candidate, run the owner-selected model benchmark, close the dependency/security disposition, explicitly merge to `main`, separately promote Vercel production, prepare the public video, and pass the final submission gate.

## Project authority

- **Current WebMCP delivery contract:** [Auralis WebMCP public delivery plan](docs/WEBMCP_PLAN.md)
- **Current external competition authority:** [WebMCP Challenge Official Rules](https://webmcp.devpost.com/rules)
- **Historical immutable Build Week provenance:** [requirements snapshot](docs/OPENAI_BUILD_WEEK_2026_REQUIREMENTS_RECOMMENDATIONS.md), [original product preparation](docs/Auralis_preparation_final.md), and [original rules comparison](docs/AURALIS_VS_OPENAI_BUILD_WEEK_2026_REQUIREMENTS.md)

The three Build Week documents preserve the original intent and competition analysis but do not govern WebMCP Challenge deadlines or submission fields. Current implementation truth is established by checked-in runtime and tests; Git, automated checks, owner observation, Preview identity, and production each remain distinct evidence layers.

## License

The Auralis source code, documentation, and Auralis-owned production assets are
licensed under the [MIT License](LICENSE). Third-party dependencies retain their
respective licenses. Generated-media provenance and AI disclosures are recorded
in [`public/media/family-dinner/manifest.json`](public/media/family-dinner/manifest.json).
No trademark rights in the Auralis name or mark are granted.
