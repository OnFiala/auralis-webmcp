import { describe, expect, it } from "vitest";

import type { AuralisToolResult, AuralisToolErrorCode } from "../contracts/webmcp";
import {
  comparisonResultIdentity,
  createExperienceController,
  experienceReducer,
  type ExperienceController,
} from "./experience";
import {
  confirmWebMcpConsent,
  confirmWebMcpProfile,
  deriveAuralisWebMcpPhase,
  finishWebMcpSession,
  getAuralisState,
  getSessionEvidence,
  prepareComparison,
  recordUserObservation,
  resetWebMcpExperience,
  stageDemoSession,
} from "./webmcp";

const SOURCE_IDENTITY =
  "auralis-family-dinner-greenhouse:a6cb7016fa973cb52a1994454cacd880a4f5864ce0a32a8081a75aad36224aed";
const SESSION_ID = "session-11111111-1111-4111-8111-111111111111";
const NEXT_SESSION_ID = "session-22222222-2222-4222-8222-222222222222";

function expectError(
  result: AuralisToolResult<unknown>,
  code: AuralisToolErrorCode,
) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Expected a tool error.");
  expect(result.error.code).toBe(code);
}

function stage(
  controller: ExperienceController,
  requestId = "stage-1",
  profileId:
    | "high-frequency-hearing-loss"
    | "flat-hearing-loss"
    | "asymmetric-hearing-loss" = "high-frequency-hearing-loss",
  createSessionId = () => SESSION_ID,
) {
  return stageDemoSession(
    controller,
    {
      requestId,
      expectedRevision: controller.getSnapshot().webMcp.revision,
      profileId,
      goal: "family-understanding",
    },
    { createSessionId },
  );
}

function commitHuman(
  controller: ExperienceController,
  command: Parameters<ExperienceController["commit"]>[0],
) {
  const result = controller.commit(command);
  expect(result.ok).toBe(true);
  expect(result.changed).toBe(true);
}

function readyController(): ExperienceController {
  const controller = createExperienceController();
  expect(stage(controller).ok).toBe(true);
  expect(confirmWebMcpConsent(controller)).toMatchObject({ ok: true, changed: true });
  expect(confirmWebMcpProfile(controller, SOURCE_IDENTITY)).toMatchObject({
    ok: true,
    changed: true,
  });
  commitHuman(controller, (state) =>
    experienceReducer(state, { type: "source-load-started" }),
  );
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "source-ready",
      sourceIdentity: SOURCE_IDENTITY,
      sampleRate: 24_000,
      frameCount: 1_536_000,
      durationSeconds: 64,
    }),
  );
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "low-volume-acknowledgement-changed",
      acknowledged: true,
    }),
  );
  expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
    "ready_for_baseline",
  );
  return controller;
}

function prepareBaseline(controller: ExperienceController, requestId = "baseline-1") {
  return prepareComparison(controller, {
    requestId,
    expectedRevision: controller.getSnapshot().webMcp.revision,
    kind: "baseline",
  });
}

function prepareAdaptation(
  controller: ExperienceController,
  requestId: string,
  variable: "support_mode" | "television_state" | "speaker_position",
  value:
    | "none"
    | "left-one-sided"
    | "bilateral"
    | "tv-on"
    | "tv-off"
    | "original-position"
    | "closer-in-front",
) {
  return prepareComparison(controller, {
    requestId,
    expectedRevision: controller.getSnapshot().webMcp.revision,
    kind: "adaptation",
    variable,
    value,
  });
}

function play(controller: ExperienceController, mode: "reference" | "simulated") {
  commitHuman(controller, (state) =>
    experienceReducer(state, { type: "render-started", mode }),
  );
  const rendering = controller.getSnapshot();
  const resultIdentity = comparisonResultIdentity(rendering, mode);
  expect(resultIdentity).toBeTypeOf("string");
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "playback-started",
      mode,
      supportMode: mode === "reference" ? null : state.supportMode,
      interventionState: state.interventionState,
      speakerPositionState: state.speakerPositionState,
      sourceIdentity: SOURCE_IDENTITY,
      resultIdentity: resultIdentity!,
      peakDbFs: -9,
    }),
  );
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "playback-ended",
      resultIdentity: resultIdentity!,
    }),
  );
}

function listenBaseline(controller: ExperienceController) {
  play(controller, "reference");
  play(controller, "simulated");
}

function observe(
  controller: ExperienceController,
  requestId: string,
  comparisonId: "comparison-1" | "comparison-2" | "comparison-3",
  options: Readonly<{
    relativeToPrevious?: "better" | "same" | "worse" | "unsure" | "not_compared";
    nextAction?: "continue" | "summarize";
    maskingSources?: ("television" | "competing_speech" | "room_noise" | "none" | "unsure")[];
  }> = {},
) {
  return recordUserObservation(controller, {
    requestId,
    expectedRevision: controller.getSnapshot().webMcp.revision,
    comparisonId,
    focusedSpeech: "partial",
    maskingSources: options.maskingSources ?? ["television"],
    relativeToPrevious: options.relativeToPrevious ?? "not_compared",
    nextAction: options.nextAction ?? "continue",
  });
}

function baselineObservedController(): ExperienceController {
  const controller = readyController();
  expect(prepareBaseline(controller).ok).toBe(true);
  listenBaseline(controller);
  expect(observe(controller, "observe-1", "comparison-1").ok).toBe(true);
  return controller;
}

describe("Auralis WebMCP deterministic domain contract", () => {
  it("keeps read-only discovery side-effect free on the human landing", () => {
    const controller = createExperienceController();
    const initial = controller.getSnapshot();
    const state = getAuralisState(controller);
    const evidence = getSessionEvidence(controller);

    expect(state).toMatchObject({
      ok: true,
      revision: 0,
      phase: "awaiting_session_stage",
      sessionId: null,
    });
    expect(evidence).toMatchObject({ ok: true, data: { evidence: null } });
    expect(controller.getSnapshot()).toBe(initial);
  });

  it("rejects non-empty read input without mutation", () => {
    const controller = createExperienceController();
    expectError(getAuralisState(controller, { activate: true }), "INVALID_INPUT");
    expectError(getSessionEvidence(controller, { sessionId: "x" }), "INVALID_INPUT");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
  });

  it("activates agent presentation only through the first successful stage", () => {
    const controller = createExperienceController();
    const result = stage(controller);

    expect(result).toMatchObject({
      ok: true,
      revision: 1,
      phase: "awaiting_consent",
      sessionId: SESSION_ID,
      data: {
        agenticPresentation: "active",
        pendingConsent: true,
        pendingHumanConfirmation: true,
      },
    });
    expect(getAuralisState(controller)).toMatchObject({
      ok: true,
      data: { session: { presentation: "agent-guided", stageCount: 1 } },
    });
  });

  it("blocks staging after semantic human progress and preserves it", () => {
    const controller = createExperienceController();
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "manual-value-changed",
        ear: "left",
        frequency: "4000",
        value: "55",
      }),
    );
    const before = controller.getSnapshot();
    const result = stage(controller);

    expectError(result, "INVALID_PHASE");
    expect(controller.getSnapshot()).toBe(before);
    expect(controller.getSnapshot().manualDraft.left["4000"]).toBe("55");
  });

  it("allows exactly one profile restage before confirmation", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    const sameProfile = stage(controller, "stage-same-profile");
    expectError(sameProfile, "INVALID_INPUT");
    expect(controller.getSnapshot().webMcp.session?.stageCount).toBe(1);
    expect(stage(controller, "stage-2", "flat-hearing-loss").ok).toBe(true);
    const third = stage(controller, "stage-3", "asymmetric-hearing-loss");

    expectError(third, "INVALID_PHASE");
    expect(controller.getSnapshot().webMcp.session).toMatchObject({
      stagedProfileId: "flat-hearing-loss",
      stageCount: 2,
    });
  });

  it("replays an identical successful request without revision or event changes", () => {
    const controller = createExperienceController();
    const input = {
      requestId: "stage-replay",
      expectedRevision: 0,
      profileId: "high-frequency-hearing-loss",
      goal: "family-understanding",
    } as const;
    const first = stageDemoSession(controller, input, {
      createSessionId: () => SESSION_ID,
    });
    const before = controller.getSnapshot();
    const replay = stageDemoSession(controller, input, {
      createSessionId: () => NEXT_SESSION_ID,
    });

    expect(first.ok).toBe(true);
    expect(replay).toMatchObject({ ok: true, replayed: true, revision: 1 });
    expect(controller.getSnapshot()).toBe(before);
    expect(controller.getSnapshot().webMcp.session?.events).toHaveLength(1);
  });

  it("rejects requestId reuse with a different payload", () => {
    const controller = createExperienceController();
    expect(stage(controller, "same-id").ok).toBe(true);
    const result = stageDemoSession(controller, {
      requestId: "same-id",
      expectedRevision: 1,
      profileId: "flat-hearing-loss",
      goal: "family-understanding",
    });

    expectError(result, "REQUEST_ID_REUSE");
    expect(controller.getSnapshot().webMcp.revision).toBe(1);
  });

  it("rejects stale revisions before phase and domain mutation", () => {
    const controller = createExperienceController();
    const result = stageDemoSession(controller, {
      requestId: "stale-stage",
      expectedRevision: 1,
      profileId: "high-frequency-hearing-loss",
      goal: "family-understanding",
    });

    expectError(result, "STALE_REVISION");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
  });

  it("fails an already aborted request before commit", () => {
    const controller = createExperienceController();
    const abort = new AbortController();
    abort.abort();
    const result = stageDemoSession(
      controller,
      {
        requestId: "aborted-stage",
        expectedRevision: 0,
        profileId: "high-frequency-hearing-loss",
        goal: "family-understanding",
      },
      { signal: abort.signal },
    );

    expectError(result, "ABORTED");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
  });

  it("validates the success envelope before committing any state", () => {
    const controller = createExperienceController();
    const result = stageDemoSession(
      controller,
      {
        requestId: "invalid-output-stage",
        expectedRevision: 0,
        profileId: "high-frequency-hearing-loss",
        goal: "family-understanding",
      },
      { createSessionId: () => "invalid-session-identity" },
    );

    expectError(result, "INTERNAL_ERROR");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
    expect(controller.getSnapshot().webMcp.requestRecords).toHaveLength(0);
  });

  it("keeps consent and profile confirmation as explicit human events", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    expect(confirmWebMcpConsent(controller)).toMatchObject({ ok: true, changed: true });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_profile_confirmation",
    );
    expect(confirmWebMcpProfile(controller, SOURCE_IDENTITY)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_scene_load",
    );
    expect(controller.getSnapshot().webMcp.session?.events.map((event) => event.actor)).toEqual([
      "agent",
      "human",
      "human",
    ]);
  });

  it("projects the seven human authority gates at their exact phases", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: {
        kind: "confirm_consent",
        authority: "human-required",
        controlChannels: ["direct", "typed-agent", "voice-agent"],
      },
    });
    expect(confirmWebMcpConsent(controller).ok).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "confirm_profile" },
    });
    expect(confirmWebMcpProfile(controller, SOURCE_IDENTITY).ok).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "load_scene" },
    });
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "source-load-started" }),
    );
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "source-ready",
        sourceIdentity: SOURCE_IDENTITY,
        sampleRate: 24_000,
        frameCount: 1_536_000,
        durationSeconds: 64,
      }),
    );
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "acknowledge_low_volume" },
    });
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "low-volume-acknowledgement-changed",
        acknowledged: true,
      }),
    );
    expect(prepareBaseline(controller, "gates-baseline").ok).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "listen_baseline" },
    });
    listenBaseline(controller);
    expect(observe(controller, "gates-observe-1", "comparison-1").ok).toBe(true);
    expect(
      prepareAdaptation(
        controller,
        "gates-adaptation",
        "support_mode",
        "bilateral",
      ).ok,
    ).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "listen_comparison" },
    });
    play(controller, "simulated");
    expect(
      observe(controller, "gates-observe-2", "comparison-2", {
        relativeToPrevious: "better",
        nextAction: "summarize",
      }).ok,
    ).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: { kind: "finish_session" },
    });
  });

  it("prepares a deterministic baseline only when the human gates are complete", () => {
    const controller = readyController();
    const result = prepareBaseline(controller);

    expect(result).toMatchObject({
      ok: true,
      phase: "awaiting_baseline_listening",
      data: {
        comparison: {
          comparisonId: "comparison-1",
          kind: "baseline",
          settings: {
            supportMode: "none",
            televisionState: "tv-on",
            speakerPosition: "original-position",
          },
          requiredPlaybackModes: ["reference", "simulated"],
        },
      },
    });
  });

  it("returns only sanitized deterministic result identities", () => {
    const controller = readyController();
    const result = prepareBaseline(controller);
    if (!result.ok) throw new Error("Expected baseline success.");
    const comparison = result.data.comparison;

    expect(comparison.referenceResultIdentity).toMatch(/^auralis-result-v1-[a-f0-9]{16}$/);
    expect(comparison.simulatedResultIdentity).toMatch(/^auralis-result-v1-[a-f0-9]{16}$/);
    expect(JSON.stringify(comparison)).not.toContain(SOURCE_IDENTITY);
  });

  it("moves to observation only after both baseline playbacks stop", () => {
    const controller = readyController();
    expect(prepareBaseline(controller).ok).toBe(true);
    play(controller, "simulated");
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_baseline_listening",
    );
    play(controller, "reference");
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_baseline_observation",
    );
  });

  it("stores the baseline observation and opens one-variable adaptation", () => {
    const controller = readyController();
    expect(prepareBaseline(controller).ok).toBe(true);
    listenBaseline(controller);
    const result = observe(controller, "observe-baseline", "comparison-1", {
      maskingSources: ["competing_speech", "television"],
    });

    expect(result).toMatchObject({
      ok: true,
      phase: "ready_for_adaptation",
      data: {
        observation: {
          observationId: "observation-1",
          maskingSources: ["television", "competing_speech"],
        },
        nextPhase: "ready_for_adaptation",
      },
    });
  });

  it("enforces baseline observation cross-field semantics", () => {
    const controller = readyController();
    expect(prepareBaseline(controller).ok).toBe(true);
    listenBaseline(controller);
    const result = observe(controller, "bad-baseline-observation", "comparison-1", {
      relativeToPrevious: "better",
    });

    expectError(result, "INVALID_INPUT");
    expect(controller.getSnapshot().webMcp.session?.observations).toHaveLength(0);
  });

  it("rejects a no-effect adaptation without mutation", () => {
    const controller = baselineObservedController();
    const before = controller.getSnapshot();
    const result = prepareAdaptation(
      controller,
      "no-effect",
      "support_mode",
      "none",
    );

    expectError(result, "NO_EFFECT");
    expect(controller.getSnapshot()).toBe(before);
  });

  it("rejects malformed multi-field adaptation input at the strict schema", () => {
    const controller = baselineObservedController();
    const result = prepareComparison(controller, {
      requestId: "multi-field",
      expectedRevision: controller.getSnapshot().webMcp.revision,
      kind: "adaptation",
      variable: "support_mode",
      value: "bilateral",
      televisionState: "tv-off",
    });

    expectError(result, "INVALID_INPUT");
  });

  it("prepares an adaptation that changes exactly one named variable", () => {
    const controller = baselineObservedController();
    const result = prepareAdaptation(
      controller,
      "support-adaptation",
      "support_mode",
      "bilateral",
    );

    expect(result).toMatchObject({
      ok: true,
      phase: "awaiting_comparison_listening",
      data: {
        comparison: {
          comparisonId: "comparison-2",
          previousComparisonId: "comparison-1",
          changedVariable: "support_mode",
          settings: { supportMode: "bilateral", televisionState: "tv-on" },
          requiredPlaybackModes: ["simulated"],
        },
      },
    });
  });

  it("requires adaptation observations to compare against the previous result", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(controller, "support-adaptation", "support_mode", "bilateral").ok,
    ).toBe(true);
    play(controller, "simulated");
    const result = observe(controller, "bad-adaptation-observation", "comparison-2");

    expectError(result, "INVALID_INPUT");
  });

  it("allows the first adaptation to continue to a second bounded comparison", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(controller, "support-adaptation", "support_mode", "bilateral").ok,
    ).toBe(true);
    play(controller, "simulated");
    const result = observe(controller, "observe-2", "comparison-2", {
      relativeToPrevious: "better",
      nextAction: "continue",
    });

    expect(result).toMatchObject({
      ok: true,
      phase: "ready_for_adaptation",
      data: { nextPhase: "ready_for_adaptation" },
    });
  });

  it("forces the second adaptation to terminate at summary", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(controller, "support-adaptation", "support_mode", "bilateral").ok,
    ).toBe(true);
    play(controller, "simulated");
    expect(
      observe(controller, "observe-2", "comparison-2", {
        relativeToPrevious: "better",
      }).ok,
    ).toBe(true);
    expect(
      prepareAdaptation(controller, "tv-adaptation", "television_state", "tv-off").ok,
    ).toBe(true);
    play(controller, "simulated");
    const continued = observe(controller, "observe-3-continue", "comparison-3", {
      relativeToPrevious: "better",
      nextAction: "continue",
    });
    expectError(continued, "INVALID_INPUT");
    const summarized = observe(controller, "observe-3-summary", "comparison-3", {
      relativeToPrevious: "better",
      nextAction: "summarize",
    });
    expect(summarized).toMatchObject({
      ok: true,
      phase: "ready_for_summary",
      humanGate: { kind: "finish_session" },
    });
  });

  it("finishes only through the visible human-authority action", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(controller, "support-adaptation", "support_mode", "bilateral").ok,
    ).toBe(true);
    play(controller, "simulated");
    expect(
      observe(controller, "observe-2", "comparison-2", {
        relativeToPrevious: "better",
        nextAction: "summarize",
      }).ok,
    ).toBe(true);
    expect(finishWebMcpSession(controller)).toMatchObject({ ok: true, changed: true });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe("complete");
    expect(getAuralisState(controller)).toMatchObject({
      ok: true,
      data: { summaryReady: true },
    });
    expect(getSessionEvidence(controller)).toMatchObject({
      ok: true,
      data: { evidence: { summaryReady: true, completionState: "complete" } },
    });
  });

  it("projects minimized ordered evidence without raw audiogram or source identity", () => {
    const controller = baselineObservedController();
    const result = getSessionEvidence(controller);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.data.evidence) throw new Error("Expected evidence.");
    const serialized = JSON.stringify(result.data.evidence);

    expect(result.data.evidence.events.map((event) => event.sequence)).toEqual(
      result.data.evidence.events.map((_, index) => index + 1),
    );
    expect(serialized).not.toContain("Threshold");
    expect(serialized).not.toContain("dB HL");
    expect(serialized).not.toContain(SOURCE_IDENTITY);
    expect(result.data.evidence.comparisons).toHaveLength(1);
    expect(result.data.evidence.observations).toHaveLength(1);
  });

  it("resets monotonically and starts a new idempotency generation", () => {
    const controller = createExperienceController();
    expect(stage(controller, "generation-id").ok).toBe(true);
    const beforeReset = controller.getSnapshot().webMcp.revision;
    expect(resetWebMcpExperience(controller)).toMatchObject({ ok: true, changed: true });
    const afterReset = controller.getSnapshot().webMcp.revision;
    expect(afterReset).toBe(beforeReset + 1);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
    expect(controller.getSnapshot().webMcp.requestRecords).toHaveLength(0);

    const delayed = stageDemoSession(controller, {
      requestId: "generation-id",
      expectedRevision: 0,
      profileId: "high-frequency-hearing-loss",
      goal: "family-understanding",
    });
    expectError(delayed, "STALE_REVISION");
    const fresh = stage(
      controller,
      "generation-id",
      "flat-hearing-loss",
      () => NEXT_SESSION_ID,
    );
    expect(fresh).toMatchObject({
      ok: true,
      replayed: false,
      sessionId: NEXT_SESSION_ID,
    });
  });

  it("offers an explicit monotonic reset recovery for progressed human state", () => {
    const controller = createExperienceController();
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "manual-value-changed",
        ear: "left",
        frequency: "4000",
        value: "55",
      }),
    );
    const progressedRevision = controller.getSnapshot().webMcp.revision;
    expect(stage(controller, "blocked-before-reset")).toMatchObject({
      ok: false,
      error: { code: "INVALID_PHASE", recovery: expect.stringContaining("Reset") },
    });
    expect(getAuralisState(controller)).toMatchObject({
      ok: true,
      allowedNextTools: ["get_auralis_state", "get_session_evidence"],
    });

    expect(resetWebMcpExperience(controller)).toMatchObject({
      ok: true,
      changed: true,
    });
    expect(controller.getSnapshot()).toMatchObject({
      webMcp: {
        revision: progressedRevision + 1,
        humanJourneyProgressed: false,
        session: null,
        requestRecords: [],
      },
    });
    expect(controller.getSnapshot().manualDraft.left["4000"]).toBe("25");
    expect(
      stage(
        controller,
        "stage-after-reset",
        "high-frequency-hearing-loss",
        () => NEXT_SESSION_ID,
      ).ok,
    ).toBe(true);
  });

  it("rejects a re-entrant commit without changing the outer atomic snapshot", () => {
    const controller = createExperienceController();
    let nestedResult: ReturnType<typeof resetWebMcpExperience> | null = null;
    let notifiedSnapshot = null as ReturnType<ExperienceController["getSnapshot"]> | null;
    controller.subscribe((snapshot) => {
      notifiedSnapshot = snapshot;
      nestedResult = resetWebMcpExperience(controller);
    });
    const outer = stage(controller);

    expect(outer).toMatchObject({ ok: true, revision: 1 });
    expect(nestedResult).toMatchObject({
      ok: false,
      changed: false,
      reason: "reentrant",
    });
    expect(notifiedSnapshot).toBe(controller.getSnapshot());
    expect(controller.getSnapshot().webMcp.session?.sessionId).toBe(SESSION_ID);
  });
});
