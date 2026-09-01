import { describe, expect, it, vi } from "vitest";

import type { AuralisToolResult, AuralisToolErrorCode } from "../contracts/webmcp";
import {
  comparisonResultIdentity,
  createExperienceController,
  experienceReducer,
  type ExperienceController,
} from "./experience";
import { ACTIVE_PREDEFINED_PROFILE_SET_VERSION } from "./profile";
import {
  AURALIS_WEBMCP_WAIT_TIMEOUT_MS,
  cancelWebMcpPlaybackRun,
  completeWebMcpNoDifferenceRecovery,
  confirmWebMcpConsent,
  confirmWebMcpListeningReadiness,
  deriveAuralisWebMcpPhase,
  deriveValidAdaptationOptions,
  getAuralisState,
  getSessionEvidence,
  prepareComparison,
  prepareWebMcpAdaptation,
  playListeningComparison,
  recordWebMcpHumanObservation,
  recordUserObservation,
  resetWebMcpExperience,
  selectWebMcpProfile,
  stageDemoSession,
  waitForSessionChange,
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
  createSessionId = () => SESSION_ID,
) {
  return stageDemoSession(
    controller,
    {
      requestId,
      expectedRevision: controller.getSnapshot().webMcp.revision,
      action: "start",
      goal: "family-understanding",
    },
    { createSessionId },
  );
}

function selectProfileWithAgent(
  controller: ExperienceController,
  profileId:
    | "high-frequency-hearing-loss"
    | "flat-hearing-loss"
    | "asymmetric-hearing-loss" = "high-frequency-hearing-loss",
  requestId = "select-profile-1",
) {
  return stageDemoSession(
    controller,
    {
      requestId,
      expectedRevision: controller.getSnapshot().webMcp.revision,
      action: "select-profile",
      goal: "family-understanding",
      profileId,
    },
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
  expect(selectWebMcpProfile(controller, "high-frequency-hearing-loss")).toMatchObject({
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

function atomicListeningController(
  agentPlaybackGranted = true,
): ExperienceController {
  const controller = createExperienceController();
  expect(stage(controller).ok).toBe(true);
  expect(confirmWebMcpConsent(controller)).toMatchObject({ ok: true, changed: true });
  expect(selectWebMcpProfile(controller, "high-frequency-hearing-loss")).toMatchObject({
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
  expect(
    confirmWebMcpListeningReadiness(controller, agentPlaybackGranted),
  ).toMatchObject({ ok: true, changed: true });
  return controller;
}

function completeRunLeg(
  controller: ExperienceController,
  mode: "reference" | "simulated",
  runId: string,
) {
  commitHuman(controller, (state) =>
    experienceReducer(state, { type: "render-started", mode }),
  );
  const rendering = controller.getSnapshot();
  const resultIdentity = comparisonResultIdentity(rendering, mode)!;
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "playback-started",
      mode,
      supportMode: mode === "reference" ? null : state.supportMode,
      interventionState: state.interventionState,
      speakerPositionState: state.speakerPositionState,
      sourceIdentity: SOURCE_IDENTITY,
      resultIdentity,
      peakDbFs: -9,
      actor: "agent",
      runId,
    }),
  );
  commitHuman(controller, (state) =>
    experienceReducer(state, {
      type: "playback-ended",
      resultIdentity,
      runId,
    }),
  );
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
      allowedNextTools: expect.arrayContaining(["stage_demo_session"]),
      data: {
        capabilities: {
          agenticActivationTool: "stage_demo_session",
          stageDemoSessionAction: "start",
          preferredAgentControl: "webmcp-first",
          computerUseFallback: "human-gate-or-no-matching-tool",
          predefinedProfileSetVersion:
            ACTIVE_PREDEFINED_PROFILE_SET_VERSION,
        },
      },
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
        operation: "started",
        stagedProfile: null,
        agenticPresentation: "active",
        pendingConsent: true,
        pendingProfileSelection: true,
      },
    });
    expect(getAuralisState(controller)).toMatchObject({
      ok: true,
      allowedNextTools: [
        "get_auralis_state",
        "get_session_evidence",
        "wait_for_session_change",
      ],
      data: {
        capabilities: {
          agenticActivationTool: null,
          stageDemoSessionAction: null,
        },
        session: { presentation: "agent-guided", stageCount: 1 },
      },
    });
  });

  it("returns an already-observed revision immediately without subscribing", async () => {
    const base = createExperienceController();
    expect(stage(base).ok).toBe(true);
    const subscribe = vi.fn(base.subscribe);
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe,
    });
    const before = base.getSnapshot();

    const result = await waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 0,
    });

    expect(result).toMatchObject({
      ok: true,
      requestId: null,
      revision: 1,
      data: { reason: "changed" },
    });
    expect(subscribe).not.toHaveBeenCalled();
    expect(base.getSnapshot()).toBe(before);
  });

  it("rejects a fresh wait when deterministic baseline preparation is ready", async () => {
    const base = readyController();
    const subscribe = vi.fn(base.subscribe);
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe,
    });
    const revision = base.getSnapshot().webMcp.revision;

    await expect(
      waitForSessionChange(controller, {
        sessionId: SESSION_ID,
        afterRevision: revision,
      }),
    ).resolves.toMatchObject({
      ok: false,
      phase: "ready_for_baseline",
      allowedNextTools: [
        "get_auralis_state",
        "get_session_evidence",
        "prepare_comparison",
      ],
      error: { code: "INVALID_PHASE" },
    });
    expect(subscribe).not.toHaveBeenCalled();

    await expect(
      waitForSessionChange(controller, {
        sessionId: SESSION_ID,
        afterRevision: revision - 1,
      }),
    ).resolves.toMatchObject({
      ok: true,
      phase: "ready_for_baseline",
      data: { reason: "changed" },
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("rejects a fresh wait when granted playback is the next action", async () => {
    const base = atomicListeningController(true);
    const subscribe = vi.fn(base.subscribe);
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe,
    });

    await expect(
      waitForSessionChange(controller, {
        sessionId: SESSION_ID,
        afterRevision: base.getSnapshot().webMcp.revision,
      }),
    ).resolves.toMatchObject({
      ok: false,
      phase: "awaiting_baseline_listening",
      allowedNextTools: [
        "get_auralis_state",
        "get_session_evidence",
        "play_listening_comparison",
      ],
      error: { code: "INVALID_PHASE" },
    });
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("closes the missed-wakeup gap between the first read and subscription", async () => {
    const base = createExperienceController();
    expect(stage(base).ok).toBe(true);
    let activeSubscriptions = 0;
    let changedDuringSubscribe = false;
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe: (listener) => {
        activeSubscriptions += 1;
        if (!changedDuringSubscribe) {
          changedDuringSubscribe = true;
          expect(confirmWebMcpConsent(base).changed).toBe(true);
        }
        const unsubscribe = base.subscribe(listener);
        return () => {
          activeSubscriptions -= 1;
          unsubscribe();
        };
      },
    });

    const result = await waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      revision: 2,
      data: { reason: "changed" },
    });
    expect(activeSubscriptions).toBe(0);
  });

  it("waits the full 60-second bound without changing semantic state or evidence", async () => {
    vi.useFakeTimers();
    try {
      expect(AURALIS_WEBMCP_WAIT_TIMEOUT_MS).toBe(60_000);
      const controller = createExperienceController();
      expect(stage(controller).ok).toBe(true);
      const before = controller.getSnapshot();
      const pending = waitForSessionChange(
        controller,
        { sessionId: SESSION_ID, afterRevision: 1 },
      );
      let settled = false;
      void pending.then(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(AURALIS_WEBMCP_WAIT_TIMEOUT_MS - 1);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;

      expect(settled).toBe(true);
      expect(result).toMatchObject({
        ok: true,
        revision: 1,
        data: { reason: "timeout" },
      });
      expect(controller.getSnapshot()).toBe(before);
      expect(controller.getSnapshot().webMcp.requestRecords).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the boundary revision instead of a false timeout", async () => {
    vi.useFakeTimers();
    try {
      const base = createExperienceController();
      expect(stage(base).ok).toBe(true);
      let current = base.getSnapshot();
      let activeSubscriptions = 0;
      const controller: ExperienceController = Object.freeze({
        getSnapshot: () => current,
        commit: base.commit,
        subscribe: () => {
          activeSubscriptions += 1;
          return () => {
            activeSubscriptions -= 1;
          };
        },
      });
      const pending = waitForSessionChange(
        controller,
        { sessionId: SESSION_ID, afterRevision: 1 },
      );

      expect(confirmWebMcpConsent(base).changed).toBe(true);
      current = base.getSnapshot();
      await vi.advanceTimersByTimeAsync(AURALIS_WEBMCP_WAIT_TIMEOUT_MS);

      await expect(pending).resolves.toMatchObject({
        ok: true,
        revision: 2,
        data: { reason: "changed" },
      });
      expect(activeSubscriptions).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a pre-aborted wait without subscribing or mutating state", async () => {
    const base = createExperienceController();
    expect(stage(base).ok).toBe(true);
    const subscribe = vi.fn(base.subscribe);
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe,
    });
    const before = base.getSnapshot();
    const beforeEvidence = getSessionEvidence(base);
    const abort = new AbortController();
    abort.abort();

    const result = await waitForSessionChange(
      controller,
      { sessionId: SESSION_ID, afterRevision: 1 },
      { signal: abort.signal },
    );

    expectError(result, "ABORTED");
    expect(subscribe).not.toHaveBeenCalled();
    expect(base.getSnapshot()).toBe(before);
    expect(getSessionEvidence(base)).toEqual(beforeEvidence);
  });

  it("fails future revisions closed and resolves reset or replacement explicitly", async () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    expectError(
      await waitForSessionChange(controller, {
        sessionId: SESSION_ID,
        afterRevision: 2,
      }),
      "INVALID_INPUT",
    );

    const pending = waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 1,
    });
    expect(resetWebMcpExperience(controller).changed).toBe(true);
    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: { reason: "session-replaced" },
    });
  });

  it("resolves a pending wait when another session replaces the observed one", async () => {
    const original = createExperienceController();
    expect(stage(original).ok).toBe(true);
    const replacement = createExperienceController();
    expect(stage(replacement, "stage-replacement", () => NEXT_SESSION_ID).ok).toBe(
      true,
    );
    let current = original.getSnapshot();
    const listeners = new Set<(snapshot: typeof current) => void>();
    const controller: ExperienceController = Object.freeze({
      getSnapshot: () => current,
      commit: original.commit,
      subscribe: (nextListener) => {
        listeners.add(nextListener);
        return () => listeners.delete(nextListener);
      },
    });
    const pending = waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 1,
    });

    current = replacement.getSnapshot();
    for (const listener of listeners) listener(current);

    await expect(pending).resolves.toMatchObject({
      ok: true,
      sessionId: NEXT_SESSION_ID,
      data: { reason: "session-replaced" },
    });
    expect(listeners.size).toBe(0);
  });

  it("aborts and cleans up independent concurrent waiters", async () => {
    const base = createExperienceController();
    expect(stage(base).ok).toBe(true);
    let activeSubscriptions = 0;
    const controller: ExperienceController = Object.freeze({
      getSnapshot: base.getSnapshot,
      commit: base.commit,
      subscribe: (listener) => {
        activeSubscriptions += 1;
        const unsubscribe = base.subscribe(listener);
        return () => {
          activeSubscriptions -= 1;
          unsubscribe();
        };
      },
    });
    const aborted = new AbortController();
    const first = waitForSessionChange(
      controller,
      { sessionId: SESSION_ID, afterRevision: 1 },
      { signal: aborted.signal },
    );
    const second = waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 1,
    });
    const third = waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: 1,
    });
    expect(activeSubscriptions).toBe(3);

    aborted.abort();
    await expect(first).resolves.toMatchObject({
      ok: false,
      error: { code: "ABORTED" },
    });
    expect(activeSubscriptions).toBe(2);
    expect(confirmWebMcpConsent(base).changed).toBe(true);
    const [secondResult, thirdResult] = await Promise.all([second, third]);
    expect(secondResult).toMatchObject({
      ok: true,
      revision: 2,
      data: { reason: "changed" },
    });
    expect(thirdResult).toEqual(secondResult);
    expect(activeSubscriptions).toBe(0);
  });

  it("offers wait for human or automatic progress but not deterministic baseline preparation", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    expect(getAuralisState(controller).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "wait_for_session_change",
    ]);

    expect(confirmWebMcpConsent(controller).ok).toBe(true);
    expect(getAuralisState(controller).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "stage_demo_session",
      "wait_for_session_change",
    ]);

    expect(selectProfileWithAgent(controller).ok).toBe(true);
    expect(getAuralisState(controller).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "wait_for_session_change",
    ]);

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
    expect(getAuralisState(controller).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "wait_for_session_change",
    ]);

    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "low-volume-acknowledgement-changed",
        acknowledged: true,
      }),
    );
    expect(getAuralisState(controller).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "prepare_comparison",
    ]);
  });

  it("makes granted playback exclusive and keeps ungranted playback human-driven", () => {
    const humanPlayback = atomicListeningController(false);
    expect(getAuralisState(humanPlayback).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "wait_for_session_change",
    ]);

    const agentPlayback = atomicListeningController(true);
    expect(getAuralisState(agentPlayback).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "play_listening_comparison",
    ]);
    play(agentPlayback, "reference");
    expect(getAuralisState(agentPlayback).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "play_listening_comparison",
    ]);
    play(agentPlayback, "simulated");
    expect(getAuralisState(agentPlayback).allowedNextTools).toEqual([
      "get_auralis_state",
      "get_session_evidence",
      "play_listening_comparison",
      "record_user_observation",
      "wait_for_session_change",
    ]);
    expect(
      observe(
        agentPlayback,
        "shared-adaptation-choice",
        "comparison-1",
      ).ok,
    ).toBe(true);
    expect(getAuralisState(agentPlayback)).toMatchObject({
      phase: "ready_for_adaptation",
      allowedNextTools: [
        "get_auralis_state",
        "get_session_evidence",
        "prepare_comparison",
        "wait_for_session_change",
      ],
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

  it("allows exactly one agent profile selection after human consent", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    const beforeConsent = selectProfileWithAgent(controller);
    expectError(beforeConsent, "INVALID_PHASE");
    expect(controller.getSnapshot().webMcp.session?.stageCount).toBe(1);
    expect(confirmWebMcpConsent(controller).ok).toBe(true);
    expect(selectProfileWithAgent(controller, "flat-hearing-loss").ok).toBe(true);
    const third = selectProfileWithAgent(
      controller,
      "asymmetric-hearing-loss",
      "select-profile-2",
    );

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
      action: "start",
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
      action: "select-profile",
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
      action: "start",
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
        action: "start",
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
        action: "start",
        goal: "family-understanding",
      },
      { createSessionId: () => "invalid-session-identity" },
    );

    expectError(result, "INTERNAL_ERROR");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
    expect(controller.getSnapshot().webMcp.requestRecords).toHaveLength(0);
  });

  it("keeps consent human-only and records a direct human profile choice", () => {
    const controller = createExperienceController();
    expect(stage(controller).ok).toBe(true);
    expect(confirmWebMcpConsent(controller)).toMatchObject({ ok: true, changed: true });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_profile_selection",
    );
    expect(selectWebMcpProfile(controller, "asymmetric-hearing-loss")).toMatchObject({
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

  it("projects only the two v1.5 human authority gates at their exact phases", () => {
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
      phase: "awaiting_profile_selection",
      humanGate: null,
      allowedNextTools: expect.arrayContaining(["stage_demo_session"]),
      data: {
        capabilities: {
          agenticActivationTool: null,
          stageDemoSessionAction: "select-profile",
          preferredAgentControl: "webmcp-first",
          computerUseFallback: "human-gate-or-no-matching-tool",
          predefinedProfileSetVersion:
            ACTIVE_PREDEFINED_PROFILE_SET_VERSION,
        },
        availableProfiles: expect.arrayContaining([
          expect.objectContaining({
            profileId: "high-frequency-hearing-loss",
            predefinedProfileSetVersion:
              ACTIVE_PREDEFINED_PROFILE_SET_VERSION,
          }),
        ]),
      },
    });
    expect(
      selectWebMcpProfile(
        controller,
        "high-frequency-hearing-loss",
      ).ok,
    ).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      phase: "awaiting_scene_load",
      humanGate: null,
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
      humanGate: { kind: "acknowledge_comfortable_volume" },
    });
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "low-volume-acknowledgement-changed",
        acknowledged: true,
      }),
    );
    expect(prepareBaseline(controller, "gates-baseline").ok).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      humanGate: null,
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
      humanGate: null,
    });
    play(controller, "simulated");
    expect(
      observe(controller, "gates-observe-2", "comparison-2", {
        relativeToPrevious: "better",
        nextAction: "summarize",
      }).ok,
    ).toBe(true);
    expect(getAuralisState(controller)).toMatchObject({
      phase: "complete",
      humanGate: null,
    });
  });

  it("atomically acknowledges comfortable volume and prepares one fixed baseline", () => {
    const controller = atomicListeningController(true);
    const snapshot = controller.getSnapshot();

    expect(deriveAuralisWebMcpPhase(snapshot)).toBe(
      "awaiting_baseline_listening",
    );
    expect(snapshot.lowVolumeAcknowledged).toBe(true);
    expect(snapshot.agentPlaybackGranted).toBe(true);
    expect(snapshot.webMcp.session?.comparisons).toHaveLength(1);
    expect(snapshot.webMcp.session?.comparisons[0]).toMatchObject({
      kind: "baseline",
      settings: {
        supportMode: "none",
        televisionState: "tv-on",
        speakerPosition: "original-position",
      },
    });
    expect(snapshot.webMcp.session?.events.slice(-2)).toMatchObject([
      { action: "volume_acknowledged", actor: "human" },
      { action: "comparison_prepared", actor: "system" },
    ]);
    const repeated = confirmWebMcpListeningReadiness(controller, true);
    expect(repeated).toMatchObject({ ok: true, changed: false });
    expect(controller.getSnapshot()).toBe(snapshot);
  });

  it("requires the explicit agent-playback grant and exact current comparison", () => {
    const controller = atomicListeningController(false);
    const revision = controller.getSnapshot().webMcp.revision;
    expectError(
      playListeningComparison(controller, {
        requestId: "play-without-grant",
        expectedRevision: revision,
        comparisonId: "comparison-1",
        playback: "reference-then-simulated",
        focus: "important-speaker",
      }),
      "HUMAN_ACTION_REQUIRED",
    );
    expect(controller.getSnapshot().webMcp.session?.playbackRuns).toHaveLength(0);

    const granted = atomicListeningController(true);
    expectError(
      playListeningComparison(granted, {
        requestId: "wrong-comparison",
        expectedRevision: granted.getSnapshot().webMcp.revision,
        comparisonId: "comparison-2",
        playback: "simulated",
        focus: "overall-scene",
      }),
      "COMPARISON_MISMATCH",
    );
  });

  it("reserves one idempotent run, rejects concurrent audio, and counts only natural end", () => {
    const controller = atomicListeningController(true);
    const expectedRevision = controller.getSnapshot().webMcp.revision;
    const input = {
      requestId: "guided-stop",
      expectedRevision,
      comparisonId: "comparison-1" as const,
      playback: "reference-then-simulated" as const,
      focus: "important-speaker" as const,
    };
    const reserved = playListeningComparison(controller, input, {
      createRunId: () => "playback-11111111-1111-4111-8111-111111111111",
    });
    expect(reserved).toMatchObject({
      ok: true,
      replayed: false,
      data: {
        status: "starting",
        sequence: ["reference", "simulated"],
        clipWindow: { startSeconds: 32.3, durationSeconds: 8 },
      },
    });
    if (!reserved.ok) throw new Error("Expected playback reservation.");

    expectError(
      playListeningComparison(controller, {
        ...input,
        requestId: "concurrent-audio",
        expectedRevision: controller.getSnapshot().webMcp.revision,
      }),
      "AUDIO_BUSY",
    );

    const runId = reserved.data.runId;
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "render-started", mode: "reference" }),
    );
    const resultIdentity = comparisonResultIdentity(
      controller.getSnapshot(),
      "reference",
    )!;
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "playback-started",
        mode: "reference",
        supportMode: null,
        interventionState: state.interventionState,
        speakerPositionState: state.speakerPositionState,
        sourceIdentity: SOURCE_IDENTITY,
        resultIdentity,
        peakDbFs: -9,
        actor: "agent",
        runId,
      }),
    );
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "playback-stopped", runId }),
    );

    expect(controller.getSnapshot().webMcp.session?.comparisons[0]?.heardPlaybackModes).toEqual([]);
    expect(controller.getSnapshot().webMcp.session?.playbackRuns[0]).toMatchObject({
      status: "cancelled",
      completedModes: [],
    });
    expect(controller.getSnapshot().webMcp.session?.events.at(-1)).toMatchObject({
      action: "playback_cancelled",
      actor: "human",
    });
    expect(playListeningComparison(controller, input)).toMatchObject({
      ok: true,
      replayed: true,
      data: { status: "cancelled", runId },
    });
  });

  it("cancels an agent run during rendering and allows a fresh request", () => {
    const controller = atomicListeningController(true);
    const reserved = playListeningComparison(
      controller,
      {
        requestId: "cancel-during-render",
        expectedRevision: controller.getSnapshot().webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference-then-simulated",
        focus: "important-speaker",
      },
      { createRunId: () => "playback-33333333-3333-4333-8333-333333333333" },
    );
    if (!reserved.ok) throw new Error("Expected playback reservation.");
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "render-started", mode: "reference" }),
    );

    expect(cancelWebMcpPlaybackRun(controller, reserved.data.runId)).toMatchObject({
      ok: true,
      changed: true,
    });
    const cancelled = controller.getSnapshot();
    expect(cancelled.renders.reference.status).toBe("idle");
    expect(cancelled.webMcp.session?.pendingPlayback).toBeNull();
    expect(cancelled.webMcp.session?.playbackRuns[0]).toMatchObject({
      status: "cancelled",
      completedModes: [],
    });
    expect(cancelled.webMcp.session?.events.at(-1)).toMatchObject({
      action: "playback_cancelled",
      actor: "human",
      requestId: "cancel-during-render",
      runId: reserved.data.runId,
    });

    expect(
      playListeningComparison(controller, {
        requestId: "after-render-cancel",
        expectedRevision: cancelled.webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference",
        focus: "important-speaker",
      }),
    ).toMatchObject({ ok: true, replayed: false, data: { status: "starting" } });
  });

  it("ignores a stale terminal callback whose runId does not match the active run", () => {
    const controller = atomicListeningController(true);
    const first = playListeningComparison(
      controller,
      {
        requestId: "stale-first",
        expectedRevision: controller.getSnapshot().webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference",
        focus: "important-speaker",
      },
      { createRunId: () => "playback-44444444-4444-4444-8444-444444444444" },
    );
    if (!first.ok) throw new Error("Expected first playback reservation.");
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "render-started", mode: "reference" }),
    );
    const firstIdentity = comparisonResultIdentity(
      controller.getSnapshot(),
      "reference",
    )!;
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "playback-started",
        mode: "reference",
        supportMode: null,
        interventionState: state.interventionState,
        speakerPositionState: state.speakerPositionState,
        sourceIdentity: SOURCE_IDENTITY,
        resultIdentity: firstIdentity,
        peakDbFs: -9,
        actor: "agent",
        runId: first.data.runId,
      }),
    );
    expect(cancelWebMcpPlaybackRun(controller, first.data.runId).changed).toBe(true);

    const second = playListeningComparison(
      controller,
      {
        requestId: "stale-second",
        expectedRevision: controller.getSnapshot().webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference",
        focus: "important-speaker",
      },
      { createRunId: () => "playback-55555555-5555-4555-8555-555555555555" },
    );
    if (!second.ok) throw new Error("Expected second playback reservation.");
    commitHuman(controller, (state) =>
      experienceReducer(state, { type: "render-started", mode: "reference" }),
    );
    const secondIdentity = comparisonResultIdentity(
      controller.getSnapshot(),
      "reference",
    )!;
    const beforeStaleStart = controller.getSnapshot();
    const staleStart = controller.commit((state) =>
      experienceReducer(state, {
        type: "playback-started",
        mode: "reference",
        supportMode: null,
        interventionState: state.interventionState,
        speakerPositionState: state.speakerPositionState,
        sourceIdentity: SOURCE_IDENTITY,
        resultIdentity: secondIdentity,
        peakDbFs: -9,
        actor: "agent",
        runId: first.data.runId,
      }),
    );
    expect(staleStart).toMatchObject({ ok: true, changed: false });
    expect(controller.getSnapshot()).toBe(beforeStaleStart);
    commitHuman(controller, (state) =>
      experienceReducer(state, {
        type: "playback-started",
        mode: "reference",
        supportMode: null,
        interventionState: state.interventionState,
        speakerPositionState: state.speakerPositionState,
        sourceIdentity: SOURCE_IDENTITY,
        resultIdentity: secondIdentity,
        peakDbFs: -9,
        actor: "agent",
        runId: second.data.runId,
      }),
    );
    const beforeStale = controller.getSnapshot();
    const stale = controller.commit((state) =>
      experienceReducer(state, {
        type: "playback-ended",
        resultIdentity: firstIdentity,
        runId: first.data.runId,
      }),
    );
    expect(stale).toMatchObject({ ok: true, changed: false });
    expect(controller.getSnapshot()).toBe(beforeStale);
    expect(controller.getSnapshot().playback).toMatchObject({
      status: "playing",
      runId: second.data.runId,
    });
    expect(controller.getSnapshot().webMcp.session?.pendingPlayback).toMatchObject({
      runId: second.data.runId,
    });
  });

  it("completes the guided A-to-B run and replays its final status without restarting", () => {
    const controller = atomicListeningController(true);
    const input = {
      requestId: "guided-complete",
      expectedRevision: controller.getSnapshot().webMcp.revision,
      comparisonId: "comparison-1" as const,
      playback: "reference-then-simulated" as const,
      focus: "important-speaker" as const,
    };
    const reserved = playListeningComparison(controller, input, {
      createRunId: () => "playback-22222222-2222-4222-8222-222222222222",
    });
    if (!reserved.ok) throw new Error("Expected playback reservation.");
    completeRunLeg(controller, "reference", reserved.data.runId);
    completeRunLeg(controller, "simulated", reserved.data.runId);

    expect(controller.getSnapshot().webMcp.session?.playbackRuns[0]).toMatchObject({
      status: "completed",
      completedModes: ["reference", "simulated"],
    });
    expect(controller.getSnapshot().webMcp.session?.events.at(-1)).toMatchObject({
      action: "playback_completed",
      actor: "system",
    });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe(
      "awaiting_baseline_observation",
    );
    expect(playListeningComparison(controller, input)).toMatchObject({
      ok: true,
      replayed: true,
      data: { status: "completed" },
    });
  });

  it("requires one evidenced focused replay before recording no clear difference", () => {
    const controller = atomicListeningController(true);
    const first = playListeningComparison(
      controller,
      {
        requestId: "initial-ab",
        expectedRevision: controller.getSnapshot().webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference-then-simulated",
        focus: "important-speaker",
      },
      { createRunId: () => "playback-66666666-6666-4666-8666-666666666666" },
    );
    if (!first.ok) throw new Error("Expected initial A-to-B reservation.");
    completeRunLeg(controller, "reference", first.data.runId);
    completeRunLeg(controller, "simulated", first.data.runId);

    const uncertainInput = {
      requestId: "no-difference-before-replay",
      expectedRevision: controller.getSnapshot().webMcp.revision,
      comparisonId: "comparison-1" as const,
      focusedSpeech: "unsure" as const,
      maskingSources: ["unsure"] as const,
      relativeToPrevious: "not_compared" as const,
      nextAction: "continue" as const,
    };
    expectError(recordUserObservation(controller, uncertainInput), "REPLAY_REQUIRED");

    const replay = playListeningComparison(
      controller,
      {
        requestId: "focused-replay",
        expectedRevision: controller.getSnapshot().webMcp.revision,
        comparisonId: "comparison-1",
        playback: "reference-then-simulated",
        focus: "important-speaker",
      },
      { createRunId: () => "playback-77777777-7777-4777-8777-777777777777" },
    );
    if (!replay.ok) throw new Error("Expected focused replay reservation.");
    expect(
      controller.getSnapshot().webMcp.session?.playbackRuns.at(-1),
    ).toMatchObject({ purpose: "no-difference-recovery" });
    completeRunLeg(controller, "reference", replay.data.runId);
    completeRunLeg(controller, "simulated", replay.data.runId);
    expect(
      controller.getSnapshot().webMcp.session?.noDifferenceRecoveries,
    ).toContainEqual({ comparisonId: "comparison-1", completedCount: 1 });
    expect(getSessionEvidence(controller)).toMatchObject({
      ok: true,
      data: {
        evidence: {
          playbackRuns: [
            { purpose: "initial-listening", focus: "important-speaker" },
            {
              purpose: "no-difference-recovery",
              focus: "important-speaker",
              status: "completed",
            },
          ],
          noDifferenceRecoveries: [
            {
              comparisonId: "comparison-1",
              completedCount: 1,
              playback: "reference-then-simulated",
              focus: "important-speaker",
            },
          ],
        },
      },
    });

    expect(
      recordUserObservation(controller, {
        ...uncertainInput,
        requestId: "no-difference-after-replay",
        expectedRevision: controller.getSnapshot().webMcp.revision,
      }),
    ).toMatchObject({ ok: true, phase: "ready_for_adaptation" });
  });

  it("uses the same no-difference recovery gate for direct human observations", () => {
    const controller = atomicListeningController(false);
    listenBaseline(controller);
    const input = {
      focusedSpeech: "unsure" as const,
      maskingSources: ["unsure" as const],
      relativeToPrevious: "not_compared" as const,
      nextAction: "continue" as const,
    };
    expect(recordWebMcpHumanObservation(controller, input)).toMatchObject({
      ok: true,
      changed: false,
    });
    expect(
      completeWebMcpNoDifferenceRecovery(controller, "comparison-1"),
    ).toMatchObject({ ok: true, changed: true });
    expect(recordWebMcpHumanObservation(controller, input)).toMatchObject({
      ok: true,
      changed: true,
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

  it("projects the same adaptation source of truth to agent and direct page actions", () => {
    const agentController = baselineObservedController();
    const directController = baselineObservedController();
    const options = deriveValidAdaptationOptions(agentController.getSnapshot());
    expect(options.map((option) => [option.variable, option.value])).toEqual([
      ["television_state", "tv-off"],
      ["speaker_position", "closer-in-front"],
      ["support_mode", "left-one-sided"],
      ["support_mode", "bilateral"],
    ]);
    expect(getAuralisState(agentController)).toMatchObject({
      ok: true,
      phase: "ready_for_adaptation",
      data: {
        availableAdaptations: [
          { variable: "television_state", value: "tv-off" },
          { variable: "speaker_position", value: "closer-in-front" },
          { variable: "support_mode", value: "left-one-sided" },
          { variable: "support_mode", value: "bilateral" },
        ],
      },
    });

    const option = options[1]!;
    const agent = prepareAdaptation(
      agentController,
      "agent-parity",
      option.variable,
      option.value,
    );
    expect(agent.ok).toBe(true);
    expect(
      prepareWebMcpAdaptation(
        directController,
        option.variable,
        option.value,
      ),
    ).toMatchObject({ ok: true, changed: true });
    expect(
      agentController.getSnapshot().webMcp.session?.comparisons.at(-1),
    ).toEqual(
      directController.getSnapshot().webMcp.session?.comparisons.at(-1),
    );
  });

  it("keeps bilateral support after the smaller one-ear option", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(
        controller,
        "left-support-adaptation",
        "support_mode",
        "left-one-sided",
      ).ok,
    ).toBe(true);
    play(controller, "simulated");
    expect(
      observe(controller, "observe-left-support", "comparison-2", {
        relativeToPrevious: "better",
        nextAction: "continue",
      }).ok,
    ).toBe(true);

    expect(
      deriveValidAdaptationOptions(controller.getSnapshot()).map((option) => [
        option.variable,
        option.value,
      ]),
    ).toEqual([
      ["television_state", "tv-off"],
      ["speaker_position", "closer-in-front"],
      ["support_mode", "bilateral"],
    ]);
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
      phase: "complete",
      humanGate: null,
      data: { nextPhase: "complete" },
    });
  });

  it("resolves a pending wait as complete when the terminal observation commits", async () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(
        controller,
        "wait-complete-adaptation",
        "support_mode",
        "bilateral",
      ).ok,
    ).toBe(true);
    play(controller, "simulated");
    const before = controller.getSnapshot();
    const pending = waitForSessionChange(controller, {
      sessionId: SESSION_ID,
      afterRevision: before.webMcp.revision,
    });

    expect(
      observe(controller, "wait-complete-observation", "comparison-2", {
        relativeToPrevious: "better",
        nextAction: "summarize",
      }).ok,
    ).toBe(true);

    await expect(pending).resolves.toMatchObject({
      ok: true,
      phase: "complete",
      data: { reason: "complete", state: { summaryReady: true } },
    });
  });

  it("atomically completes with a system-attributed terminal event", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(controller, "support-adaptation", "support_mode", "bilateral").ok,
    ).toBe(true);
    play(controller, "simulated");
    const before = controller.getSnapshot().webMcp.revision;
    const result = observe(controller, "observe-2", "comparison-2", {
      relativeToPrevious: "better",
      nextAction: "summarize",
    });
    expect(result).toMatchObject({
      ok: true,
      phase: "complete",
      data: { nextPhase: "complete" },
    });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe("complete");
    expect(controller.getSnapshot().webMcp.revision).toBe(before + 1);
    expect(getAuralisState(controller)).toMatchObject({
      ok: true,
      allowedNextTools: ["get_auralis_state", "get_session_evidence"],
      humanGate: null,
      data: { summaryReady: true },
    });
    const evidence = getSessionEvidence(controller);
    expect(evidence).toMatchObject({
      ok: true,
      data: { evidence: { summaryReady: true, completionState: "complete" } },
    });
    if (!evidence.ok || !evidence.data.evidence) {
      throw new Error("Expected terminal evidence.");
    }
    expect(evidence.data.evidence.events.slice(-2)).toMatchObject([
      {
        action: "observation_recorded",
        actor: "agent",
        requestId: "observe-2",
        comparisonId: "comparison-2",
      },
      {
        action: "session_finished",
        actor: "system",
        requestId: "observe-2",
        comparisonId: "comparison-2",
      },
    ]);
    expect(evidence.data.evidence.events.at(-2)?.revision).toBe(
      evidence.data.evidence.events.at(-1)?.revision,
    );

    const replay = recordUserObservation(controller, {
      requestId: "observe-2",
      expectedRevision: before,
      comparisonId: "comparison-2",
      focusedSpeech: "partial",
      maskingSources: ["television"],
      relativeToPrevious: "better",
      nextAction: "summarize",
    });
    expect(replay).toMatchObject({ ok: true, replayed: true, phase: "complete" });
    expect(controller.getSnapshot().webMcp.revision).toBe(before + 1);
    expect(
      controller
        .getSnapshot()
        .webMcp.session?.events.filter((event) => event.action === "session_finished"),
    ).toHaveLength(1);
  });

  it("uses the same atomic terminal transition for a direct human observation", () => {
    const controller = baselineObservedController();
    expect(
      prepareAdaptation(
        controller,
        "human-summary-adaptation",
        "television_state",
        "tv-off",
      ).ok,
    ).toBe(true);
    play(controller, "simulated");
    const before = controller.getSnapshot().webMcp.revision;

    expect(
      recordWebMcpHumanObservation(controller, {
        focusedSpeech: "clear",
        maskingSources: ["none"],
        relativeToPrevious: "better",
        nextAction: "summarize",
      }),
    ).toMatchObject({ ok: true, changed: true });
    expect(deriveAuralisWebMcpPhase(controller.getSnapshot())).toBe("complete");
    expect(controller.getSnapshot().webMcp.revision).toBe(before + 1);
    expect(controller.getSnapshot().webMcp.session?.events.slice(-2)).toMatchObject([
      {
        actor: "human",
        action: "observation_recorded",
        requestId: null,
        comparisonId: "comparison-2",
      },
      {
        actor: "system",
        action: "session_finished",
        requestId: null,
        comparisonId: "comparison-2",
      },
    ]);
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
      action: "start",
      goal: "family-understanding",
    });
    expectError(delayed, "STALE_REVISION");
    const fresh = stage(controller, "generation-id", () => NEXT_SESSION_ID);
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
      stage(controller, "stage-after-reset", () => NEXT_SESSION_ID).ok,
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
