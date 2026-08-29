# Auralis WebMCP public delivery plan

## Purpose

Auralis turns a synthetic hearing profile into a guided, same-source listening comparison for family understanding. The WebMCP extension adds an agent-guided path while preserving the complete human journey.

This document is the public product and delivery contract for that extension. It records behavior, architecture, human authority, validation, rollback, and release evidence. It intentionally excludes machine-specific diagnostics, private execution transcripts, credentials, and temporary build artifacts.

## Product contract

The V1 experience has one prepared family scene, three predefined synthetic profiles, two synchronized listening perspectives, and a bounded adaptive loop. It is illustrative and non-diagnostic. It does not require or accept a personal audiogram.

The golden path is:

1. A person opens the normal human landing page.
2. The page clearly states that it is agent-ready, but the badge is explanatory and cannot activate agent mode.
3. A compatible agent discovers the WebMCP tools.
4. The first successful `stage_demo_session` call activates the full-surface Agent Reveal.
5. The agent explains the available profiles and proposes the next bounded action.
6. The person directs the experience by clicking, typing to the agent, or speaking to the agent.
7. The person retains consent, profile confirmation, scene loading, volume acknowledgement, playback, observation, finish, reset, and stop authority.
8. The agent adapts one variable at a time and explains why the next comparison is useful.
9. The experience ends with attributable, minimized session evidence and a non-clinical summary.

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
| `stage_demo_session` | Select one predefined synthetic profile and stage the family-understanding session. | Yes. Sole Agent Reveal activation edge. | The first staging requires a pristine session. Before profile confirmation, one different-profile restage is allowed; staging never confirms the profile for the person. |
| `prepare_comparison` | Prepare the baseline or one adaptive comparison. | Yes. | Cannot load audio, start playback, or acknowledge listening. |
| `record_user_observation` | Record the person's structured observation and choose the next bounded action. | Yes. | Requires the relevant human playback evidence first. |
| `get_session_evidence` | Read minimized, attributable session evidence. | None. | Does not finish, export, or reset the session. |

Inputs are narrow and validated. Mutations use request IDs and expected revisions. Stale revisions, reused requests with different payloads, invalid phases, invalid comparisons, and missing human actions fail explicitly.

The implementation follows the official [OpenAI WebMCP guidance](https://learn.chatgpt.com/docs/webmcp): feature-detect browser support, reuse existing application logic and validation, describe side effects, return verifiable results, and preserve the normal interface for people and unsupported browsers.

## State machine and human gates

The V1 semantic phases are:

1. `awaiting_session_stage`
2. `awaiting_consent`
3. `awaiting_profile_confirmation`
4. `awaiting_scene_load`
5. `awaiting_volume_acknowledgement`
6. `ready_for_baseline`
7. `awaiting_baseline_listening`
8. `awaiting_baseline_observation`
9. `ready_for_adaptation`
10. `awaiting_comparison_listening`
11. `awaiting_comparison_observation`
12. `ready_for_summary`
13. `complete`

The seven human gates are:

- confirm consent;
- confirm the synthetic profile;
- load the prepared scene;
- acknowledge a comfortable low volume;
- listen to the baseline;
- listen to the comparison;
- finish the session.

No WebMCP tool may cross these gates. Stop remains available to the person independently of the agent.

## Architecture

`ExperienceState` is the single semantic source of truth. Human UI actions and WebMCP mutations enter one commit gateway. The browser adapter registers tools and delegates to typed domain operations; it does not automate DOM selectors or synthetic clicks.

The relevant layers are:

- `src/contracts/webmcp.ts`: public tool, state, input, output, error, evidence, and human-gate types;
- `src/core/experience.ts`: the existing experience reducer and shared controller;
- `src/core/webmcp.ts`: deterministic WebMCP transitions and projections;
- `src/browser/webmcp.ts`: feature-detected browser registration and schema conversion;
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
- the future Agent Reveal UI and agent-guided visual structure.

## Delivery phases

| Phase | Public result | Status |
|---|---|---|
| BUILD-1 | Deterministic domain contract, state transitions, errors, evidence, and focused tests. | Reviewed source available; not yet present on the public lineage. |
| BUILD-2 | Feature-detected browser registration, shared commit gateway, and adapter tests. | Reviewed source available; not yet present on the public lineage. |
| BUILD-3A | Structural Agent Reveal, visible human gates, current state, and next action. | Not started. |
| VERIFY-1 | Real-browser WebMCP journey, human fallback, negative gates, accessibility, and failure paths. | Not started. |
| DESIGN-1 | Three visual directions generated from verified final-state screenshots. | Not started. |
| VISUAL-UPDATE | One selected complete visual system for human and agent-guided modes. | Not started. |
| RELEASE | Public history, public deployment, demo evidence, and submission package. | Not started. |

BUILD-3A begins only after BUILD-1 and BUILD-2 are reconstructed, reviewed, tested, and published on the canonical public development branch.

## Visual and interaction direction

The landing page remains human-first. Agentic readiness is visible but non-activating.

The first successful staging mutation creates a deliberate full-surface transition into the agent-guided system. The transition should feel like a new interface flowing into place while preserving orientation, human controls, and reduced-motion accessibility.

Implementation uses CSS motion tokens and progressive enhancement. The same-document View Transition API may be used behind feature detection, with a stable CSS fallback and `prefers-reduced-motion` support. Audio controls, audiogram-like profile data, and session state remain accessible HTML/CSS UI rather than rasterized controls.

Image generation is used only after the structural and functional states are verified. Generated images provide art direction and approved scene assets; they do not replace accessible controls, state, text, or evidence.

## Validation

Every public implementation candidate must be validated from a clean clone or clean isolated worktree.

Required commands for the current foundation are:

```bash
npm ci
npm run test:webmcp
npm run check
```

`npm run test:webmcp` is explicit because the current aggregate `check` command does not include it yet. VERIFY-1 will add the real-browser WebMCP journey and then extend the aggregate command.

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

Before public push, each candidate commit can be rejected without changing the public repository.

After public push but before merge, correction uses an additive fix or an explicitly approved branch withdrawal. No force push is required for the intended flow.

After merge, source rollback uses a reviewed Git revert. Deployment rollback separately restores the bound previous known-good immutable deployment. A Git revert alone does not remove an already-created Preview artifact.

The unchanged human journey is the product fallback if WebMCP registration or agent guidance is unavailable.

## Privacy, safety, and known limits

- Profiles are predefined and synthetic; V1 does not require a personal audiogram.
- The experience is illustrative and non-diagnostic.
- Session evidence is minimized, attributable, and browser-ephemeral.
- No credential or shared API key is committed or exposed to client JavaScript.
- WebMCP tools do not start playback, cross consent, confirm a profile, finish, export, reset, or override Stop.
- The current playback evidence proves that a mode started and stopped; before release it must either require meaningful completion/minimum duration or use a name that accurately reflects the measured event.
- Browser support and real-agent voice behavior require dedicated runtime verification and must not be inferred from mock registration tests.

## Hackathon evidence

The final submission must bind the same public source and behavior across:

- a public licensed repository;
- a dated public diff showing the WebMCP extension;
- a public deployed URL that works without an account or participant-owned API key;
- a short public demo video showing the same implemented behavior;
- the required Codex feedback/session identifier, submitted only through the required submission field and never committed or publicly logged unless the rules explicitly require publication;
- an English project description that does not overstate unverified features.

The running build, public repository, video, and submission text must describe the same product state.
