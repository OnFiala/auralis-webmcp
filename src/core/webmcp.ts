import type { ZodType } from "zod";
import {
  AURALIS_WEBMCP_CONTRACT_VERSION,
  AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION,
  AURALIS_WEBMCP_LIMITATION,
  AURALIS_WEBMCP_MAX_ADAPTATIONS,
  AURALIS_WEBMCP_MAX_PLAYBACK_RUNS_PER_COMPARISON,
  AURALIS_WEBMCP_MAX_REVISION,
  COMPARISON_IDS,
  MASKING_SOURCES,
  OBSERVATION_IDS,
  auralisToolResultSchema,
  getAuralisStateDataSchema,
  getSessionEvidenceDataSchema,
  prepareComparisonDataSchema,
  prepareComparisonInputSchema,
  playListeningComparisonDataSchema,
  playListeningComparisonInputSchema,
  recordUserObservationDataSchema,
  recordUserObservationInputSchema,
  stageDemoSessionDataSchema,
  stageDemoSessionInputSchema,
  type AuralisSettings,
  type AdaptationOptionProjection,
  type AuralisToolErrorCode,
  type AuralisToolName,
  type AuralisToolResult,
  type AuralisWebMcpPhase,
  type ComparisonProjection,
  type GetAuralisStateData,
  type GetSessionEvidenceData,
  type HumanGateProjection,
  type ListeningFocus,
  type ListeningPlayback,
  type ObservationProjection,
  type PrepareComparisonData,
  type PrepareComparisonInput,
  type PlayListeningComparisonData,
  type PlayListeningComparisonInput,
  type ProfileId,
  type ProfileProjection,
  type RecordUserObservationData,
  type RecordUserObservationInput,
  type SessionEvidenceEvent,
  type SessionEvidenceProjection,
  type StageDemoSessionData,
  type StageDemoSessionInput,
} from "../contracts/webmcp";
import {
  comparisonResultIdentity,
  experienceReducer,
  isPristineForAgentStage,
  type ExperienceAction,
  type ExperienceCommitResult,
  type ExperienceController,
  type ExperienceState,
  type WebMcpRequestRecord,
  type WebMcpPlaybackRun,
  type WebMcpSessionState,
} from "./experience";
import {
  ACTIVE_PREDEFINED_PROFILE_SET_VERSION,
  PREDEFINED_HEARING_PROFILES,
} from "./profile";
import { FAMILY_DINNER_SOURCE_ID } from "./source";

const CONTROL_CHANNELS = Object.freeze([
  "direct",
  "typed-agent",
  "voice-agent",
] as const);

const PROFILE_COPY: Readonly<
  Record<ProfileId, Readonly<{ everydayDescription: string; demonstrates: string }>>
> = Object.freeze({
  "high-frequency-hearing-loss": Object.freeze({
    everydayDescription:
      "Speech detail can become harder to follow when several people or household sounds overlap.",
    demonstrates:
      "How higher-frequency speech detail may be reduced in a busy family scene.",
  }),
  "flat-hearing-loss": Object.freeze({
    everydayDescription:
      "Sounds across the scene may feel consistently softer or less distinct.",
    demonstrates:
      "How a broad illustrative reduction can affect the whole family scene.",
  }),
  "asymmetric-hearing-loss": Object.freeze({
    everydayDescription:
      "A conversation may change depending on which side a speaker or competing sound comes from.",
    demonstrates:
      "How an illustrative left-right difference can affect spatial listening.",
  }),
});

export const AURALIS_PROFILE_PROJECTIONS: readonly ProfileProjection[] =
  Object.freeze(
    PREDEFINED_HEARING_PROFILES.map((profile) =>
      Object.freeze({
        profileId: profile.id,
        predefinedProfileSetVersion: profile.profileSetVersion,
        displayName: profile.displayName,
        classification: profile.classification,
        everydayDescription: PROFILE_COPY[profile.id].everydayDescription,
        demonstrates: PROFILE_COPY[profile.id].demonstrates,
        limitation: AURALIS_WEBMCP_LIMITATION,
      }),
    ),
  );

const ERROR_DETAILS: Readonly<
  Record<
    AuralisToolErrorCode,
    Readonly<{ message: string; retryable: boolean; recovery: string }>
  >
> = Object.freeze({
  INVALID_INPUT: Object.freeze({
    message: "The tool input does not match the strict Auralis contract.",
    retryable: false,
    recovery: "Correct the input and use a new requestId.",
  }),
  ABORTED: Object.freeze({
    message: "The request was aborted before the semantic commit.",
    retryable: true,
    recovery: "Read the current state, then retry with a new requestId.",
  }),
  STALE_REVISION: Object.freeze({
    message: "The expected revision is not the current document revision.",
    retryable: true,
    recovery: "Call get_auralis_state and retry from its revision.",
  }),
  REQUEST_ID_REUSE: Object.freeze({
    message: "The requestId was already used with a different tool or payload.",
    retryable: false,
    recovery: "Use a new requestId in the current session generation.",
  }),
  INVALID_PHASE: Object.freeze({
    message: "The requested semantic action is not available in the current phase.",
    retryable: false,
    recovery:
      "Read allowedNextTools and complete the current visible step; if human progress blocks agent entry, use the explicit visible Reset.",
  }),
  HUMAN_ACTION_REQUIRED: Object.freeze({
    message: "A visible human-authority action is required before this tool can continue.",
    retryable: false,
    recovery: "Ask the human and operate only the named visible control after approval.",
  }),
  AUDIO_BUSY: Object.freeze({
    message: "A source, render, or playback operation is currently active.",
    retryable: true,
    recovery: "Wait for the visible operation to settle or ask the human to stop it.",
  }),
  COMPARISON_MISMATCH: Object.freeze({
    message: "The observation does not identify the current unobserved comparison.",
    retryable: false,
    recovery: "Read the current comparison and never rewrite existing evidence.",
  }),
  ONE_VARIABLE_REQUIRED: Object.freeze({
    message: "An adaptation must change exactly its named variable.",
    retryable: false,
    recovery: "Submit one allowed variable and its matching value.",
  }),
  NO_EFFECT: Object.freeze({
    message: "The requested adaptation value is already active.",
    retryable: false,
    recovery: "Choose a different allowed value.",
  }),
  PLAYBACK_REQUIRED: Object.freeze({
    message: "Required visible human playback evidence is missing.",
    retryable: false,
    recovery: "Ask the human to listen with the visible playback controls.",
  }),
  REPLAY_REQUIRED: Object.freeze({
    message: "A focused replay is required before an unsure or no-difference observation can be finalized.",
    retryable: true,
    recovery:
      "Replay A then B with important-speaker focus, explain what to listen for, then ask again using everyday words.",
  }),
  PLAYBACK_LIMIT_REACHED: Object.freeze({
    message: "The bounded agent playback limit for this comparison was reached.",
    retryable: false,
    recovery:
      "Use the visible direct controls if another replay is needed, or record that the person remains unsure.",
  }),
  SESSION_LIMIT_REACHED: Object.freeze({
    message: "The two-adaptation session limit has been reached.",
    retryable: false,
    recovery: "Move to the evidence summary.",
  }),
  INTERNAL_ERROR: Object.freeze({
    message: "The semantic command failed closed.",
    retryable: false,
    recovery: "Preserve the state and inspect the local implementation.",
  }),
});

type ExecuteOptions = Readonly<{
  signal?: AbortSignal;
  createSessionId?: () => string;
  createRunId?: () => string;
}>;

type MutationDecision<T> =
  | Readonly<{ kind: "success"; next: ExperienceState; data: T }>
  | Readonly<{ kind: "replay"; data: T }>
  | Readonly<{ kind: "error"; code: AuralisToolErrorCode }>;

function profileProjection(profileId: ProfileId): ProfileProjection {
  const projection = AURALIS_PROFILE_PROJECTIONS.find(
    (candidate) => candidate.profileId === profileId,
  );
  if (!projection) {
    throw new Error("Unknown profile projection.");
  }
  return projection;
}

function currentComparison(
  state: ExperienceState,
): ComparisonProjection | null {
  return state.webMcp.session?.comparisons.at(-1) ?? null;
}

function adaptationsUsed(state: ExperienceState): 0 | 1 | 2 {
  const count =
    state.webMcp.session?.comparisons.filter(
      (comparison) => comparison.kind === "adaptation",
    ).length ?? 0;
  return count === 0 ? 0 : count === 1 ? 1 : 2;
}

export function deriveValidAdaptationOptions(
  state: ExperienceState,
): readonly AdaptationOptionProjection[] {
  if (
    deriveAuralisWebMcpPhase(state) !== "ready_for_adaptation" ||
    adaptationsUsed(state) >= AURALIS_WEBMCP_MAX_ADAPTATIONS
  ) {
    return Object.freeze([]);
  }

  const options: AdaptationOptionProjection[] = [];
  if (state.interventionState !== "tv-off") {
    options.push(
      Object.freeze({
        variable: "television_state" as const,
        value: "tv-off" as const,
        label: "Turn the television off",
        explanation:
          "Remove only the television contribution while the people and timing stay unchanged.",
        listenFor:
          "Listen for the central voice without the television competing underneath.",
      }),
    );
  }
  if (state.speakerPositionState !== "closer-in-front") {
    options.push(
      Object.freeze({
        variable: "speaker_position" as const,
        value: "closer-in-front" as const,
        label: "Move the speaker closer",
        explanation:
          "Change only the important speaker's bounded illustrative position in B.",
        listenFor:
          "Listen for the central voice separating more clearly from the group.",
      }),
    );
  }
  if (state.supportMode === "none") {
    options.push(
      Object.freeze({
        variable: "support_mode" as const,
        value: "left-one-sided" as const,
        label: "Add left-ear illustrative support",
        explanation:
          "Apply bounded illustrative support to the left ear only in B.",
        listenFor:
          "Listen for a smaller one-ear change before trying both sides.",
      }),
    );
  }
  if (state.supportMode !== "bilateral") {
    options.push(
      Object.freeze({
        variable: "support_mode" as const,
        value: "bilateral" as const,
        label: "Add bilateral illustrative support",
        explanation:
          "Apply the same bounded illustrative support to both ears in B.",
        listenFor:
          "Listen for clearer consonants against the other voices.",
      }),
    );
  }

  return Object.freeze(options);
}

const LISTENING_GUIDANCE = Object.freeze({
  playbackTool: "play_listening_comparison" as const,
  focusOptions: Object.freeze([
    "important-speaker",
    "overall-scene",
  ] as const),
  askForObservation:
    "After playback, ask the person what they noticed in their own everyday words.",
  translateEverydayLanguage:
    "Translate only the person's stated meaning into the bounded observation fields. Never ask them to name internal enum values and never infer a diagnosis.",
  noDifferenceRecovery:
    "If the person reports no clear difference, do not finalize an observation yet. Replay A then B with important-speaker focus, explain what to listen for, and ask again.",
});

function availableListeningPlaybacks(
  phase: AuralisWebMcpPhase,
): readonly ListeningPlayback[] {
  return phase === "awaiting_baseline_listening" ||
    phase === "awaiting_baseline_observation" ||
    phase === "awaiting_comparison_listening" ||
    phase === "awaiting_comparison_observation"
    ? Object.freeze([
        "reference",
        "simulated",
        "reference-then-simulated",
      ] as const)
    : Object.freeze([]);
}

function requiredPlaybackComplete(comparison: ComparisonProjection): boolean {
  return comparison.requiredPlaybackModes.every((mode) =>
    comparison.heardPlaybackModes.includes(mode),
  );
}

export function deriveAuralisWebMcpPhase(
  state: ExperienceState,
): AuralisWebMcpPhase {
  const session = state.webMcp.session;
  if (!session) return "awaiting_session_stage";
  if (session.completionState === "complete") return "complete";
  if (!session.consentConfirmed) return "awaiting_consent";
  if (!session.confirmedProfileId) return "awaiting_profile_selection";
  if (state.source.status !== "ready") return "awaiting_scene_load";
  if (!state.lowVolumeAcknowledged) return "awaiting_volume_acknowledgement";

  const comparison = currentComparison(state);
  if (!comparison) return "ready_for_baseline";
  if (comparison.observationId) return "ready_for_adaptation";

  if (!requiredPlaybackComplete(comparison) || state.playback.status === "playing") {
    return comparison.kind === "baseline"
      ? "awaiting_baseline_listening"
      : "awaiting_comparison_listening";
  }
  return comparison.kind === "baseline"
    ? "awaiting_baseline_observation"
    : "awaiting_comparison_observation";
}

function humanGateForPhase(
  phase: AuralisWebMcpPhase,
): HumanGateProjection | null {
  const instructions: Partial<Record<AuralisWebMcpPhase, readonly [HumanGateProjection["kind"], string]>> = {
    awaiting_consent: [
      "confirm_consent",
      "Explain the illustrative purpose and limitation, then wait for explicit human consent. Do not use Computer Use preemptively; the person may use the visible control directly or explicitly direct the agent by text or voice.",
    ],
    awaiting_volume_acknowledgement: [
      "acknowledge_comfortable_volume",
      "Wait until the human states that physical listening volume is comfortable. Do not use Computer Use preemptively; the person may use the visible acknowledgement directly or explicitly direct the agent by text or voice.",
    ],
  };
  const instruction = instructions[phase];
  return instruction
    ? Object.freeze({
        kind: instruction[0],
        instruction: instruction[1],
        authority: "human-required" as const,
        controlChannels: CONTROL_CHANNELS,
      })
    : null;
}

function stageDemoSessionActionForState(
  state: ExperienceState,
): "start" | "select-profile" | null {
  const phase = deriveAuralisWebMcpPhase(state);
  if (phase === "awaiting_session_stage" && isPristineForAgentStage(state)) {
    return "start";
  }
  if (
    phase === "awaiting_profile_selection" &&
    state.webMcp.session?.stageCount === 1
  ) {
    return "select-profile";
  }
  return null;
}

function allowedNextToolsForState(
  state: ExperienceState,
): readonly AuralisToolName[] {
  const phase = deriveAuralisWebMcpPhase(state);
  const always: AuralisToolName[] = [
    "get_auralis_state",
    "get_session_evidence",
  ];
  if (stageDemoSessionActionForState(state) !== null) {
    always.push("stage_demo_session");
  } else if (phase === "ready_for_baseline" || phase === "ready_for_adaptation") {
    always.push("prepare_comparison");
  }
  if (
    phase === "awaiting_baseline_listening" ||
    phase === "awaiting_baseline_observation" ||
    phase === "awaiting_comparison_listening" ||
    phase === "awaiting_comparison_observation"
  ) {
    always.push("play_listening_comparison");
  }
  if (
    phase === "awaiting_baseline_observation" ||
    phase === "awaiting_comparison_observation"
  ) {
    always.push("record_user_observation");
  }
  return Object.freeze(always);
}

function toolContext(state: ExperienceState) {
  const phase = deriveAuralisWebMcpPhase(state);
  return Object.freeze({
    revision: state.webMcp.revision,
    phase,
    sessionId: state.webMcp.session?.sessionId ?? null,
    allowedNextTools: allowedNextToolsForState(state),
    humanGate: humanGateForPhase(phase),
  });
}

function successResult<T>(
  tool: AuralisToolName,
  requestId: string | null,
  state: ExperienceState,
  data: T,
  replayed = false,
): AuralisToolResult<T> {
  return Object.freeze({
    contractVersion: AURALIS_WEBMCP_CONTRACT_VERSION,
    ok: true as const,
    tool,
    requestId,
    ...toolContext(state),
    replayed,
    data,
    error: null,
  });
}

function errorResult<T>(
  tool: AuralisToolName,
  requestId: string | null,
  state: ExperienceState,
  code: AuralisToolErrorCode,
): AuralisToolResult<T> {
  return Object.freeze({
    contractVersion: AURALIS_WEBMCP_CONTRACT_VERSION,
    ok: false as const,
    tool,
    requestId,
    ...toolContext(state),
    replayed: false as const,
    data: null,
    error: Object.freeze({ code, ...ERROR_DETAILS[code] }),
  });
}

function validateResult<T>(
  tool: AuralisToolName,
  requestId: string | null,
  state: ExperienceState,
  dataSchema: ZodType,
  result: AuralisToolResult<T>,
): AuralisToolResult<T> {
  const parsed = auralisToolResultSchema(dataSchema).safeParse(result);
  return parsed.success
    ? result
    : errorResult(tool, requestId, state, "INTERNAL_ERROR");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function canonicalInput(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function canonicalObservationInput(
  input: RecordUserObservationInput,
): RecordUserObservationInput {
  const order = new Map(MASKING_SOURCES.map((source, index) => [source, index]));
  return Object.freeze({
    ...input,
    maskingSources: [...input.maskingSources].sort(
      (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0),
    ),
  });
}

function sanitizedIdentity(input: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0;
  }
  return `auralis-result-v1-${first.toString(16).padStart(8, "0")}${second
    .toString(16)
    .padStart(8, "0")}`;
}

function sessionId(): string {
  return `session-${globalThis.crypto.randomUUID().toLowerCase()}`;
}

function playbackRunId(): string {
  return `playback-${globalThis.crypto.randomUUID().toLowerCase()}`;
}

function audioBusy(state: ExperienceState): boolean {
  return (
    state.source.status === "loading" ||
    state.playback.status === "playing" ||
    state.renders.reference.status === "rendering" ||
    state.renders.simulated.status === "rendering"
  );
}

function committedToolState(
  previous: ExperienceState,
  next: ExperienceState,
  requestId: string,
): boolean {
  return (
    next.webMcp.revision === previous.webMcp.revision + 1 &&
    next.webMcp.revision <= AURALIS_WEBMCP_MAX_REVISION &&
    next.failure === null &&
    next.webMcp.requestRecords.some((record) => record.requestId === requestId)
  );
}

function existingRequestDecision<T>(
  state: ExperienceState,
  tool: AuralisToolName,
  requestId: string,
  canonical: string,
): MutationDecision<T> | null {
  const existing = state.webMcp.requestRecords.find(
    (record) => record.requestId === requestId,
  );
  if (!existing) return null;
  if (existing.tool !== tool || existing.canonicalInput !== canonical) {
    return Object.freeze({ kind: "error", code: "REQUEST_ID_REUSE" });
  }
  if (tool === "play_listening_comparison") {
    const run = state.webMcp.session?.playbackRuns.find(
      (candidate) => candidate.requestId === requestId,
    );
    const original = existing.data as PlayListeningComparisonData;
    if (!run || original.runId !== run.runId) {
      return Object.freeze({ kind: "error", code: "INTERNAL_ERROR" });
    }
    return Object.freeze({
      kind: "replay",
      data: Object.freeze({
        ...original,
        status: run.status,
      }) as T,
    });
  }
  return Object.freeze({ kind: "replay", data: existing.data as T });
}

function agentEvent(
  session: WebMcpSessionState | null,
  revision: number,
  action: SessionEvidenceEvent["action"],
  requestId: string,
  comparisonId: ComparisonProjection["comparisonId"] | null = null,
  runId: SessionEvidenceEvent["runId"] = null,
): SessionEvidenceEvent {
  return Object.freeze({
    sequence: (session?.events.length ?? 0) + 1,
    revision,
    actor: "agent" as const,
    action,
    requestId,
    comparisonId,
    runId,
  });
}

function humanEvent(
  state: ExperienceState,
  action: SessionEvidenceEvent["action"],
  comparisonId: ComparisonProjection["comparisonId"] | null = null,
  actor: SessionEvidenceEvent["actor"] = "human",
  runId: SessionEvidenceEvent["runId"] = null,
): SessionEvidenceEvent | null {
  const session = state.webMcp.session;
  return session
    ? Object.freeze({
        sequence: session.events.length + 1,
        revision: state.webMcp.revision + 1,
        actor,
        action,
        requestId: null,
        comparisonId,
        runId,
      })
    : null;
}

function automaticCompletionEvent(
  observationEvent: SessionEvidenceEvent,
): SessionEvidenceEvent {
  return Object.freeze({
    sequence: observationEvent.sequence + 1,
    revision: observationEvent.revision,
    actor: "system" as const,
    action: "session_finished" as const,
    requestId: observationEvent.requestId,
    comparisonId: observationEvent.comparisonId,
    runId: null,
  });
}

function executeMutation<I extends { requestId: string; expectedRevision: number }, T>(
  controller: ExperienceController,
  tool: AuralisToolName,
  input: I,
  canonical: string,
  dataSchema: ZodType,
  options: ExecuteOptions,
  decide: (state: ExperienceState) => MutationDecision<T>,
): AuralisToolResult<T> {
  const outcome: { decision?: MutationDecision<T> } = {};
  const commit = controller.commit((state) => {
    const existing = existingRequestDecision<T>(
      state,
      tool,
      input.requestId,
      canonical,
    );
    if (existing) {
      outcome.decision = existing;
      return state;
    }
    if (input.expectedRevision !== state.webMcp.revision) {
      outcome.decision = Object.freeze({ kind: "error", code: "STALE_REVISION" });
      return state;
    }
    if (options.signal?.aborted) {
      outcome.decision = Object.freeze({ kind: "error", code: "ABORTED" });
      return state;
    }
    outcome.decision = decide(state);
    if (outcome.decision.kind !== "success") return state;

    const preview = successResult(
      tool,
      input.requestId,
      outcome.decision.next,
      outcome.decision.data,
    );
    if (!auralisToolResultSchema(dataSchema).safeParse(preview).success) {
      outcome.decision = Object.freeze({ kind: "error", code: "INTERNAL_ERROR" });
      return state;
    }
    return outcome.decision.next;
  });

  const snapshot = controller.getSnapshot();
  const decision = outcome.decision;
  if (!commit.ok || !decision) {
    return errorResult(tool, input.requestId, snapshot, "INTERNAL_ERROR");
  }
  if (decision.kind === "error") {
    return errorResult(tool, input.requestId, snapshot, decision.code);
  }
  const result = successResult(
    tool,
    input.requestId,
    snapshot,
    decision.data,
    decision.kind === "replay",
  );
  return validateResult(tool, input.requestId, snapshot, dataSchema, result);
}

function getStateData(state: ExperienceState): GetAuralisStateData {
  const session = state.webMcp.session;
  const sourceStatus = state.source.status;
  const phase = deriveAuralisWebMcpPhase(state);
  const stageDemoSessionAction = stageDemoSessionActionForState(state);
  const activeRun =
    session?.playbackRuns.find(
      (
        run,
      ): run is WebMcpPlaybackRun & { status: "starting" | "started" } =>
        run.status === "starting" || run.status === "started",
    ) ?? null;
  return Object.freeze({
    capabilities: Object.freeze({
      maxAdaptiveComparisons: 2 as const,
      profileMode: "synthetic-predefined-only" as const,
      agenticEntry: "agent-origin-only" as const,
      agenticActivationTool:
        stageDemoSessionAction === "start"
          ? ("stage_demo_session" as const)
          : null,
      stageDemoSessionAction,
      preferredAgentControl: "webmcp-first" as const,
      computerUseFallback: "human-gate-or-no-matching-tool" as const,
      predefinedProfileSetVersion: ACTIVE_PREDEFINED_PROFILE_SET_VERSION,
      audioControl: "agent-start-or-direct-human-stop" as const,
      controlChannels: CONTROL_CHANNELS,
    }),
    availableProfiles: AURALIS_PROFILE_PROJECTIONS,
    session: Object.freeze({
      goal: session?.goal ?? null,
      stagedProfileId: session?.stagedProfileId ?? null,
      confirmedProfileId: session?.confirmedProfileId ?? null,
      adaptationsUsed: adaptationsUsed(state),
      presentation: session ? ("agent-guided" as const) : ("human-landing" as const),
      stageCount: session?.stageCount ?? (0 as const),
      lastEvent: session?.events.at(-1) ?? null,
    }),
    currentComparison: currentComparison(state),
    availableAdaptations: deriveValidAdaptationOptions(state),
    listeningGuidance: Object.freeze({
      ...LISTENING_GUIDANCE,
      availablePlaybacks: availableListeningPlaybacks(phase),
    }),
    audio: Object.freeze({
      sourceStatus,
      comfortableVolumeAcknowledged: state.lowVolumeAcknowledged,
      agentPlaybackGranted: state.agentPlaybackGranted,
      playbackStatus: state.playback.status,
      activeRun: activeRun
        ? Object.freeze({
            runId: activeRun.runId,
            requestId: activeRun.requestId,
            comparisonId: activeRun.comparisonId,
            playback: activeRun.playback,
            focus: activeRun.focus,
            sequence: activeRun.sequence,
            completedModes: activeRun.completedModes,
            status: activeRun.status,
          })
        : null,
    }),
    summaryReady: session ? session.completionState !== "active" : false,
    limitation: AURALIS_WEBMCP_LIMITATION,
  });
}

function getEvidenceData(state: ExperienceState): GetSessionEvidenceData {
  const session = state.webMcp.session;
  if (!session) return Object.freeze({ evidence: null });
  const evidence: SessionEvidenceProjection = Object.freeze({
    schemaVersion: AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION,
    contractVersion: AURALIS_WEBMCP_CONTRACT_VERSION,
    sessionId: session.sessionId,
    goal: session.goal,
    profile: session.confirmedProfileId
      ? profileProjection(session.confirmedProfileId)
      : null,
    comparisons: session.comparisons,
    observations: session.observations,
    playbackRuns: Object.freeze(
      session.playbackRuns.map((run) =>
        Object.freeze({
          runId: run.runId,
          requestId: run.requestId,
          comparisonId: run.comparisonId,
          playback: run.playback,
          focus: run.focus,
          purpose: run.purpose,
          completedModes: run.completedModes,
          status: run.status,
        }),
      ),
    ),
    noDifferenceRecoveries: Object.freeze(
      session.noDifferenceRecoveries.map((recovery) =>
        Object.freeze({
          comparisonId: recovery.comparisonId,
          completedCount: recovery.completedCount,
          playback: "reference-then-simulated" as const,
          focus: "important-speaker" as const,
        }),
      ),
    ),
    events: session.events,
    summaryReady: session.completionState !== "active",
    completionState: session.completionState,
    limitation: AURALIS_WEBMCP_LIMITATION,
  });
  return Object.freeze({ evidence });
}

export function getAuralisState(
  controller: ExperienceController,
  input: unknown = {},
): AuralisToolResult<GetAuralisStateData> {
  const parsed = getAuralisStateDataSchema.safeParse(getStateData(controller.getSnapshot()));
  const emptyInput =
    input !== null && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0;
  if (!emptyInput || !parsed.success) {
    return errorResult(
      "get_auralis_state",
      null,
      controller.getSnapshot(),
      emptyInput ? "INTERNAL_ERROR" : "INVALID_INPUT",
    );
  }
  const result = successResult(
    "get_auralis_state",
    null,
    controller.getSnapshot(),
    parsed.data,
  );
  return validateResult(
    "get_auralis_state",
    null,
    controller.getSnapshot(),
    getAuralisStateDataSchema,
    result,
  );
}

export function getSessionEvidence(
  controller: ExperienceController,
  input: unknown = {},
): AuralisToolResult<GetSessionEvidenceData> {
  const emptyInput =
    input !== null && typeof input === "object" && !Array.isArray(input) && Object.keys(input).length === 0;
  if (!emptyInput) {
    return errorResult(
      "get_session_evidence",
      null,
      controller.getSnapshot(),
      "INVALID_INPUT",
    );
  }
  const data = getEvidenceData(controller.getSnapshot());
  const result = successResult(
    "get_session_evidence",
    null,
    controller.getSnapshot(),
    data,
  );
  return validateResult(
    "get_session_evidence",
    null,
    controller.getSnapshot(),
    getSessionEvidenceDataSchema,
    result,
  );
}

export function stageDemoSession(
  controller: ExperienceController,
  rawInput: unknown,
  options: ExecuteOptions = {},
): AuralisToolResult<StageDemoSessionData> {
  const parsed = stageDemoSessionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(
      "stage_demo_session",
      null,
      controller.getSnapshot(),
      "INVALID_INPUT",
    );
  }
  const input: StageDemoSessionInput = parsed.data;
  const canonical = canonicalInput(input);
  return executeMutation(
    controller,
    "stage_demo_session",
    input,
    canonical,
    stageDemoSessionDataSchema,
    options,
    (state) => {
      const phase = deriveAuralisWebMcpPhase(state);
      const currentSession = state.webMcp.session;
      const firstStage =
        input.action === "start" && phase === "awaiting_session_stage";
      const profileSelection =
        input.action === "select-profile" &&
        phase === "awaiting_profile_selection" &&
        currentSession?.stageCount === 1 &&
        currentSession.confirmedProfileId === null;
      if (!firstStage && !profileSelection) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (firstStage && !isPristineForAgentStage(state)) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (audioBusy(state)) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      const data: StageDemoSessionData = Object.freeze({
        operation: firstStage ? ("started" as const) : ("profile-selected" as const),
        stagedProfile:
          input.action === "select-profile"
            ? profileProjection(input.profileId)
            : null,
        agenticPresentation: "active" as const,
        pendingConsent: firstStage,
        pendingProfileSelection: firstStage,
      });
      const record: WebMcpRequestRecord = Object.freeze({
        requestId: input.requestId,
        tool: "stage_demo_session",
        canonicalInput: canonical,
        data,
      });
      const next = firstStage
        ? experienceReducer(state, {
            type: "webmcp-session-staged",
            sessionId: (options.createSessionId ?? sessionId)(),
            requestRecord: record,
            event: agentEvent(
              null,
              state.webMcp.revision + 1,
              "session_staged",
              input.requestId,
            ),
          })
        : input.action === "select-profile"
          ? experienceReducer(state, {
            type: "webmcp-agent-profile-selected",
            profileId: input.profileId,
            sourceIdentity: FAMILY_DINNER_SOURCE_ID,
            requestRecord: record,
            event: agentEvent(
              currentSession,
              state.webMcp.revision + 1,
              "profile_confirmed",
              input.requestId,
            ),
          })
          : state;
      return !committedToolState(state, next, input.requestId)
        ? Object.freeze({ kind: "error", code: "INTERNAL_ERROR" })
        : Object.freeze({ kind: "success", next, data });
    },
  );
}

function settingsForComparison(
  state: ExperienceState,
  input: PrepareComparisonInput,
): AuralisSettings | null {
  if (input.kind === "baseline") {
    return Object.freeze({
      supportMode: "none" as const,
      televisionState: "tv-on" as const,
      speakerPosition: "original-position" as const,
    });
  }
  const previous = currentComparison(state);
  if (!previous) return null;
  return Object.freeze({
    ...previous.settings,
    ...(input.variable === "support_mode" ? { supportMode: input.value } : {}),
    ...(input.variable === "television_state"
      ? { televisionState: input.value }
      : {}),
    ...(input.variable === "speaker_position"
      ? { speakerPosition: input.value }
      : {}),
  });
}

function createComparisonProjection(
  state: ExperienceState,
  input: PrepareComparisonInput,
  settings: AuralisSettings,
): ComparisonProjection | null {
  const session = state.webMcp.session;
  if (!session || !state.comparisonPlan) return null;
  const sequence = session.comparisons.length + 1;
  if (sequence < 1 || sequence > 3) return null;
  const preview: ExperienceState = Object.freeze({
    ...state,
    supportMode: settings.supportMode,
    interventionState: settings.televisionState,
    speakerPositionState: settings.speakerPosition,
  });
  const reference = comparisonResultIdentity(preview, "reference");
  const simulated = comparisonResultIdentity(preview, "simulated");
  if (!reference || !simulated) return null;
  const previous = currentComparison(state);
  return Object.freeze({
    comparisonId: COMPARISON_IDS[sequence - 1]!,
    sequence: sequence as 1 | 2 | 3,
    kind: input.kind,
    previousComparisonId: previous?.comparisonId ?? null,
    changedVariable: input.kind === "adaptation" ? input.variable : null,
    settings,
    referenceResultIdentity: sanitizedIdentity(reference),
    simulatedResultIdentity: sanitizedIdentity(simulated),
    requiredPlaybackModes: Object.freeze(
      input.kind === "baseline"
        ? (["reference", "simulated"] as const)
        : (["simulated"] as const),
    ),
    heardPlaybackModes: Object.freeze([]),
    observationId: null,
  });
}

export function confirmWebMcpListeningReadiness(
  controller: ExperienceController,
  agentPlaybackGranted: boolean,
): ExperienceCommitResult {
  return controller.commit((state) => {
    if (
      deriveAuralisWebMcpPhase(state) !== "awaiting_volume_acknowledgement" ||
      audioBusy(state) ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    const session = state.webMcp.session;
    const settings = settingsForComparison(state, {
      requestId: "system-baseline-preview",
      expectedRevision: state.webMcp.revision,
      kind: "baseline",
    });
    const comparison = settings
      ? createComparisonProjection(
          state,
          {
            requestId: "system-baseline-preview",
            expectedRevision: state.webMcp.revision,
            kind: "baseline",
          },
          settings,
        )
      : null;
    const volumeEvent = humanEvent(state, "volume_acknowledged");
    if (!session || !comparison || !volumeEvent) return state;
    const comparisonEvent: SessionEvidenceEvent = Object.freeze({
      sequence: volumeEvent.sequence + 1,
      revision: volumeEvent.revision,
      actor: "system" as const,
      action: "comparison_prepared" as const,
      requestId: null,
      comparisonId: comparison.comparisonId,
      runId: null,
    });

    return experienceReducer(state, {
      type: "webmcp-human-listening-readiness-confirmed",
      agentPlaybackGranted,
      comparison,
      volumeEvent,
      comparisonEvent,
    });
  });
}

export function prepareWebMcpAdaptation(
  controller: ExperienceController,
  variable: "support_mode" | "television_state" | "speaker_position",
  value:
    | "none"
    | "left-one-sided"
    | "bilateral"
    | "tv-on"
    | "tv-off"
    | "original-position"
    | "closer-in-front",
): ExperienceCommitResult {
  return commitHumanAction(controller, "ready_for_adaptation", (state) => {
    const option = deriveValidAdaptationOptions(state).find(
      (candidate) => candidate.variable === variable && candidate.value === value,
    );
    if (!option) return null;
    const input = {
      requestId: "human-adaptation-preview",
      expectedRevision: state.webMcp.revision,
      kind: "adaptation" as const,
      variable,
      value,
    } as PrepareComparisonInput;
    const settings = settingsForComparison(state, input);
    const comparison = settings
      ? createComparisonProjection(state, input, settings)
      : null;
    const event = comparison
      ? humanEvent(state, "comparison_prepared", comparison.comparisonId)
      : null;
    return comparison && event
      ? {
          type: "webmcp-comparison-prepared",
          comparison,
          requestRecord: null,
          event,
        }
      : null;
  });
}

export function prepareWebMcpBaselineRecovery(
  controller: ExperienceController,
): ExperienceCommitResult {
  return commitHumanAction(controller, "ready_for_baseline", (state) => {
    const input: PrepareComparisonInput = {
      requestId: "human-baseline-recovery-preview",
      expectedRevision: state.webMcp.revision,
      kind: "baseline",
    };
    const settings = settingsForComparison(state, input);
    const comparison = settings
      ? createComparisonProjection(state, input, settings)
      : null;
    const event = comparison
      ? humanEvent(state, "comparison_prepared", comparison.comparisonId)
      : null;
    return comparison && event
      ? {
          type: "webmcp-comparison-prepared",
          comparison,
          requestRecord: null,
          event,
        }
      : null;
  });
}

export function prepareComparison(
  controller: ExperienceController,
  rawInput: unknown,
  options: ExecuteOptions = {},
): AuralisToolResult<PrepareComparisonData> {
  const parsed = prepareComparisonInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(
      "prepare_comparison",
      null,
      controller.getSnapshot(),
      "INVALID_INPUT",
    );
  }
  const input = parsed.data;
  const canonical = canonicalInput(input);
  return executeMutation(
    controller,
    "prepare_comparison",
    input,
    canonical,
    prepareComparisonDataSchema,
    options,
    (state) => {
      const expectedPhase =
        input.kind === "baseline" ? "ready_for_baseline" : "ready_for_adaptation";
      if (deriveAuralisWebMcpPhase(state) !== expectedPhase) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (audioBusy(state)) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      const session = state.webMcp.session;
      if (!session?.consentConfirmed || !session.confirmedProfileId) {
        return Object.freeze({ kind: "error", code: "HUMAN_ACTION_REQUIRED" });
      }
      if (input.kind === "adaptation" && adaptationsUsed(state) >= AURALIS_WEBMCP_MAX_ADAPTATIONS) {
        return Object.freeze({ kind: "error", code: "SESSION_LIMIT_REACHED" });
      }
      const settings = settingsForComparison(state, input);
      if (!settings) {
        return Object.freeze({ kind: "error", code: "ONE_VARIABLE_REQUIRED" });
      }
      if (input.kind === "adaptation") {
        const previous = currentComparison(state);
        if (!previous) {
          return Object.freeze({ kind: "error", code: "ONE_VARIABLE_REQUIRED" });
        }
        const key =
          input.variable === "support_mode"
            ? "supportMode"
            : input.variable === "television_state"
              ? "televisionState"
              : "speakerPosition";
        if (settings[key] === previous.settings[key]) {
          return Object.freeze({ kind: "error", code: "NO_EFFECT" });
        }
        const changed = (Object.keys(settings) as (keyof AuralisSettings)[]).filter(
          (candidate) => settings[candidate] !== previous.settings[candidate],
        );
        if (changed.length !== 1 || changed[0] !== key) {
          return Object.freeze({ kind: "error", code: "ONE_VARIABLE_REQUIRED" });
        }
        const allowed = deriveValidAdaptationOptions(state).some(
          (option) =>
            option.variable === input.variable && option.value === input.value,
        );
        if (!allowed) {
          return Object.freeze({ kind: "error", code: "ONE_VARIABLE_REQUIRED" });
        }
      }
      const comparison = createComparisonProjection(state, input, settings);
      if (!comparison) {
        return Object.freeze({ kind: "error", code: "INTERNAL_ERROR" });
      }
      const data: PrepareComparisonData = Object.freeze({ comparison });
      const record: WebMcpRequestRecord = Object.freeze({
        requestId: input.requestId,
        tool: "prepare_comparison",
        canonicalInput: canonical,
        data,
      });
      const next = experienceReducer(state, {
        type: "webmcp-comparison-prepared",
        comparison,
        requestRecord: record,
        event: agentEvent(
          session,
          state.webMcp.revision + 1,
          "comparison_prepared",
          input.requestId,
          comparison.comparisonId,
        ),
      });
      return !committedToolState(state, next, input.requestId)
        ? Object.freeze({ kind: "error", code: "INTERNAL_ERROR" })
        : Object.freeze({ kind: "success", next, data });
    },
  );
}

function listeningSequence(
  playback: ListeningPlayback,
): readonly ("reference" | "simulated")[] {
  return playback === "reference-then-simulated"
    ? Object.freeze(["reference", "simulated"] as const)
    : Object.freeze([
        playback === "reference" ? ("reference" as const) : ("simulated" as const),
      ]);
}

function listeningNarration(
  state: ExperienceState,
  input: PlayListeningComparisonInput,
) {
  const comparison = currentComparison(state);
  const focus =
    input.focus === "important-speaker"
      ? "Focus on the important speaker at the center of the conversation, especially the edges of words and consonants."
      : "Take in the whole scene and notice which voices or household sounds compete for your attention.";
  const simulatedContext = comparison?.kind === "baseline"
    ? "B keeps the television on, the speaker in the original position, and adds no support; only the synthetic listening profile changes."
    : `B uses ${comparison?.settings.supportMode.replaceAll("-", " ")}, ${comparison?.settings.televisionState.replaceAll("-", " ")}, and ${comparison?.settings.speakerPosition.replaceAll("-", " ")}.`;
  const now =
    input.playback === "reference"
      ? `Playing A, the validated source reference. ${focus}`
      : input.playback === "simulated"
        ? `Playing B, the current synthetic illustrative result. ${simulatedContext} ${focus}`
        : `Playing A first, then B from the same eight-second moment. ${focus}`;
  const next =
    input.playback === "reference-then-simulated"
      ? `A has ended. B follows automatically. ${simulatedContext}`
      : null;
  return Object.freeze({
    now,
    next,
    after:
      "Playback has ended. Ask the person what they noticed in their own everyday words; do not ask for enum names.",
    noDifferenceRecovery:
      "If they heard no clear difference, acknowledge that answer, replay A then B with important-speaker focus, and ask them to listen for the central voice against the television and overlapping speech.",
  });
}

export function playListeningComparison(
  controller: ExperienceController,
  rawInput: unknown,
  options: ExecuteOptions = {},
): AuralisToolResult<PlayListeningComparisonData> {
  const parsed = playListeningComparisonInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(
      "play_listening_comparison",
      null,
      controller.getSnapshot(),
      "INVALID_INPUT",
    );
  }
  const input = parsed.data;
  const canonical = canonicalInput(input);
  return executeMutation(
    controller,
    "play_listening_comparison",
    input,
    canonical,
    playListeningComparisonDataSchema,
    options,
    (state) => {
      const phase = deriveAuralisWebMcpPhase(state);
      if (!availableListeningPlaybacks(phase).includes(input.playback)) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (!state.agentPlaybackGranted) {
        return Object.freeze({ kind: "error", code: "HUMAN_ACTION_REQUIRED" });
      }
      if (audioBusy(state)) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      const session = state.webMcp.session;
      const comparison = currentComparison(state);
      if (!session || !comparison || comparison.comparisonId !== input.comparisonId) {
        return Object.freeze({ kind: "error", code: "COMPARISON_MISMATCH" });
      }
      if (
        session.playbackRuns.some(
          (run) => run.status === "starting" || run.status === "started",
        )
      ) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      if (
        session.playbackRuns.filter(
          (run) => run.comparisonId === comparison.comparisonId,
        ).length >= AURALIS_WEBMCP_MAX_PLAYBACK_RUNS_PER_COMPARISON
      ) {
        return Object.freeze({ kind: "error", code: "PLAYBACK_LIMIT_REACHED" });
      }

      const runId = (options.createRunId ?? playbackRunId)();
      const sequence = listeningSequence(input.playback);
      const narration = listeningNarration(state, input);
      const data: PlayListeningComparisonData = Object.freeze({
        runId,
        comparisonId: input.comparisonId,
        playback: input.playback,
        sequence,
        focus: input.focus,
        clipWindow: Object.freeze({
          startSeconds: 32.3 as const,
          durationSeconds: 8 as const,
        }),
        status: "starting" as const,
        narration,
      });
      const run: WebMcpPlaybackRun = Object.freeze({
        runId,
        requestId: input.requestId,
        canonicalInput: canonical,
        comparisonId: input.comparisonId,
        playback: input.playback,
        focus: input.focus,
        purpose:
          requiredPlaybackComplete(comparison) &&
          input.playback === "reference-then-simulated" &&
          input.focus === "important-speaker"
            ? ("no-difference-recovery" as const)
            : ("initial-listening" as const),
        sequence,
        completedModes: Object.freeze([]),
        status: "starting" as const,
      });
      const record: WebMcpRequestRecord = Object.freeze({
        requestId: input.requestId,
        tool: "play_listening_comparison",
        canonicalInput: canonical,
        data,
      });
      const next = experienceReducer(state, {
        type: "webmcp-agent-playback-reserved",
        run,
        requestRecord: record,
        event: agentEvent(
          session,
          state.webMcp.revision + 1,
          "playback_requested",
          input.requestId,
          comparison.comparisonId,
          runId,
        ),
      });
      return !committedToolState(state, next, input.requestId)
        ? Object.freeze({ kind: "error", code: "INTERNAL_ERROR" })
        : Object.freeze({ kind: "success", next, data });
    },
  );
}

export function failWebMcpPlaybackRun(
  controller: ExperienceController,
  runId: string,
): ExperienceCommitResult {
  return controller.commit((state) => {
    const session = state.webMcp.session;
    const run = session?.playbackRuns.find((candidate) => candidate.runId === runId);
    if (
      !session ||
      !run ||
      (run.status !== "starting" && run.status !== "started") ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    return experienceReducer(state, {
      type: "webmcp-agent-playback-failed",
      runId,
      event: agentEvent(
        session,
        state.webMcp.revision + 1,
        "playback_failed",
        run.requestId,
        run.comparisonId,
        run.runId,
      ),
    });
  });
}

export function cancelWebMcpPlaybackRun(
  controller: ExperienceController,
  runId: string,
): ExperienceCommitResult {
  return controller.commit((state) => {
    const session = state.webMcp.session;
    const run = session?.playbackRuns.find((candidate) => candidate.runId === runId);
    if (
      !session ||
      !run ||
      (run.status !== "starting" && run.status !== "started") ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    const event = Object.freeze({
      ...agentEvent(
        session,
        state.webMcp.revision + 1,
        "playback_cancelled",
        run.requestId,
        run.comparisonId,
        run.runId,
      ),
      actor: "human" as const,
    });
    return experienceReducer(state, {
      type: "webmcp-agent-playback-cancelled",
      runId,
      event,
    });
  });
}

export function completeWebMcpNoDifferenceRecovery(
  controller: ExperienceController,
  comparisonId: ComparisonProjection["comparisonId"],
): ExperienceCommitResult {
  return controller.commit((state) => {
    const session = state.webMcp.session;
    const comparison = currentComparison(state);
    if (
      !session ||
      !comparison ||
      comparison.comparisonId !== comparisonId ||
      comparison.observationId !== null ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    const event = humanEvent(
      state,
      "playback_completed",
      comparisonId,
      "human",
    );
    return event
      ? experienceReducer(state, {
          type: "webmcp-no-difference-recovery-completed",
          comparisonId,
          event,
        })
      : state;
  });
}

type ObservationFields = Readonly<{
  focusedSpeech: RecordUserObservationInput["focusedSpeech"];
  maskingSources: RecordUserObservationInput["maskingSources"];
  relativeToPrevious: RecordUserObservationInput["relativeToPrevious"];
  nextAction: RecordUserObservationInput["nextAction"];
}>;

type ObservationDecision =
  | Readonly<{
      ok: true;
      observation: ObservationProjection;
      completionState: "active" | "complete";
      nextPhase: AuralisWebMcpPhase;
    }>
  | Readonly<{ ok: false; code: AuralisToolErrorCode }>;

export function noDifferenceRecoveryCount(
  state: ExperienceState,
  comparisonId: ComparisonProjection["comparisonId"],
): 0 | 1 | 2 {
  return (
    state.webMcp.session?.noDifferenceRecoveries.find(
      (candidate) => candidate.comparisonId === comparisonId,
    )?.completedCount ?? 0
  );
}

function observationNeedsFocusedReplay(input: ObservationFields): boolean {
  return (
    input.relativeToPrevious === "same" ||
    input.relativeToPrevious === "unsure" ||
    (input.focusedSpeech === "unsure" && input.maskingSources.includes("unsure"))
  );
}

function decideObservation(
  state: ExperienceState,
  comparison: ComparisonProjection,
  input: ObservationFields,
): ObservationDecision {
  const session = state.webMcp.session;
  if (!session || comparison.observationId !== null) {
    return Object.freeze({ ok: false, code: "COMPARISON_MISMATCH" });
  }
  if (!requiredPlaybackComplete(comparison)) {
    return Object.freeze({ ok: false, code: "PLAYBACK_REQUIRED" });
  }
  if (
    comparison.kind === "baseline" &&
    (input.relativeToPrevious !== "not_compared" || input.nextAction !== "continue")
  ) {
    return Object.freeze({ ok: false, code: "INVALID_INPUT" });
  }
  if (
    comparison.kind === "adaptation" &&
    input.relativeToPrevious === "not_compared"
  ) {
    return Object.freeze({ ok: false, code: "INVALID_INPUT" });
  }
  if (
    observationNeedsFocusedReplay(input) &&
    noDifferenceRecoveryCount(state, comparison.comparisonId) === 0
  ) {
    return Object.freeze({ ok: false, code: "REPLAY_REQUIRED" });
  }
  const adaptationCount = adaptationsUsed(state);
  if (
    comparison.kind === "adaptation" &&
    adaptationCount === AURALIS_WEBMCP_MAX_ADAPTATIONS &&
    input.nextAction !== "summarize"
  ) {
    return Object.freeze({ ok: false, code: "INVALID_INPUT" });
  }
  const sequence = session.observations.length + 1;
  if (sequence < 1 || sequence > 3) {
    return Object.freeze({ ok: false, code: "SESSION_LIMIT_REACHED" });
  }
  const observation: ObservationProjection = Object.freeze({
    observationId: OBSERVATION_IDS[sequence - 1]!,
    comparisonId: comparison.comparisonId,
    focusedSpeech: input.focusedSpeech,
    maskingSources: input.maskingSources,
    relativeToPrevious: input.relativeToPrevious,
    nextAction: input.nextAction,
  });
  const completionState =
    comparison.kind === "adaptation" &&
    (input.nextAction === "summarize" ||
      adaptationCount === AURALIS_WEBMCP_MAX_ADAPTATIONS)
      ? ("complete" as const)
      : ("active" as const);
  return Object.freeze({
    ok: true,
    observation,
    completionState,
    nextPhase:
      completionState === "complete"
        ? ("complete" as const)
        : ("ready_for_adaptation" as const),
  });
}

export function recordUserObservation(
  controller: ExperienceController,
  rawInput: unknown,
  options: ExecuteOptions = {},
): AuralisToolResult<RecordUserObservationData> {
  const parsed = recordUserObservationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return errorResult(
      "record_user_observation",
      null,
      controller.getSnapshot(),
      "INVALID_INPUT",
    );
  }
  const input = canonicalObservationInput(parsed.data);
  const canonical = canonicalInput(input);
  return executeMutation(
    controller,
    "record_user_observation",
    input,
    canonical,
    recordUserObservationDataSchema,
    options,
    (state) => {
      const phase = deriveAuralisWebMcpPhase(state);
      if (
        phase !== "awaiting_baseline_observation" &&
        phase !== "awaiting_comparison_observation"
      ) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (audioBusy(state)) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      const session = state.webMcp.session;
      const comparison = currentComparison(state);
      if (
        !session ||
        !comparison ||
        comparison.comparisonId !== input.comparisonId ||
        comparison.observationId !== null
      ) {
        return Object.freeze({ kind: "error", code: "COMPARISON_MISMATCH" });
      }
      if (!requiredPlaybackComplete(comparison)) {
        return Object.freeze({ kind: "error", code: "PLAYBACK_REQUIRED" });
      }
      const decision = decideObservation(state, comparison, input);
      if (!decision.ok) {
        return Object.freeze({ kind: "error", code: decision.code });
      }
      const { observation, completionState, nextPhase } = decision;
      const data: RecordUserObservationData = Object.freeze({
        observation,
        nextPhase,
      });
      const record: WebMcpRequestRecord = Object.freeze({
        requestId: input.requestId,
        tool: "record_user_observation",
        canonicalInput: canonical,
        data,
      });
      const observationEvent = agentEvent(
        session,
        state.webMcp.revision + 1,
        "observation_recorded",
        input.requestId,
        comparison.comparisonId,
      );
      const next = experienceReducer(state, {
        type: "webmcp-observation-recorded",
        observation,
        requestRecord: record,
        event: observationEvent,
        completionEvent:
          completionState === "complete"
            ? automaticCompletionEvent(observationEvent)
            : null,
        completionState,
      });
      return !committedToolState(state, next, input.requestId)
        ? Object.freeze({ kind: "error", code: "INTERNAL_ERROR" })
        : Object.freeze({ kind: "success", next, data });
    },
  );
}

export function recordWebMcpHumanObservation(
  controller: ExperienceController,
  observationInput: Readonly<{
    focusedSpeech: RecordUserObservationInput["focusedSpeech"];
    maskingSources: RecordUserObservationInput["maskingSources"];
    relativeToPrevious: RecordUserObservationInput["relativeToPrevious"];
    nextAction: RecordUserObservationInput["nextAction"];
  }>,
): ExperienceCommitResult {
  const phase = deriveAuralisWebMcpPhase(controller.getSnapshot());
  return commitHumanAction(controller, phase, (state) => {
    if (
      phase !== "awaiting_baseline_observation" &&
      phase !== "awaiting_comparison_observation"
    ) {
      return null;
    }
    const session = state.webMcp.session;
    const comparison = currentComparison(state);
    if (!session || !comparison) {
      return null;
    }
    const decision = decideObservation(state, comparison, observationInput);
    if (!decision.ok) return null;
    const { observation, completionState } = decision;
    const event = humanEvent(
      state,
      "observation_recorded",
      comparison.comparisonId,
    );
    return event
      ? {
          type: "webmcp-observation-recorded",
          observation,
          requestRecord: null,
          event,
          completionEvent:
            completionState === "complete"
              ? automaticCompletionEvent(event)
              : null,
          completionState,
        }
      : null;
  });
}

function commitHumanAction(
  controller: ExperienceController,
  phase: AuralisWebMcpPhase,
  createAction: (state: ExperienceState) => ExperienceAction | null,
): ExperienceCommitResult {
  return controller.commit((state) => {
    if (
      deriveAuralisWebMcpPhase(state) !== phase ||
      audioBusy(state) ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    const action = createAction(state);
    return action ? experienceReducer(state, action) : state;
  });
}

export function confirmWebMcpConsent(
  controller: ExperienceController,
): ExperienceCommitResult {
  return commitHumanAction(controller, "awaiting_consent", (state) => {
    const event = humanEvent(state, "consent_confirmed");
    return event ? { type: "webmcp-human-consent-confirmed", event } : null;
  });
}

export function selectWebMcpProfile(
  controller: ExperienceController,
  profileId: ProfileId,
): ExperienceCommitResult {
  return commitHumanAction(controller, "awaiting_profile_selection", (state) => {
    const event = humanEvent(state, "profile_confirmed");
    return event
      ? {
          type: "webmcp-human-profile-selected",
          profileId,
          sourceIdentity: FAMILY_DINNER_SOURCE_ID,
          event,
        }
      : null;
  });
}

export function resetWebMcpExperience(
  controller: ExperienceController,
): ExperienceCommitResult {
  return controller.commit((state) => {
    if (
      (!state.webMcp.session && !state.webMcp.humanJourneyProgressed) ||
      state.webMcp.revision >= AURALIS_WEBMCP_MAX_REVISION
    ) {
      return state;
    }
    return experienceReducer(state, { type: "webmcp-human-reset" });
  });
}
