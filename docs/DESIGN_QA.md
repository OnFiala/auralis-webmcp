# Resonant Canvas listening-loop repair — design QA history

This report preserves the local visual-verification checkpoints that preceded
and support the current v1.5 candidate. Current contract and acceptance status
remain authoritative in `docs/WEBMCP_PLAN.md`; paths below identify reproducible
local QA outputs, not committed publication artifacts.

## V1.5 automatic terminal summary

The final valid agent or direct-human observation now completes the session in
the same revision and opens a single deterministic summary. The summary is not
the human journey's optional GPT screen and makes no model request. It replaces
the removed `ready_for_summary` / `finish_session` gate with one opaque,
high-contrast surface containing:

- the selected synthetic profile, A/B meaning, final conditions, and bounded
  changes;
- all structured observations and the ordered comparison path;
- the hard illustrative/non-diagnostic limitation;
- general next-step information, including urgent wording for sudden or rapidly
  worsening hearing changes;
- a browser-generated conversation guide that contains no session data and
  creates no request;
- a disabled audiologist-locator placeholder with no location, search, booking,
  or external-provider integration.

Reproducible capture:

- desktop: `artifacts/design-qa/v15-final-summary-1280x720.png`;
- mobile: `artifacts/design-qa/v15-final-summary-390x844.png`;
- viewport: `1280 × 720` CSS pixels, full-page capture;
- mobile viewport: `390 × 844` CSS pixels, full-page capture;
- source build: local production build from the current working tree;
- test entry: the primary mocked-host WebMCP journey in
  `tests/webmcp.spec.ts` with `AURALIS_SUMMARY_QA_CAPTURE` set.

The browser acceptance checks the summary's exact viewport centering, absence of
horizontal overflow, opaque surface, WCAG AA heading contrast, missing finish
and GPT actions, client-only download, disabled audiologist control, and final
v4 evidence. The complete unchanged-byte `npm run check` passed with 45 core
tests, 55 WebMCP unit/adapter tests, 12 model tests, a production build, one
smoke journey, two preserved human journeys, and eight Chromium WebMCP journeys.

## Comparison target

- Source visual truth: owner-supplied local reference, intentionally not committed.
- Selected art direction: Codex ImageGen direction 2; the approved derivative is committed as `public/media/auralis-family-scene-agent-v1.webp`.
- Normalized source crop: `artifacts/design-qa/reference-agent-listening-1536x1024.png`.
- Browser-rendered implementation: local production build.
- Closest state comparison, source left / implementation right: `artifacts/design-qa/v12-playing-b-reference-comparison-3072x1024.png`.
- Baseline listening: `artifacts/design-qa/v12-baseline-listening-1536x1024.png`.
- Baseline observation: `artifacts/design-qa/v12-baseline-observation-1536x1024.png`.
- Profile selection with audiograms: `artifacts/design-qa/v12-profile-audiograms-1536x1024.png`.
- Adaptation options: `artifacts/design-qa/v12-adaptation-options-1536x1024.png`.
- Adaptation listening: `artifacts/design-qa/v12-adaptation-listening-1536x1024.png`.
- Active B playback: `artifacts/design-qa/v12-adaptation-playing-b-1536x1024.png`.
- Mobile profile selection: `artifacts/design-qa/v12-profile-audiograms-390x844.png`.
- Desktop CSS viewport and implementation pixels: `1536 × 1024`, device scale factor `1`
- Mobile CSS viewport: `390 × 844`, device scale factor `1`; full-page capture is `390 × 2468`
- Source pixels: `3072 × 1024`; the owner diagnostic contains two equal `1536 × 1024` halves. The selected left half was cropped without scaling, so source and desktop implementation are equal-density.

## State and normalization

The combined comparison uses the source's active-B visual state and the implementation's active-B adaptation state. The source depicts three simultaneous changes (`bilateral`, `TV off`, `speaker closer`) while the implementation intentionally preserves the frozen one-variable-per-round semantic invariant (`bilateral`, `TV on`, `original position`). That semantic difference is not visual drift and must not be copied.

The baseline and observation captures separately verify the states requested in this repair. The profile desktop/mobile captures have no matching source-state mock; they are evaluated against the selected Resonant Canvas tokens, layout, imagery, and interaction language rather than claimed as pixel-identical clones.

## Browser evidence

The owner previously authorized local Playwright Design-QA. A mocked top-level WebMCP host registered the exact six v1.2 tools. The capture passed consent, displayed all three unselected synthetic profiles, selected `Flat hearing loss`, loaded the approved scene, explicitly granted agent playback, atomically entered baseline listening, completed the real bounded A-to-B browser-audio sequence, recorded an everyday-language observation, exposed the three derived adaptations, selected bilateral support, and captured active B playback. Console and page-error collection were empty.

After the visual comparison, an independent architecture review found two audio-lifecycle races and three contract/evidence gaps. The repaired candidate now cancels a run even before playback starts, binds every start and terminal callback to the exact active run, returns the first tool invocation after actual start with `replayed: false`, correlates evidence-v2 lifecycle events by request and run ID, exports minimized run/recovery descriptors, and uses one core observation decision for page and agent input. The final complete `npm run check` passed: 45 core tests, 53 WebMCP unit/adapter tests, 12 model tests, production build, one smoke journey, two preserved human journeys, and eight Chromium WebMCP journeys.

Measured desktop geometry:

- each compact audiogram figure: approximately `293 × 168` CSS pixels;
- baseline playback dock: top `438`, bottom `857` in a `1024`-pixel viewport;
- persistent Stop: top `24`, in viewport throughout.

Primary interactions verified by automated Chromium tests:

- no-host human fallback;
- agent-only activation edge;
- consent and modal focus containment;
- direct and agent profile selection into one session;
- automatic source preparation and bounded Retry;
- explicit playback grant versus click-only mode;
- automatic fixed baseline preparation;
- direct Stop cancellation without heard evidence;
- agent A, B, and A-to-B run custody;
- everyday-language observation controls;
- no-clear-difference replay plus visible continue-unsure escape;
- identical page/agent adaptation choices;
- summary finish, reset, and stale-call rejection;
- unchanged manual and predefined human journeys.

## Required fidelity surfaces

- **Fonts and typography:** the existing Auralis sans/display system remains consistent with Resonant Canvas. Large action headings retain the compact heavy optical weight; small state labels remain legible and do not truncate. Desktop and mobile captures show intentional wrapping rather than collision.
- **Spacing and layout rhythm:** the earlier empty `27.5rem` grid row was removed from listening and adaptation states. The dock now begins at approximately 43% of the desktop viewport and all playback controls are initially visible. Profile cards use one equal desktop row and one mobile column. Radii, thin teal borders, and dark translucent elevation remain coherent.
- **Colors and tokens:** agent teal, deep green-black surfaces, white hierarchy, muted blue-green support text, and red emergency Stop match the selected direction. Disabled Stop is deliberately subdued; active playback restores the saturated red state.
- **Image quality and asset fidelity:** the approved generated family-scene derivative remains full-resolution, correctly cropped, and is not replaced by CSS art, placeholders, emoji, or a new inline illustration. The existing data-driven audiogram component supplies the plots; no fake decorative audiogram asset was introduced.
- **Copy and content:** all new visible copy is English, non-diagnostic, and uses everyday listening language. Baseline B explicitly says that no adaptation is applied. The previous `low volume acknowledged` phrase is replaced with `Comfortable listening level acknowledged` in agent mode.
- **Icons and affordances:** existing logo assets and A/B letter controls remain aligned. Play, Stop, checkbox, adaptation, and observation controls are semantic native controls with visible focus behavior; no new non-standard icon approximation was added.
- **Responsiveness and accessibility:** mobile has no horizontal overflow or overlapping cards. The long profile state intentionally scrolls. Audiogram SVG title/description IDs are unique per chart and expose exact bilateral values; plots are not the sole information channel. Reduced motion removes the entry animation.

## Comparison history

1. **Initial P1 — dead `Prepare the first comparison` state.** Comfortable-volume confirmation changed only the volume flag, so a passive page click could leave the agent session waiting with no direct recovery. Fixed by one atomic volume-plus-fixed-baseline commit and a visible bounded recovery control for legacy/stale state. Post-fix evidence: `v12-baseline-listening-1536x1024.png`.
2. **Initial P2 — playback surface below the useful first viewport.** The shell reserved a large empty grid row before playback/adaptation content. Fixed with phase-specific compact grid rows. Post-fix baseline dock is fully visible from y438–857; adaptation choices are fully visible in `v12-adaptation-options-1536x1024.png`.
3. **Initial P2 — false baseline support language.** Baseline exposed support-oriented copy even though support was `none`. Fixed by omitting the support condition pill and selector, labeling B `Synthetic listening profile only`, and stating the exact baseline truth. Post-fix evidence: `v12-baseline-listening-1536x1024.png`.
4. **Initial P2 — technical observation labels and no-difference dead end.** Fixed with English everyday-answer controls, agent translation guidance, focused replay, a two-replay UI bound, and a visible continue-unsure escape. Post-fix evidence: `v12-baseline-observation-1536x1024.png` plus the passing WebMCP journey.
5. **Initial P2 — adaptation choice hidden below the scene.** Fixed by projecting the three core-derived options into a foreground Resonant Canvas panel shared with the agent contract. Post-fix evidence: `v12-adaptation-options-1536x1024.png`.
6. **Independent P0 — Stop during render could strand a run in `starting`.** Fixed with an explicit run-cancellation action that applies before or after playback start, resets interrupted render state, preserves zero heard evidence, and permits a fresh request. Covered by a deterministic negative test.
7. **Independent P0 — delayed terminal callbacks were not bound to the current run.** Fixed by carrying run ID in active playback and requiring exact active, pending, and action identity. A mismatched stale callback is a complete no-op without revision change.
8. **Independent P1 — page and agent observation recovery could drift.** Fixed with one core decision function, one evidenced important-speaker recovery replay before an unsure/no-difference observation, a shared final-adaptation summary rule, and core-owned recovery counts rather than React-local truth.
9. **Independent P1 — playback return and audit lineage were ambiguous.** Fixed by returning the original invocation after actual start with `replayed: false`; idempotent repeats project current/final status. Evidence schema v2 carries request and run IDs for requested, started, completed, cancelled, and failed lifecycle events.
10. **Independent P1 — rollback wording described two units.** Before versioning, this was fixed by binding rollback to the complete unstaged candidate. The reviewed recovery later created exact boundaries at `8711001` and `6b93385`.

The post-fix comparison found no remaining actionable P0, P1, or P2 issue.

## Follow-up polish

- [P3] Mobile may later collapse the `Shows` paragraph behind an accessible disclosure if shorter profile scanning becomes preferable to immediate explanation.
- [P3] The final landing-to-agent liquid transition remains a later visual layer and is not silently included in this listening-loop repair.
- [P3] Native host/voice discovery and physical audible-output proof remain VERIFY-0 evidence; mocked Playwright does not substitute for them.

## Screen 4 compactness follow-up — 2026-08-30

The owner accepted the landing, consent, and agent-playback/comfortable-volume
gate, then identified the first baseline listening screen as visually crowded.
This repair is intentionally limited to the agent listening surface; the first
three accepted states are unchanged.

Current-run evidence at the owner-reported `1328 × 969` viewport:

- compact stopped state: `artifacts/design-qa/screen4-compact.png`;
- active B state: `artifacts/design-qa/screen4-playing-b.png`;
- mobile stopped state: `artifacts/design-qa/screen4-mobile-compact.png`;
- mobile active B state: `artifacts/design-qa/screen4-mobile-playing-b.png`.

The two tall cards now form one compact playback dock. The dock carries the
primary `Playing A`, `Transition A → B`, or `Playing B` status, and the active
card also receives a high-contrast outline, filled `Now playing` pill, and
`aria-current="true"`. Every transport state includes the concise
`Focus: central speaker` instruction. The active-speaker scene remains visible
above the dock.
The duplicate `Available to the agent` panel, the acknowledged-volume row, and
the scene transcript are absent from the agent listening screen. The
non-clinical limitation and comparison proof remain behind the compact
technical disclosure. Human-mode content and controls are unchanged.

Measured by the Chromium acceptance journey:

- complete A/B dock height: at most `240` CSS pixels;
- each A/B card height: at most `130` CSS pixels;
- mobile A/B dock height: at most `380` CSS pixels, with no horizontal
  overflow;
- active agent scene asset remains present;
- no transcript, standalone volume confirmation, or duplicate agent action
  block is rendered in baseline listening;
- Stop, click playback, WebMCP playback, focus behavior, and sticky emergency
  control remain covered by the complete journey.
- a guided run exposes the explicit transition state; stopping during that
  transition clears the visual flag, cancels the exact run, and does not count
  B as heard;
- direct playback exposes `preparing|playing` on both the transport and target
  card within the one-second UI assertion window.

## Acceptance

The implemented v1.2 profile, listening, observation, and adaptation states preserve the Resonant Canvas direction while making the requested controls truthful, visible, and functional. The compact screen-4 follow-up removes the newly reported crowding without changing the accepted first three states. No actionable P0, P1, or P2 design-QA finding remains.

The subsequent V1.4 checkpoint adds the fourth, left-ear support choice and the
versioned television-masking mix without changing this historical visual target.
Its exact clean-clone browser journey passed before local commit `6b93385`.

## Agent terminal-summary visual repair — 2026-08-30

Manual owner QA found that the new automatic terminal summary was functionally
correct but visually projected as a light human-style report inside the agent
session. The repair is presentation-only: the deterministic content, evidence
projection, client-only download, disabled audiologist placeholder, terminal
focus, and all WebMCP, consent, playback, and audio contracts are unchanged.

The final summary now uses one centered Resonant Canvas surface over the family
scene: deep green-black layers, teal hierarchy, white primary copy, narrative
dividers, and an unboxed comparison/observation/path structure. The global
human `section` card treatment is explicitly neutralized inside this component,
so the result no longer reads as a stack of imported human-flow cards. Wide
desktop facts and observations use the additional horizontal space; the 390 px
layout returns every internal block to one column.

The current automated browser run exercises the regular desktop, `2863 × 1514`,
and `390 × 844` terminal states. Generated screenshots are local working aids,
not retained release evidence; the committed acceptance authority is the
deterministic geometry, contrast, behavior, and privacy assertion set below.

The automated end-state assertion verifies focus, absence of the removed finish
and GPT controls, evidence v4, a network-free static download, the disabled
audiologist placeholder, centered geometry, zero horizontal overflow at regular
desktop, `2863 × 1514`, and `390 × 844`, a dark non-transparent hero surface,
and computed heading contrast of at least `4.5:1`.

final result: passed
