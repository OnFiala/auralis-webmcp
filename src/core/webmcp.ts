import type { ZodType } from "zod";
import {
  AURALIS_WEBMCP_CONTRACT_VERSION,
  AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION,
  AURALIS_WEBMCP_LIMITATION,
  AURALIS_WEBMCP_MAX_ADAPTATIONS,
  AURALIS_WEBMCP_MAX_REVISION,
  COMPARISON_IDS,
  MASKING_SOURCES,
  OBSERVATION_IDS,
  auralisToolResultSchema,
  getAuralisStateDataSchema,
  getSessionEvidenceDataSchema,
  prepareComparisonDataSchema,
  prepareComparisonInputSchema,
  recordUserObservationDataSchema,
  recordUserObservationInputSchema,
  stageDemoSessionDataSchema,
  stageDemoSessionInputSchema,
  type AuralisSettings,
  type AuralisToolErrorCode,
  type AuralisToolName,
  type AuralisToolResult,
  type AuralisWebMcpPhase,
  type ComparisonProjection,
  type GetAuralisStateData,
  type GetSessionEvidenceData,
  type HumanGateProjection,
  type ObservationProjection,
  type PrepareComparisonData,
  type PrepareComparisonInput,
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
  type WebMcpSessionState,
} from "./experience";
import { PREDEFINED_HEARING_PROFILES } from "./profile";

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
  if (session.completionState === "ready_for_summary") return "ready_for_summary";
  if (!session.consentConfirmed) return "awaiting_consent";
  if (!session.confirmedProfileId) return "awaiting_profile_confirmation";
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
      "Explain the illustrative purpose and limitation, then wait for explicit human consent through the visible control.",
    ],
    awaiting_profile_confirmation: [
      "confirm_profile",
      "Ask the human to confirm the visibly staged synthetic profile.",
    ],
    awaiting_scene_load: [
      "load_scene",
      "Load the validated family scene only through the visible control after human direction.",
    ],
    awaiting_volume_acknowledgement: [
      "acknowledge_low_volume",
      "Wait until the human states that physical listening volume is comfortable, then use the visible acknowledgement.",
    ],
    awaiting_baseline_listening: [
      "listen_baseline",
      "Ask the human to play both reference A and illustrative B through the visible controls.",
    ],
    awaiting_comparison_listening: [
      "listen_comparison",
      "Ask the human to play illustrative B through the visible controls; reference A remains optional.",
    ],
    ready_for_summary: [
      "finish_session",
      "Present the recorded evidence and finish only after explicit human direction through the visible control.",
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

function allowedNextToolsForState(
  state: ExperienceState,
): readonly AuralisToolName[] {
  const phase = deriveAuralisWebMcpPhase(state);
  const always: AuralisToolName[] = [
    "get_auralis_state",
    "get_session_evidence",
  ];
  if (
    (phase === "awaiting_session_stage" && isPristineForAgentStage(state)) ||
    ((phase === "awaiting_consent" || phase === "awaiting_profile_confirmation") &&
      state.webMcp.session?.stageCount === 1)
  ) {
    always.push("stage_demo_session");
  } else if (phase === "ready_for_baseline" || phase === "ready_for_adaptation") {
    always.push("prepare_comparison");
  } else if (
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
  return Object.freeze({ kind: "replay", data: existing.data as T });
}

function agentEvent(
  session: WebMcpSessionState | null,
  revision: number,
  action: SessionEvidenceEvent["action"],
  requestId: string,
  comparisonId: ComparisonProjection["comparisonId"] | null = null,
): SessionEvidenceEvent {
  return Object.freeze({
    sequence: (session?.events.length ?? 0) + 1,
    revision,
    actor: "agent" as const,
    action,
    requestId,
    comparisonId,
  });
}

function humanEvent(
  state: ExperienceState,
  action: SessionEvidenceEvent["action"],
  comparisonId: ComparisonProjection["comparisonId"] | null = null,
): SessionEvidenceEvent | null {
  const session = state.webMcp.session;
  return session
    ? Object.freeze({
        sequence: session.events.length + 1,
        revision: state.webMcp.revision + 1,
        actor: "human" as const,
        action,
        requestId: null,
        comparisonId,
      })
    : null;
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
  return Object.freeze({
    capabilities: Object.freeze({
      maxAdaptiveComparisons: 2 as const,
      profileMode: "synthetic-predefined-only" as const,
      agenticEntry: "agent-origin-only" as const,
      agenticActivationTool: "stage_demo_session" as const,
      audioControl: "human-authority" as const,
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
    }),
    currentComparison: currentComparison(state),
    audio: Object.freeze({
      sourceStatus,
      lowVolumeAcknowledged: state.lowVolumeAcknowledged,
      playbackStatus: state.playback.status,
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
      const firstStage = phase === "awaiting_session_stage";
      const restage =
        (phase === "awaiting_consent" || phase === "awaiting_profile_confirmation") &&
        currentSession?.stageCount === 1 &&
        currentSession.confirmedProfileId === null;
      if (!firstStage && !restage) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (firstStage && !isPristineForAgentStage(state)) {
        return Object.freeze({ kind: "error", code: "INVALID_PHASE" });
      }
      if (restage && currentSession?.stagedProfileId === input.profileId) {
        return Object.freeze({ kind: "error", code: "INVALID_INPUT" });
      }
      if (audioBusy(state)) {
        return Object.freeze({ kind: "error", code: "AUDIO_BUSY" });
      }
      const data: StageDemoSessionData = Object.freeze({
        stagedProfile: profileProjection(input.profileId),
        agenticPresentation: "active" as const,
        pendingConsent: !(currentSession?.consentConfirmed ?? false),
        pendingHumanConfirmation: true as const,
      });
      const record: WebMcpRequestRecord = Object.freeze({
        requestId: input.requestId,
        tool: "stage_demo_session",
        canonicalInput: canonical,
        data,
      });
      const next = experienceReducer(state, {
        type: "webmcp-session-staged",
        sessionId: currentSession?.sessionId ?? (options.createSessionId ?? sessionId)(),
        profileId: input.profileId,
        requestRecord: record,
        event: agentEvent(
          currentSession,
          state.webMcp.revision + 1,
          "session_staged",
          input.requestId,
        ),
      });
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
      if (
        comparison.kind === "baseline" &&
        (input.relativeToPrevious !== "not_compared" || input.nextAction !== "continue")
      ) {
        return Object.freeze({ kind: "error", code: "INVALID_INPUT" });
      }
      if (
        comparison.kind === "adaptation" &&
        input.relativeToPrevious === "not_compared"
      ) {
        return Object.freeze({ kind: "error", code: "INVALID_INPUT" });
      }
      const adaptationCount = adaptationsUsed(state);
      if (
        comparison.kind === "adaptation" &&
        adaptationCount === AURALIS_WEBMCP_MAX_ADAPTATIONS &&
        input.nextAction !== "summarize"
      ) {
        return Object.freeze({ kind: "error", code: "INVALID_INPUT" });
      }
      const sequence = session.observations.length + 1;
      if (sequence < 1 || sequence > 3) {
        return Object.freeze({ kind: "error", code: "SESSION_LIMIT_REACHED" });
      }
      const observation: ObservationProjection = Object.freeze({
        observationId: OBSERVATION_IDS[sequence - 1]!,
        comparisonId: input.comparisonId,
        focusedSpeech: input.focusedSpeech,
        maskingSources: input.maskingSources,
        relativeToPrevious: input.relativeToPrevious,
        nextAction: input.nextAction,
      });
      const completionState =
        comparison.kind === "adaptation" &&
        (input.nextAction === "summarize" ||
          adaptationCount === AURALIS_WEBMCP_MAX_ADAPTATIONS)
          ? ("ready_for_summary" as const)
          : ("active" as const);
      const nextPhase: AuralisWebMcpPhase =
        completionState === "ready_for_summary"
          ? "ready_for_summary"
          : "ready_for_adaptation";
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
      const next = experienceReducer(state, {
        type: "webmcp-observation-recorded",
        observation,
        requestRecord: record,
        event: agentEvent(
          session,
          state.webMcp.revision + 1,
          "observation_recorded",
          input.requestId,
          comparison.comparisonId,
        ),
        completionState,
      });
      return !committedToolState(state, next, input.requestId)
        ? Object.freeze({ kind: "error", code: "INTERNAL_ERROR" })
        : Object.freeze({ kind: "success", next, data });
    },
  );
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

export function confirmWebMcpProfile(
  controller: ExperienceController,
  sourceIdentity: string,
): ExperienceCommitResult {
  return commitHumanAction(controller, "awaiting_profile_confirmation", (state) => {
    const event = humanEvent(state, "profile_confirmed");
    return event
      ? { type: "webmcp-human-profile-confirmed", sourceIdentity, event }
      : null;
  });
}

export function finishWebMcpSession(
  controller: ExperienceController,
): ExperienceCommitResult {
  return commitHumanAction(controller, "ready_for_summary", (state) => {
    const event = humanEvent(state, "session_finished");
    return event ? { type: "webmcp-human-session-finished", event } : null;
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
