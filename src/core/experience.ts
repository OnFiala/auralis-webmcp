import {
  MAX_MODEL_ATTEMPTS_PER_SESSION,
  MODEL_ID,
  MODEL_OPERATION,
  modelExplanationRequestSchema,
  type ModelExplanationRequest,
  type ModelExplanationResponse,
} from "../contracts/runtime";
import type {
  AuralisToolName,
  ComparisonProjection,
  ListeningFocus,
  ListeningPlayback,
  ObservationProjection,
  PlaybackMode,
  ProfileId,
  SessionEvidenceEvent,
} from "../contracts/webmcp";
import {
  FREQUENCY_KEYS,
  MANUAL_PROFILE_ENTRY_LABEL,
  ProfileValidationError,
  confirmManualAudiogramDraft,
  confirmPredefinedProfile,
  createManualAudiogramDraft,
  predefinedProfileById,
  updateManualAudiogramDraft,
  type ConfirmedHearingProfile,
  type Ear,
  type FrequencyKey,
  type ManualAudiogramDraft,
  type PredefinedProfileId,
  type ProfileEntryOption,
} from "./profile";
import {
  createComparisonPlan,
  resultForSupportMode,
  resultIdentityForMode,
  type ComparisonMode,
  type ComparisonPlan,
  type InterventionState,
  type SpeakerPositionState,
  type SupportMode,
  type TransformedResultPlan,
} from "./transformation";

export type ExperienceComparisonMode = ComparisonMode;
export type ExperienceSupportMode = SupportMode;
export type ExperienceInterventionState = InterventionState;
export type ExperienceSpeakerPositionState = SpeakerPositionState;
export type ExperienceProfileEntryOption = ProfileEntryOption;
export type ExperienceCompletionState =
  | "in-progress"
  | "complete-live"
  | "complete-degraded";

export type ModelState =
  | Readonly<{ status: "idle" }>
  | Readonly<{
      status: "loading";
      request: ModelExplanationRequest;
      canonicalResultIdentity: string;
    }>
  | Readonly<{
      status: "live";
      result: Extract<ModelExplanationResponse, { status: "live" }>;
    }>
  | Readonly<{
      status: "degraded";
      result: Extract<ModelExplanationResponse, { status: "degraded" }>;
    }>;

type SourceState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "loading" }>
  | Readonly<{
      status: "ready";
      sourceIdentity: string;
      sampleRate: number;
      frameCount: number;
      durationSeconds: number;
    }>
  | Readonly<{ status: "failed" }>;

type RenderState =
  | Readonly<{ status: "idle" }>
  | Readonly<{ status: "rendering" }>
  | Readonly<{
      status: "ready";
      sourceIdentity: string;
      resultIdentity: string;
      peakDbFs: number;
    }>
  | Readonly<{ status: "failed" }>;

type PlaybackState =
  | Readonly<{
      status: "stopped";
      mode: null;
      supportMode: null;
      interventionState: null;
      speakerPositionState: null;
      resultIdentity: null;
      runId: null;
    }>
  | Readonly<{
      status: "playing";
      mode: ComparisonMode;
      supportMode: SupportMode | null;
      interventionState: InterventionState;
      speakerPositionState: SpeakerPositionState;
      resultIdentity: string;
      runId: string | null;
    }>
  | Readonly<{
      status: "failed";
      mode: null;
      supportMode: null;
      interventionState: null;
      speakerPositionState: null;
      resultIdentity: null;
      runId: null;
    }>;

export type ValidatedFailureCode =
  | "invalid-profile"
  | "invalid-transition"
  | "stale-transition"
  | "source-load-failed"
  | "audio-safety-rejected"
  | "audio-runtime-unavailable"
  | "audio-runtime-interrupted";

export type ValidatedFailure = Readonly<{
  validated: true;
  code: ValidatedFailureCode;
  message: string;
}>;

export type WebMcpRequestRecord = Readonly<{
  requestId: string;
  tool: AuralisToolName;
  canonicalInput: string;
  data: unknown;
}>;

export type WebMcpPendingPlayback = Readonly<{
  comparisonId: ComparisonProjection["comparisonId"];
  mode: ExperienceComparisonMode;
  runId: string | null;
}>;

export type WebMcpPlaybackRun = Readonly<{
  runId: string;
  requestId: string;
  canonicalInput: string;
  comparisonId: ComparisonProjection["comparisonId"];
  playback: ListeningPlayback;
  focus: ListeningFocus;
  purpose: "initial-listening" | "no-difference-recovery";
  sequence: readonly PlaybackMode[];
  completedModes: readonly PlaybackMode[];
  status: "starting" | "started" | "completed" | "cancelled" | "failed";
}>;

export type WebMcpNoDifferenceRecovery = Readonly<{
  comparisonId: ComparisonProjection["comparisonId"];
  completedCount: 1 | 2;
}>;

export type WebMcpSessionState = Readonly<{
  sessionId: string;
  goal: "family-understanding";
  stagedProfileId: ProfileId | null;
  confirmedProfileId: ProfileId | null;
  consentConfirmed: boolean;
  stageCount: 1 | 2;
  comparisons: readonly ComparisonProjection[];
  observations: readonly ObservationProjection[];
  events: readonly SessionEvidenceEvent[];
  pendingPlayback: WebMcpPendingPlayback | null;
  playbackRuns: readonly WebMcpPlaybackRun[];
  noDifferenceRecoveries: readonly WebMcpNoDifferenceRecovery[];
  completionState: "active" | "ready_for_summary" | "complete";
}>;

export type WebMcpExperienceSlice = Readonly<{
  revision: number;
  humanJourneyProgressed: boolean;
  session: WebMcpSessionState | null;
  requestRecords: readonly WebMcpRequestRecord[];
}>;

export type ExperienceState = Readonly<{
  selectedProfileEntry: ProfileEntryOption;
  manualDraft: ManualAudiogramDraft;
  draftRevision: number;
  lastEdit: Readonly<{
    ear: Ear;
    frequency: FrequencyKey;
    previousValue: string;
    nextValue: string;
  }> | null;
  confirmedProfile: ConfirmedHearingProfile | null;
  comparisonPlan: ComparisonPlan | null;
  supportMode: SupportMode;
  interventionState: InterventionState;
  speakerPositionState: SpeakerPositionState;
  source: SourceState;
  renders: Readonly<Record<ComparisonMode, RenderState>>;
  lowVolumeAcknowledged: boolean;
  agentPlaybackGranted: boolean;
  playback: PlaybackState;
  modelGroundingRevision: number;
  modelAttemptsUsed: number;
  modelState: ModelState;
  completionState: ExperienceCompletionState;
  failure: ValidatedFailure | null;
  webMcp: WebMcpExperienceSlice;
}>;

export type ExperienceAction =
  | Readonly<{
      type: "profile-entry-selected";
      entryOption: ProfileEntryOption;
    }>
  | Readonly<{
      type: "manual-value-changed";
      ear: Ear;
      frequency: FrequencyKey;
      value: string;
    }>
  | Readonly<{ type: "manual-profile-confirmed"; sourceIdentity: string }>
  | Readonly<{
      type: "predefined-profile-confirmed";
      profileId: PredefinedProfileId;
      sourceIdentity: string;
    }>
  | Readonly<{ type: "support-mode-changed"; supportMode: SupportMode }>
  | Readonly<{
      type: "intervention-state-changed";
      interventionState: InterventionState;
    }>
  | Readonly<{
      type: "speaker-position-changed";
      speakerPositionState: SpeakerPositionState;
    }>
  | Readonly<{ type: "low-volume-acknowledgement-changed"; acknowledged: boolean }>
  | Readonly<{ type: "source-load-started" }>
  | Readonly<{
      type: "source-ready";
      sourceIdentity: string;
      sampleRate: number;
      frameCount: number;
      durationSeconds: number;
    }>
  | Readonly<{ type: "render-started"; mode: ComparisonMode }>
  | Readonly<{
      type: "playback-started";
      mode: ComparisonMode;
      supportMode: SupportMode | null;
      interventionState: InterventionState;
      speakerPositionState: SpeakerPositionState;
      sourceIdentity: string;
      resultIdentity: string;
      peakDbFs: number;
      actor?: "human" | "agent";
      runId?: string;
    }>
  | Readonly<{
      type: "playback-stopped";
      runId?: string;
    }>
  | Readonly<{
      type: "playback-ended";
      resultIdentity: string;
      runId?: string;
    }>
  | Readonly<{
      type: "model-request-started";
      request: ModelExplanationRequest;
    }>
  | Readonly<{
      type: "model-result-received";
      result: ModelExplanationResponse;
    }>
  | Readonly<{ type: "experience-completed" }>
  | Readonly<{ type: "comparison-reset" }>
  | Readonly<{
      type: "webmcp-session-staged";
      sessionId: string;
      requestRecord: WebMcpRequestRecord;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-human-consent-confirmed";
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-agent-profile-selected";
      profileId: ProfileId;
      sourceIdentity: string;
      requestRecord: WebMcpRequestRecord;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-human-profile-selected";
      profileId: ProfileId;
      sourceIdentity: string;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-comparison-prepared";
      comparison: ComparisonProjection;
      requestRecord: WebMcpRequestRecord | null;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-observation-recorded";
      observation: ObservationProjection;
      requestRecord: WebMcpRequestRecord | null;
      event: SessionEvidenceEvent;
      completionState: "active" | "ready_for_summary";
    }>
  | Readonly<{
      type: "webmcp-human-listening-readiness-confirmed";
      agentPlaybackGranted: boolean;
      comparison: ComparisonProjection;
      volumeEvent: SessionEvidenceEvent;
      comparisonEvent: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-agent-playback-reserved";
      run: WebMcpPlaybackRun;
      requestRecord: WebMcpRequestRecord;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-agent-playback-failed";
      runId: string;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-agent-playback-cancelled";
      runId: string;
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-no-difference-recovery-completed";
      comparisonId: ComparisonProjection["comparisonId"];
      event: SessionEvidenceEvent;
    }>
  | Readonly<{
      type: "webmcp-human-session-finished";
      event: SessionEvidenceEvent;
    }>
  | Readonly<{ type: "webmcp-human-reset" }>
  | Readonly<{
      type: "operation-failed";
      code: Exclude<ValidatedFailureCode, "invalid-profile" | "invalid-transition" | "stale-transition">;
      mode?: ComparisonMode;
    }>;

const failureMessages: Record<ValidatedFailureCode, string> = {
  "invalid-profile":
    "Complete every left and right value using 0–100 dB HL in 5 dB steps.",
  "invalid-transition": "That action is not available in the current experience state.",
  "stale-transition": "The result no longer matches the confirmed profile or source.",
  "source-load-failed": "The validated family scene could not be loaded.",
  "audio-safety-rejected": "Playback was blocked because digital validation did not pass.",
  "audio-runtime-unavailable": "This browser could not prepare the audio proof.",
  "audio-runtime-interrupted":
    "Playback was muted because the browser audio runtime was interrupted.",
};

const idleRenders = (): Readonly<Record<ComparisonMode, RenderState>> =>
  Object.freeze({
    reference: Object.freeze({ status: "idle" as const }),
    simulated: Object.freeze({ status: "idle" as const }),
  });

const stoppedPlayback = (): PlaybackState =>
  Object.freeze({
    status: "stopped" as const,
    mode: null,
    supportMode: null,
    interventionState: null,
    speakerPositionState: null,
    resultIdentity: null,
    runId: null,
  });

const idleModelState = (): ModelState =>
  Object.freeze({ status: "idle" as const });

const initialWebMcpSlice = (revision = 0): WebMcpExperienceSlice =>
  Object.freeze({
    revision,
    humanJourneyProgressed: false,
    session: null,
    requestRecords: Object.freeze([]),
  });

export function createInitialExperienceState(): ExperienceState {
  return Object.freeze({
    selectedProfileEntry: "manual" as const,
    manualDraft: createManualAudiogramDraft(),
    draftRevision: 0,
    lastEdit: null,
    confirmedProfile: null,
    comparisonPlan: null,
    supportMode: "none" as const,
    interventionState: "tv-on" as const,
    speakerPositionState: "original-position" as const,
    source: Object.freeze({ status: "idle" as const }),
    renders: idleRenders(),
    lowVolumeAcknowledged: false,
    agentPlaybackGranted: false,
    playback: stoppedPlayback(),
    modelGroundingRevision: 0,
    modelAttemptsUsed: 0,
    modelState: idleModelState(),
    completionState: "in-progress" as const,
    failure: null,
    webMcp: initialWebMcpSlice(),
  });
}

function failure(code: ValidatedFailureCode): ValidatedFailure {
  return Object.freeze({
    validated: true as const,
    code,
    message: failureMessages[code],
  });
}

function rejectTransition(
  state: ExperienceState,
  code: "invalid-transition" | "stale-transition",
): ExperienceState {
  return Object.freeze({
    ...state,
    failure: failure(code),
  });
}

function expectedResultIdentity(
  state: ExperienceState,
  mode: ComparisonMode,
): string | null {
  return state.comparisonPlan
    ? resultIdentityForMode(
        state.comparisonPlan,
        mode,
        state.supportMode,
        state.interventionState,
        state.speakerPositionState,
      )
    : null;
}

function invalidatedModelAndCompletionState(state: ExperienceState) {
  return {
    modelGroundingRevision: state.modelGroundingRevision + 1,
    modelState: idleModelState(),
    completionState: "in-progress" as const,
  } as const;
}

export function comparisonResultIdentity(
  state: ExperienceState,
  mode: ExperienceComparisonMode,
): string | null {
  return expectedResultIdentity(state, mode);
}

export function currentTransformedResult(
  state: ExperienceState,
): TransformedResultPlan | null {
  return state.comparisonPlan
    ? resultForSupportMode(
        state.comparisonPlan,
        state.supportMode,
        state.interventionState,
        state.speakerPositionState,
      )
    : null;
}

export function canCompleteExperience(state: ExperienceState): boolean {
  const result = currentTransformedResult(state);
  const modelResult =
    state.modelState.status === "live" || state.modelState.status === "degraded"
      ? state.modelState.result
      : null;

  return (
    state.confirmedProfile !== null &&
    state.source.status === "ready" &&
    result !== null &&
    state.renders.reference.status !== "rendering" &&
    state.renders.simulated.status === "ready" &&
    state.renders.simulated.sourceIdentity === result.sourceIdentity &&
    state.renders.simulated.resultIdentity === result.resultIdentity &&
    state.playback.status === "stopped" &&
    modelResult !== null &&
    modelResult.sourceIdentity === result.sourceIdentity &&
    modelResult.groundingRevision === state.modelGroundingRevision
  );
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function profileSummary(
  profile: ConfirmedHearingProfile,
): ModelExplanationRequest["profile"] {
  const left = FREQUENCY_KEYS.map(
    (frequency) => profile.leftThresholdsDbHl[frequency],
  );
  const right = FREQUENCY_KEYS.map(
    (frequency) => profile.rightThresholdsDbHl[frequency],
  );
  const combined = left.map((value, index) => (value + right[index]!) / 2);
  const lowerAverage = average(combined.slice(0, 3));
  const higherAverage = average(combined.slice(3));
  const range = Math.max(...combined) - Math.min(...combined);
  const leftAverage = average(left);
  const rightAverage = average(right);

  return Object.freeze({
    origin: profile.sourceType,
    predefinedProfileId: profile.predefinedProfileId,
    pattern:
      higherAverage - lowerAverage >= 10
        ? ("higher-frequency-emphasis" as const)
        : range <= 15
          ? ("broad-frequency" as const)
          : ("mixed-frequency" as const),
    earBalance:
      leftAverage - rightAverage >= 10
        ? ("left-more-attenuated" as const)
        : rightAverage - leftAverage >= 10
          ? ("right-more-attenuated" as const)
          : ("similar" as const),
  });
}

export function canRequestModelExplanation(state: ExperienceState): boolean {
  const result = currentTransformedResult(state);

  return (
    state.confirmedProfile !== null &&
    state.source.status === "ready" &&
    result !== null &&
    state.renders.simulated.status === "ready" &&
    state.renders.simulated.sourceIdentity === result.sourceIdentity &&
    state.renders.simulated.resultIdentity === result.resultIdentity &&
    state.modelState.status !== "loading" &&
    state.modelAttemptsUsed < MAX_MODEL_ATTEMPTS_PER_SESSION
  );
}

export function createModelExplanationRequest(
  state: ExperienceState,
  runId: string,
  attemptId: string,
  transportResultIdentity: string,
): ModelExplanationRequest | null {
  if (!canRequestModelExplanation(state) || !state.confirmedProfile) {
    return null;
  }

  const result = currentTransformedResult(state);

  if (!result) {
    return null;
  }

  return modelExplanationRequestSchema.parse({
    operation: MODEL_OPERATION,
    runId,
    attemptId,
    attemptNumber: state.modelAttemptsUsed + 1,
    groundingRevision: state.modelGroundingRevision,
    sourceIdentity: result.sourceIdentity,
    resultIdentity: transportResultIdentity,
    profile: profileSummary(state.confirmedProfile),
    supportMode: state.supportMode,
    interventionState: state.interventionState,
    speakerPositionState: state.speakerPositionState,
    transformation: {
      support:
        state.supportMode === "none"
          ? "unsupported"
          : state.supportMode === "left-one-sided"
            ? "left-ear-partial-compensation"
            : "bilateral-partial-compensation",
      television:
        state.interventionState === "tv-on" ? "included" : "removed",
      focusedSpeechPosition: state.speakerPositionState,
      overlappingSpeech: "unchanged",
      kitchenRoom: "unchanged",
      limitation: "illustrative-non-clinical",
    },
    scene: {
      sceneId: "family-dinner",
      sourcePackage: "four-synchronized-synthetic-stems",
      focusedSpeech: "present",
      overlappingSpeech: "present",
      television: "present-in-source",
      kitchenRoom: "sparse-events",
    },
  });
}

function confirmProfile(
  state: ExperienceState,
  profile: ConfirmedHearingProfile,
  sourceIdentity: string,
): ExperienceState {
  const comparisonPlan = createComparisonPlan(profile, sourceIdentity);

  return Object.freeze({
    ...state,
    confirmedProfile: profile,
    comparisonPlan,
    supportMode: "none" as const,
    interventionState: "tv-on" as const,
    speakerPositionState: "original-position" as const,
    renders: idleRenders(),
    playback: stoppedPlayback(),
    ...invalidatedModelAndCompletionState(state),
    failure: null,
  });
}

function reduceExperienceState(
  state: ExperienceState,
  action: ExperienceAction,
): ExperienceState {
  switch (action.type) {
    case "profile-entry-selected": {
      if (state.selectedProfileEntry === action.entryOption) {
        return Object.freeze({
          ...state,
          failure: null,
        });
      }

      return Object.freeze({
        ...state,
        selectedProfileEntry: action.entryOption,
        confirmedProfile: null,
        comparisonPlan: null,
        supportMode: "none" as const,
        interventionState: "tv-on" as const,
        speakerPositionState: "original-position" as const,
        source:
          state.source.status === "loading"
            ? Object.freeze({ status: "idle" as const })
            : state.source,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "manual-value-changed": {
      if (
        state.selectedProfileEntry !== "manual" ||
        state.playback.status === "playing"
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      const previousValue = state.manualDraft[action.ear][action.frequency];

      return Object.freeze({
        ...state,
        manualDraft: updateManualAudiogramDraft(
          state.manualDraft,
          action.ear,
          action.frequency,
          action.value,
        ),
        draftRevision: state.draftRevision + 1,
        lastEdit: Object.freeze({
          ear: action.ear,
          frequency: action.frequency,
          previousValue,
          nextValue: action.value,
        }),
        confirmedProfile: null,
        comparisonPlan: null,
        supportMode: "none" as const,
        interventionState: "tv-on" as const,
        speakerPositionState: "original-position" as const,
        source:
          state.source.status === "loading"
            ? Object.freeze({ status: "idle" as const })
            : state.source,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "manual-profile-confirmed": {
      if (
        state.selectedProfileEntry !== "manual" ||
        state.playback.status === "playing"
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      try {
        const profile = confirmManualAudiogramDraft(
          state.manualDraft,
          state.draftRevision,
        );

        return confirmProfile(state, profile, action.sourceIdentity);
      } catch (error) {
        if (error instanceof ProfileValidationError) {
          return Object.freeze({
            ...state,
            confirmedProfile: null,
            comparisonPlan: null,
            supportMode: "none" as const,
            interventionState: "tv-on" as const,
            speakerPositionState: "original-position" as const,
            renders: idleRenders(),
            failure: failure("invalid-profile"),
          });
        }

        throw error;
      }
    }

    case "predefined-profile-confirmed": {
      if (
        state.selectedProfileEntry !== action.profileId ||
        state.playback.status === "playing"
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      try {
        const profile = confirmPredefinedProfile(
          action.profileId,
          state.draftRevision,
        );

        return confirmProfile(state, profile, action.sourceIdentity);
      } catch (error) {
        if (error instanceof ProfileValidationError) {
          return Object.freeze({
            ...state,
            confirmedProfile: null,
            comparisonPlan: null,
            supportMode: "none" as const,
            interventionState: "tv-on" as const,
            speakerPositionState: "original-position" as const,
            renders: idleRenders(),
            failure: failure("invalid-profile"),
          });
        }

        throw error;
      }
    }

    case "support-mode-changed": {
      const rendering =
        state.renders.reference.status === "rendering" ||
        state.renders.simulated.status === "rendering";

      if (
        !state.comparisonPlan ||
        state.source.status === "loading" ||
        state.playback.status === "playing" ||
        rendering
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      if (state.supportMode === action.supportMode) {
        return Object.freeze({
          ...state,
          failure: null,
        });
      }

      return Object.freeze({
        ...state,
        supportMode: action.supportMode,
        renders: Object.freeze({
          ...state.renders,
          simulated: Object.freeze({ status: "idle" as const }),
        }),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "intervention-state-changed": {
      const rendering =
        state.renders.reference.status === "rendering" ||
        state.renders.simulated.status === "rendering";

      if (
        !state.comparisonPlan ||
        state.source.status !== "ready" ||
        state.playback.status === "playing" ||
        rendering
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      if (state.interventionState === action.interventionState) {
        return Object.freeze({
          ...state,
          failure: null,
        });
      }

      return Object.freeze({
        ...state,
        interventionState: action.interventionState,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "speaker-position-changed": {
      const rendering =
        state.renders.reference.status === "rendering" ||
        state.renders.simulated.status === "rendering";

      if (
        !state.comparisonPlan ||
        state.source.status !== "ready" ||
        state.playback.status === "playing" ||
        rendering
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      if (state.speakerPositionState === action.speakerPositionState) {
        return Object.freeze({
          ...state,
          failure: null,
        });
      }

      return Object.freeze({
        ...state,
        speakerPositionState: action.speakerPositionState,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "low-volume-acknowledgement-changed": {
      const rendering =
        state.renders.reference.status === "rendering" ||
        state.renders.simulated.status === "rendering";

      if ((state.playback.status === "playing" || rendering) && !action.acknowledged) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        lowVolumeAcknowledged: action.acknowledged,
        failure: null,
      });
    }

    case "source-load-started": {
      if (!state.comparisonPlan || state.playback.status === "playing") {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        source: Object.freeze({ status: "loading" as const }),
        renders: idleRenders(),
        ...invalidatedModelAndCompletionState(state),
        failure: null,
      });
    }

    case "source-ready": {
      if (
        !state.comparisonPlan ||
        state.source.status !== "loading" ||
        action.sourceIdentity !== state.comparisonPlan.sourceIdentity
      ) {
        return rejectTransition(state, "stale-transition");
      }

      return Object.freeze({
        ...state,
        source: Object.freeze({
          status: "ready" as const,
          sourceIdentity: action.sourceIdentity,
          sampleRate: action.sampleRate,
          frameCount: action.frameCount,
          durationSeconds: action.durationSeconds,
        }),
        renders: idleRenders(),
        failure: null,
      });
    }

    case "render-started": {
      if (
        !state.comparisonPlan ||
        state.source.status !== "ready" ||
        state.source.sourceIdentity !== state.comparisonPlan.sourceIdentity ||
        !state.lowVolumeAcknowledged ||
        state.playback.status === "playing"
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        renders: Object.freeze({
          ...state.renders,
          [action.mode]: Object.freeze({ status: "rendering" as const }),
        }),
        completionState: "in-progress" as const,
        failure: null,
      });
    }

    case "playback-started": {
      const expectedIdentity = expectedResultIdentity(state, action.mode);
      const expectedSupportMode =
        action.mode === "reference" ? null : state.supportMode;
      const run = action.runId
        ? state.webMcp.session?.playbackRuns.find(
            (candidate) => candidate.runId === action.runId,
          ) ?? null
        : null;
      const runMatches = action.runId
        ? Boolean(
            run &&
              run.status === "starting" &&
              run.comparisonId ===
                state.webMcp.session?.comparisons.at(-1)?.comparisonId &&
              run.sequence[run.completedModes.length] === action.mode,
          )
        : true;

      if (action.runId && !runMatches) {
        return state;
      }

      if (
        !state.lowVolumeAcknowledged ||
        state.source.status !== "ready" ||
        state.source.sourceIdentity !== action.sourceIdentity ||
        state.comparisonPlan?.sourceIdentity !== action.sourceIdentity ||
        expectedIdentity === null ||
        expectedIdentity !== action.resultIdentity ||
        action.supportMode !== expectedSupportMode ||
        action.interventionState !== state.interventionState ||
        action.speakerPositionState !== state.speakerPositionState ||
        state.renders[action.mode].status !== "rendering"
      ) {
        return rejectTransition(state, "stale-transition");
      }

      return Object.freeze({
        ...state,
        renders: Object.freeze({
          ...state.renders,
          [action.mode]: Object.freeze({
            status: "ready" as const,
            sourceIdentity: action.sourceIdentity,
            resultIdentity: action.resultIdentity,
            peakDbFs: action.peakDbFs,
          }),
        }),
        playback: Object.freeze({
          status: "playing" as const,
          mode: action.mode,
          supportMode: expectedSupportMode,
          interventionState: state.interventionState,
          speakerPositionState: state.speakerPositionState,
          resultIdentity: action.resultIdentity,
          runId: action.runId ?? null,
        }),
        completionState: "in-progress" as const,
        failure: null,
      });
    }

    case "playback-stopped": {
      if (
        state.playback.status === "playing" &&
        state.playback.runId !== (action.runId ?? null)
      ) {
        return state;
      }
      const resetInterruptedRender = (render: RenderState): RenderState =>
        render.status === "rendering"
          ? Object.freeze({ status: "idle" as const })
          : render;

      return Object.freeze({
        ...state,
        renders: Object.freeze({
          reference: resetInterruptedRender(state.renders.reference),
          simulated: resetInterruptedRender(state.renders.simulated),
        }),
        playback: stoppedPlayback(),
        failure: null,
      });
    }

    case "playback-ended": {
      if (
        state.playback.status !== "playing" ||
        state.playback.resultIdentity !== action.resultIdentity ||
        state.playback.runId !== (action.runId ?? null)
      ) {
        return state;
      }

      return Object.freeze({
        ...state,
        playback: stoppedPlayback(),
      });
    }

    case "model-request-started": {
      const currentResult = currentTransformedResult(state);
      const request = action.request;

      if (
        !canRequestModelExplanation(state) ||
        !currentResult ||
        request.operation !== MODEL_OPERATION ||
        request.attemptNumber !== state.modelAttemptsUsed + 1 ||
        request.groundingRevision !== state.modelGroundingRevision ||
        request.sourceIdentity !== currentResult.sourceIdentity ||
        request.supportMode !== state.supportMode ||
        request.interventionState !== state.interventionState ||
        request.speakerPositionState !== state.speakerPositionState
      ) {
        return rejectTransition(state, "stale-transition");
      }

      return Object.freeze({
        ...state,
        modelAttemptsUsed: state.modelAttemptsUsed + 1,
        modelState: Object.freeze({
          status: "loading" as const,
          request,
          canonicalResultIdentity: currentResult.resultIdentity,
        }),
        completionState: "in-progress" as const,
        failure: null,
      });
    }

    case "model-result-received": {
      if (state.modelState.status !== "loading") {
        return state;
      }

      const pending = state.modelState.request;
      const pendingCanonicalResultIdentity =
        state.modelState.canonicalResultIdentity;
      const currentResult = currentTransformedResult(state);
      const result = action.result;

      if (
        !currentResult ||
        result.operation !== MODEL_OPERATION ||
        result.runId !== pending.runId ||
        result.attemptId !== pending.attemptId ||
        result.attemptNumber !== pending.attemptNumber ||
        result.groundingRevision !== pending.groundingRevision ||
        result.groundingRevision !== state.modelGroundingRevision ||
        result.sourceIdentity !== pending.sourceIdentity ||
        result.sourceIdentity !== currentResult.sourceIdentity ||
        result.resultIdentity !== pending.resultIdentity ||
        pendingCanonicalResultIdentity !== currentResult.resultIdentity
      ) {
        return Object.freeze({
          ...state,
          modelState: idleModelState(),
        });
      }

      return Object.freeze({
        ...state,
        modelState:
          result.status === "live"
            ? Object.freeze({ status: "live" as const, result })
            : Object.freeze({ status: "degraded" as const, result }),
        failure: null,
      });
    }

    case "experience-completed": {
      if (
        !canCompleteExperience(state) ||
        (state.modelState.status !== "live" &&
          state.modelState.status !== "degraded")
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        completionState:
          state.modelState.status === "live"
            ? ("complete-live" as const)
            : ("complete-degraded" as const),
        failure: null,
      });
    }

    case "comparison-reset": {
      if (state.completionState === "in-progress") {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...createInitialExperienceState(),
        modelGroundingRevision: state.modelGroundingRevision + 1,
        modelAttemptsUsed: state.modelAttemptsUsed,
      });
    }

    case "webmcp-session-staged": {
      if (state.webMcp.session) {
        return rejectTransition(state, "invalid-transition");
      }
      const session: WebMcpSessionState = Object.freeze({
        sessionId: action.sessionId,
        goal: "family-understanding" as const,
        stagedProfileId: null,
        confirmedProfileId: null,
        consentConfirmed: false,
        stageCount: 1 as const,
        comparisons: Object.freeze([]),
        observations: Object.freeze([]),
        events: Object.freeze([action.event]),
        pendingPlayback: null,
        playbackRuns: Object.freeze([]),
        noDifferenceRecoveries: Object.freeze([]),
        completionState: "active" as const,
      });

      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session,
          requestRecords: Object.freeze([
            ...state.webMcp.requestRecords,
            action.requestRecord,
          ]),
        }),
        failure: null,
      });
    }

    case "webmcp-human-consent-confirmed": {
      const session = state.webMcp.session;
      if (!session || session.consentConfirmed) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            consentConfirmed: true,
            events: Object.freeze([...session.events, action.event]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-agent-profile-selected":
    case "webmcp-human-profile-selected": {
      const session = state.webMcp.session;
      if (
        !session ||
        !session.consentConfirmed ||
        session.confirmedProfileId !== null ||
        state.playback.status === "playing"
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      const profile = confirmPredefinedProfile(
        action.profileId,
        state.draftRevision,
      );
      const confirmed = confirmProfile(state, profile, action.sourceIdentity);
      const selectedByAgent = action.type === "webmcp-agent-profile-selected";

      return Object.freeze({
        ...confirmed,
        selectedProfileEntry: action.profileId,
        webMcp: Object.freeze({
          ...confirmed.webMcp,
          session: Object.freeze({
            ...session,
            stagedProfileId: action.profileId,
            confirmedProfileId: action.profileId,
            stageCount: selectedByAgent ? (2 as const) : session.stageCount,
            events: Object.freeze([...session.events, action.event]),
          }),
          requestRecords: selectedByAgent
            ? Object.freeze([
                ...confirmed.webMcp.requestRecords,
                action.requestRecord,
              ])
            : confirmed.webMcp.requestRecords,
        }),
        failure: null,
      });
    }

    case "webmcp-comparison-prepared": {
      const session = state.webMcp.session;
      if (!session) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        supportMode: action.comparison.settings.supportMode,
        interventionState: action.comparison.settings.televisionState,
        speakerPositionState: action.comparison.settings.speakerPosition,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            comparisons: Object.freeze([
              ...session.comparisons,
              action.comparison,
            ]),
            pendingPlayback: null,
            events: Object.freeze([...session.events, action.event]),
          }),
          requestRecords: action.requestRecord
            ? Object.freeze([
                ...state.webMcp.requestRecords,
                action.requestRecord,
              ])
            : state.webMcp.requestRecords,
        }),
        failure: null,
      });
    }

    case "webmcp-observation-recorded": {
      const session = state.webMcp.session;
      if (!session) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            comparisons: Object.freeze(
              session.comparisons.map((comparison) =>
                comparison.comparisonId === action.observation.comparisonId
                  ? Object.freeze({
                      ...comparison,
                      observationId: action.observation.observationId,
                    })
                  : comparison,
              ),
            ),
            observations: Object.freeze([
              ...session.observations,
              action.observation,
            ]),
            completionState: action.completionState,
            events: Object.freeze([...session.events, action.event]),
          }),
          requestRecords: action.requestRecord
            ? Object.freeze([
                ...state.webMcp.requestRecords,
                action.requestRecord,
              ])
            : state.webMcp.requestRecords,
        }),
        failure: null,
      });
    }

    case "webmcp-human-listening-readiness-confirmed": {
      const session = state.webMcp.session;
      if (
        !session ||
        !session.confirmedProfileId ||
        state.source.status !== "ready" ||
        state.lowVolumeAcknowledged ||
        session.comparisons.length !== 0
      ) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        lowVolumeAcknowledged: true,
        agentPlaybackGranted: action.agentPlaybackGranted,
        supportMode: action.comparison.settings.supportMode,
        interventionState: action.comparison.settings.televisionState,
        speakerPositionState: action.comparison.settings.speakerPosition,
        renders: idleRenders(),
        playback: stoppedPlayback(),
        ...invalidatedModelAndCompletionState(state),
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            comparisons: Object.freeze([action.comparison]),
            events: Object.freeze([
              ...session.events,
              action.volumeEvent,
              action.comparisonEvent,
            ]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-agent-playback-reserved": {
      const session = state.webMcp.session;
      if (!session) {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            playbackRuns: Object.freeze([
              ...session.playbackRuns,
              action.run,
            ]),
            events: Object.freeze([...session.events, action.event]),
          }),
          requestRecords: Object.freeze([
            ...state.webMcp.requestRecords,
            action.requestRecord,
          ]),
        }),
        failure: null,
      });
    }

    case "webmcp-agent-playback-failed": {
      const session = state.webMcp.session;
      const run = session?.playbackRuns.find(
        (candidate) => candidate.runId === action.runId,
      );
      if (!session || !run || run.status === "completed" || run.status === "cancelled") {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        playback:
          state.playback.status === "playing" &&
          state.playback.runId === action.runId
            ? stoppedPlayback()
            : state.playback,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            pendingPlayback:
              session.pendingPlayback?.runId === action.runId
                ? null
                : session.pendingPlayback,
            playbackRuns: Object.freeze(
              session.playbackRuns.map((candidate) =>
                candidate.runId === action.runId
                  ? Object.freeze({ ...candidate, status: "failed" as const })
                  : candidate,
              ),
            ),
            events: Object.freeze([...session.events, action.event]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-agent-playback-cancelled": {
      const session = state.webMcp.session;
      const run = session?.playbackRuns.find(
        (candidate) => candidate.runId === action.runId,
      );
      if (
        !session ||
        !run ||
        (run.status !== "starting" && run.status !== "started")
      ) {
        return state;
      }
      const resetInterruptedRender = (render: RenderState): RenderState =>
        render.status === "rendering"
          ? Object.freeze({ status: "idle" as const })
          : render;

      return Object.freeze({
        ...state,
        renders: Object.freeze({
          reference: resetInterruptedRender(state.renders.reference),
          simulated: resetInterruptedRender(state.renders.simulated),
        }),
        playback:
          state.playback.status === "playing" &&
          state.playback.runId === action.runId
            ? stoppedPlayback()
            : state.playback,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            pendingPlayback:
              session.pendingPlayback?.runId === action.runId
                ? null
                : session.pendingPlayback,
            playbackRuns: Object.freeze(
              session.playbackRuns.map((candidate) =>
                candidate.runId === action.runId
                  ? Object.freeze({ ...candidate, status: "cancelled" as const })
                  : candidate,
              ),
            ),
            events: Object.freeze([...session.events, action.event]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-no-difference-recovery-completed": {
      const session = state.webMcp.session;
      const comparison = session?.comparisons.find(
        (candidate) => candidate.comparisonId === action.comparisonId,
      );
      if (!session || !comparison || comparison.observationId !== null) {
        return state;
      }
      const existing = session.noDifferenceRecoveries.find(
        (candidate) => candidate.comparisonId === action.comparisonId,
      );
      if (existing?.completedCount === 2) {
        return state;
      }
      const recovery: WebMcpNoDifferenceRecovery = Object.freeze({
        comparisonId: action.comparisonId,
        completedCount: existing ? (2 as const) : (1 as const),
      });
      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            noDifferenceRecoveries: Object.freeze([
              ...session.noDifferenceRecoveries.filter(
                (candidate) => candidate.comparisonId !== action.comparisonId,
              ),
              recovery,
            ]),
            events: Object.freeze([...session.events, action.event]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-human-session-finished": {
      const session = state.webMcp.session;
      if (!session || session.completionState !== "ready_for_summary") {
        return rejectTransition(state, "invalid-transition");
      }

      return Object.freeze({
        ...state,
        webMcp: Object.freeze({
          ...state.webMcp,
          session: Object.freeze({
            ...session,
            completionState: "complete" as const,
            events: Object.freeze([...session.events, action.event]),
          }),
        }),
        failure: null,
      });
    }

    case "webmcp-human-reset": {
      return Object.freeze({
        ...createInitialExperienceState(),
        modelGroundingRevision: state.modelGroundingRevision + 1,
        modelAttemptsUsed: state.modelAttemptsUsed,
      });
    }

    case "operation-failed": {
      return Object.freeze({
        ...state,
        source:
          action.code === "source-load-failed"
            ? Object.freeze({ status: "failed" as const })
            : state.source,
        renders: action.mode
          ? Object.freeze({
              ...state.renders,
              [action.mode]: Object.freeze({ status: "failed" as const }),
            })
          : state.renders,
        playback: Object.freeze({
          status: "failed" as const,
          mode: null,
          supportMode: null,
          interventionState: null,
          speakerPositionState: null,
          resultIdentity: null,
          runId: null,
        }),
        completionState: "in-progress" as const,
        failure: failure(action.code),
      });
    }
  }
}

const semanticStateKeys = [
  "selectedProfileEntry",
  "manualDraft",
  "draftRevision",
  "lastEdit",
  "confirmedProfile",
  "comparisonPlan",
  "supportMode",
  "interventionState",
  "speakerPositionState",
  "source",
  "renders",
  "lowVolumeAcknowledged",
  "agentPlaybackGranted",
  "playback",
  "modelGroundingRevision",
  "modelAttemptsUsed",
  "modelState",
  "completionState",
] as const satisfies readonly (keyof ExperienceState)[];

function rawSemanticStateChanged(
  previous: ExperienceState,
  next: ExperienceState,
): boolean {
  return semanticStateKeys.some((key) => previous[key] !== next[key]);
}

function evidenceEvent(
  session: WebMcpSessionState,
  revision: number,
  action: SessionEvidenceEvent["action"],
  comparisonId: SessionEvidenceEvent["comparisonId"] = null,
  actor: SessionEvidenceEvent["actor"] = "human",
  requestId: SessionEvidenceEvent["requestId"] = null,
  runId: SessionEvidenceEvent["runId"] = null,
): SessionEvidenceEvent {
  return Object.freeze({
    sequence: session.events.length + 1,
    revision,
    actor,
    action,
    requestId,
    comparisonId,
    runId,
  });
}

function sessionAfterHumanTransition(
  previous: ExperienceState,
  next: ExperienceState,
  action: ExperienceAction,
  revision: number,
): WebMcpSessionState | null {
  let session = next.webMcp.session;
  if (!session) {
    return null;
  }

  if (
    action.type === "profile-entry-selected" ||
    action.type === "manual-value-changed" ||
    action.type === "manual-profile-confirmed"
  ) {
    return null;
  }

  if (action.type === "predefined-profile-confirmed") {
    if (
      action.profileId !== session.stagedProfileId ||
      next.confirmedProfile?.predefinedProfileId !== action.profileId
    ) {
      return null;
    }

    if (session.confirmedProfileId === null) {
      session = Object.freeze({
        ...session,
        confirmedProfileId: action.profileId,
        events: Object.freeze([
          ...session.events,
          evidenceEvent(session, revision, "profile_confirmed"),
        ]),
      });
    }
  }

  if (
    action.type === "source-ready" &&
    !session.events.some((event) => event.action === "scene_loaded")
  ) {
    session = Object.freeze({
      ...session,
      events: Object.freeze([
        ...session.events,
        evidenceEvent(
          session,
          revision,
          "scene_loaded",
          null,
          "system",
        ),
      ]),
    });
  }

  if (
    action.type === "low-volume-acknowledgement-changed" &&
    action.acknowledged &&
    !session.events.some((event) => event.action === "volume_acknowledged")
  ) {
    session = Object.freeze({
      ...session,
      events: Object.freeze([
        ...session.events,
        evidenceEvent(session, revision, "volume_acknowledged"),
      ]),
    });
  }

  if (action.type === "playback-started") {
    const comparison = session.comparisons.at(-1) ?? null;
    const run = action.runId
      ? session.playbackRuns.find((candidate) => candidate.runId === action.runId)
      : null;
    if (
      comparison &&
      !session.pendingPlayback &&
      (!action.runId ||
        (run &&
          run.status === "starting" &&
          run.comparisonId === comparison.comparisonId &&
          run.sequence[run.completedModes.length] === action.mode))
    ) {
      session = Object.freeze({
        ...session,
        pendingPlayback: Object.freeze({
          comparisonId: comparison.comparisonId,
          mode: action.mode,
          runId: action.runId ?? null,
        }),
        playbackRuns: action.runId
          ? Object.freeze(
              session.playbackRuns.map((candidate) =>
                candidate.runId === action.runId
                  ? Object.freeze({ ...candidate, status: "started" as const })
                  : candidate,
              ),
            )
          : session.playbackRuns,
        events: Object.freeze([
          ...session.events,
          evidenceEvent(
            session,
            revision,
            "playback_started",
            comparison.comparisonId,
            action.actor ?? "human",
            run?.requestId ?? null,
            run?.runId ?? null,
          ),
        ]),
      });
    }
  }

  if (
    (action.type === "playback-stopped" || action.type === "playback-ended") &&
    session.pendingPlayback &&
    session.pendingPlayback.runId === (action.runId ?? null)
  ) {
    const pending = session.pendingPlayback;
    // Only a natural media end proves that the clip was heard. Stop is always
    // cancellation, even if it happened near the end of the clip.
    const completed = action.type === "playback-ended";
    const runId = action.runId ?? pending.runId;
    const run = runId
      ? session.playbackRuns.find((candidate) => candidate.runId === runId)
      : null;
    const completedModes =
      run && completed && !run.completedModes.includes(pending.mode)
        ? Object.freeze([...run.completedModes, pending.mode])
        : run?.completedModes ?? Object.freeze([]);
    const runFinished =
      Boolean(run) && completedModes.length === run!.sequence.length;
    const runCancelled = Boolean(run) && action.type === "playback-stopped";
    session = Object.freeze({
      ...session,
      comparisons: Object.freeze(
        session.comparisons.map((comparison) =>
          comparison.comparisonId === pending.comparisonId &&
          completed &&
          !comparison.heardPlaybackModes.includes(pending.mode)
            ? Object.freeze({
                ...comparison,
                heardPlaybackModes: Object.freeze([
                  ...comparison.heardPlaybackModes,
                  pending.mode,
                ]),
              })
            : comparison,
        ),
      ),
      playbackRuns: run
        ? Object.freeze(
            session.playbackRuns.map((candidate) =>
              candidate.runId === run.runId
                ? Object.freeze({
                    ...candidate,
                    completedModes,
                    status: runCancelled
                      ? ("cancelled" as const)
                      : runFinished
                        ? ("completed" as const)
                        : ("starting" as const),
                  })
                : candidate,
            ),
          )
        : session.playbackRuns,
      pendingPlayback: null,
      events:
        run && (runCancelled || runFinished)
          ? Object.freeze([
              ...session.events,
              evidenceEvent(
                session,
                revision,
                runCancelled ? "playback_cancelled" : "playback_completed",
                pending.comparisonId,
                runCancelled ? "human" : "system",
                run?.requestId ?? null,
                run?.runId ?? null,
              ),
            ])
          : session.events,
    });

    if (
      runFinished &&
      run?.purpose === "no-difference-recovery" &&
      !session.noDifferenceRecoveries.some(
        (candidate) =>
          candidate.comparisonId === pending.comparisonId &&
          candidate.completedCount === 2,
      )
    ) {
      const existing = session.noDifferenceRecoveries.find(
        (candidate) => candidate.comparisonId === pending.comparisonId,
      );
      session = Object.freeze({
        ...session,
        noDifferenceRecoveries: Object.freeze([
          ...session.noDifferenceRecoveries.filter(
            (candidate) => candidate.comparisonId !== pending.comparisonId,
          ),
          Object.freeze({
            comparisonId: pending.comparisonId,
            completedCount: existing ? (2 as const) : (1 as const),
          }),
        ]),
      });
    }
  }

  if (
    action.type === "experience-completed" &&
    session.completionState === "ready_for_summary"
  ) {
    session = Object.freeze({
      ...session,
      completionState: "complete" as const,
      events: Object.freeze([
        ...session.events,
        evidenceEvent(session, revision, "session_finished"),
      ]),
    });
  }

  return session;
}

function isWebMcpToolAction(action: ExperienceAction): boolean {
  return (
    action.type === "webmcp-session-staged" ||
    action.type === "webmcp-agent-profile-selected" ||
    (action.type === "webmcp-comparison-prepared" &&
      action.requestRecord !== null) ||
    (action.type === "webmcp-observation-recorded" &&
      action.requestRecord !== null) ||
    action.type === "webmcp-agent-playback-reserved" ||
    action.type === "webmcp-agent-playback-failed"
  );
}

export function experienceReducer(
  state: ExperienceState,
  action: ExperienceAction,
): ExperienceState {
  const reduced = reduceExperienceState(state, action);
  const toolAction = isWebMcpToolAction(action);
  const webMcpChanged = reduced.webMcp !== state.webMcp;
  const semanticChanged = rawSemanticStateChanged(state, reduced) || webMcpChanged;

  if (!semanticChanged) {
    return reduced;
  }

  const revision = state.webMcp.revision + 1;
  if (
    revision > Number.MAX_SAFE_INTEGER ||
    revision > 2_147_483_647
  ) {
    return Object.freeze({
      ...state,
      failure: failure("invalid-transition"),
    });
  }

  const reset =
    action.type === "comparison-reset" || action.type === "webmcp-human-reset";
  const session = reset
    ? null
    : toolAction || action.type.startsWith("webmcp-")
      ? reduced.webMcp.session
      : sessionAfterHumanTransition(state, reduced, action, revision);

  return Object.freeze({
    ...reduced,
    webMcp: Object.freeze({
      revision,
      humanJourneyProgressed: reset
        ? false
        : toolAction
          ? state.webMcp.humanJourneyProgressed
          : true,
      session,
      requestRecords: reset
        ? Object.freeze([])
        : reduced.webMcp.requestRecords,
    }),
  });
}

export function isPristineForAgentStage(state: ExperienceState): boolean {
  return (
    state.webMcp.session === null &&
    !state.webMcp.humanJourneyProgressed &&
    state.confirmedProfile === null &&
    state.comparisonPlan === null &&
    state.source.status === "idle" &&
    state.renders.reference.status === "idle" &&
    state.renders.simulated.status === "idle" &&
    !state.lowVolumeAcknowledged &&
    state.playback.status === "stopped" &&
    state.modelState.status === "idle" &&
    state.completionState === "in-progress"
  );
}

export type ExperienceSemanticCommand = (
  current: ExperienceState,
) => ExperienceState;

export type ExperienceCommitResult =
  | Readonly<{
      ok: true;
      changed: boolean;
      snapshot: ExperienceState;
    }>
  | Readonly<{
      ok: false;
      changed: false;
      reason: "reentrant" | "command-failed";
      snapshot: ExperienceState;
    }>;

export type ExperienceController = Readonly<{
  getSnapshot(): ExperienceState;
  subscribe(listener: (snapshot: ExperienceState) => void): () => void;
  commit(command: ExperienceSemanticCommand): ExperienceCommitResult;
}>;

export function createExperienceController(
  initialState: ExperienceState = createInitialExperienceState(),
): ExperienceController {
  let snapshot = initialState;
  let committing = false;
  const listeners = new Set<(snapshot: ExperienceState) => void>();

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe: (listener: (next: ExperienceState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    commit: (command: ExperienceSemanticCommand): ExperienceCommitResult => {
      if (committing) {
        return Object.freeze({
          ok: false as const,
          changed: false as const,
          reason: "reentrant" as const,
          snapshot,
        });
      }

      committing = true;
      try {
        const next = command(snapshot);
        const changed = next !== snapshot;
        if (changed) {
          snapshot = next;
          for (const listener of listeners) {
            try {
              listener(snapshot);
            } catch {
              // Notification failures cannot turn an already committed snapshot
              // into a false command failure or roll semantic state back.
            }
          }
        }

        return Object.freeze({
          ok: true as const,
          changed,
          snapshot,
        });
      } catch {
        return Object.freeze({
          ok: false as const,
          changed: false as const,
          reason: "command-failed" as const,
          snapshot,
        });
      } finally {
        committing = false;
      }
    },
  });
}

export type VisibleExperienceState = Readonly<{
  profile: string;
  source: string;
  support: string;
  intervention: string;
  interventionSummary: string;
  speakerPosition: string;
  speakerPositionSummary: string;
  reference: string;
  simulated: string;
  playback: string;
  model: string;
  lastEdit: string | null;
  failure: string | null;
}>;

export type TerminalCompletionProjection = Readonly<{
  status: "complete-live" | "complete-degraded";
  profile: string;
  profileOrigin: "Manual" | "Synthetic predefined";
  support: string;
  television: string;
  speakerPosition: string;
  resultIdentity: string;
  explanationStatus: "Live GPT" | "Degraded";
  explanationAvailability: string;
  limitation: string;
  nextAction: string;
}>;

export const ATTRIBUTABLE_EVIDENCE_SCHEMA_VERSION =
  "auralis-evidence-v1" as const;

export type AttributableEvidenceProjection = Readonly<{
  schemaVersion: typeof ATTRIBUTABLE_EVIDENCE_SCHEMA_VERSION;
  sourceIdentity: string;
  resultIdentity: string;
  profile: Readonly<{
    label: string;
    origin: "manual" | "predefined";
    predefinedProfileId: PredefinedProfileId | null;
  }>;
  supportMode: SupportMode;
  televisionState: InterventionState;
  speakerPositionState: SpeakerPositionState;
  completionStatus: "complete-live" | "complete-degraded";
  explanation: Readonly<
    | {
        status: "live";
        model: typeof MODEL_ID;
      }
    | {
        status: "degraded";
        model: null;
      }
  >;
  limitation: string;
  generatedAt: string;
}>;

const supportLabels: Record<SupportMode, string> = {
  none: "No support",
  "left-one-sided": "Left-ear support",
  bilateral: "Bilateral support",
};

const interventionLabels: Record<InterventionState, string> = {
  "tv-on": "TV on",
  "tv-off": "TV off",
};

const interventionSummaries: Record<InterventionState, string> = {
  "tv-on": "The television remains part of the competing family scene.",
  "tv-off":
    "The television contribution has been removed; focused speech, overlapping speech, and room events remain unchanged.",
};

const speakerPositionLabels: Record<SpeakerPositionState, string> = {
  "original-position": "Original position",
  "closer-in-front": "Closer, in front",
};

const speakerPositionSummaries: Record<SpeakerPositionState, string> = {
  "original-position":
    "The important speaker remains at the manifest position: 12° left and 1.2 m away.",
  "closer-in-front":
    "Only the important speaker moves to the front at 0.8 m with bounded 2.5 dB focused-speech gain; competing scene content remains unchanged.",
};

function terminalResultIdentity(resultIdentity: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < resultIdentity.length; index += 1) {
    const code = resultIdentity.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
    second ^= second >>> 13;
  }

  return `auralis-result-v1-${(first >>> 0).toString(16).padStart(8, "0")}${(
    second >>> 0
  )
    .toString(16)
    .padStart(8, "0")}`;
}

export function projectTerminalCompletion(
  state: ExperienceState,
): TerminalCompletionProjection | null {
  const result = currentTransformedResult(state);
  const profile = state.confirmedProfile;
  const completionMatchesModel =
    (state.completionState === "complete-live" &&
      state.modelState.status === "live") ||
    (state.completionState === "complete-degraded" &&
      state.modelState.status === "degraded");

  if (
    !result ||
    !profile ||
    !canCompleteExperience(state) ||
    !completionMatchesModel
  ) {
    return null;
  }

  const isLive = state.modelState.status === "live";

  return Object.freeze({
    status: isLive ? ("complete-live" as const) : ("complete-degraded" as const),
    profile:
      profile.sourceType === "manual"
        ? "Manual audiogram"
        : profile.displayName,
    profileOrigin:
      profile.sourceType === "manual"
        ? ("Manual" as const)
        : ("Synthetic predefined" as const),
    support: supportLabels[state.supportMode],
    television: interventionLabels[state.interventionState],
    speakerPosition: speakerPositionLabels[state.speakerPositionState],
    resultIdentity: terminalResultIdentity(result.resultIdentity),
    explanationStatus: isLive ? ("Live GPT" as const) : ("Degraded" as const),
    explanationAvailability: isLive
      ? "A fresh grounded explanation is available for this result."
      : "Live explanation is unavailable; the deterministic comparison remains available.",
    limitation:
      "This experience is illustrative; it is not a diagnosis, prescription, hearing-aid fitting, or prediction of individual perception.",
    nextAction:
      "Use this comparison to discuss communication conditions with the people around you.",
  });
}

export function projectAttributableEvidence(
  state: ExperienceState,
  generatedAt: string,
): AttributableEvidenceProjection | null {
  const terminal = projectTerminalCompletion(state);
  const result = currentTransformedResult(state);
  const profile = state.confirmedProfile;
  const generatedTime = Date.parse(generatedAt);

  if (
    !terminal ||
    !result ||
    !profile ||
    !Number.isFinite(generatedTime) ||
    new Date(generatedTime).toISOString() !== generatedAt ||
    (state.modelState.status !== "live" &&
      state.modelState.status !== "degraded")
  ) {
    return null;
  }

  return Object.freeze({
    schemaVersion: ATTRIBUTABLE_EVIDENCE_SCHEMA_VERSION,
    sourceIdentity: result.sourceIdentity,
    resultIdentity: terminal.resultIdentity,
    profile: Object.freeze({
      label: terminal.profile,
      origin: profile.sourceType,
      predefinedProfileId: profile.predefinedProfileId,
    }),
    supportMode: state.supportMode,
    televisionState: state.interventionState,
    speakerPositionState: state.speakerPositionState,
    completionStatus: terminal.status,
    explanation:
      state.modelState.status === "live"
        ? Object.freeze({
            status: "live" as const,
            model: MODEL_ID,
          })
        : Object.freeze({
            status: "degraded" as const,
            model: null,
          }),
    limitation: terminal.limitation,
    generatedAt,
  });
}

function renderLabel(
  mode: ComparisonMode,
  supportMode: SupportMode,
  interventionState: InterventionState,
  speakerPositionState: SpeakerPositionState,
  render: RenderState,
): string {
  const name =
    mode === "reference" ? "Reference" : supportLabels[supportMode];
  const intervention = interventionLabels[interventionState];
  const speakerPosition = speakerPositionLabels[speakerPositionState];

  switch (render.status) {
    case "idle":
      return `${name}, ${intervention}, ${speakerPosition}: not rendered.`;
    case "rendering":
      return `${name}, ${intervention}, ${speakerPosition}: validating and rendering.`;
    case "ready":
      return `${name}, ${intervention}, ${speakerPosition}: validated at ${render.peakDbFs.toFixed(1)} dBFS peak.`;
    case "failed":
      return `${name}, ${intervention}, ${speakerPosition}: rejected.`;
  }
}

export function projectVisibleExperienceState(
  state: ExperienceState,
): VisibleExperienceState {
  const selectedEntryName =
    state.selectedProfileEntry === "manual"
      ? MANUAL_PROFILE_ENTRY_LABEL
      : predefinedProfileById(state.selectedProfileEntry).displayName;
  const profile = state.confirmedProfile
    ? state.confirmedProfile.sourceType === "manual"
      ? `Manual audiogram confirmed from revision ${state.confirmedProfile.revision}.`
      : `${state.confirmedProfile.displayName} confirmed as a synthetic illustrative profile.`
    : `${selectedEntryName}: confirmation required.`;

  let source: string;
  switch (state.source.status) {
    case "idle":
      source = "Family scene: not loaded.";
      break;
    case "loading":
      source = "Family scene: loading and validating.";
      break;
    case "ready":
      source = `Family scene: ready, ${state.source.durationSeconds.toFixed(1)} s at ${state.source.sampleRate} Hz.`;
      break;
    case "failed":
      source = "Family scene: unavailable.";
      break;
  }

  const playback =
    state.playback.status === "playing"
      ? state.playback.mode === "reference"
        ? `Playback: reference, ${interventionLabels[state.playback.interventionState]}, ${speakerPositionLabels[state.playback.speakerPositionState]}.`
        : `Playback: ${supportLabels[state.playback.supportMode ?? "none"]}, ${interventionLabels[state.playback.interventionState]}, ${speakerPositionLabels[state.playback.speakerPositionState]}.`
      : state.playback.status === "failed"
        ? "Playback: blocked."
        : "Playback: stopped.";

  const lastEdit = state.selectedProfileEntry === "manual" && state.lastEdit
    ? `Last edit: ${state.lastEdit.ear} ear at ${state.lastEdit.frequency} Hz, ${state.lastEdit.previousValue || "missing"} → ${state.lastEdit.nextValue || "missing"} dB HL.`
    : null;

  const model =
    state.modelState.status === "loading"
      ? "Live GPT explanation: generating for the current result."
      : state.modelState.status === "live"
        ? "Live GPT explanation: current and grounded."
        : state.modelState.status === "degraded"
          ? "Live GPT explanation: degraded; deterministic audio remains available."
          : "Live GPT explanation: not requested.";

  return Object.freeze({
    profile,
    source,
    support: `Support state: ${supportLabels[state.supportMode]}.`,
    intervention: `Environmental intervention: ${interventionLabels[state.interventionState]}.`,
    interventionSummary: interventionSummaries[state.interventionState],
    speakerPosition: `Speaker position: ${speakerPositionLabels[state.speakerPositionState]}.`,
    speakerPositionSummary:
      speakerPositionSummaries[state.speakerPositionState],
    reference: renderLabel(
      "reference",
      state.supportMode,
      state.interventionState,
      state.speakerPositionState,
      state.renders.reference,
    ),
    simulated: renderLabel(
      "simulated",
      state.supportMode,
      state.interventionState,
      state.speakerPositionState,
      state.renders.simulated,
    ),
    playback,
    model,
    lastEdit,
    failure: state.failure?.message ?? null,
  });
}
