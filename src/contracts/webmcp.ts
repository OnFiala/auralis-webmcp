import { z } from "zod";

export const AURALIS_WEBMCP_CONTRACT_VERSION = "auralis-webmcp-v1" as const;
export const AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION =
  "auralis-webmcp-evidence-v1" as const;
export const AURALIS_WEBMCP_LIMITATION =
  "This synthetic comparison is illustrative, non-diagnostic, and not a substitute for a hearing assessment." as const;
export const AURALIS_WEBMCP_MAX_REVISION = 2_147_483_647;
export const AURALIS_WEBMCP_MAX_ADAPTATIONS = 2 as const;

export const AURALIS_TOOL_NAMES = [
  "get_auralis_state",
  "stage_demo_session",
  "prepare_comparison",
  "record_user_observation",
  "get_session_evidence",
] as const;

export const AURALIS_WEBMCP_PHASES = [
  "awaiting_session_stage",
  "awaiting_consent",
  "awaiting_profile_confirmation",
  "awaiting_scene_load",
  "awaiting_volume_acknowledgement",
  "ready_for_baseline",
  "awaiting_baseline_listening",
  "awaiting_baseline_observation",
  "ready_for_adaptation",
  "awaiting_comparison_listening",
  "awaiting_comparison_observation",
  "ready_for_summary",
  "complete",
] as const;

export const HUMAN_GATE_KINDS = [
  "confirm_consent",
  "confirm_profile",
  "load_scene",
  "acknowledge_low_volume",
  "listen_baseline",
  "listen_comparison",
  "finish_session",
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
  "playback_started",
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
export type FocusedSpeech = (typeof FOCUSED_SPEECH_VALUES)[number];
export type MaskingSource = (typeof MASKING_SOURCES)[number];
export type RelativeResult = (typeof RELATIVE_RESULTS)[number];
export type NextAction = (typeof NEXT_ACTIONS)[number];
export type ControlChannel = (typeof CONTROL_CHANNELS)[number];
export type EvidenceAction = (typeof EVIDENCE_ACTIONS)[number];
export type SemanticActor = "human" | "agent";
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
const mutationFields = {
  requestId: requestIdSchema,
  expectedRevision: expectedRevisionSchema,
} as const;

export const emptyToolInputSchema = z.object({}).strict();
export const stageDemoSessionInputSchema = z
  .object({
    ...mutationFields,
    profileId: z.enum(PROFILE_IDS),
    goal: z.literal("family-understanding"),
  })
  .strict();

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
export type StageDemoSessionInput = z.infer<
  typeof stageDemoSessionInputSchema
>;
export type PrepareComparisonInput = z.infer<
  typeof prepareComparisonInputSchema
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
  displayName: string;
  classification: "synthetic-illustrative";
  everydayDescription: string;
  demonstrates: string;
  limitation: string;
}>;

export type HumanGateProjection = Readonly<{
  kind: HumanGateKind;
  instruction: string;
  authority: "human-required";
  controlChannels: readonly ControlChannel[];
}>;

export type GetAuralisStateData = Readonly<{
  capabilities: Readonly<{
    maxAdaptiveComparisons: 2;
    profileMode: "synthetic-predefined-only";
    agenticEntry: "agent-origin-only";
    agenticActivationTool: "stage_demo_session";
    audioControl: "human-authority";
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
  }>;
  currentComparison: ComparisonProjection | null;
  audio: Readonly<{
    sourceStatus: "idle" | "loading" | "ready" | "failed";
    lowVolumeAcknowledged: boolean;
    playbackStatus: "stopped" | "playing" | "failed";
  }>;
  summaryReady: boolean;
  limitation: string;
}>;

export type StageDemoSessionData = Readonly<{
  stagedProfile: ProfileProjection;
  agenticPresentation: "active";
  pendingConsent: boolean;
  pendingHumanConfirmation: true;
}>;

export type PrepareComparisonData = Readonly<{
  comparison: ComparisonProjection;
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
}>;

export type SessionEvidenceProjection = Readonly<{
  schemaVersion: typeof AURALIS_WEBMCP_EVIDENCE_SCHEMA_VERSION;
  contractVersion: typeof AURALIS_WEBMCP_CONTRACT_VERSION;
  sessionId: string;
  goal: "family-understanding";
  profile: ProfileProjection | null;
  comparisons: readonly ComparisonProjection[];
  observations: readonly ObservationProjection[];
  events: readonly SessionEvidenceEvent[];
  summaryReady: boolean;
  completionState: "active" | "ready_for_summary" | "complete";
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
  data: null;
  error: AuralisToolFailure;
}>;

export type AuralisToolResult<T> = AuralisToolSuccess<T> | AuralisToolError;

const profileIdSchema = z.enum(PROFILE_IDS);
const comparisonIdSchema = z.enum(COMPARISON_IDS);
const observationIdSchema = z.enum(OBSERVATION_IDS);
const playbackModeSchema = z.enum(PLAYBACK_MODES);
const sessionIdSchema = z
  .string()
  .regex(
    /^session-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
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
    displayName: z.string().min(1),
    classification: z.literal("synthetic-illustrative"),
    everydayDescription: z.string().min(1),
    demonstrates: z.string().min(1),
    limitation: z.string().min(1),
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

export const getAuralisStateDataSchema = z
  .object({
    capabilities: z
      .object({
        maxAdaptiveComparisons: z.literal(2),
        profileMode: z.literal("synthetic-predefined-only"),
        agenticEntry: z.literal("agent-origin-only"),
        agenticActivationTool: z.literal("stage_demo_session"),
        audioControl: z.literal("human-authority"),
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
      })
      .strict(),
    currentComparison: comparisonProjectionSchema.nullable(),
    audio: z
      .object({
        sourceStatus: z.enum(["idle", "loading", "ready", "failed"]),
        lowVolumeAcknowledged: z.boolean(),
        playbackStatus: z.enum(["stopped", "playing", "failed"]),
      })
      .strict(),
    summaryReady: z.boolean(),
    limitation: z.string().min(1),
  })
  .strict();

export const stageDemoSessionDataSchema = z
  .object({
    stagedProfile: profileProjectionSchema,
    agenticPresentation: z.literal("active"),
    pendingConsent: z.boolean(),
    pendingHumanConfirmation: z.literal(true),
  })
  .strict();

export const prepareComparisonDataSchema = z
  .object({ comparison: comparisonProjectionSchema })
  .strict();
export const recordUserObservationDataSchema = z
  .object({
    observation: observationProjectionSchema,
    nextPhase: z.enum(AURALIS_WEBMCP_PHASES),
  })
  .strict();

export const sessionEvidenceEventSchema = z
  .object({
    sequence: z.number().int().positive(),
    revision: expectedRevisionSchema,
    actor: z.enum(["human", "agent"]),
    action: z.enum(EVIDENCE_ACTIONS),
    requestId: requestIdSchema.nullable(),
    comparisonId: comparisonIdSchema.nullable(),
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
    events: z.array(sessionEvidenceEventSchema).max(17),
    summaryReady: z.boolean(),
    completionState: z.enum(["active", "ready_for_summary", "complete"]),
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
