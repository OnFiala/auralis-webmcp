# ADR 0015: Automatic terminal summary after the final observation

- **Status:** Accepted in v1.5; presentation refined in the local v1.9 candidate
- **Scope:** Agent-guided browser session only

## Context

WebMCP v1.4 stored a final observation as `ready_for_summary`, then required a separate visible `finish_session` human gate. That gate did not protect audio, consent, physical volume, personal data, or an irreversible operation. It fragmented the conclusion and attributed an extra `session_finished` action to the person even though the final observation had already asked to summarize.

The existing agent summary also reused the human journey's optional GPT screen. This duplicated deterministic facts, made the explanation appear dependent on an optional model call, and weakened desktop readability over the photographic Agent Reveal surface.

## Decision

The final valid observation atomically:

1. records `observation_recorded`;
2. records `session_finished` with actor `system`;
3. gives both events the same revision and final observation request/comparison identity;
4. sets `completionState` and the returned phase to `complete`;
5. projects one deterministic summary without a GPT request.

The public contract is bumped to `auralis-webmcp-v1.5` and evidence to `auralis-webmcp-evidence-v4`. The unreachable `ready_for_summary` phase and `finish_session` gate are removed. Consent, comfortable-volume acknowledgement, the separate agent-playback grant, natural-playback proof, Stop, reset, replay recovery, revision checks, and request replay remain unchanged.

The summary includes only bounded session evidence and general educational guidance. The v1.9 presentation narrows it to three visible areas: what the person reported, what the illustration was for, and clearly marked future directions. The previous browser-only appointment download and administrative comparison/path grids are removed from the current surface by owner direction; this does not change the terminal state or evidence.

The future hearing-technology card uses one static generated educational asset. It is not derived from the current session and does not simulate a device, fitting, correction result, or expected benefit. The first asset version is retained in provenance as owner-rejected for incorrect BTE anatomy. The separately versioned replacement uses official Widex material only as anatomical reference, is a new composition without visible brand marks, labels, or copied page layout, and received explicit owner visual approval on 2026-09-02; pixel-level uniqueness is not guaranteed. The audiologist locator stays a disabled placeholder with no location, search, booking, or external-provider integration. General correction information remains non-diagnostic and non-prescriptive.

## Rejected alternatives

- A React effect or automatic click would create a second mutation and risk remount, replay, and revision drift.
- A seventh completion tool would preserve the unnecessary step and expand the public surface.
- A hidden `ready_for_summary` state would leave ambiguous terminal truth.

## Rollback

The v1.9 presentation refinement is an independent rollback unit because it changes only the summary component, complete-state shell copy, scoped CSS, a static generated asset and its manifest, tests, and documentation. Reverting that commit restores the previous v1.5 presentation without changing the `complete` phase or evidence v4. Reverting the original v1.5 terminal contract remains an atomic contract/reducer/UI operation.
