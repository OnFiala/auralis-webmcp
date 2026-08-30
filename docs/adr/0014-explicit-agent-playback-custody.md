# ADR 0014: Explicit agent playback custody

- **Status:** Accepted in v1.2 and retained by the local pre-release v1.4 candidate
- **Date:** 2026-08-30
- **Scope:** Agent-guided WebMCP listening only

## Context

The v1.1 contract kept playback human-only. That prevented unsafe autoplay, but it also left the agent unable to run the comparison it was explaining and allowed the volume acknowledgement to strand the session at `ready_for_baseline`. The product now needs click, typed-agent, and voice-agent control to remain equivalent without silently broadening audio authority.

The browser host does not provide a page-to-agent wake guarantee. Auralis therefore cannot promise that the agent will speak at an exact instant between A and B.

## Decision

Add `play_listening_comparison` as the sixth pre-release tool and require a separate visible, unchecked agent-playback grant during the comfortable-volume human gate. The acknowledgement and fixed baseline are one semantic commit. The tool reserves an idempotent `PlaybackRun` containing its request, comparison, sequence, focus, initiator, completed legs, and status.

The browser page owns the verified audio runtime and timed visible guidance. A run may play A, B, or the fixed eight-second A-then-B sequence. At most three agent-started runs may be reserved per comparison. The first invocation returns only after the first leg actually starts, while the page continues the bounded sequence. The agent receives canonical before, between, after, and no-difference guidance in tool/state results, but Auralis does not claim a timed agent callback.

Only natural media end marks a leg heard. Stop or reset cancels a `starting` or `started` run and invalidates delayed continuation, so B cannot start after cancellation. Active playback, pending playback, and every terminal callback must carry the same run ID; a stale mismatch is a complete no-op. Direct page playback remains available when the agent grant is off.

Adaptation choices are derived once in the core and projected to both WebMCP state and direct page controls. Everyday-language observations remain human-provided; one core decision path serves agent and page submissions. The agent may translate stated meaning into bounded fields but may not infer hearing ability or fabricate a difference. An unsure or no-difference result requires one completed important-speaker A-then-B recovery replay before it can be recorded.

## Consequences

- The public tuple changes from five to six tools before release.
- Contract, reducer, domain operation, browser port, UI, tests, and public documentation must move together.
- The first WebMCP call returns after actual playback start with `replayed: false`; replaying the same request returns current or final status without starting audio again.
- Evidence schema v2 introduced correlation of playback request, start, completion, cancellation, and failure with request and run IDs. The current evidence schema v3 retains that custody and adds the later capability/profile-set contract. It exports a minimized run descriptor (`playback`, `focus`, `purpose`, completed modes, status) plus bounded recovery counts. Canonical input, raw audiogram data, source identity, and free text remain excluded.
- Native host discovery, voice control, and physical audible output remain separate runtime evidence from mocked Playwright verification.

## Rollback

Before the reviewed versioning recovery, the safe rollback unit was the complete unstaged visual-and-flow candidate recorded in `docs/WEBMCP_PLAN.md`; overlapping v1.2 files were not an independently discardable layer. The resulting product boundary is commit `8711001`; revert the later V1.4 delta `6b93385` first, then revert `8711001` as a complete unit. Never restore the five-tool adapter independently of its contract and UI consumers.
