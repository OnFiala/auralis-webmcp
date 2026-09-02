# Auralis WebMCP public delivery plan

## Purpose

Auralis turns a synthetic hearing profile into a guided, same-source listening comparison for family understanding. The WebMCP extension adds an agent-guided path while preserving the complete human journey.

This document is the public product and delivery contract for that extension. It records behavior, architecture, human authority, validation, rollback, and release evidence. It intentionally excludes machine-specific diagnostics, private execution transcripts, credentials, and temporary build artifacts.

## Product contract

The V1 experience has one prepared family scene, three predefined synthetic profiles, two synchronized listening perspectives, and a bounded adaptive loop. It is illustrative and non-diagnostic. It does not require or accept a personal audiogram. The active preset set is `auralis-synthetic-presets-v2`: each retained v1 fixture is shifted numerically by +10 dB HL, which draws the same curve 10 dB lower and drives the deterministic audio transformation from that exact versioned source.

The golden path is:

1. A person opens the normal human landing page.
2. The page clearly states that it is agent-ready, but the badge is explanatory and cannot activate agent mode.
3. A compatible agent discovers the WebMCP tools.
4. The first successful `stage_demo_session` call activates the full-surface Agent Reveal.
5. The person explicitly confirms the illustrative purpose and limitation.
6. Auralis then exposes the same three unselected demo audiograms to the page and the agent. The agent explains only their grounded `availableProfiles` descriptions, proposes `asymmetric-hearing-loss` as the clearest left-right demo contrast, and opens one 15-second revision wait. The person may override by click, text, or voice; if no revision changes, the agent commits the proposed profile. This is a demo choice, never an inference about the person's hearing.
7. The validated family scene loads automatically after profile selection. Nothing plays.
8. The loaded scene presents a visible human consent dialog for a comfortable headphone level. A separate, unchecked control may grant agent-started playback for this browser session.
9. The volume confirmation atomically prepares the fixed baseline. Without the separate grant, playback remains click-only; with it, the agent may start only the bounded typed playback commands. Stop, reset, consent, and physical-volume acknowledgement remain visible human authority.
10. Auralis asks for observations in everyday language. The agent maps only the person's stated meaning to bounded fields; "no clear difference" triggers focused guidance and replay rather than fabricated evidence.
11. The agent or person selects one exposed adaptation at a time, then may repeat the listen-observe loop.
12. The last valid observation atomically completes the experience and immediately opens one attributable, minimized, non-clinical summary. No separate finish action or GPT request is required.

Pure human browsing never activates Agent Reveal. WebMCP absence or failure never removes the normal human interface.

## Entry modes and control channels

The same tool contract supports two entry modes:

- A person asks an agent to find Auralis and explain why a family member may struggle to hear in a shared scene.
- A person opens Auralis directly and asks an agent to summarize or guide the page.

The person can then control the session through:

- direct page interaction;
- typed direction to the agent;
- voice direction to the agent.

These are human-authority channels, not separate product states. The page shows the current state and available next action while the agent explains the choices.

## WebMCP tool catalog

| Tool | Role | Side effect | Human boundary |
|---|---|---|---|
| `get_auralis_state` | Read the current semantic state, revision, available profiles, next tools, and active human gate. | None. | Cannot activate Agent Reveal. |
| `stage_demo_session` | With `action: start`, activate an empty family-understanding session. After consent, with `action: select-profile`, choose exactly one approved synthetic profile. | Yes. Sole Agent Reveal activation edge and agent profile-selection command. | Start never preselects a profile. Consent remains human-only. Profile selection may be performed once by either the agent or the visible page control. |
| `prepare_comparison` | Prepare the baseline or one adaptive comparison. | Yes. | Cannot load audio, start playback, or acknowledge listening. |
| `play_listening_comparison` | After an explicit visible grant, reserve and run A, B, or the bounded eight-second A-then-B sequence for the current comparison. Agent-started playback begins after a page-owned eight-second quiet lead-in, and the tool call remains pending until the complete sequence ends, fails, or the person presses Stop. In an observation phase it can replay source reference A on explicit request. At most three agent runs may be reserved per comparison. | Yes. | Cannot grant itself authority, bypass Stop/reset, alter DSP, count a stopped clip as heard, create an observation, or return control for new narration during the quiet lead-in or active audio. |
| `record_user_observation` | Record the person's structured observation and choose the next bounded action. | Yes. | Requires the relevant human playback evidence first. |
| `get_session_evidence` | Read minimized, attributable session evidence. | None. | Does not finish, export, or reset the session. |
| `wait_for_session_change` | Wait read-only for the bound session revision to advance, reset/replace, or complete. The default bound is four minutes; 15 seconds is accepted only as the explicit profile override window. | None. | Cannot create a session, select a profile, cross a human gate, mutate evidence, start playback, or replace an already-authorized action tool; a fresh call while wait is absent from `allowedNextTools` fails with `INVALID_PHASE`. |

`allowedNextTools` is the sole authority for what can execute in the current phase. `capabilities.agenticActivationTool` is non-null only while the initial Agent Reveal activation is available. `capabilities.stageDemoSessionAction` independently disambiguates the shared tool as `start`, `select-profile`, or `null`; therefore a post-consent profile-selection state cannot falsely present a current profile-selection action as an activation capability.

Every result now includes a strict derived `continuation` object. `allowedNextTools` remains the sole current-executability authority; `continuation` tells the active agent whether it must explain and wait, call one allowed tool, ask for an observation, or stop. When `doNotEndTurn` is true, the host is instructed to perform that narration and tool call before returning a final answer. Exact `sessionId`, `afterRevision`, and allowed duration are supplied for waits. This projection is not stored, creates no state, and grants no authority.

Every registered tool also states the same control preference: follow `continuation`, and when a matching entry exists in `allowedNextTools`, use that WebMCP operation before Computer Use. Computer Use is fallback-only for an explicitly approved visible human gate or when no matching WebMCP tool is available. This is a machine-readable behavioral contract, not a page-level prohibition: Auralis preserves normal accessible human controls and cannot disable a host agent's general browser capability. `wait_for_session_change` appears only while the page expects human or automatic progress. While required playback evidence is pending, an explicit agent-playback grant exposes `play_listening_comparison` and suppresses wait; without the grant, agent playback is absent and wait covers direct human playback. Observation and shared-choice phases retain wait because either the person or the agent may legitimately commit the next revision. Timeout is not a state change and is not permission to switch to Computer Use.

Inputs are narrow and validated. Mutations use request IDs and expected revisions. Stale revisions, reused requests with different payloads, invalid phases, invalid comparisons, and missing human actions fail explicitly.

The implementation follows the official [OpenAI WebMCP guidance](https://learn.chatgpt.com/docs/webmcp): feature-detect browser support, reuse existing application logic and validation, describe side effects, return verifiable results, and preserve the normal interface for people and unsupported browsers. Page clicks update the shared semantic state and revision immediately. WebMCP does not expose a general page-to-agent event subscription API, so Auralis combines one bounded page wait over the existing controller subscription with explicit continuation instructions. This can keep an already-active host run waiting without model polling, but the page still cannot restart a host turn that the model already ended or mute host narration. V1.9 therefore requires a no-preface playback call and adds a deterministic page-owned eight-second quiet lead-in before agent-started audio. An owner-observed local native run on `157ba50` proved continuous voice-guided behavior through two adaptations under V1.8; V1.9 quiet-lead-in timing, reference replay, and exact-candidate Preview behavior remain native-host acceptance claims rather than consequences inferred from browser mocks.

## State machine and human gates

The V1 semantic phases are:

1. `awaiting_session_stage`
2. `awaiting_consent`
3. `awaiting_profile_selection`
4. `awaiting_scene_load`
5. `awaiting_volume_acknowledgement`
6. `ready_for_baseline`
7. `awaiting_baseline_listening`
8. `awaiting_baseline_observation`
9. `ready_for_adaptation`
10. `awaiting_comparison_listening`
11. `awaiting_comparison_observation`
12. `complete`

The two human gates are:

- confirm consent;
- acknowledge a comfortable physical listening level after automatic scene preparation;

No WebMCP tool may cross these gates. Selecting one of the three synthetic demo profiles is intentionally a shared action rather than a human gate: either the agent tool or the person's click may commit it once after consent. Scene preparation is an automatic technical transition with a failure-only Retry, not a normal user decision. Listening is a shared action only after the person explicitly grants agent playback; direct visible playback always remains available. Stop remains available to the person independently of the agent, and only natural clip completion produces heard evidence. The final observation and system-attributed `session_finished` event share one revision, so evidence is terminal without a second human or agent mutation.

## Architecture

`ExperienceState` is the single semantic source of truth. Human UI actions and WebMCP mutations enter one commit gateway. The browser adapter registers tools and delegates to typed domain operations; it does not automate DOM selectors or synthetic clicks. `wait_for_session_change` is a thin asynchronous port over `ExperienceController.subscribe`; `continuation` is derived from the same snapshot. Neither creates a second state machine, scheduler, event log, persistence layer, or revision. The 15-second profile window is a read-only pre-commit wait; the existing profile mutation remains the only selection edge, and its expected-revision fence makes a near-boundary human choice win.

The relevant layers are:

- `src/contracts/webmcp.ts`: public tool, state, input, output, error, evidence, and human-gate types;
- `src/core/experience.ts`: the existing experience reducer and shared controller;
- `src/core/webmcp.ts`: deterministic WebMCP transitions and projections;
- `src/core/source.ts`: the canonical validated family-scene identity shared without coupling WebMCP to browser audio;
- `src/browser/webmcp.ts`: feature-detected browser registration and schema conversion;
- `src/browser/audio.ts`: verified playback runtime and bounded clip window;
- `src/app/page.tsx`: React subscription and browser binding;
- focused core and browser adapter tests.

No new service, database, durable session store, route, or product dependency is required for V1. Session state remains anonymous and ephemeral in the browser.

## Baseline and new work

The preserved baseline Auralis already provides:

- the complete human listening journey;
- deterministic same-source A/B playback;
- a prepared synthetic family scene and audio stems;
- browser audio safety and stop behavior;
- an optional sanitized explanatory model layer;
- public build, smoke, journey, and rollback checks.

The WebMCP extension adds:

- typed semantic tools and errors;
- revision and request replay safety;
- predefined synthetic-profile staging;
- one-variable adaptive comparisons;
- minimized attributable evidence;
- browser tool registration;
- an explicit playback grant, idempotent playback-run custody, and guided A/B playback;
- shared page/agent adaptation options and everyday-language observation guidance;
- the structural Agent Reveal UI and agent-guided information architecture;
- a single deterministic terminal summary focused on recorded observations, the purpose and limitation of the illustration, general correction information, and clearly marked future hearing-technology and audiologist functions.
- one session/revision-bound read-only wait primitive for human and automatic page progress, with bounded timeout, abort cleanup, and no semantic side effect.

## Delivery phases

| Phase | Public result | Status |
|---|---|---|
| BUILD-1 | Deterministic domain contract, state transitions, errors, evidence, and focused tests. | Implemented; clean-clone contract tests passed. |
| BUILD-2 | Feature-detected browser registration, shared commit gateway, and adapter tests. | Implemented; clean-clone adapter and registration tests passed. |
| BUILD-3A | Structural Agent Reveal, visible human gates, current state, and next action. | Implemented at `6b18563373ef1279bc1639525e952b86b0dc18d2`; clean Linux build, mocked WebMCP host journey, reduced-motion, Stop, reset, smoke, and existing human journeys passed. Local native typed/click proof passed on `b84d4c3`; current voice and exact public Preview proof remain VERIFY work. |
| VERIFY-1 | Automated real-browser WebMCP journey, human fallback, negative gates, accessibility, and failure paths. | Implemented and independently reviewed at `c08ddf3fa53ebe77d814fbe19f4a4025ea93daa9`; aggregate validation passed with six Chromium WebMCP journeys and zero model-route calls. |
| VERIFY-0 | Native site-tool discovery and the intended typed and voice agent control in the supported desktop host. | Local commit `b84d4c3` passed an owner-observed native typed/click live session through consent, the 15-second profile default, scene loading, volume and playback authority, natural A/B completion, one television-off adaptation, and terminal summary at revision 20 with two completed playback runs. Current voice steering and the exact published Preview remain pending; the older V1 voice/Stop evidence does not replace those current-candidate checks. |
| DESIGN-1 | Three visual directions generated from verified final-state screenshots. | Complete. Three grounded ImageGen directions were produced from the canonical family scene and the existing human/agent references; direction 2, `Resonant Canvas`, is the selected DESIGN-LOCK. |
| VISUAL-UPDATE | One selected complete visual system for human and agent-guided modes. | Agent-mode `Resonant Canvas`, onboarding, compact audiograms, automatic scene/baseline preparation, explicit agent-playback custody, repeated listen-observe-adapt loops, and the responsive listening surfaces are versioned in `8711001`. The V1.4 broadband mix and four-option adaptation order are isolated in `6b93385`; the automatic terminal summary uses the same dark agent surface without importing the human report layout. Current voice, exact public Preview verification, and the later human-mode visual update remain separate gates. |
| LIVE-SESSION V1.6 | Bounded event-driven continuation over the existing page session. | `c493d36` adds `wait_for_session_change`; `1e5cd9b` reserves it for passive phases; `87a93cc` extends ordinary waits to 60 seconds. The local native run on `b84d4c3` stayed active across every passive gate and completed both bounded comparisons. |
| SESSION-PROTOCOL V1.7 | Machine-readable same-run continuation plus a bounded demo-profile recommendation window. | `2af80ff` adds strict `continuation` guidance and the 15-second profile window; `b84d4c3` derives an omitted optional timeout from the current phase for native-host compatibility. The local native typed/click session completed successfully; current voice and exact public Preview verification remain pending. |
| SESSION-PROTOCOL V1.8 | Longer human waits, a tool-held silent playback interval, and the preferred TV-off then left-ear-support path. | Local implementation is based on rollback SHA `8bd45931`. Typecheck, core contract tests, browser contract tests, production build, and the focused WebMCP Playwright journey pass locally; native voice and physical-listening QA remain the owner acceptance gate. |
| SESSION-PROTOCOL V1.9 | Page-owned quiet lead-in before agent-started audio plus explicit reference-A replay. | Implemented in rollback commit `a514a4e`. Typecheck, 80 WebMCP tests, production build, the nine-scenario browser journey, and independent review pass. Native host voice-overlap QA remains the owner acceptance gate. |
| TERMINAL-SUMMARY REFINEMENT | A concise three-part completion surface: observations, purpose, and future directions. | Local presentation candidate only. It preserves evidence v4 and all session semantics; local visual QA and owner approval of the generated static educational asset passed. Exact public Preview browser acceptance remains a separate post-push release gate. |
| RELEASE | Public history, public deployment, demo evidence, and submission package. | Not started. |

BUILD-3A begins only after BUILD-1 and BUILD-2 are reconstructed, reviewed, tested, and published on the canonical public development branch.

## Visual and interaction direction

The landing page remains human-first. Agentic readiness is visible but non-activating.

The first successful staging mutation creates a deliberate full-surface transition into the agent-guided system. The transition should feel like a new interface flowing into place while preserving orientation, human controls, and reduced-motion accessibility.

Implementation uses CSS motion tokens and progressive enhancement. The same-document View Transition API may be used behind feature detection, with a stable CSS fallback and `prefers-reduced-motion` support. Audio controls, audiogram-like profile data, and session state remain accessible HTML/CSS UI rather than rasterized controls.

Image generation is used only after the structural and functional states are verified. Generated images provide art direction and approved scene assets; they do not replace accessible controls, state, text, or evidence.

The selected agent direction is `Resonant Canvas`: the family scene becomes the full agent-session surface, frozen macro progress moves to a vertical spine, canonical conditions remain visible, and human-gated playback stays in the foreground. The acoustic-focus derivative appears only during the two canonical listening phases and is recorded in the existing generated-media manifest. This visual projection does not create a second semantic state.

## V1.4 pre-release audio and adaptation migration

This branch evolves the still-unreleased v1.3 candidate atomically. The migration verdict is **CONDITIONAL (pre-release, atomically migrated)**: request schemas and persisted evidence shape remain compatible, but opaque result identities, adaptation ordering, and the number of returned adaptation options change. All known producers and consumers are inside this repository and must move together.

| Surface | V1.3 candidate | V1.4 migration | Compatibility and mitigation |
|---|---|---|---|
| Request fields and enums | `support_mode` already accepted `none`, `left-one-sided`, and `bilateral`. | No request-field or enum change. | Compile/schema compatible; strict request and one-variable tests remain authoritative. |
| Adaptation response ordering | TV off, speaker closer, and bilateral support were available but bilateral appeared first. | Ordered TV off, speaker closer, left-ear support, bilateral support. | Behavior-changing; agent/direct parity and browser order assertions migrate atomically. |
| Audio mix | Every present source stem used unity gain in the browser mix. | `auralis-family-mix-v2` applies one +6 dB linear broadband gain to the unchanged television stem while TV is on, while reserving deterministic -1.5 dB mix headroom; TV off remains zero contribution. | Behavior-changing; exact constants, mix identity, rendered peak ceiling, and physical owner listening must be verified. |
| Result identifiers | Result identities described filters, intervention, and speaker position under the prior unity mix. | Every result identity binds the source-mix algorithm and television masking gain. | Intentionally breaking opaque identity values; no stored rows exist and evidence v3 shape is unchanged. |
| Session bounds | At most two adaptation comparisons. | Unchanged. Bilateral remains available as the last displayed support option, not an automatically forced first change. | Runtime compatible; later selection remains human/agent controlled. |

Rollback is atomic: restore the v1.3 contract, transformation plan, browser mixer, option derivation, UI layout, tests, README, and this plan together. Do not restore the mixer without restoring the result-identity version or vice versa.

## Retained V1.3 pre-release contract migration

This branch intentionally evolves the still-unreleased v1.2 candidate before public release. The migration is **BREAKING (pre-release, atomically migrated)**:

| Consumer | V1.2 candidate | V1.3 migration |
|---|---|---|
| Current staging meaning | `agenticActivationTool` remained statically named even when `stage_demo_session` meant profile selection or was unavailable. | `allowedNextTools` remains authoritative; activation is phase-bound and `stageDemoSessionAction` declares `start`, `select-profile`, or `null`. |
| Agent/browser control | Tool discovery did not state a shared fallback policy. | Every tool declares WebMCP-first and Computer Use fallback-only for a human gate or absence of a matching tool. |
| Synthetic profile set | Unversioned active fixture values. | `auralis-synthetic-presets-v2` retains the v1 basis and applies an explicit +10 dB HL offset; confirmed identity, WebMCP projection, SVG plots, transform tests, and rollback evidence are version-bound. |
| State evidence | Evidence v2 covered playback custody. | Evidence v3 and contract v1.3 keep strict schema versioning aligned with the capability and profile-set additions. |
| Adaptation presentation | The first adaptation screen repeated the shell heading, agent action panel, detailed prose, and session table. | One shell heading plus three compact grounded choices; technical session details remain available in other phases but are not part of page 5. |

The first playback invocation returns after the first leg has actually started with `replayed: false`; the page continues the bounded sequence and a repeated identical request reads current or final status without restarting audio.

The reviewed local split now provides two durable rollback boundaries: revert `6b93385` to restore the exact V1.3 mix and three-option presentation, then revert `8711001` to restore the prior published feature-branch state at `61c2afc`. Contract, profile fixtures, reducer, browser adapter, UI, tests, and documentation must never be partially restored across those boundaries.

## Validation

Every public implementation candidate must be validated from a clean clone or clean isolated worktree.

Required commands for the current foundation are:

```bash
npm ci
npm run test:webmcp
npm run check
```

`npm run check` now includes the deterministic WebMCP unit and adapter suite plus the nine-scenario Chromium WebMCP journey. `npm run test:webmcp` and `npm run test:webmcp:journey` remain available as narrower diagnostic commands.

Acceptance also requires:

- exact changed-path review;
- unchanged dependency lock unless a later phase explicitly changes it;
- byte-for-byte comparison of reconstructed BUILD-1/2 product files against the reviewed implementation;
- a scan of every newly reachable blob and commit message for secrets and machine-specific operational data;
- tool registration and schema tests;
- stale revision, replay, invalid phase, and human-gate negative tests;
- normal human fallback with WebMCP absent;
- public preview smoke and immutable deployment identity after publication is separately approved.

## Public history and release safety

Public commits are small and meaningful:

1. `docs(webmcp): add public architecture and delivery plan`
2. `feat(webmcp): add deterministic domain contract`
3. `feat(webmcp): register browser tools`
4. `docs(webmcp): publish build-2 implementation map`
5. `feat(webmcp): add structural agent reveal`
6. `docs(webmcp): record build-3a acceptance`
7. `docs(webmcp): align build-3a public status`
8. `test(webmcp): add verified browser journey`
9. `docs(webmcp): record verify-1 acceptance`
10. `feat(webmcp): add bounded live-session waiting`
11. `fix(webmcp): reserve waits for passive phases`
12. `fix(webmcp): extend passive wait to 60 seconds`
13. `fix(webmcp): keep agent run across human gates`
14. `fix(webmcp): derive wait timeout from session phase`
15. `docs(webmcp): record native live-session verification`
16. `feat(webmcp): refine persistent guided session`

The public branch starts from the live public `main`. Only the explicitly reviewed branch ref is pushed. Broad ref pushes are not used.

Before push, the release gate binds:

- public base commit and candidate commit/tree;
- exact public diff and full reachable-history scan;
- clean-clone test results;
- the Vercel project and production branch;
- whether the feature push creates a Preview only;
- the previous known-good production deployment;
- separate Git and deployment rollback procedures.

Push, pull request, merge, production promotion, release tag, and hackathon submission remain separate human-authorized actions.

## Rollback

Before the local v1.5 commit, reject the complete contract/reducer/summary/test/documentation diff without changing public history. After commit, revert the complete v1.5 commit. The coupled terminal phase, evidence schema, summary projection, acceptance tests, and documentation must never be rolled back independently.

The V1.6 live-session increment is based on exact rollback commit `853c0259a73367f6a42bf32a33e8b91d318b5768` and its original atomic implementation is `c493d36ce7cbb587c2478900684d7c0c5b02e010`. The dynamic next-tool repair is `1e5cd9bada265b96ac3927880e3b5582a22a7102`, and the 60-second passive-wait adjustment is `87a93cceb40d9754c88a32effec68e16bab8b3d5`. The V1.7 session-protocol repair is `2af80ff39534bde85b8f1ec52dcb6178ca64afda`; its host-compatibility follow-up is a separate atomic commit that only derives an omitted wait duration from the current phase. V1.8 starts from exact rollback SHA `8bd45931f1804ec57c98eee2878e2e408a5c3ac1`; reject its complete current diff before commit or revert its single atomic commit afterward to restore the published V1.7 state. Revert the V1.7 compatibility follow-up alone to restore strict explicit profile timing, then revert `2af80ff` to restore exact V1.6 behavior. To remove live-session support entirely, revert V1.8 first, then the V1.7 commits, `87a93cc`, `1e5cd9b`, and `c493d36` newest-first; never retain a newer strict result schema while reverting its producers or browser consumer.

After public push but before merge, correction uses an additive fix or an explicitly approved branch withdrawal. No force push is required for the intended flow.

After merge, source rollback uses a reviewed Git revert. Deployment rollback separately restores the bound previous known-good immutable deployment. A Git revert alone does not remove an already-created Preview artifact.

The unchanged human journey is the product fallback if WebMCP registration or agent guidance is unavailable.

### V1.5 pre-release migration

| Surface | V1.4 | V1.5 | Compatibility consequence |
|---|---|---|---|
| Terminal phase | `ready_for_summary`, then `complete` | `complete` directly | Hosts must reload the v1.5 contract and must not wait for a finish gate. |
| Terminal human gate | `finish_session` | Removed | The final valid observation is the last mutating authorization. |
| Evidence | `auralis-webmcp-evidence-v3` | `auralis-webmcp-evidence-v4` | Consumers must validate v4 before reading new evidence. |
| Revision count | Separate observation and finish revisions | One terminal observation revision | Consumers must not assume a fixed terminal revision number. |
| Terminal event attribution | Human finish | System consequence of the final observation | `session_finished` shares request/comparison identity and revision with the final observation. |

### V1.6 pre-release migration

The migration verdict is **CONDITIONAL (pre-release, atomically migrated)**. Existing six-tool request and response data shapes are unchanged, but the contract literal and exhaustive tool-name enum gain one entry, so all in-repository consumers move in the same commit.

| Surface | V1.5 | V1.6 | Compatibility consequence |
|---|---|---|---|
| Tool catalog | Six tools | Adds read-only `wait_for_session_change` | Additive for discovery, but exhaustive enum consumers must reload V1.6. |
| Existing tool inputs and data | Frozen V1.5 shapes | Unchanged | Existing semantic calls retain their behavior. |
| Session evidence | Evidence v4 with V1.5 contract literal | Same evidence-v4 structure with V1.6 contract literal | No row, backfill, or storage migration; strict consumers must accept the new contract literal. |
| Session progression | Agent reads state on later calls/turns | Optional bounded revision wait over the same controller | No second scheduler or mutation path; timeout and abort are evidence-neutral. |
| Dynamic next-tool policy | Wait available throughout each active session | Wait only for human or automatic progress; granted listening exposes playback without wait | Existing schemas and tool names are unchanged; hosts must obey the narrower `allowedNextTools` projection. |
| Rollback | `853c0259…` feature candidate | Atomic `c493d36` V1.6 increment, `1e5cd9b` dynamic-availability repair, and one separate 60-second timeout adjustment | Revert only the latest adjustment to restore the 15-second bound, or revert the three commits newest-first to return to `853c0259`; never partially roll back enum consumers. |

### V1.7 pre-release contract expansion

The migration verdict is **CONDITIONAL (pre-release, atomically migrated)**. No persisted state, reducer action, evidence event, phase, audio rule, or human gate changes. The request change is additive, but the common strict result envelope gains a required field and the contract literal changes, so every exhaustive consumer must rediscover V1.7 before use.

| Surface | V1.6 | V1.7 | Producers and consumers | Compatibility and mitigation |
|---|---|---|---|---|
| Wait request fields | `sessionId`, `afterRevision`; fixed 60-second executor bound | Optional `timeoutMs`, restricted to `15000` or `60000`; omission derives the canonical value from the current phase: 15 seconds for profile selection and 60 seconds for every other wait phase | Core executor, browser JSON Schema, host tool caller | Existing calls remain runtime-compatible when native hosts omit an optional argument. Explicitly mismatched phase/duration and arbitrary values fail closed; stale-revision catch-up is evaluated first. Contract tests cover both bounds and omission. |
| Common result fields | Revision, phase, session, `allowedNextTools`, human gate, data/error | Adds required discriminated `continuation` with semantically locked action/tool/wait/default combinations, including `select-default-profile` after profile timeout | All seven core producers, browser safe-failure adapter, native host | Strict/exhaustive consumers must reload V1.7. Every result is validated against the common schema. |
| Profile choice | Shared atomic human/agent selection with no recommendation window | Derived guidance explains the same three profiles and holds a 15-second read-only window before the agent selects the asymmetric demo default | State projection, wait result, stage tool, direct profile cards | Behavior-changing orchestration only. No auto-commit exists; direct human choice advances revision and wins. Timeout remains evidence-neutral. |
| State and evidence | `ExperienceState` plus evidence v4 | Unchanged | Reducer, summary, UI | No data migration, backfill, dual write, or stored-row risk. |
| Host continuation | General prose plus dynamic tool allowlist | Machine-readable same-run directive; host compliance still requires native proof | Browser registration metadata and ChatGPT Work/Codex host | Page mocks prove shape, not model behavior. Release remains blocked until VERIFY-0. |
| Rollback | Local V1.6 stack through `87a93cc` | Atomic V1.7 protocol commit `2af80ff` plus one isolated omitted-timeout compatibility repair | Git branch only; no deployment in this phase | Revert the compatibility repair first, then `2af80ff` to restore exact V1.6 request/result contracts. No state or data downgrade is required. |

### V1.8 pre-release guided-session refinement

The migration verdict is **CONDITIONAL (pre-release, atomically migratable)**. The explicit ordinary-wait literal and playback response timing change, so native hosts must rediscover the V1.8 Site Tools contract. No persisted state, evidence schema, human gate, consent rule, playback grant, Stop authority, dependency, route, or service changes.

| Surface | V1.7 | V1.8 | Producers and consumers | Compatibility and mitigation |
|---|---|---|---|---|
| Ordinary wait | `60000` ms for normal human and technical waits; `15000` ms for the profile override | `240000` ms for normal waits; profile override remains exactly `15000` ms | Core executor, continuation projection, browser JSON Schema, host caller | Omitted timeout remains compatible and derives the phase value. Explicit V1.7 `60000` input fails `INVALID_INPUT`; rediscover tools before use. Fake-timer tests cover the exact boundary. |
| Playback response timing | The first tool call returned after the first leg started while the page continued audio | The tool call stays pending through the complete sequence and returns only after completion, failure, or Stop | Browser playback port, registered tool executor, native host | Prevents a new model narration turn during audible A/B. The visible Stop remains usable while the call is pending; natural completion remains the only heard evidence. |
| Television mix | `auralis-family-mix-v2`, +6 dB TV contribution in the same A/B source mix | `auralis-family-mix-v3`, +8 dB TV contribution in the same A/B source mix | Transformation plan, browser renderer, result identities, UI playback | Behavior-changing but same-source: A and B retain identical stem levels and timing; only B adds the selected synthetic profile filters. Peak validation and physical localhost listening remain required. |
| Adaptation policy | Display order TV off, speaker closer, left-ear support, bilateral support; only TV off had a default preference | Display and default path TV off, left-ear support, speaker closer, bilateral support; speaker position and bilateral support require an explicit request | State projection, continuation, direct controls, agent caller | Request enums and one-variable invariant are unchanged. The two-adaptation ceiling remains unchanged. |
| Rollback | Published V1.7 branch SHA `8bd45931…` | One atomic V1.8 source/test/docs commit | Git branch only; no deployment or data migration | Revert the complete V1.8 commit to restore V1.7. Do not roll back the mix version without its result identities and tests. |

### V1.9 playback and terminal-presentation refinement

The playback migration verdict is **COMPATIBLE (behavior-changing, pre-release)**. Tool names, request and response fields, identifiers, enums, phases, events, evidence v4, persisted data, and human gates are unchanged. Browser metadata and continuation prose now forbid a pre-playback narration, while the page inserts a cancellable eight-second quiet lead-in before agent-started audio. Observation phases already accepted source-reference playback; V1.9 makes that existing capability explicit to the agent. Stop and reset resolve the lead-in immediately, and the three-run ceiling remains fail-closed.

The terminal-summary refinement is presentation-only. It reads the same bounded `WebMcpSessionState`, removes the previous client download and administrative path/fact grids, and renders only the person's observations, the illustration's purpose and hard limitation, general non-prescriptive information, a static future hearing-technology illustration, and a disabled future audiologist locator. The original hearing-aid image was owner-rejected for incorrect BTE anatomy; the replacement records that rejection, uses a separately versioned original illustration grounded only by official Widex anatomy references, and received explicit owner visual approval on 2026-09-02. The image is not generated from the current session and does not simulate a fitting or expected benefit. No route, request, personal-data flow, geolocation, provider integration, model call, or WebMCP mutation is added.

Rollback is split: revert the terminal-summary commit alone to restore the previous completion presentation, then revert `a514a4e` to restore V1.8 playback orchestration. No state or data downgrade is required.

### V1.10 channel-aware guided-session refinement

The migration verdict is **COMPATIBLE (instruction-only, pre-release)**. Tool names, input and output schemas, phases, human gates, evidence v4, state ownership, audio behavior, and persistence remain unchanged. Continuation and browser metadata now explicitly require every non-playback explanation in the person's active communication channel: written guidance in text mode or spoken guidance in voice mode. The V1.9 silence rule remains the stronger instruction during the page-owned quiet lead-in and pending audio call, so this repair cannot reintroduce narration over A or B.

Rollback is one isolated V1.10 protocol commit over `2deac7f`; reverting it restores the exact V1.9 instructions without a state, evidence, audio, or data downgrade.

## Privacy, safety, and known limits

- Profiles are predefined and synthetic; V1 does not require a personal audiogram.
- The experience is illustrative and non-diagnostic.
- Session evidence is minimized, attributable, and browser-ephemeral.
- No credential or shared API key is committed or exposed to client JavaScript.
- WebMCP tools do not cross consent, acknowledge physical volume, export, reset, or override Stop. `play_listening_comparison` starts only a current bounded run after the separate human grant. After consent, `stage_demo_session` may select exactly one approved synthetic profile; the same choice is available through a human click. The final valid `record_user_observation` may atomically complete the session and record one system-attributed terminal event without a second human or agent mutation.
- Playback evidence distinguishes requested, started, completed, cancelled, and failed. Stop invalidates the active run and never marks a mode heard; only natural media completion does.
- The page owns timed visible guidance during A-to-B playback. V1.9 instructs the agent to call playback without a spoken preface, then owns a cancellable eight-second quiet lead-in; the tool stays pending until the complete sequence ends, fails, or is stopped. The current WebMCP host surface does not guarantee a timed agent message between the two legs or allow the page to mute host TTS, so Auralis keeps that interval intentionally silent rather than pretending to wake the agent.
- `wait_for_session_change` is a bounded Promise-based tool call, not a WebSocket or guaranteed host subscription. `continuation.doNotEndTurn` is a host instruction, not a page-level execution primitive. Mock and Playwright coverage prove page-side semantics only. Local native evidence on `b84d4c3` proves consent waiting, profile explanation/default, later human gates, typed observations, playback completion, one adaptation, and terminal summary; it does not prove current voice or the future public Preview.
- Current real-agent voice behavior and exact published-Preview behavior require dedicated runtime verification and must not be inferred from the successful local typed/click run.

## Hackathon evidence

The final submission must bind the same public source and behavior across:

- a public licensed repository;
- a dated public diff showing the WebMCP extension;
- a public deployed URL that works without an account or participant-owned API key;
- a short public demo video showing the same implemented behavior;
- the required Codex feedback/session identifier, submitted only through the required submission field and never committed or publicly logged unless the rules explicitly require publication;
- an English project description that does not overstate unverified features.

The running build, public repository, video, and submission text must describe the same product state.
