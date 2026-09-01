import { z } from "zod";

export const AURALIS_WEBMCP_CONTRACT_VERSION = "auralis-webmcp-v1.9" as const;
export const AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION =
  "auralis-webmcp-evidence-v4" as const;
export const AURALIS_WEBMCP_LIMITATION =
  "This synthetic comparison is illustrative, non-diagnostic, and not a substitute for a hearing assessment." as const;
export const AURALIS_WEBMCP_MAX_REVISION = 2_147_483_647;
export const AURALIS_WEBMCP_MAX_ADAPTATIONS = 2 as const;
export const AURALIS_WEBMCP_MAX_PLAYBACK_RUNS_PER_COMPARISON = 3 as const;
export const AURALIS_WEBMCP_PROFILE_OVERRIDE_TIMEOUT_MS = 15_000 as const;
export const AURALIS_WEBMCP_WAIT_TIMEOUT_MS = 240_000 as const;
export const AURALIS_WEBMCP_AGENT_PLAYBACK_LEAD_IN_MS = 8_000 as const;

export const AURALIS_TOOL_NAMES = [
  "get_auralis_state",
  "stage_demo_session",
  "prepare_comparison",
  "play_listening_comparison",
  "record_user_observation",
  "get_session_evidence",
  "wait_for_session_change",
] as const;

export const AURALIS_WEBMCP_PHASES = [
  "awaiting_session_stage",
  "awaiting_consent",
  "awaiting_profile_selection",
  "awaiting_scene_load",
  "awaiting_volume_acknowledgement",
  "ready_for_baseline",
  "awaiting_baseline_listening",
  "awaiting_baseline_observation",
  "ready_for_adaptation",
  "awaiting_comparison_listening",
  "awaiting_comparison_observation",
  "complete",
] as const;

export const HUMAN_GATE_KINDS = [
  "confirm_consent",
  "acknowledge_comfortable_volume",
] as const;

export const AURALIS_TOOL_ERROR_CODES = [
  "INVALID_INPUT",
  "ABORTED",
  "STALE_REVISION",
  "REQUEST_ID_REUSE",
  "INVALID_PHASE",
  "HUMAN_ACTION_REQUIRED",
  "AUDIO_BUSY",
  "COMPARISON_MISMATCH",
  "ONE_VARIABLE_REQUIRED",
  "NO_EFFECT",
  "PLAYBACK_REQUIRED",
  "REPLAY_REQUIRED",
  "PLAYBACK_LIMIT_REACHED",
  "SESSION_LIMIT_REACHED",
  "INTERNAL_ERROR",
] as const;

export const PROFILE_IDS = [
  "high-frequency-hearing-loss",
  "flat-hearing-loss",
  "asymmetric-hearing-loss",
] as const;
export const COMPARISON_IDS = [
  "comparison-1",
  "comparison-2",
  "comparison-3",
] as const;
export const OBSERVATION_IDS = [
  "observation-1",
  "observation-2",
  "observation-3",
] as const;
export const SUPPORT_MODES = ["none", "left-one-sided", "bilateral"] as const;
export const TELEVISION_STATES = ["tv-on", "tv-off"] as const;
export const SPEAKER_POSITIONS = [
  "original-position",
  "closer-in-front",
] as const;
export const PLAYBACK_MODES = ["reference", "simulated"] as const;
export const LISTENING_PLAYBACKS = [
  "reference",
  "simulated",
  "reference-then-simulated",
] as const;
export const LISTENING_FOCUS_OPTIONS = [
  "important-speaker",
  "overall-scene",
] as const;
export const FOCUSED_SPEECH_VALUES = [
  "clear",
  "partial",
  "missed",
  "unsure",
] as const;
export const MASKING_SOURCES = [
  "television",
  "competing_speech",
  "room_noise",
  "none",
  "unsure",
] as const;
export const RELATIVE_RESULTS = [
  "better",
  "same",
  "worse",
  "unsure",
  "not_compared",
] as const;
export const NEXT_ACTIONS = ["continue", "summarize"] as const;
export const CONTROL_CHANNELS = [
  "direct",
  "typed-agent",
  "voice-agent",
] as const;
export const EVIDENCE_ACTIONS = [
  "consent_confirmed",
  "session_staged",
  "profile_confirmed",
  "scene_loaded",
  "volume_acknowledged",
  "comparison_prepared",
  "playback_requested",
  "playback_started",
  "playback_completed",
  "playback_cancelled",
  "playback_failed",
  "observation_recorded",
  "session_finished",
] as const;

export type AuralisToolName = (typeof AURALIS_TOOL_NAMES)[number];
export type AuralisWebMcpPhase = (typeof AURALIS_WEBMCP_PHASES)[number];
export type HumanGateKind = (typeof HUMAN_GATE_KINDS)[number];
export type AuralisToolErrorCode = (typeof AURALIS_TOOL_ERROR_CODES)[number];
export type ProfileId = (typeof PROFILE_IDS)[number];
export type ComparisonId = (typeof COMPARISON_IDS)[number];
export type ObservationId = (typeof OBSERVATION_IDS)[number];
export type AuralisSupportMode = (typeof SUPPORT_MODES)[number];
export type TelevisionState = (typeof TELEVISION_STATES)[number];
export type SpeakerPosition = (typeof SPEAKER_POSITIONS)[number];
export type PlaybackMode = (typeof PLAYBACK_MODES)[number];
export type ListeningPlayback = (typeof LISTENING_PLAYBACKS)[number];
export type ListeningFocus = (typeof LISTENING_FOCUS_OPTIONS)[number];
export type FocusedSpeech = (typeof FOCUSED_SPEECH_VALUES)[number];
export type MaskingSource = (typeof MASKING_SOURCES)[number];
export type RelativeResult = (typeof RELATIVE_RESULTS)[number];
export type NextAction = (typeof NEXT_ACTIONS)[number];
export type ControlChannel = (typeof CONTROL_CHANNELS)[number];
export type EvidenceAction = (typeof EVIDENCE_ACTIONS)[number];
export type SemanticActor = "human" | "agent" | "system";
export type AgenticPresentation = "human-landing" | "agent-guided";

const requestIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/);
const expectedRevisionSchema = z
  .number()
  .int()
  .min(0)
  .max(AURALIS_WEBMCP_MAX_REVISION);
const sessionIdSchema = z
  .string()
  .regex(
    /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
const mutationFields = {
  requestId: requestIdSchema,
  expectedRevision: expectedRevisionSchema,
} as const;

export const emptyToolInputSchema = z.object({}).strict();
export const waitForSessionChangeInputSchema = z
  .object({
    sessionId: sessionIdSchema,
    afterRevision: expectedRevisionSchema,
    timeoutMs: z
      .union([
        z.literal(AURALIS_WEBMCP_PROFILE_OVERRIDE_TIMEOUT_MS),
        z.literal(AURALIS_WEBMCP_WAIT_TIMEOUT_MS),
      ])
      .optional(),
  })
  .strict();
export const stageDemoSessionInputSchema = z.discriminatedUnion("action", [
  z
    .object({
      ...mutationFields,
      action: z.literal("start"),
      goal: z.literal("family-understanding"),
    })
    .strict(),
  z
    .object({
      ...mutationFields,
      action: z.literal("select-profile"),
      goal: z.literal("family-understanding"),
      profileId: z.enum(PROFILE_IDS),
    })
    .strict(),
]);

const baselineComparisonInputSchema = z
  .object({
    ...mutationFields,
    kind: z.literal("baseline"),
  })
  .strict();
const supportComparisonInputSchema = z
  .object({
    ...mutationFields,
    kind: z.literal("adaptation"),
    variable: z.literal("support_mode"),
    value: z.enum(SUPPORT_MODES),
  })
  .strict();
const televisionComparisonInputSchema = z
  .object({
    ...mutationFields,
    kind: z.literal("adaptation"),
    variable: z.literal("television_state"),
    value: z.enum(TELEVISION_STATES),
  })
  .strict();
const speakerComparisonInputSchema = z
  .object({
    ...mutationFields,
    kind: z.literal("adaptation"),
    variable: z.literal("speaker_position"),
    value: z.enum(SPEAKER_POSITIONS),
  })
  .strict();

export const prepareComparisonInputSchema = z.union([
  baselineComparisonInputSchema,
  supportComparisonInputSchema,
  televisionComparisonInputSchema,
  speakerComparisonInputSchema,
]);

export const playListeningComparisonInputSchema = z
  .object({
    ...mutationFields,
    comparisonId: z.enum(COMPARISON_IDS),
    playback: z.enum(LISTENING_PLAYBACKS),
    focus: z.enum(LISTENING_FOCUS_OPTIONS),
  })
  .strict();

export const recordUserObservationInputSchema = z
  .object({
    ...mutationFields,
    comparisonId: z.enum(COMPARISON_IDS),
    focusedSpeech: z.enum(FOCUSED_SPEECH_VALUES),
    maskingSources: z
      .array(z.enum(MASKING_SOURCES))
      .min(1)
      .max(2)
      .refine((values) => new Set(values).size === values.length, {
        message: "Masking sources must be unique.",
      })
      .refine(
        (values) =>
          values.length === 1 ||
          (!values.includes("none") && !values.includes("unsure")),
        { message: "None and unsure cannot be combined with another source." },
      ),
    relativeToPrevious: z.enum(RELATIVE_RESULTS),
    nextAction: z.enum(NEXT_ACTIONS),
  })
  .strict();

export type EmptyToolInput = z.infer<typeof emptyToolInputSchema>;
export type WaitForSessionChangeInput = z.infer<
  typeof waitForSessionChangeInputSchema
>;
export type StageDemoSessionInput = z.infer<
  typeof stageDemoSessionInputSchema
>;
export type PrepareComparisonInput = z.infer<
  typeof prepareComparisonInputSchema
>;
export type PlayListeningComparisonInput = z.infer<
  typeof playListeningComparisonInputSchema
>;
export type RecordUserObservationInput = z.infer<
  typeof recordUserObservationInputSchema
>;

export type AuralisSettings = Readonly<{
  supportMode: AuralisSupportMode;
  televisionState: TelevisionState;
  speakerPosition: SpeakerPosition;
}>;

export type ComparisonProjection = Readonly<{
  comparisonId: ComparisonId;
  sequence: 1 | 2 | 3;
  kind: "baseline" | "adaptation";
  previousComparisonId: ComparisonId | null;
  changedVariable:
    | "support_mode"
    | "television_state"
    | "speaker_position"
    | null;
  settings: AuralisSettings;
  referenceResultIdentity: string;
  simulatedResultIdentity: string;
  requiredPlaybackModes: readonly PlaybackMode[];
  heardPlaybackModes: readonly PlaybackMode[];
  observationId: ObservationId | null;
}>;

export type ObservationProjection = Readonly<{
  observationId: ObservationId;
  comparisonId: ComparisonId;
  focusedSpeech: FocusedSpeech;
  maskingSources: readonly MaskingSource[];
  relativeToPrevious: RelativeResult;
  nextAction: NextAction;
}>;

export type ProfileProjection = Readonly<{
  profileId: ProfileId;
  predefinedProfileSetVersion: string;
  displayName: string;
  classification: "synthetic-illustrative";
  everydayDescription: string;
  demonstrates: string;
  limitation: string;
}>;

export type AdaptationOptionProjection = Readonly<
  | {
      variable: "support_mode";
      value: AuralisSupportMode;
      label: string;
      explanation: string;
      listenFor: string;
    }
  | {
      variable: "television_state";
      value: TelevisionState;
      label: string;
      explanation: string;
      listenFor: string;
    }
  | {
      variable: "speaker_position";
      value: SpeakerPosition;
      label: string;
      explanation: string;
      listenFor: string;
    }
>;

export type ListeningNarrationProjection = Readonly<{
  now: string;
  next: string | null;
  after: string;
  noDifferenceRecovery: string;
}>;

export type HumanGateProjection = Readonly<{
  kind: HumanGateKind;
  instruction: string;
  authority: "human-required";
  controlChannels: readonly ControlChannel[];
}>;

type AgentContinuationBase = Readonly<{
  policy: "continue-current-agent-run";
  instruction: string;
}>;

type AgentWaitInput<T extends 15_000 | 240_000> = Readonly<{
  sessionId: string;
  afterRevision: number;
  timeoutMs: T;
}>;

export type AgentContinuationProjection =
  | (AgentContinuationBase &
      Readonly<{
        action: "call-tool";
        tool: AuralisToolName;
        waitInput: null;
        defaultProfileId: null;
        doNotEndTurn: true;
      }>)
  | (AgentContinuationBase &
      Readonly<{
        action: "select-default-profile";
        tool: "stage_demo_session";
        waitInput: null;
        defaultProfileId: "asymmetric-hearing-loss";
        doNotEndTurn: true;
      }>)
  | (AgentContinuationBase &
      Readonly<{
        action: "explain-profiles-then-wait";
        tool: "wait_for_session_change";
        waitInput: AgentWaitInput<15_000>;
        defaultProfileId: "asymmetric-hearing-loss";
        doNotEndTurn: true;
      }>)
  | (AgentContinuationBase &
      Readonly<{
        action: "explain-then-wait" | "ask-then-wait";
        tool: "wait_for_session_change";
        waitInput: AgentWaitInput<240_000>;
        defaultProfileId: null;
        doNotEndTurn: true;
      }>)
  | (AgentContinuationBase &
      Readonly<{
        action: "stop";
        tool: null;
        waitInput: null;
        defaultProfileId: null;
        doNotEndTurn: false;
      }>);

export type GetAuralisStateData = Readonly<{
  capabilities: Readonly<{
    maxAdaptiveComparisons: 2;
    profileMode: "synthetic-predefined-only";
    agenticEntry: "agent-origin-only";
    agenticActivationTool: "stage_demo_session" | null;
    stageDemoSessionAction: "start" | "select-profile" | null;
    preferredAgentControl: "webmcp-first";
    computerUseFallback: "human-gate-or-no-matching-tool";
    predefinedProfileSetVersion: string;
    audioControl: "agent-start-or-direct-human-stop";
    controlChannels: readonly ["direct", "typed-agent", "voice-agent"];
  }>;
  availableProfiles: readonly ProfileProjection[];
  session: Readonly<{
    goal: "family-understanding" | null;
    stagedProfileId: ProfileId | null;
    confirmedProfileId: ProfileId | null;
    adaptationsUsed: 0 | 1 | 2;
    presentation: AgenticPresentation;
    stageCount: 0 | 1 | 2;
    lastEvent: SessionEvidenceEvent | null;
  }>;
  currentComparison: ComparisonProjection | null;
  availableAdaptations: readonly AdaptationOptionProjection[];
  listeningGuidance: Readonly<{
    playbackTool: "play_listening_comparison";
    availablePlaybacks: readonly ListeningPlayback[];
    focusOptions: readonly ListeningFocus[];
    askForObservation: string;
    translateEverydayLanguage: string;
    noDifferenceRecovery: string;
  }>;
  audio: Readonly<{
    sourceStatus: "idle" | "loading" | "ready" | "failed";
    comfortableVolumeAcknowledged: boolean;
    agentPlaybackGranted: boolean;
    playbackStatus: "stopped" | "playing" | "failed";
    activeRun: Readonly<{
      runId: string;
      requestId: string;
      comparisonId: ComparisonId;
      playback: ListeningPlayback;
      focus: ListeningFocus;
      sequence: readonly PlaybackMode[];
      completedModes: readonly PlaybackMode[];
      status: "starting" | "started";
    }> | null;
  }>;
  summaryReady: boolean;
  limitation: string;
}>;

export type WaitForSessionChangeData = Readonly<{
  reason: "changed" | "timeout" | "session-replaced" | "complete";
  state: GetAuralisStateData;
}>;

export type StageDemoSessionData = Readonly<{
  operation: "started" | "profile-selected";
  stagedProfile: ProfileProjection | null;
  agenticPresentation: "active";
  pendingConsent: boolean;
  pendingProfileSelection: boolean;
}>;

export type PrepareComparisonData = Readonly<{
  comparison: ComparisonProjection;
}>;

export type PlayListeningComparisonData = Readonly<{
  runId: string;
  comparisonId: ComparisonId;
  playback: ListeningPlayback;
  sequence: readonly PlaybackMode[];
  focus: ListeningFocus;
  clipWindow: Readonly<{
    startSeconds: 32.3;
    durationSeconds: 8;
  }>;
  status: "starting" | "started" | "completed" | "cancelled" | "failed";
  narration: ListeningNarrationProjection;
}>;

export type RecordUserObservationData = Readonly<{
  observation: ObservationProjection;
  nextPhase: AuralisWebMcpPhase;
}>;

export type SessionEvidenceEvent = Readonly<{
  sequence: number;
  revision: number;
  actor: SemanticActor;
  action: EvidenceAction;
  requestId: string | null;
  comparisonId: ComparisonId | null;
  runId: string | null;
}>;

export type PlaybackRunEvidenceProjection = Readonly<{
  runId: string;
  requestId: string;
  comparisonId: ComparisonId;
  playback: ListeningPlayback;
  focus: ListeningFocus;
  purpose: "initial-listening" | "no-difference-recovery";
  completedModes: readonly PlaybackMode[];
  status: "starting" | "started" | "completed" | "cancelled" | "failed";
}>;

export type NoDifferenceRecoveryProjection = Readonly<{
  comparisonId: ComparisonId;
  completedCount: 1 | 2;
  playback: "reference-then-simulated";
  focus: "important-speaker";
}>;

export type SessionEvidenceProjection = Readonly<{
  schemaVersion: typeof AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION;
  contractVersion: typeof AURALIS_WEBMCP_CONTRACT_VERSION;
  sessionId: string;
  goal: "family-understanding";
  profile: ProfileProjection | null;
  comparisons: readonly ComparisonProjection[];
  observations: readonly ObservationProjection[];
  playbackRuns: readonly PlaybackRunEvidenceProjection[];
  noDifferenceRecoveries: readonly NoDifferenceRecoveryProjection[];
  events: readonly SessionEvidenceEvent[];
  summaryReady: boolean;
  completionState: "active" | "complete";
  limitation: string;
}>;

export type GetSessionEvidenceData = Readonly<{
  evidence: SessionEvidenceProjection | null;
}>;

export type AuralisToolFailure = Readonly<{
  code: AuralisToolErrorCode;
  message: string;
  retryable: boolean;
  recovery: string;
}>;

type AuralisToolSuccess<T> = Readonly<{
  contractVersion: typeof AURALIS_WEBMCP_CONTRACT_VERSION;
  ok: true;
  tool: AuralisToolName;
  requestId: string | null;
  revision: number;
  phase: AuralisWebMcpPhase;
  sessionId: string | null;
  replayed: boolean;
  allowedNextTools: readonly AuralisToolName[];
  humanGate: HumanGateProjection | null;
  continuation: AgentContinuationProjection;
  data: T;
  error: null;
}>;

type AuralisToolError = Readonly<{
  contractVersion: typeof AURALIS_WEBMCP_CONTRACT_VERSION;
  ok: false;
  tool: AuralisToolName;
  requestId: string | null;
  revision: number;
  phase: AuralisWebMcpPhase;
  sessionId: string | null;
  replayed: false;
  allowedNextTools: readonly AuralisToolName[];
  humanGate: HumanGateProjection | null;
  continuation: AgentContinuationProjection;
  data: null;
  error: AuralisToolFailure;
}>;

export type AuralisToolResult<T> = AuralisToolSuccess<T> | AuralisToolError;

const profileIdSchema = z.enum(PROFILE_IDS);
const comparisonIdSchema = z.enum(COMPARISON_IDS);
const observationIdSchema = z.enum(OBSERVATION_IDS);
const playbackModeSchema = z.enum(PLAYBACK_MODES);
const listeningPlaybackSchema = z.enum(LISTENING_PLAYBACKS);
const listeningFocusSchema = z.enum(LISTENING_FOCUS_OPTIONS);
const settingsSchema = z
  .object({
    supportMode: z.enum(SUPPORT_MODES),
    televisionState: z.enum(TELEVISION_STATES),
    speakerPosition: z.enum(SPEAKER_POSITIONS),
  })
  .strict();

export const comparisonProjectionSchema = z
  .object({
    comparisonId: comparisonIdSchema,
    sequence: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    kind: z.enum(["baseline", "adaptation"]),
    previousComparisonId: comparisonIdSchema.nullable(),
    changedVariable: z
      .enum(["support_mode", "television_state", "speaker_position"])
      .nullable(),
    settings: settingsSchema,
    referenceResultIdentity: z.string().regex(/^auralis-result-v1-[a-f0-9]{16}$/),
    simulatedResultIdentity: z.string().regex(/^auralis-result-v1-[a-f0-9]{16}$/),
    requiredPlaybackModes: z.array(playbackModeSchema),
    heardPlaybackModes: z.array(playbackModeSchema),
    observationId: observationIdSchema.nullable(),
  })
  .strict();

export const observationProjectionSchema = z
  .object({
    observationId: observationIdSchema,
    comparisonId: comparisonIdSchema,
    focusedSpeech: z.enum(FOCUSED_SPEECH_VALUES),
    maskingSources: z.array(z.enum(MASKING_SOURCES)).min(1).max(2),
    relativeToPrevious: z.enum(RELATIVE_RESULTS),
    nextAction: z.enum(NEXT_ACTIONS),
  })
  .strict();

export const profileProjectionSchema = z
  .object({
    profileId: profileIdSchema,
    predefinedProfileSetVersion: z
      .string()
      .regex(/^auralis-synthetic-presets-v\d+$/),
    displayName: z.string().min(1),
    classification: z.literal("synthetic-illustrative"),
    everydayDescription: z.string().min(1),
    demonstrates: z.string().min(1),
    limitation: z.string().min(1),
  })
  .strict();

export const adaptationOptionProjectionSchema = z.discriminatedUnion(
  "variable",
  [
    z
      .object({
        variable: z.literal("support_mode"),
        value: z.enum(SUPPORT_MODES),
        label: z.string().min(1),
        explanation: z.string().min(1),
        listenFor: z.string().min(1),
      })
      .strict(),
    z
      .object({
        variable: z.literal("television_state"),
        value: z.enum(TELEVISION_STATES),
        label: z.string().min(1),
        explanation: z.string().min(1),
        listenFor: z.string().min(1),
      })
      .strict(),
    z
      .object({
        variable: z.literal("speaker_position"),
        value: z.enum(SPEAKER_POSITIONS),
        label: z.string().min(1),
        explanation: z.string().min(1),
        listenFor: z.string().min(1),
      })
      .strict(),
  ],
);

export const listeningNarrationProjectionSchema = z
  .object({
    now: z.string().min(1),
    next: z.string().min(1).nullable(),
    after: z.string().min(1),
    noDifferenceRecovery: z.string().min(1),
  })
  .strict();

export const humanGateProjectionSchema = z
  .object({
    kind: z.enum(HUMAN_GATE_KINDS),
    instruction: z.string().min(1),
    authority: z.literal("human-required"),
    controlChannels: z.array(z.enum(CONTROL_CHANNELS)).length(3),
  })
  .strict();

const continuationBaseSchema = {
  policy: z.literal("continue-current-agent-run"),
  instruction: z.string().min(1),
} as const;

function continuationWaitInputSchema(timeoutMs: 15_000 | 240_000) {
  return z
    .object({
      sessionId: sessionIdSchema,
      afterRevision: expectedRevisionSchema,
      timeoutMs: z.literal(timeoutMs),
    })
    .strict();
}

export const agentContinuationProjectionSchema = z.discriminatedUnion(
  "action",
  [
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("call-tool"),
        tool: z.enum(AURALIS_TOOL_NAMES),
        waitInput: z.null(),
        defaultProfileId: z.null(),
        doNotEndTurn: z.literal(true),
      })
      .strict(),
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("select-default-profile"),
        tool: z.literal("stage_demo_session"),
        waitInput: z.null(),
        defaultProfileId: z.literal("asymmetric-hearing-loss"),
        doNotEndTurn: z.literal(true),
      })
      .strict(),
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("explain-profiles-then-wait"),
        tool: z.literal("wait_for_session_change"),
        waitInput: continuationWaitInputSchema(
          AURALIS_WEBMCP_PROFILE_OVERRIDE_TIMEOUT_MS,
        ),
        defaultProfileId: z.literal("asymmetric-hearing-loss"),
        doNotEndTurn: z.literal(true),
      })
      .strict(),
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("explain-then-wait"),
        tool: z.literal("wait_for_session_change"),
        waitInput: continuationWaitInputSchema(AURALIS_WEBMCP_WAIT_TIMEOUT_MS),
        defaultProfileId: z.null(),
        doNotEndTurn: z.literal(true),
      })
      .strict(),
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("ask-then-wait"),
        tool: z.literal("wait_for_session_change"),
        waitInput: continuationWaitInputSchema(AURALIS_WEBMCP_WAIT_TIMEOUT_MS),
        defaultProfileId: z.null(),
        doNotEndTurn: z.literal(true),
      })
      .strict(),
    z
      .object({
        ...continuationBaseSchema,
        action: z.literal("stop"),
        tool: z.null(),
        waitInput: z.null(),
        defaultProfileId: z.null(),
        doNotEndTurn: z.literal(false),
      })
      .strict(),
  ],
);

export const sessionEvidenceEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    revision: expectedRevisionSchema,
    actor: z.enum(["human", "agent", "system"]),
    action: z.enum(EVIDENCE_ACTIONS),
    requestId: requestIdSchema.nullable(),
    comparisonId: comparisonIdSchema.nullable(),
    runId: z.string().regex(/^playback-[0-9a-f-]{36}$/).nullable(),
  })
  .strict();

export const getAuralisStateDataSchema = z
  .object({
    capabilities: z
      .object({
        maxAdaptiveComparisons: z.literal(2),
        profileMode: z.literal("synthetic-predefined-only"),
        agenticEntry: z.literal("agent-origin-only"),
        agenticActivationTool: z.literal("stage_demo_session").nullable(),
        stageDemoSessionAction: z
          .enum(["start", "select-profile"])
          .nullable(),
        preferredAgentControl: z.literal("webmcp-first"),
        computerUseFallback: z.literal(
          "human-gate-or-no-matching-tool",
        ),
        predefinedProfileSetVersion: z
          .string()
          .regex(/^auralis-synthetic-presets-v\d+$/),
        audioControl: z.literal("agent-start-or-direct-human-stop"),
        controlChannels: z.tuple([
          z.literal("direct"),
          z.literal("typed-agent"),
          z.literal("voice-agent"),
        ]),
      })
      .strict(),
    availableProfiles: z.array(profileProjectionSchema).length(3),
    session: z
      .object({
        goal: z.literal("family-understanding").nullable(),
        stagedProfileId: profileIdSchema.nullable(),
        confirmedProfileId: profileIdSchema.nullable(),
        adaptationsUsed: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        presentation: z.enum(["human-landing", "agent-guided"]),
        stageCount: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        lastEvent: sessionEvidenceEventSchema.nullable(),
      })
      .strict(),
    currentComparison: comparisonProjectionSchema.nullable(),
    availableAdaptations: z.array(adaptationOptionProjectionSchema).max(4),
    listeningGuidance: z
      .object({
        playbackTool: z.literal("play_listening_comparison"),
        availablePlaybacks: z.array(listeningPlaybackSchema).max(3),
        focusOptions: z.array(listeningFocusSchema).length(2),
        askForObservation: z.string().min(1),
        translateEverydayLanguage: z.string().min(1),
        noDifferenceRecovery: z.string().min(1),
      })
      .strict(),
    audio: z
      .object({
        sourceStatus: z.enum(["idle", "loading", "ready", "failed"]),
        comfortableVolumeAcknowledged: z.boolean(),
        agentPlaybackGranted: z.boolean(),
        playbackStatus: z.enum(["stopped", "playing", "failed"]),
        activeRun: z
          .object({
            runId: z.string().regex(/^playback-[0-9a-f-]{36}$/),
            requestId: requestIdSchema,
            comparisonId: comparisonIdSchema,
            playback: listeningPlaybackSchema,
            focus: listeningFocusSchema,
            sequence: z.array(playbackModeSchema).min(1).max(2),
            completedModes: z.array(playbackModeSchema).max(2),
            status: z.enum(["starting", "started"]),
          })
          .strict()
          .nullable(),
      })
      .strict(),
    summaryReady: z.boolean(),
    limitation: z.string().min(1),
  })
  .strict();

export const waitForSessionChangeDataSchema = z
  .object({
    reason: z.enum(["changed", "timeout", "session-replaced", "complete"]),
    state: getAuralisStateDataSchema,
  })
  .strict();

export const stageDemoSessionDataSchema = z
  .object({
    operation: z.enum(["started", "profile-selected"]),
    stagedProfile: profileProjectionSchema.nullable(),
    agenticPresentation: z.literal("active"),
    pendingConsent: z.boolean(),
    pendingProfileSelection: z.boolean(),
  })
  .strict();

export const prepareComparisonDataSchema = z
  .object({ comparison: comparisonProjectionSchema })
  .strict();
export const playListeningComparisonDataSchema = z
  .object({
    runId: z.string().regex(/^playback-[0-9a-f-]{36}$/),
    comparisonId: comparisonIdSchema,
    playback: listeningPlaybackSchema,
    sequence: z.array(playbackModeSchema).min(1).max(2),
    focus: listeningFocusSchema,
    clipWindow: z
      .object({
        startSeconds: z.literal(32.3),
        durationSeconds: z.literal(8),
      })
      .strict(),
    status: z.enum(["starting", "started", "completed", "cancelled", "failed"]),
    narration: listeningNarrationProjectionSchema,
  })
  .strict();
export const recordUserObservationDataSchema = z
  .object({
    observation: observationProjectionSchema,
    nextPhase: z.enum(AURALIS_WEBMCP_PHASES),
  })
  .strict();

export const sessionEvidenceProjectionSchema = z
  .object({
    schemaVersion: z.literal(AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION),
    contractVersion: z.literal(AURALIS_WEBMCP_CONTRACT_VERSION),
    sessionId: sessionIdSchema,
    goal: z.literal("family-understanding"),
    profile: profileProjectionSchema.nullable(),
    comparisons: z.array(comparisonProjectionSchema).max(3),
    observations: z.array(observationProjectionSchema).max(3),
    playbackRuns: z
      .array(
        z
          .object({
            runId: z.string().regex(/^playback-[0-9a-f-]{36}$/),
            requestId: requestIdSchema,
            comparisonId: comparisonIdSchema,
            playback: listeningPlaybackSchema,
            focus: listeningFocusSchema,
            purpose: z.enum([
              "initial-listening",
              "no-difference-recovery",
            ]),
            completedModes: z.array(playbackModeSchema).max(2),
            status: z.enum([
              "starting",
              "started",
              "completed",
              "cancelled",
              "failed",
            ]),
          })
          .strict(),
      )
      .max(9),
    noDifferenceRecoveries: z
      .array(
        z
          .object({
            comparisonId: comparisonIdSchema,
            completedCount: z.union([z.literal(1), z.literal(2)]),
            playback: z.literal("reference-then-simulated"),
            focus: z.literal("important-speaker"),
          })
          .strict(),
      )
      .max(3),
    events: z.array(sessionEvidenceEventSchema).max(64),
    summaryReady: z.boolean(),
    completionState: z.enum(["active", "complete"]),
    limitation: z.string().min(1),
  })
  .strict();
export const getSessionEvidenceDataSchema = z
  .object({ evidence: sessionEvidenceProjectionSchema.nullable() })
  .strict();

const toolFailureSchema = z
  .object({
    code: z.enum(AURALIS_TOOL_ERROR_CODES),
    message: z.string().min(1),
    retryable: z.boolean(),
    recovery: z.string().min(1),
  })
  .strict();

export function auralisToolResultSchema<T extends z.ZodType>(dataSchema: T) {
  const common = {
    contractVersion: z.literal(AURALIS_WEBMCP_CONTRACT_VERSION),
    tool: z.enum(AURALIS_TOOL_NAMES),
    requestId: requestIdSchema.nullable(),
    revision: expectedRevisionSchema,
    phase: z.enum(AURALIS_WEBMCP_PHASES),
    sessionId: sessionIdSchema.nullable(),
    allowedNextTools: z.array(z.enum(AURALIS_TOOL_NAMES)),
    humanGate: humanGateProjectionSchema.nullable(),
    continuation: agentContinuationProjectionSchema,
  } as const;

  return z.discriminatedUnion("ok", [
    z
      .object({
        ...common,
        ok: z.literal(true),
        replayed: z.boolean(),
        data: dataSchema,
        error: z.null(),
      })
      .strict(),
    z
      .object({
        ...common,
        ok: z.literal(false),
        replayed: z.literal(false),
        data: z.null(),
        error: toolFailureSchema,
      })
      .strict(),
  ]);
}
