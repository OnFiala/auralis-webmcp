# ADR 0015: Automatic terminal summary after the final observation

- **Status:** Accepted for the local WebMCP v1.5 candidate
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

The summary includes only bounded session evidence and general educational guidance. Its information download is created entirely in the browser and contains no session or personal data. The audiologist locator is a disabled placeholder with no location, search, booking, or external-provider integration.

## Rejected alternatives

- A React effect or automatic click would create a second mutation and risk remount, replay, and revision drift.
- A seventh completion tool would preserve the unnecessary step and expand the public surface.
- A hidden `ready_for_summary` state would leave ambiguous terminal truth.

## Rollback

Revert the complete v1.5 candidate as one unit. Contract, reducer, UI, tests, and documentation must not be partially rolled back because the terminal phase and evidence schema are coupled.
