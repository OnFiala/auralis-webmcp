"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";

import {
  AudioPlaybackCancelledError,
  BrowserAudioEngine,
  FAMILY_DINNER_SOURCE_ID,
  type SceneTranscriptEntry,
} from "../browser/audio";
import { downloadAttributableEvidence } from "../browser/evidence";
import { requestLiveExplanation } from "../browser/model-client";
import {
  registerAuralisWebMcpTools,
  type AuralisWebMcpPlaybackPort,
} from "../browser/webmcp";
import { MAX_MODEL_ATTEMPTS_PER_SESSION } from "../contracts/runtime";
import type {
  AuralisWebMcpPhase,
  PlayListeningComparisonData,
  ProfileId,
} from "../contracts/webmcp";
import {
  canCompleteExperience,
  canRequestModelExplanation,
  comparisonResultIdentity,
  createExperienceController,
  createModelExplanationRequest,
  currentTransformedResult,
  experienceReducer,
  projectAttributableEvidence,
  projectTerminalCompletion,
  projectVisibleExperienceState,
  type ExperienceAction,
  type ExperienceComparisonMode,
  type ExperienceInterventionState,
  type ExperienceSpeakerPositionState,
  type ExperienceSupportMode,
} from "../core/experience";
import {
  AURALIS_PROFILE_PROJECTIONS,
  cancelWebMcpPlaybackRun,
  completeWebMcpNoDifferenceRecovery,
  confirmWebMcpListeningReadiness,
  confirmWebMcpConsent,
  deriveValidAdaptationOptions,
  failWebMcpPlaybackRun,
  getAuralisState,
  noDifferenceRecoveryCount,
  prepareWebMcpBaselineRecovery,
  prepareWebMcpAdaptation,
  recordWebMcpHumanObservation,
  resetWebMcpExperience,
  selectWebMcpProfile,
} from "../core/webmcp";
import {
  FREQUENCY_GRID_HZ,
  MANUAL_THRESHOLD_MAX_DB_HL,
  MANUAL_THRESHOLD_MIN_DB_HL,
  MANUAL_PROFILE_ENTRY_LABEL,
  PREDEFINED_HEARING_PROFILES,
  frequencyKey,
  predefinedProfileById,
  type Ear,
  type EarThresholdDraft,
  type EarThresholds,
  type FrequencyKey,
  type PredefinedProfileId,
  type ProfileEntryOption,
} from "../core/profile";
import { AgentSessionShell } from "./agent-session-shell";
import { AgentFinalSummary } from "./agent-final-summary";

type ActiveScreen =
  | "welcome"
  | "profile"
  | "scene"
  | "listening"
  | "interventions"
  | "explanation"
  | "completion";

type ExperienceScreen = Exclude<ActiveScreen, "welcome">;
type PlaybackOutcome = "completed" | "cancelled" | "failed";

const experienceScreenOrder: readonly ExperienceScreen[] = [
  "profile",
  "scene",
  "listening",
  "interventions",
  "explanation",
  "completion",
];

const screenLabels: Record<ExperienceScreen, string> = {
  profile: "Profile",
  scene: "Scene",
  listening: "Listening",
  interventions: "Interventions",
  explanation: "Explanation",
  completion: "Completion",
};

const nextScreen: Record<Exclude<ActiveScreen, "completion">, ExperienceScreen> = {
  welcome: "profile",
  profile: "scene",
  scene: "listening",
  listening: "interventions",
  interventions: "explanation",
  explanation: "completion",
};

const previousScreen: Record<ExperienceScreen, ActiveScreen> = {
  profile: "welcome",
  scene: "profile",
  listening: "scene",
  interventions: "listening",
  explanation: "interventions",
  completion: "explanation",
};

const supportLabels: Record<ExperienceSupportMode, string> = {
  none: "No support",
  "left-one-sided": "Left-ear support",
  bilateral: "Bilateral support",
};

const supportEarSummaries: Record<ExperienceSupportMode, string> = {
  none: "Right: none · Left: none",
  "left-one-sided": "Right: none · Left: illustrative",
  bilateral: "Right: illustrative · Left: illustrative",
};

const supportEarStates: Record<
  ExperienceSupportMode,
  Readonly<{ right: string; left: string }>
> = {
  none: {
    right: "No support",
    left: "No support",
  },
  "left-one-sided": {
    right: "No support",
    left: "Illustrative support",
  },
  bilateral: {
    right: "Illustrative support",
    left: "Illustrative support",
  },
};

const interventionLabels: Record<ExperienceInterventionState, string> = {
  "tv-on": "TV on",
  "tv-off": "TV off",
};

const speakerPositionLabels: Record<
  ExperienceSpeakerPositionState,
  string
> = {
  "original-position": "Original position",
  "closer-in-front": "Closer, in front",
};

const profileEverydayDescriptions: Record<PredefinedProfileId, string> = {
  "high-frequency-hearing-loss":
    "Quieter high-pitched detail may be easier to miss, especially consonants and distant speech.",
  "flat-hearing-loss":
    "A broad range of sounds is softened, so voices may feel quieter overall.",
  "asymmetric-hearing-loss":
    "The two ears receive different detail, which can make busy conversations harder to follow.",
};

const manualProfileEverydayDescription =
  "Enter separate right- and left-ear values to explore a specific illustrative pattern.";

const sceneSources = [
  {
    id: "important-speaker",
    label: "Important speaker",
    description: "The focused voice at the center of the family conversation.",
  },
  {
    id: "overlapping-speakers",
    label: "Overlapping speakers",
    description: "Additional family voices sharing the same scene and timeline.",
  },
  {
    id: "television",
    label: "Television",
    description: "A synthetic television contribution from the living room.",
  },
  {
    id: "kitchen-room",
    label: "Kitchen / room",
    description: "Sparse kitchen and household events around the conversation.",
  },
] as const;

const sceneSourceStatusLabels = {
  idle: "Family scene not loaded.",
  loading: "Loading and validating the family scene…",
  ready: "Family scene ready.",
  failed: "Family scene unavailable. Try loading it again.",
} as const;

function formatTranscriptTime(startSeconds: number): string {
  const minutes = Math.floor(startSeconds / 60);
  const seconds = (startSeconds - minutes * 60)
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

const AUDIOGRAM_GRID_DB_HL = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
] as const;
const AUDIOGRAM_VIEWBOX_WIDTH = 680;
const AUDIOGRAM_VIEWBOX_HEIGHT = 440;
const AUDIOGRAM_PLOT_LEFT = 98;
const AUDIOGRAM_PLOT_RIGHT = 640;
const AUDIOGRAM_PLOT_TOP = 42;
const AUDIOGRAM_PLOT_BOTTOM = 360;

type AudiogramThresholds = EarThresholds | EarThresholdDraft;

function audiogramX(index: number): number {
  return (
    AUDIOGRAM_PLOT_LEFT +
    (index * (AUDIOGRAM_PLOT_RIGHT - AUDIOGRAM_PLOT_LEFT)) /
      (FREQUENCY_GRID_HZ.length - 1)
  );
}

function audiogramY(value: number): number {
  return (
    AUDIOGRAM_PLOT_TOP +
    ((value - MANUAL_THRESHOLD_MIN_DB_HL) /
      (MANUAL_THRESHOLD_MAX_DB_HL - MANUAL_THRESHOLD_MIN_DB_HL)) *
      (AUDIOGRAM_PLOT_BOTTOM - AUDIOGRAM_PLOT_TOP)
  );
}

function numericAudiogramValue(value: string | number): number | null {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const numericValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(numericValue) &&
    numericValue >= MANUAL_THRESHOLD_MIN_DB_HL &&
    numericValue <= MANUAL_THRESHOLD_MAX_DB_HL
    ? numericValue
    : null;
}

function describeThresholds(thresholds: AudiogramThresholds): string {
  return FREQUENCY_GRID_HZ.map((frequency) => {
    const value = thresholds[frequencyKey(frequency)];
    const displayedValue =
      typeof value === "string" && value.trim() === ""
        ? "not entered"
        : `${value} dB HL`;

    return `${frequency} Hz: ${displayedValue}`;
  }).join("; ");
}

function Audiogram({
  profileLabel,
  rightThresholds,
  leftThresholds,
  compact = false,
}: Readonly<{
  profileLabel: string;
  rightThresholds: AudiogramThresholds;
  leftThresholds: AudiogramThresholds;
  compact?: boolean;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const series = [
    {
      ear: "right",
      thresholds: rightThresholds,
    },
    {
      ear: "left",
      thresholds: leftThresholds,
    },
  ] as const;
  const plottedSeries = series.map((earSeries) => ({
    ...earSeries,
    points: FREQUENCY_GRID_HZ.map((frequency, index) => {
      const value = numericAudiogramValue(
        earSeries.thresholds[frequencyKey(frequency)],
      );

      return {
        frequency,
        value,
        x: audiogramX(index),
        y: value === null ? null : audiogramY(value),
      };
    }),
  }));
  const hasUnplottedValues = plottedSeries.some((earSeries) =>
    earSeries.points.some((point) => point.y === null),
  );
  const accessibleDescription = `${profileLabel}. Right ear exact values: ${describeThresholds(
    rightThresholds,
  )}. Left ear exact values: ${describeThresholds(leftThresholds)}.`;

  return (
    <figure
      className={`audiogram-figure${compact ? " audiogram-figure-compact" : ""}`}
      data-testid={compact ? "agent-profile-audiogram" : undefined}
    >
      <div className="audiogram-heading-row">
        <div>
          <p className="audiogram-kicker">Exact bilateral view</p>
          <h3>Audiogram</h3>
        </div>
        <ul className="audiogram-legend" aria-label="Audiogram ear legend">
          <li>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <line
                className="audiogram-legend-line audiogram-right-line"
                x1="1"
                y1="10"
                x2="19"
                y2="10"
              />
              <circle
                className="audiogram-right-marker"
                cx="10"
                cy="10"
                r="4"
              />
            </svg>
            <span>Right ear · circles · solid</span>
          </li>
          <li>
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <line
                className="audiogram-legend-line audiogram-left-line"
                x1="1"
                y1="10"
                x2="19"
                y2="10"
              />
              <path
                className="audiogram-left-marker"
                d="M6 6 L14 14 M14 6 L6 14"
              />
            </svg>
            <span>Left ear · crosses · dashed</span>
          </li>
        </ul>
      </div>

      <svg
        className="audiogram-chart"
        viewBox={`0 0 ${AUDIOGRAM_VIEWBOX_WIDTH} ${AUDIOGRAM_VIEWBOX_HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <title id={titleId}>
          Bilateral audiogram for {profileLabel}
        </title>
        <desc id={descriptionId}>{accessibleDescription}</desc>

        <g aria-hidden="true">
          <text className="audiogram-axis-title" x="18" y="24">
            Hearing level (dB HL)
          </text>
          {AUDIOGRAM_GRID_DB_HL.map((level) => {
            const y = audiogramY(level);

            return (
              <g key={level}>
                <line
                  className="audiogram-grid-line"
                  x1={AUDIOGRAM_PLOT_LEFT}
                  y1={y}
                  x2={AUDIOGRAM_PLOT_RIGHT}
                  y2={y}
                />
                {level % 20 === 0 ? (
                  <text
                    className="audiogram-axis-label"
                    x={AUDIOGRAM_PLOT_LEFT - 18}
                    y={y + 6}
                    textAnchor="end"
                  >
                    {level}
                  </text>
                ) : null}
              </g>
            );
          })}

          {FREQUENCY_GRID_HZ.map((frequency, index) => {
            const x = audiogramX(index);

            return (
              <g key={frequency}>
                <line
                  className="audiogram-grid-line audiogram-grid-line-vertical"
                  x1={x}
                  y1={AUDIOGRAM_PLOT_TOP}
                  x2={x}
                  y2={AUDIOGRAM_PLOT_BOTTOM}
                />
                <text
                  className="audiogram-axis-label"
                  x={x}
                  y={AUDIOGRAM_PLOT_BOTTOM + 31}
                  textAnchor="middle"
                >
                  {frequency}
                </text>
              </g>
            );
          })}
          <text
            className="audiogram-axis-title"
            x={(AUDIOGRAM_PLOT_LEFT + AUDIOGRAM_PLOT_RIGHT) / 2}
            y={AUDIOGRAM_VIEWBOX_HEIGHT - 12}
            textAnchor="middle"
          >
            Frequency (Hz)
          </text>

          {plottedSeries.map((earSeries) =>
            earSeries.points.slice(0, -1).map((point, index) => {
              const nextPoint = earSeries.points[index + 1];

              return point.y !== null && nextPoint.y !== null ? (
                <line
                  key={`${earSeries.ear}-${point.frequency}-${nextPoint.frequency}`}
                  className={`audiogram-series-line audiogram-${earSeries.ear}-line`}
                  x1={point.x}
                  y1={point.y}
                  x2={nextPoint.x}
                  y2={nextPoint.y}
                />
              ) : null;
            }),
          )}

          {plottedSeries.map((earSeries) =>
            earSeries.points.map((point) =>
              point.y === null ? null : earSeries.ear === "right" ? (
                <circle
                  key={`${earSeries.ear}-${point.frequency}`}
                  className="audiogram-right-marker"
                  cx={point.x}
                  cy={point.y}
                  r="7"
                />
              ) : (
                <path
                  key={`${earSeries.ear}-${point.frequency}`}
                  className="audiogram-left-marker"
                  d={`M${point.x - 7} ${point.y - 7} L${point.x + 7} ${
                    point.y + 7
                  } M${point.x + 7} ${point.y - 7} L${point.x - 7} ${
                    point.y + 7
                  }`}
                />
              ),
            ),
          )}
        </g>
      </svg>

      <figcaption>
        Six exact octave-frequency points per ear. Lower dB HL values appear at
        the top; higher values appear at the bottom. Lines only connect adjacent
        entered points.
      </figcaption>
      {hasUnplottedValues ? (
        <p className="audiogram-plot-note">
          Missing, non-finite, or out-of-range values are not plotted or
          approximated; the exact entry remains in the editor below.
        </p>
      ) : null}
    </figure>
  );
}

function AgentVolumeConsentDialog({
  controlsBusy,
  onConfirm,
  onReset,
}: Readonly<{
  controlsBusy: boolean;
  onConfirm: (grantAgentPlayback: boolean) => Promise<void>;
  onReset: () => void;
}>) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const primaryActionRef = useRef<HTMLButtonElement | null>(null);
  const [grantAgentPlayback, setGrantAgentPlayback] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const focusPrimary = () =>
      primaryActionRef.current?.focus({ preventScroll: true });
    const trapDialogFocus = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input:not(:disabled)",
        ) ?? [],
      );
      const first = focusable.at(0);
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const containDialogFocus = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !dialogRef.current?.contains(event.target)
      ) {
        focusPrimary();
      }
    };

    document.addEventListener("keydown", trapDialogFocus, true);
    document.addEventListener("focusin", containDialogFocus, true);
    focusPrimary();
    return () => {
      document.removeEventListener("keydown", trapDialogFocus, true);
      document.removeEventListener("focusin", containDialogFocus, true);
    };
  }, []);

  return (
    <section
      ref={dialogRef}
      className="agent-volume-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="agent-volume-heading"
      aria-describedby="agent-volume-description"
    >
      <p className="agent-kicker">Human consent · scene ready</p>
      <h2 id="agent-volume-heading">Set a comfortable listening level</h2>
      <p id="agent-volume-description">
        Put on your headphones and choose a comfortable device volume. Auralis
        will not start playback until you confirm below.
      </p>
      <p className="agent-volume-safety-note">
        Your headphones and device manage physical output; Auralis also
        validates its digital signal before playback.
      </p>
      <label className="agent-playback-grant">
        <input
          type="checkbox"
          checked={grantAgentPlayback}
          onChange={(event) => setGrantAgentPlayback(event.target.checked)}
          disabled={controlsBusy || submitting}
        />
        <span>
          <strong>Allow agent-started playback for this session</strong>
          <small>
            The agent may start A, B, or A then B. I can stop immediately or
            reset at any time. Leaving this off keeps playback click-only.
          </small>
        </span>
      </label>
      <div className="agent-volume-actions">
        <button
          ref={primaryActionRef}
          type="button"
          onClick={() => {
            setSubmitting(true);
            void onConfirm(grantAgentPlayback).finally(() =>
              setSubmitting(false),
            );
          }}
          disabled={controlsBusy || submitting}
        >
          {submitting
            ? "Preparing audio safely…"
            : "My listening level is comfortable"}
        </button>
        <button
          className="agent-volume-reset"
          type="button"
          onClick={onReset}
          disabled={controlsBusy || submitting}
        >
          Reset session
        </button>
      </div>
    </section>
  );
}

export default function HomePage() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>("welcome");
  const [sceneTranscript, setSceneTranscript] = useState<
    readonly SceneTranscriptEntry[]
  >([]);
  const [experienceController] = useState(() => createExperienceController());
  const agentPlaybackRunnerRef = useRef<
    (run: PlayListeningComparisonData, onStarted: () => void) => Promise<void>
  >(async () => {
    throw new Error("The page playback port is not ready.");
  });
  const [webMcpPlaybackPort] = useState<AuralisWebMcpPlaybackPort>(() =>
    Object.freeze({
      start: (run) =>
        new Promise<void>((resolve, reject) => {
          let started = false;
          void agentPlaybackRunnerRef
            .current(run, () => {
              started = true;
            })
            .then(() => {
              started
                ? resolve()
                : reject(new Error("Playback was cancelled before it started."));
            })
            .catch((error: unknown) => {
              reject(error);
            });
        }),
    }),
  );
  const experience = useSyncExternalStore(
    experienceController.subscribe,
    experienceController.getSnapshot,
    experienceController.getSnapshot,
  );
  const dispatch = useCallback(
    (action: ExperienceAction) => {
      experienceController.commit((state) => experienceReducer(state, action));
    },
    [experienceController],
  );
  const audioEngineRef = useRef<BrowserAudioEngine | null>(null);
  const screenHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const previousActiveScreenRef = useRef<ActiveScreen>("welcome");
  const runIdRef = useRef<string | null>(null);
  const modelRequestInFlightRef = useRef(false);
  const autoLoadedAgentSessionRef = useRef<string | null>(null);
  const activeAgentPlaybackRef = useRef<string | null>(null);
  const guidedSequenceTokenRef = useRef(0);
  const [agentListeningCue, setAgentListeningCue] = useState<string | null>(null);
  const [agentAudioNotice, setAgentAudioNotice] = useState<string | null>(null);
  const [guidedTransitionActive, setGuidedTransitionActive] = useState(false);
  const visible = projectVisibleExperienceState(experience);
  const terminalCompletion = projectTerminalCompletion(experience);
  const agentState = getAuralisState(experienceController);
  const currentAgentComparison = experience.webMcp.session?.comparisons.at(-1) ?? null;
  const noDifferenceReplayCount = currentAgentComparison
    ? noDifferenceRecoveryCount(experience, currentAgentComparison.comparisonId)
    : 0;
  const selectedTransformation = currentTransformedResult(experience);
  const renderingMode: ExperienceComparisonMode | null =
    experience.renders.reference.status === "rendering"
      ? "reference"
      : experience.renders.simulated.status === "rendering"
        ? "simulated"
        : null;
  const isRendering = renderingMode !== null;
  const isPlaying = experience.playback.status === "playing";
  const controlsLocked =
    isRendering ||
    isPlaying ||
    guidedTransitionActive ||
    experience.source.status === "loading";
  const selectedPredefinedProfile =
    experience.selectedProfileEntry === "manual"
      ? null
      : predefinedProfileById(experience.selectedProfileEntry);
  const referenceIdentity = comparisonResultIdentity(experience, "reference");
  const simulatedIdentity = comparisonResultIdentity(experience, "simulated");
  const referenceReady =
    referenceIdentity !== null &&
    experience.renders.reference.status === "ready" &&
    experience.renders.reference.sourceIdentity === FAMILY_DINNER_SOURCE_ID &&
    experience.renders.reference.resultIdentity === referenceIdentity;
  const simulatedReady =
    simulatedIdentity !== null &&
    experience.renders.simulated.status === "ready" &&
    experience.renders.simulated.sourceIdentity === FAMILY_DINNER_SOURCE_ID &&
    experience.renders.simulated.resultIdentity === simulatedIdentity;
  const sceneReady =
    experience.confirmedProfile !== null &&
    experience.source.status === "ready" &&
    experience.lowVolumeAcknowledged;
  const listeningComparisonReady =
    referenceReady &&
    simulatedReady &&
    !isRendering &&
    experience.playback.status === "stopped";
  const interventionComparisonReady =
    canRequestModelExplanation(experience) &&
    !isRendering &&
    experience.playback.status === "stopped";
  const explanationReady = simulatedReady;
  const agentFocusPrefix = experience.webMcp.session
    ? "Focus: central speaker · "
    : "";
  const listeningTransportStatus = guidedTransitionActive
    ? experience.webMcp.session
      ? "Transition A → B · Same moment · Focus: central speaker."
      : "Transition A → B · Same moment · listening perspective changes now."
    : renderingMode === "reference"
      ? `Preparing A · ${agentFocusPrefix}Source reference · ${interventionLabels[experience.interventionState]} · ${speakerPositionLabels[experience.speakerPositionState]}`
      : renderingMode === "simulated"
        ? `Preparing B · ${agentFocusPrefix}${supportLabels[experience.supportMode]} · ${interventionLabels[experience.interventionState]} · ${speakerPositionLabels[experience.speakerPositionState]}`
        : experience.playback.status === "playing"
          ? experience.playback.mode === "reference"
            ? `Playing A · ${agentFocusPrefix}Source reference · ${interventionLabels[experience.playback.interventionState]} · ${speakerPositionLabels[experience.playback.speakerPositionState]}`
            : `Playing B · ${agentFocusPrefix}${supportLabels[experience.playback.supportMode ?? "none"]} · ${interventionLabels[experience.playback.interventionState]} · ${speakerPositionLabels[experience.playback.speakerPositionState]}`
          : experience.playback.status === "failed"
            ? "Playback blocked · The audio request failed closed."
            : experience.webMcp.session
              ? "Playback stopped · A and B controls are ready · Focus: central speaker."
              : "Playback stopped · A and B controls are ready.";
  const listeningTransportKind = guidedTransitionActive
    ? "transition"
    : renderingMode
    ? "preparing"
    : experience.playback.status === "playing"
      ? "playing"
      : experience.playback.status === "failed"
        ? "failed"
        : "stopped";
  const interventionTransportStatus =
    renderingMode === "reference"
      ? `Preparing A · Source reference · ${interventionLabels[experience.interventionState]} · ${speakerPositionLabels[experience.speakerPositionState]}`
      : renderingMode === "simulated"
        ? `Preparing B · ${supportLabels[experience.supportMode]} · ${interventionLabels[experience.interventionState]} · ${speakerPositionLabels[experience.speakerPositionState]}`
        : experience.playback.status === "playing"
          ? experience.playback.mode === "reference"
            ? `Playing A · Source reference · ${interventionLabels[experience.playback.interventionState]} · ${speakerPositionLabels[experience.playback.speakerPositionState]}`
            : `Playing B · ${supportLabels[experience.playback.supportMode ?? "none"]} · ${interventionLabels[experience.playback.interventionState]} · ${speakerPositionLabels[experience.playback.speakerPositionState]}`
          : experience.playback.status === "failed"
            ? "Playback blocked · The audio request failed closed."
            : simulatedReady
              ? `Playback stopped · Current result ready · ${supportLabels[experience.supportMode]} · ${interventionLabels[experience.interventionState]} · ${speakerPositionLabels[experience.speakerPositionState]}`
              : "Playback stopped · Conditions changed · Play B to prepare the current illustrative result.";
  const interventionTransportKind = renderingMode
    ? "preparing"
    : experience.playback.status === "playing"
      ? "playing"
      : experience.playback.status === "failed"
        ? "failed"
        : simulatedReady
          ? "ready"
          : "stale";

  useEffect(() => {
    const binding = registerAuralisWebMcpTools({
      controller: experienceController,
      playbackPort: webMcpPlaybackPort,
    });
    return () => binding.dispose();
  }, [experienceController, webMcpPlaybackPort]);

  useEffect(() => {
    const session = experience.webMcp.session;
    const profileId = session?.confirmedProfileId;
    if (!session || !profileId || experience.source.status !== "idle") {
      return;
    }

    const autoLoadKey = `${session.sessionId}:${profileId}`;
    if (autoLoadedAgentSessionRef.current === autoLoadKey) {
      return;
    }

    autoLoadedAgentSessionRef.current = autoLoadKey;
    void loadSource();
  }, [experience.source.status, experience.webMcp.session]);

  useEffect(
    () => () => {
      void audioEngineRef.current?.dispose();
    },
    [],
  );

  useEffect(() => {
    if (previousActiveScreenRef.current === activeScreen) {
      return;
    }

    screenHeadingRef.current
      ?.closest("section")
      ?.scrollIntoView({ block: "start" });
    screenHeadingRef.current?.focus({ preventScroll: true });
    previousActiveScreenRef.current = activeScreen;
  }, [activeScreen]);

  useEffect(() => {
    if (activeScreen === "welcome") {
      return;
    }

    let furthestValidScreen: ExperienceScreen = "profile";

    if (experience.confirmedProfile) {
      furthestValidScreen = "scene";
    }

    if (sceneReady) {
      furthestValidScreen = "interventions";
    }

    if (sceneReady && explanationReady) {
      furthestValidScreen = "explanation";
    }

    if (canCompleteExperience(experience)) {
      furthestValidScreen = "completion";
    }

    if (
      experienceScreenOrder.indexOf(activeScreen) >
      experienceScreenOrder.indexOf(furthestValidScreen)
    ) {
      setActiveScreen(furthestValidScreen);
    }
  }, [activeScreen, experience, explanationReady, sceneReady]);

  function audioEngine(): BrowserAudioEngine {
    audioEngineRef.current ??= new BrowserAudioEngine();
    return audioEngineRef.current;
  }

  function updateManualValue(ear: Ear, frequency: number, value: string) {
    dispatch({
      type: "manual-value-changed",
      ear,
      frequency: frequencyKey(frequency as (typeof FREQUENCY_GRID_HZ)[number]),
      value,
    });
  }

  function selectProfileEntry(entryOption: ProfileEntryOption) {
    audioEngineRef.current?.stop();
    dispatch({ type: "profile-entry-selected", entryOption });
  }

  function confirmSelectedProfile() {
    if (experience.selectedProfileEntry === "manual") {
      dispatch({
        type: "manual-profile-confirmed",
        sourceIdentity: FAMILY_DINNER_SOURCE_ID,
      });
      return;
    }

    dispatch({
      type: "predefined-profile-confirmed",
      profileId: experience.selectedProfileEntry,
      sourceIdentity: FAMILY_DINNER_SOURCE_ID,
    });
  }

  async function loadSource() {
    dispatch({ type: "source-load-started" });
    setSceneTranscript([]);

    try {
      const evidence = await audioEngine().loadSource();
      setSceneTranscript(evidence.transcript);
      dispatch({
        type: "source-ready",
        sourceIdentity: evidence.sourceIdentity,
        sampleRate: evidence.sampleRate,
        frameCount: evidence.frameCount,
        durationSeconds: evidence.durationSeconds,
      });
    } catch {
      setSceneTranscript([]);
      dispatch({ type: "operation-failed", code: "source-load-failed" });
    }
  }

  async function play(
    mode: ExperienceComparisonMode,
    options: Readonly<{
      actor?: "human" | "agent";
      runId?: string;
      clipWindow?: Readonly<{ startSeconds: number; durationSeconds: number }>;
      onStarted?: () => void;
    }> = {},
  ): Promise<PlaybackOutcome> {
    const snapshot = experienceController.getSnapshot();
    const plan = snapshot.comparisonPlan;

    if (!plan) {
      dispatch({ type: "operation-failed", code: "audio-runtime-unavailable" });
      return "failed";
    }

    const resultIdentity = comparisonResultIdentity(snapshot, mode);

    if (!resultIdentity) {
      dispatch({ type: "operation-failed", code: "audio-runtime-unavailable" });
      return "failed";
    }
    dispatch({ type: "render-started", mode });

    let settlePlayback!: (outcome: PlaybackOutcome) => void;
    const playbackSettled = new Promise<PlaybackOutcome>((resolve) => {
      settlePlayback = resolve;
    });

    try {
      const evidence = await audioEngine().play(
        mode,
        snapshot.supportMode,
        snapshot.interventionState,
        snapshot.speakerPositionState,
        plan,
        snapshot.lowVolumeAcknowledged,
        {
          onEnded: () => {
            dispatch({
              type: "playback-ended",
              resultIdentity,
              runId: options.runId,
            });
            settlePlayback("completed");
          },
          onStopped: () => {
            settlePlayback("cancelled");
          },
          onInterrupted: () => {
            dispatch({
              type: "operation-failed",
              code: "audio-runtime-interrupted",
              mode,
            });
            settlePlayback("failed");
          },
        },
        options.clipWindow,
      );

      dispatch({
        type: "playback-started",
        mode,
        supportMode: evidence.supportMode,
        interventionState: evidence.interventionState,
        speakerPositionState: evidence.speakerPositionState,
        sourceIdentity: evidence.sourceIdentity,
        resultIdentity: evidence.resultIdentity,
        peakDbFs: evidence.peakDbFs,
        actor: options.actor ?? "human",
        runId: options.runId,
      });
      options.onStarted?.();
      return playbackSettled;
    } catch (error) {
      if (error instanceof AudioPlaybackCancelledError) {
        return "cancelled";
      }

      dispatch({
        type: "operation-failed",
        code:
          error instanceof Error && error.name === "AudioSafetyError"
            ? "audio-safety-rejected"
            : "audio-runtime-unavailable",
        mode,
      });
      return "failed";
    }
  }

  function stopPlayback() {
    guidedSequenceTokenRef.current += 1;
    const runId = activeAgentPlaybackRef.current;
    activeAgentPlaybackRef.current = null;
    if (runId) {
      cancelWebMcpPlaybackRun(experienceController, runId);
    }
    audioEngineRef.current?.stop();
    if (!runId) {
      dispatch({ type: "playback-stopped" });
    }
    setAgentListeningCue(
      runId ? "Playback stopped by the person. Nothing was counted as heard." : null,
    );
    setGuidedTransitionActive(false);
  }

  async function playAgentRun(
    run: PlayListeningComparisonData,
    onStarted: () => void,
  ): Promise<void> {
    const currentRun = experienceController
      .getSnapshot()
      .webMcp.session?.playbackRuns.find(
        (candidate) => candidate.runId === run.runId,
      );
    if (!currentRun || currentRun.status !== "starting") {
      throw new Error("The reserved playback run is no longer current.");
    }

    activeAgentPlaybackRef.current = run.runId;
    setGuidedTransitionActive(false);
    setAgentListeningCue(run.narration.now);
    for (let index = 0; index < run.sequence.length; index += 1) {
      if (activeAgentPlaybackRef.current !== run.runId) {
        setGuidedTransitionActive(false);
        return;
      }
      if (index > 0) {
        setGuidedTransitionActive(true);
        await new Promise<void>((resolve) => setTimeout(resolve, 220));
        if (activeAgentPlaybackRef.current !== run.runId) {
          setGuidedTransitionActive(false);
          return;
        }
      }
      const outcome = await play(run.sequence[index]!, {
        actor: "agent",
        runId: run.runId,
        clipWindow: run.clipWindow,
        onStarted: () => {
          setGuidedTransitionActive(false);
          if (index === 0) onStarted();
        },
      });
      if (outcome === "cancelled") {
        activeAgentPlaybackRef.current = null;
        setGuidedTransitionActive(false);
        return;
      }
      if (outcome === "failed") {
        activeAgentPlaybackRef.current = null;
        setGuidedTransitionActive(false);
        failWebMcpPlaybackRun(experienceController, run.runId);
        throw new Error("The browser audio runtime could not complete playback.");
      }
      if (index < run.sequence.length - 1 && run.narration.next) {
        setAgentListeningCue(run.narration.next);
      }
    }
    if (activeAgentPlaybackRef.current === run.runId) {
      activeAgentPlaybackRef.current = null;
      setGuidedTransitionActive(false);
      setAgentListeningCue(run.narration.after);
    }
  }

  agentPlaybackRunnerRef.current = playAgentRun;

  async function playGuidedAB(
    noDifferenceRecovery = false,
  ): Promise<boolean> {
    if (controlsLocked) return false;
    const guidedSequenceToken = guidedSequenceTokenRef.current + 1;
    guidedSequenceTokenRef.current = guidedSequenceToken;
    setGuidedTransitionActive(false);
    const comparisonId = experience.webMcp.session?.comparisons.at(-1)?.comparisonId;
    setAgentListeningCue(
      "Playing the same eight-second moment as A, then B. Focus on the important speaker at the center of the conversation.",
    );
    const clipWindow = { startSeconds: 32.3, durationSeconds: 8 } as const;
    const referenceOutcome = await play("reference", { clipWindow });
    if (referenceOutcome !== "completed") {
      setGuidedTransitionActive(false);
      return false;
    }
    setGuidedTransitionActive(true);
    setAgentListeningCue(
      "A has ended. B follows now; listen for what changes around the important speaker.",
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 220));
    if (guidedSequenceTokenRef.current !== guidedSequenceToken) {
      setGuidedTransitionActive(false);
      return false;
    }
    const simulatedOutcome = await play("simulated", {
      clipWindow,
      onStarted: () => setGuidedTransitionActive(false),
    });
    if (simulatedOutcome === "completed") {
      setGuidedTransitionActive(false);
      setAgentListeningCue(
        "What did you notice? Use your own words — there is no technical phrase you need to choose.",
      );
      if (noDifferenceRecovery && comparisonId) {
        completeWebMcpNoDifferenceRecovery(
          experienceController,
          comparisonId,
        );
      }
      return true;
    }
    setGuidedTransitionActive(false);
    return false;
  }

  async function confirmAgentListeningReadiness(
    grantAgentPlayback: boolean,
  ): Promise<void> {
    let effectiveGrant = false;
    try {
      await audioEngine().unlock();
      effectiveGrant = grantAgentPlayback;
      setAgentAudioNotice(
        grantAgentPlayback
          ? "Agent-started A/B playback is enabled for this session. Stop remains human-controlled."
          : "Playback remains click-only. You can still use every visible listening control.",
      );
    } catch {
      setAgentAudioNotice(
        "The browser could not unlock audio yet. Agent playback remains off; use a visible Play control to retry safely.",
      );
    }
    confirmWebMcpListeningReadiness(experienceController, effectiveGrant);
  }

  function recordDirectObservation(
    focusedSpeech: "clear" | "partial" | "missed" | "unsure",
    maskingSources:
      | readonly ["none"]
      | readonly ["unsure"]
      | readonly ["television"]
      | readonly ["competing_speech"]
      | readonly ["television", "competing_speech"],
    relativeToPrevious: "better" | "same" | "worse" | "unsure" | "not_compared",
    nextAction: "continue" | "summarize" = "continue",
  ) {
    const session = experienceController.getSnapshot().webMcp.session;
    const comparison = session?.comparisons.at(-1);
    const adaptationCount =
      session?.comparisons.filter((candidate) => candidate.kind === "adaptation")
        .length ?? 0;
    const canonicalNextAction =
      comparison?.kind === "adaptation" && adaptationCount >= 2
        ? ("summarize" as const)
        : nextAction;
    recordWebMcpHumanObservation(experienceController, {
      focusedSpeech,
      maskingSources: [...maskingSources],
      relativeToPrevious,
      nextAction: canonicalNextAction,
    });
  }

  function handleNoClearDifference() {
    setAgentListeningCue(
      "That is a valid answer. Replay A then B and focus on the central speaker’s consonants while the television and other voices overlap.",
    );
    void playGuidedAB(true);
  }

  function chooseAgentAdaptation(
    option: ReturnType<typeof deriveValidAdaptationOptions>[number],
  ) {
    setAgentAudioNotice(null);
    switch (option.variable) {
      case "support_mode":
        prepareWebMcpAdaptation(
          experienceController,
          option.variable,
          option.value,
        );
        break;
      case "television_state":
        prepareWebMcpAdaptation(
          experienceController,
          option.variable,
          option.value,
        );
        break;
      case "speaker_position":
        prepareWebMcpAdaptation(
          experienceController,
          option.variable,
          option.value,
        );
        break;
    }
    setAgentListeningCue(option.listenFor);
  }

  function navigateTo(screen: ActiveScreen) {
    if (isPlaying || isRendering) {
      audioEngineRef.current?.stop();
      flushSync(() => {
        dispatch({ type: "playback-stopped" });
      });
    }

    setActiveScreen(screen);
  }

  function canContinueFrom(screen: ActiveScreen): boolean {
    switch (screen) {
      case "welcome":
        return true;
      case "profile":
        return experience.confirmedProfile !== null;
      case "scene":
        return sceneReady;
      case "listening":
        return listeningComparisonReady;
      case "interventions":
        return interventionComparisonReady;
      case "explanation":
        return canCompleteExperience(experience);
      case "completion":
        return false;
    }
  }

  function continueExperience() {
    if (activeScreen === "completion" || !canContinueFrom(activeScreen)) {
      return;
    }

    if (activeScreen === "explanation") {
      flushSync(() => {
        dispatch({ type: "experience-completed" });
      });
    }

    navigateTo(nextScreen[activeScreen]);
  }

  function goBack() {
    if (activeScreen === "welcome") {
      return;
    }

    navigateTo(previousScreen[activeScreen]);
  }

  async function generateLiveExplanation() {
    if (modelRequestInFlightRef.current) {
      return;
    }

    runIdRef.current ??= globalThis.crypto.randomUUID();
    const request = createModelExplanationRequest(
      experience,
      runIdRef.current,
      globalThis.crypto.randomUUID(),
      `result-${globalThis.crypto.randomUUID()}`,
    );

    if (!request) {
      return;
    }

    modelRequestInFlightRef.current = true;
    dispatch({ type: "model-request-started", request });

    try {
      const result = await requestLiveExplanation(request);
      dispatch({ type: "model-result-received", result });
    } finally {
      modelRequestInFlightRef.current = false;
    }
  }

  function startAnotherComparison() {
    audioEngineRef.current?.stop();
    runIdRef.current = null;
    setSceneTranscript([]);
    flushSync(() => {
      dispatch({ type: "comparison-reset" });
    });
    setActiveScreen("profile");
  }

  function confirmAgentConsent() {
    confirmWebMcpConsent(experienceController);
  }

  function selectAgentProfile(profileId: ProfileId) {
    selectWebMcpProfile(experienceController, profileId);
  }

  function resetAgentSession() {
    guidedSequenceTokenRef.current += 1;
    audioEngineRef.current?.stop();
    activeAgentPlaybackRef.current = null;
    runIdRef.current = null;
    setSceneTranscript([]);
    autoLoadedAgentSessionRef.current = null;
    setAgentListeningCue(null);
    setAgentAudioNotice(null);
    flushSync(() => {
      resetWebMcpExperience(experienceController);
    });
    setActiveScreen("welcome");
    setTimeout(() => {
      screenHeadingRef.current?.focus({ preventScroll: true });
    }, 0);
  }

  function downloadCurrentEvidence() {
    const evidence = projectAttributableEvidence(
      experience,
      new Date().toISOString(),
    );

    if (evidence) {
      downloadAttributableEvidence(evidence);
    }
  }

  function sceneTranscriptDetail() {
    return sceneTranscript.length > 0 ? (
      <details className="scene-transcript">
        <summary>Scene transcript</summary>
        <p>
          All comparison states use the same underlying scene and timeline.
          Processing changes the listening comparison, not the spoken wording.
        </p>
        <ol>
          {sceneTranscript.map((entry, index) => (
            <li key={`${entry.startSeconds}-${entry.speaker}-${index}`}>
              <div className="transcript-cue">
                <time dateTime={`PT${entry.startSeconds}S`}>
                  {formatTranscriptTime(entry.startSeconds)}
                </time>
                <strong className="transcript-speaker">{entry.speaker}</strong>
              </div>
              <p className="transcript-text">{entry.text}</p>
            </li>
          ))}
        </ol>
      </details>
    ) : null;
  }

  function renderProfileScreen() {
    const profileLabel =
      selectedPredefinedProfile?.displayName ?? MANUAL_PROFILE_ENTRY_LABEL;
    const rightThresholds =
      selectedPredefinedProfile?.rightThresholdsDbHl ??
      experience.manualDraft.right;
    const leftThresholds =
      selectedPredefinedProfile?.leftThresholdsDbHl ??
      experience.manualDraft.left;

    return (
      <section
        key="profile"
        className="experience-screen"
        aria-labelledby="profile-entry-heading"
      >
        <p className="step-label">Profile / Audiogram</p>
        <h2
          id="profile-entry-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Choose a listening profile
        </h2>
        <div className="profile-guidance">
          <p className="screen-introduction">
            An audiogram is a map of the quietest sounds a person can hear at
            different pitches. It does not tell the whole story, but it can help
            illustrate why parts of speech, distant voices, or quieter sounds may
            become harder to catch.
          </p>
          <p>
            Choosing a profile changes the listening perspective used next. You
            will compare it with the original scene—you are not taking a hearing
            test or receiving a diagnosis.
          </p>
        </div>

        <div className="profile-workspace">
          <div className="profile-entry-column">
            <fieldset className="profile-selector" disabled={controlsLocked}>
              <legend>Profile entry</legend>
              <div className="profile-options">
                {PREDEFINED_HEARING_PROFILES.map((profile) => (
                  <label key={profile.id}>
                    <input
                      type="radio"
                      name="profile-entry"
                      value={profile.id}
                      checked={experience.selectedProfileEntry === profile.id}
                      aria-label={profile.displayName}
                      aria-describedby={`profile-${profile.id}-description`}
                      onChange={() => selectProfileEntry(profile.id)}
                    />
                    <span className="profile-option-copy">
                      <strong>{profile.displayName}</strong>
                      <small id={`profile-${profile.id}-description`}>
                        {profileEverydayDescriptions[profile.id]}
                      </small>
                    </span>
                  </label>
                ))}
                <label>
                  <input
                    type="radio"
                    name="profile-entry"
                    value="manual"
                    checked={experience.selectedProfileEntry === "manual"}
                    aria-label={MANUAL_PROFILE_ENTRY_LABEL}
                    aria-describedby="profile-manual-description"
                    onChange={() => selectProfileEntry("manual")}
                  />
                  <span className="profile-option-copy">
                    <strong>{MANUAL_PROFILE_ENTRY_LABEL}</strong>
                    <small id="profile-manual-description">
                      {manualProfileEverydayDescription}
                    </small>
                  </span>
                </label>
              </div>
            </fieldset>
            <p className="profile-selection-note">
              Three options are fixed synthetic examples. Manual entry stays
              exact and separate for the right and left ears.
            </p>
          </div>

          <div className="profile-detail-column">
            <Audiogram
              profileLabel={profileLabel}
              rightThresholds={rightThresholds}
              leftThresholds={leftThresholds}
            />

            {selectedPredefinedProfile ? (
              <>
                <p className="profile-detail-introduction">
                  Review the exact fixed values before confirming this synthetic
                  illustrative profile.
                </p>
                <details
                  key={selectedPredefinedProfile.id}
                  className="profile-values-detail"
                >
                  <summary>Exact threshold values</summary>
                  <div className="table-scroll profile-table-shell">
                    <table className="profile-threshold-table">
                      <caption>
                        {selectedPredefinedProfile.displayName}: exact fixed
                        synthetic thresholds
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Frequency</th>
                          <th scope="col">Right ear (dB HL)</th>
                          <th scope="col">Left ear (dB HL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FREQUENCY_GRID_HZ.map((frequency) => {
                          const key = frequencyKey(frequency);

                          return (
                            <tr key={frequency}>
                              <th scope="row">
                                {frequency >= 1000
                                  ? `${frequency / 1000} kHz`
                                  : `${frequency} Hz`}
                              </th>
                              <td>
                                {
                                  selectedPredefinedProfile
                                    .rightThresholdsDbHl[key]
                                }
                              </td>
                              <td>
                                {
                                  selectedPredefinedProfile.leftThresholdsDbHl[
                                    key
                                  ]
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
                <button
                  type="button"
                  onClick={confirmSelectedProfile}
                  disabled={controlsLocked}
                >
                  Confirm {selectedPredefinedProfile.displayName}
                </button>
              </>
            ) : (
              <>
                <p className="profile-detail-introduction">
                  Edit the exact thresholds below. The graph reads these same
                  values directly and does not smooth or approximate them.
                </p>

                <details key="manual" className="profile-values-detail">
                  <summary>Exact threshold values</summary>
                  <div className="table-scroll profile-table-shell">
                    <table className="profile-threshold-table">
                      <caption>
                        {MANUAL_PROFILE_ENTRY_LABEL}: exact current thresholds
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Frequency</th>
                          <th scope="col">Right ear (dB HL)</th>
                          <th scope="col">Left ear (dB HL)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FREQUENCY_GRID_HZ.map((frequency) => {
                          const key = frequencyKey(frequency);

                          return (
                            <tr key={frequency}>
                              <th scope="row">
                                {frequency >= 1000
                                  ? `${frequency / 1000} kHz`
                                  : `${frequency} Hz`}
                              </th>
                              {(["right", "left"] as const).map((ear) => (
                                <td key={ear}>
                                  <input
                                    aria-label={`${ear} ear at ${frequency} Hz`}
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="5"
                                    inputMode="numeric"
                                    value={experience.manualDraft[ear][key]}
                                    disabled={controlsLocked}
                                    onChange={(event) =>
                                      updateManualValue(
                                        ear,
                                        frequency,
                                        event.target.value,
                                      )
                                    }
                                  />
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>

                {visible.lastEdit ? (
                  <p className="state-line">{visible.lastEdit}</p>
                ) : null}

                <button
                  type="button"
                  onClick={confirmSelectedProfile}
                  disabled={controlsLocked}
                >
                  Confirm exact manual profile
                </button>
              </>
            )}

            <p className="state-line">{visible.profile}</p>
            {visible.failure ? (
              <p className="error-message" role="alert">
                {visible.failure}
              </p>
            ) : null}
          </div>
        </div>

        <p className="limitation profile-limitation">
          Synthetic profiles and manually entered values are illustrative—not
          diagnoses or predictions of individual perception.
        </p>
      </section>
    );
  }

  function renderSceneScreen() {
    return (
      <section
        key="scene"
        className="experience-screen scene-screen"
        aria-labelledby="source-heading"
      >
        <p className="step-label">Family scene</p>
        <h2
          id="source-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Step into an everyday family moment
        </h2>
        <p className="screen-introduction">
          You are joining a familiar conversation with more than one voice, a
          little distance, and some background sound. Listening difficulty is
          often not about volume alone—it can also be about finding the voice
          you want among everything else.
        </p>
        <p className="scene-continuity-line">
          One validated 64-second scene · four synchronized audio sources · the
          same timeline throughout
        </p>

        <div className="scene-setup-grid">
          <div className="scene-context-column">
            <figure className="scene-figure">
              <div className="scene-image-frame">
                <Image
                  className="scene-image"
                  src="/media/auralis-family-scene.png"
                  width={1672}
                  height={941}
                  sizes="(max-width: 44rem) calc(100vw - 3.5rem), (max-width: 78rem) 62vw, 760px"
                  alt="A multigenerational family talking in a living room, with a television on the left and kitchen activity on the right."
                />
                <div className="scene-source-badges" aria-hidden="true">
                  {sceneSources.map((source) => (
                    <span
                      key={source.id}
                      className={`scene-source-badge scene-source-badge-${source.id}`}
                    >
                      {source.label}
                    </span>
                  ))}
                </div>
              </div>
              <figcaption>
                Original illustrative family context—not a synchronized video
                frame or a measured spatial model.
              </figcaption>
            </figure>

            <div
              className="scene-source-guide"
              aria-labelledby="scene-source-guide-heading"
            >
              <p className="scene-panel-kicker">What you will hear</p>
              <h3 id="scene-source-guide-heading">Four scene sources</h3>
              <ul
                className="scene-source-list"
                aria-label="Family scene sound sources"
              >
                {sceneSources.map((source) => (
                  <li key={source.id}>
                    <strong>{source.label}</strong>
                    <span>{source.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <aside className="scene-setup-panel" aria-label="Scene setup">
            <div className="scene-load-card">
              <p className="scene-panel-kicker">1 · Load the scene</p>
              <h3>Prepare the validated audio</h3>
              <p>
                Load the family moment now. Nothing plays until you choose a
                listening control on the next screen.
              </p>
              <p
                className={`scene-load-status scene-load-status-${experience.source.status}`}
                aria-live="polite"
              >
                {sceneSourceStatusLabels[experience.source.status]}
              </p>
              <button
                type="button"
                onClick={() => void loadSource()}
                disabled={
                  !experience.confirmedProfile ||
                  experience.source.status === "loading" ||
                  controlsLocked
                }
              >
                {experience.source.status === "loading"
                  ? "Loading family scene…"
                  : "Load family scene"}
              </button>
              {visible.failure ? (
                <p className="error-message" role="alert">
                  {visible.failure}
                </p>
              ) : null}
            </div>

            <div className="scene-safety-card">
              <p className="scene-panel-kicker">2 · Listen safely</p>
              <h3>Start at low volume</h3>
              <label className="scene-safety-acknowledgement">
                <input
                  type="checkbox"
                  checked={experience.lowVolumeAcknowledged}
                  disabled={controlsLocked}
                  onChange={(event) =>
                    dispatch({
                      type: "low-volume-acknowledgement-changed",
                      acknowledged: event.target.checked,
                    })
                  }
                />
                <span>
                  I’m listening at a low volume and understand this is an
                  illustrative comparison.
                </span>
              </label>
              <p className="scene-safety-note">
                Digital safety checks cannot guarantee the physical listening
                level of your device.
              </p>
            </div>
          </aside>
        </div>

        <div className="scene-transcript-region">
          {sceneTranscriptDetail()}
        </div>
        <p className="limitation scene-limitation">
          The visual and audio scene are synthetic, illustrative context—not a
          diagnosis, prediction, or synchronized recording.
        </p>
      </section>
    );
  }

  function interventionPlaybackDock() {
    const cardState = (
      mode: ExperienceComparisonMode,
      ready: boolean,
    ): "preparing" | "playing" | "current" | "stale" => {
      if (renderingMode === mode) {
        return "preparing";
      }

      if (
        experience.playback.status === "playing" &&
        experience.playback.mode === mode
      ) {
        return "playing";
      }

      return ready ? "current" : "stale";
    };
    const referenceState = cardState("reference", referenceReady);
    const simulatedState = cardState("simulated", simulatedReady);
    const stateLabel = (state: ReturnType<typeof cardState>): string => {
      switch (state) {
        case "preparing":
          return "Preparing";
        case "playing":
          return "Now playing";
        case "current":
          return "Current";
        case "stale":
          return "Needs refresh";
      }
    };

    return (
      <section
        className="intervention-listening-dock"
        aria-labelledby="intervention-listening-heading"
      >
        <div className="intervention-dock-heading">
          <div>
            <p className="intervention-dock-kicker">Current comparison</p>
            <h3 id="intervention-listening-heading">
              Listen to these conditions
            </h3>
          </div>
          <p>
            Same validated source and timeline. Support applies only to B.
          </p>
        </div>

        <div
          className="intervention-ab-grid"
          role="group"
          aria-label="Intervention A and B playback"
        >
          <article
            className={`intervention-ab-card intervention-ab-card-a intervention-ab-card-${referenceState}`}
          >
            <div className="intervention-ab-title">
              <span aria-hidden="true">A</span>
              <div>
                <p>Validated source</p>
                <h4>Source reference</h4>
              </div>
            </div>
            <p className="intervention-ab-context">
              {interventionLabels[experience.interventionState]} ·{" "}
              {speakerPositionLabels[experience.speakerPositionState]}
            </p>
            <p className="intervention-ab-state">
              {stateLabel(referenceState)}
            </p>
            <button
              type="button"
              aria-label="Play A — Source reference for current conditions"
              onClick={() => void play("reference")}
              disabled={
                !experience.comparisonPlan ||
                experience.source.status !== "ready" ||
                !experience.lowVolumeAcknowledged ||
                controlsLocked
              }
            >
              Play A
            </button>
          </article>

          <article
            className={`intervention-ab-card intervention-ab-card-b intervention-ab-card-${simulatedState}`}
          >
            <div className="intervention-ab-title">
              <span aria-hidden="true">B</span>
              <div>
                <p>Current conditions</p>
                <h4>Current illustrative result</h4>
              </div>
            </div>
            <p className="intervention-ab-context">
              {supportLabels[experience.supportMode]} ·{" "}
              {interventionLabels[experience.interventionState]} ·{" "}
              {speakerPositionLabels[experience.speakerPositionState]}
            </p>
            <p className="intervention-ab-state">
              {stateLabel(simulatedState)}
            </p>
            <button
              type="button"
              aria-label={`Play B — ${supportLabels[experience.supportMode]} current illustrative result`}
              onClick={() => void play("simulated")}
              disabled={
                !experience.comparisonPlan ||
                experience.source.status !== "ready" ||
                !experience.lowVolumeAcknowledged ||
                controlsLocked
              }
            >
              Play B
            </button>
          </article>
        </div>
      </section>
    );
  }

  function listeningPlaybackCards() {
    const cardState = (
      mode: ExperienceComparisonMode,
      ready: boolean,
    ): "preparing" | "playing" | "ready" | "idle" => {
      if (renderingMode === mode) {
        return "preparing";
      }

      if (
        experience.playback.status === "playing" &&
        experience.playback.mode === mode
      ) {
        return "playing";
      }

      return ready ? "ready" : "idle";
    };
    const referenceCardState = cardState("reference", referenceReady);
    const simulatedCardState = cardState("simulated", simulatedReady);
    const agentComparison = experience.webMcp.session?.comparisons.at(-1) ?? null;
    const agentBaseline = agentComparison?.kind === "baseline";
    const awaitingAgentObservation =
      agentState.phase === "awaiting_baseline_observation" ||
      agentState.phase === "awaiting_comparison_observation";
    const cardStateLabel = (
      state: ReturnType<typeof cardState>,
    ): string => {
      switch (state) {
        case "preparing":
          return "Preparing";
        case "playing":
          return "Now playing";
        case "ready":
          return "Ready";
        case "idle":
          return "Ready to prepare";
      }
    };

    return (
      <div
        className="ab-playback-grid"
        data-transport-state={listeningTransportKind}
        role="group"
        aria-label="A and B playback choices"
      >
        <p
          className={`listening-transport-status listening-transport-status-${listeningTransportKind}`}
          role="status"
          aria-live="polite"
        >
          {listeningTransportStatus}
        </p>
        <article
          className={`ab-playback-card ab-playback-card-a ab-playback-card-${referenceCardState}`}
          data-playback-state={referenceCardState}
          aria-current={referenceCardState === "playing" ? "true" : undefined}
        >
          <div className="ab-card-heading">
            <span className="ab-card-letter" aria-hidden="true">
              A
            </span>
            <div>
              <p className="ab-card-kicker">Validated source</p>
              <h3>Source reference</h3>
            </div>
          </div>
          <p className="ab-card-description">
            Hear the family scene before the illustrative profile result.
          </p>
          <dl className="ab-condition-list">
            <div>
              <dt>Television</dt>
              <dd>{interventionLabels[experience.interventionState]}</dd>
            </div>
            <div>
              <dt>Speaker</dt>
              <dd>
                {speakerPositionLabels[experience.speakerPositionState]}
              </dd>
            </div>
          </dl>
          <p className="ab-card-state">
            <span aria-hidden="true" />
            {cardStateLabel(referenceCardState)}
          </p>
          <p className="ab-support-note">
            {agentBaseline
              ? "A is the unchanged validated source reference."
              : "A remains independent of the B support choice."}
          </p>
          <button
            className="ab-play-button"
            type="button"
            aria-label="Play A — Source reference"
            onClick={() => void play("reference")}
            disabled={
              !experience.comparisonPlan ||
              experience.source.status !== "ready" ||
              !experience.lowVolumeAcknowledged ||
              controlsLocked
            }
          >
            Play A
          </button>
        </article>

        <article
          className={`ab-playback-card ab-playback-card-b ab-playback-card-${simulatedCardState}`}
          data-playback-state={simulatedCardState}
          aria-current={simulatedCardState === "playing" ? "true" : undefined}
        >
          <div className="ab-card-heading">
            <span className="ab-card-letter" aria-hidden="true">
              B
            </span>
            <div>
              <p className="ab-card-kicker">Profile-shaped comparison</p>
              <h3>Illustrative result</h3>
            </div>
          </div>
          <p className="ab-card-description">
            {agentBaseline
              ? "Hear the same source through the selected synthetic profile. No adaptation is applied in this baseline."
              : "Hear the same source with the current illustrative support and environmental conditions."}
          </p>
          <dl className="ab-condition-list">
            {agentBaseline ? (
              <div>
                <dt>Change</dt>
                <dd>Synthetic listening profile only</dd>
              </div>
            ) : (
              <div>
                <dt>Support</dt>
                <dd>{supportLabels[experience.supportMode]}</dd>
              </div>
            )}
            <div>
              <dt>Environment</dt>
              <dd>
                {interventionLabels[experience.interventionState]} ·{" "}
                {speakerPositionLabels[experience.speakerPositionState]}
              </dd>
            </div>
          </dl>
          <p className="ab-card-state">
            <span aria-hidden="true" />
            {cardStateLabel(simulatedCardState)}
          </p>
          <p className="ab-support-note">
            {agentBaseline
              ? "Baseline truth: TV on · original position · no support."
              : experience.webMcp.session
                ? "The selected adaptation applies only to B."
                : "Support applies only to B."}
          </p>
          <button
            className="ab-play-button"
            type="button"
            aria-label={`Play B — ${supportLabels[experience.supportMode]} illustrative result`}
            onClick={() => void play("simulated")}
            disabled={
              !experience.comparisonPlan ||
              experience.source.status !== "ready" ||
              !experience.lowVolumeAcknowledged ||
              controlsLocked
            }
          >
            Play B
          </button>
        </article>
        <div className="guided-listening-control">
          <div>
            <p className="agent-kicker">Guided comparison</p>
            <strong>Hear the same moment as A, then B</strong>
            <span>
              Eight seconds each, with a smooth handoff and a clear listening
              focus.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void playGuidedAB()}
            disabled={
              !experience.comparisonPlan ||
              experience.source.status !== "ready" ||
              !experience.lowVolumeAcknowledged ||
              controlsLocked
            }
          >
            Play A then B
          </button>
        </div>
        {experience.webMcp.session &&
        (agentListeningCue || agentAudioNotice?.startsWith("The browser could not unlock")) ? (
          <div className="agent-listening-cue" role="status" aria-live="polite">
            {agentListeningCue ? <strong>{agentListeningCue}</strong> : null}
            {agentAudioNotice?.startsWith("The browser could not unlock") ? (
              <span>{agentAudioNotice}</span>
            ) : null}
          </div>
        ) : null}
        {experience.webMcp.session && awaitingAgentObservation ? (
          <section
            className="agent-observation-prompt"
            aria-labelledby="agent-observation-heading"
          >
            <div>
              <p className="agent-kicker">Your words, not technical labels</p>
              <h3 id="agent-observation-heading">
                {agentBaseline
                  ? "What could you follow in the scene?"
                  : "How did this version feel compared with before?"}
              </h3>
              <p>
                Say it to the agent, type it, or choose the closest everyday
                answer here. The agent translates only what you report.
              </p>
            </div>
            <div className="agent-observation-options">
              {agentBaseline ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "clear",
                        ["none"],
                        "not_compared",
                      )
                    }
                  >
                    I could follow the central voice
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "partial",
                        ["competing_speech"],
                        "not_compared",
                      )
                    }
                  >
                    I lost parts when people overlapped
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "missed",
                        ["television", "competing_speech"],
                        "not_compared",
                      )
                    }
                  >
                    The TV and voices covered too much
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "clear",
                        ["none"],
                        "better",
                      )
                    }
                  >
                    The central voice was easier to follow
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "partial",
                        ["competing_speech"],
                        "worse",
                      )
                    }
                  >
                    It became harder to follow
                  </button>
                  <button
                    type="button"
                    onClick={handleNoClearDifference}
                  >
                    I am not sure yet
                  </button>
                </>
              )}
              <button
                className="agent-no-difference-button"
                type="button"
                onClick={handleNoClearDifference}
                disabled={controlsLocked || noDifferenceReplayCount >= 2}
              >
                I do not hear a clear difference
              </button>
              {noDifferenceReplayCount > 0 ? (
                <button
                  className="agent-continue-unsure-button"
                  type="button"
                  onClick={() =>
                    recordDirectObservation(
                      "unsure",
                      ["unsure"],
                      agentBaseline ? "not_compared" : "same",
                    )
                  }
                >
                  Continue and record that I am unsure
                </button>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    );
  }

  function renderListeningScreen() {
    return (
      <section
        key="listening"
        className="experience-screen listening-screen"
        aria-labelledby="comparison-heading"
      >
        <p className="step-label">A / B LISTENING COMPARISON</p>
        <h2
          id="comparison-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Compare the same moment
        </h2>
        <p className="same-source-line">Same family scene · same timeline</p>
        <p className="screen-introduction">
          Listen to the original scene first, then switch to the selected
          listening profile. The speakers, words, and timing stay the same; only
          the listening perspective changes, making the difference easier to
          notice. Support changes only B.
        </p>

        <figure className="listening-scene-strip">
          <div className="listening-scene-strip-frame">
            <Image
              src="/media/auralis-family-scene.png"
              alt="A family talking in a connected living room and kitchen."
              fill
              sizes="(max-width: 700px) calc(100vw - 3rem), 1180px"
              className="listening-scene-strip-image"
            />
          </div>
          <figcaption>
            <strong>Same validated family scene · same timeline</strong>
            <span>Illustrative visual context—not synchronized playback.</span>
          </figcaption>
        </figure>

        {listeningPlaybackCards()}

        {!experience.webMcp.session ? (
        <><fieldset
          className="support-selector listening-support-selector"
          disabled={
            !experience.comparisonPlan ||
            controlsLocked ||
            experience.webMcp.session !== null
          }
          aria-describedby="listening-support-limitation"
        >
          <legend>Illustrative support for B</legend>
          <div className="support-options listening-support-options">
            {(
              [
                ["none", "No support"],
                ["left-one-sided", "Left-ear support"],
                ["bilateral", "Bilateral support"],
              ] as const
            ).map(([supportMode, label]) => (
              <label key={supportMode}>
                <input
                  type="radio"
                  name="support-mode"
                  value={supportMode}
                  checked={experience.supportMode === supportMode}
                  aria-label={label}
                  onChange={() =>
                    dispatch({ type: "support-mode-changed", supportMode })
                  }
                />
                <span className="support-option-copy">
                  <strong>{label}</strong>
                  <small>{supportEarSummaries[supportMode]}</small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <p
          id="listening-support-limitation"
          className="listening-support-limitation"
        >
          Illustrative support comparison—not a fitting, prescription, or
          prediction of benefit.
        </p>
        </>
        ) : null}

        {!experience.webMcp.session ? (
          <p className="listening-volume-confirmation">
            <span aria-hidden="true" />
            Comfortable listening level acknowledged
          </p>
        ) : null}

        <div className="listening-details">
          {!experience.webMcp.session ? sceneTranscriptDetail() : null}

          <details className="technical-detail">
            <summary>Technical comparison details</summary>
            <ul>
              <li>{visible.profile}</li>
              <li>{visible.source}</li>
              <li>{visible.reference}</li>
              <li>{visible.simulated}</li>
            </ul>
            {selectedTransformation ? (
              <div className="table-scroll proof-table">
                <table>
                  <caption>
                    {supportLabels[experience.supportMode]} profile-derived plan
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Frequency</th>
                      <th scope="col">Right</th>
                      <th scope="col">Left</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTransformation.leftFilters.map(
                      (leftFilter, index) => {
                        const rightFilter =
                          selectedTransformation.rightFilters[index];

                        return (
                          <tr key={leftFilter.frequencyHz}>
                            <th scope="row">{leftFilter.frequencyHz} Hz</th>
                            <td>{rightFilter.gainDb.toFixed(1)} dB</td>
                            <td>{leftFilter.gainDb.toFixed(1)} dB</td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
            ) : null}
            {experience.webMcp.session ? (
              <p className="technical-limitation">
                This comparison is illustrative and non-clinical. It is not a
                fitting, prescription, or prediction of individual benefit.
              </p>
            ) : null}
          </details>
        </div>

        {!experience.webMcp.session ? (
          <p className="limitation listening-limitation">
            This spectral transformation and every support state are illustrative
            and non-clinical. They are not a hearing-aid fitting, prescription, or
            prediction of individual benefit.
          </p>
        ) : null}
      </section>
    );
  }

  function renderInterventionsScreen() {
    const televisionIncluded = experience.interventionState === "tv-on";
    const speakerCloser =
      experience.speakerPositionState === "closer-in-front";
    const currentEarStates = supportEarStates[experience.supportMode];

    return (
      <section
        key="interventions"
        className="experience-screen interventions-screen"
        aria-labelledby="interventions-heading"
      >
        <p className="step-label">COMMUNICATION CONDITIONS</p>
        <h2
          id="interventions-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Try small changes that can help
        </h2>
        <p className="screen-introduction">
          Simple communication choices can make a conversation easier to
          follow. Try facing the listener, moving closer, or reducing competing
          sound, then compare the same scene again.
        </p>

        <div className="intervention-control-grid">
          <fieldset
            className="intervention-selector intervention-control-card"
            disabled={
              !experience.confirmedProfile ||
              experience.source.status !== "ready" ||
              controlsLocked ||
              experience.webMcp.session !== null
            }
          >
            <legend>Television</legend>
            <p>
              Change only whether the television contribution is included in
              the audio.
            </p>
            <div className="intervention-options">
              {(["tv-on", "tv-off"] as const).map((interventionState) => (
                <label key={interventionState}>
                  <input
                    type="radio"
                    name="intervention-state"
                    value={interventionState}
                    checked={experience.interventionState === interventionState}
                    onChange={() =>
                      dispatch({
                        type: "intervention-state-changed",
                        interventionState,
                      })
                    }
                  />
                  <span>
                    <strong>{interventionLabels[interventionState]}</strong>
                    <small>
                      {interventionState === "tv-on"
                        ? "Television contribution included"
                        : "Television contribution removed"}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset
            className="speaker-position-selector intervention-control-card"
            disabled={
              !experience.confirmedProfile ||
              experience.source.status !== "ready" ||
              controlsLocked ||
              experience.webMcp.session !== null
            }
          >
            <legend>Important speaker</legend>
            <p>
              Change only the important speaker&apos;s illustrative position
              and contribution.
            </p>
            <div className="speaker-position-options">
              {(["original-position", "closer-in-front"] as const).map(
                (speakerPositionState) => (
                  <label key={speakerPositionState}>
                    <input
                      type="radio"
                      name="speaker-position-state"
                      value={speakerPositionState}
                      checked={
                        experience.speakerPositionState === speakerPositionState
                      }
                      onChange={() =>
                        dispatch({
                          type: "speaker-position-changed",
                          speakerPositionState,
                        })
                      }
                    />
                    <span>
                      <strong>
                        {speakerPositionLabels[speakerPositionState]}
                      </strong>
                      <small>
                        {speakerPositionState === "original-position"
                          ? "Original illustrative condition"
                          : "Closer and centered in front"}
                      </small>
                    </span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
        </div>

        <div className="intervention-visual-grid">
          <div className="intervention-map-column">
            <figure
              className="intervention-scene-map"
              aria-labelledby="intervention-map-title"
              aria-describedby="intervention-map-description"
            >
              <div className="intervention-scene-frame">
                <Image
                  src="/media/auralis-family-scene.png"
                  alt="A family talking in a connected living room and kitchen."
                  fill
                  sizes="(max-width: 700px) calc(100vw - 3rem), 760px"
                  className="intervention-scene-image"
                />
                <div
                  className={`intervention-tv-region ${
                    televisionIncluded
                      ? "intervention-tv-region-included"
                      : "intervention-tv-region-removed"
                  }`}
                  aria-hidden="true"
                >
                  <span>Television</span>
                  <strong>
                    {televisionIncluded ? "Included" : "Removed from audio"}
                  </strong>
                </div>
                <div
                  className={`intervention-speaker-marker ${
                    speakerCloser
                      ? "intervention-speaker-marker-closer"
                      : "intervention-speaker-marker-original"
                  }`}
                  aria-hidden="true"
                >
                  <span>Important speaker</span>
                  <strong>
                    {speakerCloser ? "Closer, in front" : "Original position"}
                  </strong>
                </div>
                <div
                  className="intervention-source-badge intervention-source-badge-overlap"
                  aria-hidden="true"
                >
                  Overlapping speakers · Included
                </div>
                <div
                  className="intervention-source-badge intervention-source-badge-room"
                  aria-hidden="true"
                >
                  Kitchen / room · Included
                </div>
                <div
                  className="intervention-listener-anchor"
                  aria-hidden="true"
                >
                  Listener focus
                </div>
              </div>
              <figcaption>
                <strong id="intervention-map-title">
                  Illustrative scene-state map
                </strong>
                <span id="intervention-map-description">
                  Television is{" "}
                  {televisionIncluded ? "included" : "removed from audio"}.
                  The important speaker is in the{" "}
                  {speakerCloser
                    ? "closer, in-front condition"
                    : "original-position condition"}
                  . Overlapping speakers and kitchen or room sounds remain
                  included.
                </span>
                <small>Position marker is illustrative and not to scale.</small>
              </figcaption>
            </figure>

            <dl
              className="intervention-state-summary"
              aria-label="Current scene-source states"
            >
              <div data-source="important-speaker">
                <dt>Important speaker</dt>
                <dd>
                  {speakerCloser ? "Closer, in front" : "Original position"}
                </dd>
              </div>
              <div data-source="overlapping-speakers">
                <dt>Overlapping speakers</dt>
                <dd>Included</dd>
              </div>
              <div
                data-source="television"
                className={
                  televisionIncluded
                    ? undefined
                    : "intervention-source-removed"
                }
              >
                <dt>Television</dt>
                <dd>
                  {televisionIncluded ? "Included" : "Removed from audio"}
                </dd>
              </div>
              <div data-source="kitchen-room">
                <dt>Kitchen / room</dt>
                <dd>Included</dd>
              </div>
            </dl>
          </div>

          <aside
            className="intervention-support-context"
            aria-labelledby="intervention-support-heading"
          >
            <p className="intervention-context-kicker">Read-only context</p>
            <h3 id="intervention-support-heading">Current support for B</h3>
            <strong>{supportLabels[experience.supportMode]}</strong>
            <dl>
              <div>
                <dt>Right ear</dt>
                <dd>{currentEarStates.right}</dd>
              </div>
              <div>
                <dt>Left ear</dt>
                <dd>{currentEarStates.left}</dd>
              </div>
            </dl>
            <p>
              Return to Listening to change support. This is illustrative
              support—not a fitting, prescription, or prediction of benefit.
            </p>
            <details className="technical-detail intervention-technical-detail">
              <summary>Technical condition details</summary>
              <p>{visible.interventionSummary}</p>
              <p>{visible.speakerPositionSummary}</p>
            </details>
          </aside>
        </div>

        {interventionPlaybackDock()}
        {experience.webMcp.session ? (
          <div className="agent-adaptation-listening-loop">
            <div className="guided-listening-control">
              <div>
                <p className="agent-kicker">Repeatable listening loop</p>
                <strong>Compare the same moment again</strong>
                <span>
                  Play A then B, ask the agent to run it, or use either Play
                  control above.
                </span>
              </div>
              <button
                type="button"
                onClick={() => void playGuidedAB()}
                disabled={controlsLocked}
              >
                Play A then B
              </button>
            </div>
            {agentListeningCue ||
            agentAudioNotice?.startsWith("The browser could not unlock") ? (
              <div
                className="agent-listening-cue"
                role="status"
                aria-live="polite"
              >
                {agentListeningCue ? <strong>{agentListeningCue}</strong> : null}
                {agentAudioNotice?.startsWith("The browser could not unlock") ? (
                  <span>{agentAudioNotice}</span>
                ) : null}
              </div>
            ) : null}
            {agentState.phase === "awaiting_comparison_observation" ? (
              <section
                className="agent-observation-prompt"
                aria-labelledby="agent-adaptation-observation-heading"
              >
                <div>
                  <p className="agent-kicker">Use everyday words</p>
                  <h3 id="agent-adaptation-observation-heading">
                    What changed for you?
                  </h3>
                  <p>
                    You can speak or type a vague answer. The agent maps only
                    your stated meaning into the bounded session evidence.
                  </p>
                </div>
                <div className="agent-observation-options">
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation("clear", ["none"], "better")
                    }
                  >
                    The central voice was easier to follow
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      recordDirectObservation(
                        "partial",
                        ["competing_speech"],
                        "worse",
                      )
                    }
                  >
                    It became harder to follow
                  </button>
                  <button
                    type="button"
                    onClick={handleNoClearDifference}
                  >
                    I am not sure yet
                  </button>
                  <button
                    className="agent-no-difference-button"
                    type="button"
                    onClick={handleNoClearDifference}
                    disabled={controlsLocked || noDifferenceReplayCount >= 2}
                  >
                    I do not hear a clear difference
                  </button>
                  {noDifferenceReplayCount > 0 ? (
                    <button
                      className="agent-continue-unsure-button"
                      type="button"
                      onClick={() =>
                        recordDirectObservation(
                          "unsure",
                          ["unsure"],
                          "same",
                        )
                      }
                    >
                      Continue and record no clear difference
                    </button>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        <p
          className={`intervention-transport-status intervention-transport-status-${interventionTransportKind}`}
          role="status"
          aria-live="polite"
        >
          {interventionTransportStatus}
        </p>
        <p className="limitation intervention-limitation">
          These changes do not restore hearing, but they can make the voice
          easier to reach in a difficult moment. This remains a deterministic
          illustration—not a medical recommendation or guaranteed outcome.
        </p>
      </section>
    );
  }

  function renderExplanationScreen() {
    const profile = experience.confirmedProfile;
    const profileLabel = profile
      ? profile.sourceType === "manual"
        ? "Manual audiogram"
        : profile.displayName
      : "No confirmed profile";
    const profileOrigin = profile
      ? profile.sourceType === "manual"
        ? "Manually entered"
        : "Synthetic predefined"
      : "Unavailable";
    const currentEarStates = supportEarStates[experience.supportMode];
    const modelStatus =
      experience.modelState.status === "loading"
        ? "Generating an explanation for the current comparison…"
        : experience.modelState.status === "live"
          ? "Live GPT explanation is current for this deterministic comparison."
          : experience.modelState.status === "degraded"
            ? "Live GPT unavailable; the deterministic comparison remains complete and usable."
            : "Optional GPT explanation not requested.";
    const hasModelAttempt = experience.modelAttemptsUsed > 0;

    return (
      <section
        key="explanation"
        className="experience-screen explanation-screen"
        aria-labelledby="live-explanation-heading"
      >
        <p className="step-label">UNDERSTAND THE COMPARISON</p>
        <h2
          id="live-explanation-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Make sense of what changed
        </h2>
        <p className="screen-introduction">
          Auralis connects the comparison with a plain-language explanation.
          Softer parts of speech may fade, distance can reduce clarity, and
          background sound can compete with the voice you are trying to follow.
          This remains an illustration, not a diagnosis or an exact prediction
          of one person&apos;s experience.
        </p>

        <div className="explanation-layout">
          <section
            className="explanation-deterministic-summary"
            aria-labelledby="what-you-compared-heading"
          >
            <p className="explanation-panel-kicker">Deterministic result</p>
            <h3 id="what-you-compared-heading">What you compared</h3>
            <p className="explanation-panel-lead">
              This comparison is complete and usable independently of GPT.
            </p>
            <dl className="explanation-summary-grid">
              <div>
                <dt>Profile</dt>
                <dd>{profileLabel}</dd>
              </div>
              <div>
                <dt>Origin</dt>
                <dd>{profileOrigin}</dd>
              </div>
              <div>
                <dt>Support for B</dt>
                <dd>{supportLabels[experience.supportMode]}</dd>
              </div>
              <div>
                <dt>Right ear</dt>
                <dd>{currentEarStates.right}</dd>
              </div>
              <div>
                <dt>Left ear</dt>
                <dd>{currentEarStates.left}</dd>
              </div>
              <div>
                <dt>Television</dt>
                <dd>{interventionLabels[experience.interventionState]}</dd>
              </div>
              <div>
                <dt>Important speaker</dt>
                <dd>
                  {speakerPositionLabels[experience.speakerPositionState]}
                </dd>
              </div>
            </dl>
            <div className="explanation-deterministic-proof">
              <strong>Same validated family scene and timeline</strong>
              <span>
                The current deterministic transformation produced the result you
                heard; GPT cannot change it.
              </span>
            </div>
          </section>

          <section
            className={`gpt-explanation-panel gpt-explanation-panel-${experience.modelState.status}`}
            aria-labelledby="optional-gpt-heading"
            aria-busy={experience.modelState.status === "loading"}
          >
            <p className="explanation-panel-kicker">Optional layer</p>
            <h3 id="optional-gpt-heading">Optional GPT explanation</h3>
            <p className="explanation-panel-lead">
              It explains the current result but cannot control audio, support,
              communication conditions, or safety.
            </p>

            <aside className="gpt-demo-note" aria-labelledby="gpt-demo-note-heading">
              <h4 id="gpt-demo-note-heading">About the GPT explanation</h4>
              <p>
                The recorded demo shows the GPT-powered explanation fully
                enabled. This public production build does not include a shared
                OpenAI API key. To generate the explanation live in a production
                demo, configure your own API key securely on the server. This
                keeps private credentials out of the browser and prevents public
                use of the project key.
              </p>
            </aside>

            <button
              type="button"
              className="explanation-action"
              onClick={() => void generateLiveExplanation()}
              disabled={!canRequestModelExplanation(experience)}
            >
              {experience.modelState.status === "loading"
                ? "Generating explanation…"
                : hasModelAttempt
                  ? "Retry explanation"
                  : "Generate explanation"}
            </button>

            <p
              className="model-status"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {modelStatus}
            </p>

            {hasModelAttempt ? (
              <p className="attempt-count">
                Attempt {experience.modelAttemptsUsed} of{" "}
                {MAX_MODEL_ATTEMPTS_PER_SESSION} used.
              </p>
            ) : null}

            {experience.modelState.status === "live" ? (
              <div className="model-result model-result-live">
                <p className="model-badge">Live GPT</p>
                <h4>What this comparison means</h4>
                <dl className="model-result-structure">
                  <div>
                    <dt>What was happening</dt>
                    <dd>{experience.modelState.result.sceneFraming}</dd>
                  </div>
                  <div>
                    <dt>What changed in this comparison</dt>
                    <dd>{experience.modelState.result.audibleChange}</dd>
                  </div>
                  <div>
                    <dt>What stayed the same</dt>
                    <dd>{experience.modelState.result.unchanged}</dd>
                  </div>
                  <div>
                    <dt>How to interpret this</dt>
                    <dd>{experience.modelState.result.limitation}</dd>
                  </div>
                </dl>
              </div>
            ) : null}

            {experience.modelState.status === "degraded" ? (
              <div className="model-result model-result-degraded">
                <p className="model-badge">Degraded</p>
                <h4>Live explanation unavailable</h4>
                <p className="degraded-core-message">
                  Live GPT unavailable; the deterministic comparison remains
                  complete and usable.
                </p>
                <p>{experience.modelState.result.message}</p>
              </div>
            ) : null}
          </section>
        </div>

        <p className="limitation explanation-limitation">
          This experience and explanation are illustrative and non-clinical—not
          a diagnosis, hearing-aid fitting, prescription, or prediction of
          individual perception or benefit.
        </p>
      </section>
    );
  }

  function renderCompletionScreen() {
    return (
      <section
        key="completion"
        className="experience-screen completion-screen"
        aria-labelledby="completion-heading"
      >
        <p className="step-label">COMPLETION</p>
        <h2
          id="completion-heading"
          ref={screenHeadingRef}
          className="screen-heading"
          tabIndex={-1}
        >
          Take the comparison into a real conversation
        </h2>
        <p className="screen-introduction">
          The goal is not to reproduce someone&apos;s hearing perfectly. It is to
          make an invisible difficulty easier to understand and talk about—and
          to show how small choices in distance, attention, and background sound
          can help.
        </p>

        {terminalCompletion ? (
          <div
            className="completion-result"
            aria-labelledby="completion-result-heading"
          >
            <div className="completion-result-heading">
              <p className="completion-status">Comparison complete</p>
              <h3 id="completion-result-heading">Attributable summary</h3>
              <p>
                The deterministic listening comparison completed successfully.
              </p>
            </div>
            <dl className="completion-summary">
              <div>
                <dt>Profile</dt>
                <dd>{terminalCompletion.profile}</dd>
              </div>
              <div>
                <dt>Profile origin</dt>
                <dd>{terminalCompletion.profileOrigin}</dd>
              </div>
              <div>
                <dt>Support</dt>
                <dd>{terminalCompletion.support}</dd>
              </div>
              <div>
                <dt>Television</dt>
                <dd>{terminalCompletion.television}</dd>
              </div>
              <div>
                <dt>Important speaker</dt>
                <dd>{terminalCompletion.speakerPosition}</dd>
              </div>
              <div>
                <dt>Explanation status</dt>
                <dd>{terminalCompletion.explanationStatus}</dd>
              </div>
            </dl>

            <section
              className={`completion-explanation completion-explanation-${terminalCompletion.status}`}
              aria-labelledby="completion-explanation-heading"
            >
              <p className="model-badge">
                {terminalCompletion.explanationStatus}
              </p>
              <h3 id="completion-explanation-heading">
                Explanation availability
              </h3>
              <p>{terminalCompletion.explanationAvailability}</p>
              {terminalCompletion.status === "complete-degraded" ? (
                <p className="completion-degraded-truth">
                  The deterministic comparison completed successfully; only Live
                  GPT availability was limited.
                </p>
              ) : (
                <p>
                  The explanation is grounded in this completed result and does
                  not change the deterministic audio.
                </p>
              )}
            </section>

            <p className="limitation completion-limitation">
              {terminalCompletion.limitation}
            </p>

            <div className="completion-next-action">
              <span>One bounded next action</span>
              <strong>{terminalCompletion.nextAction}</strong>
            </div>

            <div className="completion-actions">
              <button
                className="completion-primary-action"
                type="button"
                onClick={startAnotherComparison}
              >
                Start another comparison
              </button>
              <div className="completion-secondary-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={downloadCurrentEvidence}
                >
                  Download evidence
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => navigateTo("explanation")}
                >
                  Review explanation
                </button>
              </div>
            </div>

            <p className="completion-evidence-note">
              Downloaded evidence is a sanitized, attributable proof of this
              illustrative run—not a clinical report.
            </p>

            <details className="completion-details">
              <summary>Result details</summary>
              <dl>
                <div>
                  <dt>Deterministic result identity</dt>
                  <dd>
                    <code>{terminalCompletion.resultIdentity}</code>
                  </dd>
                </div>
                <div>
                  <dt>Completion classification</dt>
                  <dd>
                    {terminalCompletion.status === "complete-live"
                      ? "Complete — live"
                      : "Complete — degraded"}
                  </dd>
                </div>
                <div>
                  <dt>Evidence</dt>
                  <dd>Sanitized attributable JSON available</dd>
                </div>
              </dl>
            </details>
          </div>
        ) : (
          <p className="state-line" role="status">
            Completion is unavailable because the current result is no longer
            eligible.
          </p>
        )}
      </section>
    );
  }

  function renderActiveScreen() {
    switch (activeScreen) {
      case "profile":
        return renderProfileScreen();
      case "scene":
        return renderSceneScreen();
      case "listening":
        return renderListeningScreen();
      case "interventions":
        return renderInterventionsScreen();
      case "explanation":
        return renderExplanationScreen();
      case "completion":
        return renderCompletionScreen();
      case "welcome":
        return null;
    }
  }

  function renderAgentSurface(phase: AuralisWebMcpPhase) {
    switch (phase) {
      case "awaiting_profile_selection":
        return (
          <section
            className="agent-profile-selection"
            aria-labelledby="agent-next-action-heading"
          >
            <div className="agent-profile-selection-heading">
              <p className="agent-kicker">Three approved demo audiograms</p>
              <p>
                Nothing is preselected. These are the same grounded
                descriptions available to the agent.
              </p>
            </div>
            <div className="agent-profile-options">
              {AURALIS_PROFILE_PROJECTIONS.map((profile) => {
                const audiogram = predefinedProfileById(profile.profileId);
                return (
                <article
                  key={profile.profileId}
                  className="agent-profile-card"
                  data-profile-id={profile.profileId}
                >
                  <p className="agent-profile-classification">
                    Synthetic illustrative profile
                  </p>
                  <h3>{profile.displayName}</h3>
                  <Audiogram
                    compact
                    profileLabel={profile.displayName}
                    rightThresholds={audiogram.rightThresholdsDbHl}
                    leftThresholds={audiogram.leftThresholdsDbHl}
                  />
                  <p>{profile.everydayDescription}</p>
                  <dl>
                    <div>
                      <dt>Shows</dt>
                      <dd>{profile.demonstrates}</dd>
                    </div>
                  </dl>
                  <button
                    type="button"
                    onClick={() => selectAgentProfile(profile.profileId)}
                    disabled={controlsLocked}
                  >
                    Use {profile.displayName}
                  </button>
                </article>
                );
              })}
            </div>
            <p className="agent-profile-limitation">
              Synthetic and illustrative only — not a diagnosis or a
              prediction of an individual person’s hearing.
            </p>
          </section>
        );
      case "awaiting_scene_load":
        return (
          <section className="agent-scene-loading" aria-live="polite">
            <p className="agent-kicker">Scene-first preparation</p>
            <h2>
              {experience.source.status === "failed"
                ? "The family scene could not be prepared"
                : "Preparing the family scene"}
            </h2>
            <p>
              {experience.source.status === "failed"
                ? "The session and selected audiogram are preserved. Retry only the scene preparation."
                : "The validated 64-second scene is loading automatically. Nothing will play."}
            </p>
            {experience.source.status === "failed" ? (
              <button type="button" onClick={() => void loadSource()}>
                Retry scene preparation
              </button>
            ) : (
              <span className="agent-loading-indicator" aria-hidden="true" />
            )}
          </section>
        );
      case "awaiting_volume_acknowledgement":
        return (
          <AgentVolumeConsentDialog
            controlsBusy={controlsLocked}
            onConfirm={confirmAgentListeningReadiness}
            onReset={resetAgentSession}
          />
        );
      case "awaiting_baseline_listening":
      case "awaiting_baseline_observation":
        return renderListeningScreen();
      case "awaiting_comparison_listening":
      case "awaiting_comparison_observation":
        return renderInterventionsScreen();
      case "ready_for_baseline":
        return (
          <section className="agent-recovery-action" role="status">
            <p className="agent-kicker">Bounded recovery</p>
            <h2>The scene is ready; the baseline needs one final commit</h2>
            <p>
              This state should normally be skipped automatically after the
              comfortable-volume confirmation. No audio will start.
            </p>
            <button
              type="button"
              onClick={() => prepareWebMcpBaselineRecovery(experienceController)}
              disabled={controlsLocked}
            >
              Prepare the fixed baseline
            </button>
          </section>
        );
      case "ready_for_adaptation": {
        const options = deriveValidAdaptationOptions(experience);
        return (
          <section
            className="agent-adaptation-choice"
            aria-label="Available adaptation options"
          >
            <div className="agent-adaptation-options">
              {options.map((option) => (
                <article key={`${option.variable}-${option.value}`}>
                  <h3>{option.label}</h3>
                  <small>{option.listenFor}</small>
                  <button
                    type="button"
                    onClick={() => chooseAgentAdaptation(option)}
                    disabled={controlsLocked}
                  >
                    Try this change
                  </button>
                </article>
              ))}
            </div>
          </section>
        );
      }
      case "complete":
        return experience.webMcp.session ? (
          <AgentFinalSummary session={experience.webMcp.session} />
        ) : null;
      case "awaiting_session_stage":
      case "awaiting_consent":
        return null;
    }
  }

  const showPersistentStop =
    activeScreen === "listening" ||
    activeScreen === "interventions" ||
    activeScreen === "explanation";
  const activeStep =
    activeScreen === "welcome"
      ? null
      : experienceScreenOrder.indexOf(activeScreen) + 1;

  if (experience.webMcp.session) {
    return (
      <AgentSessionShell
        phase={agentState.phase}
        revision={agentState.revision}
        session={experience.webMcp.session}
        humanGate={agentState.humanGate}
        allowedNextTools={agentState.allowedNextTools}
        controlsBusy={controlsLocked}
        stopAvailable={isPlaying || isRendering || guidedTransitionActive}
        onStopImmediately={stopPlayback}
        onConfirmConsent={confirmAgentConsent}
        onResetSession={resetAgentSession}
      >
        {renderAgentSurface(agentState.phase)}
      </AgentSessionShell>
    );
  }

  return (
    <main className="guided-shell">
      {activeScreen === "welcome" ? (
        <section
          key="welcome"
          className="welcome-screen experience-screen"
          aria-labelledby="auralis-heading"
        >
          <div className="welcome-copy">
            <p className="eyebrow">A guided listening comparison</p>
            <div className="welcome-brand-lockup">
              <Image
                src="/media/auralis-mark.png"
                width={256}
                height={256}
                sizes="64px"
                className="welcome-mark"
                alt=""
                aria-hidden="true"
              />
              <h1
                id="auralis-heading"
                ref={screenHeadingRef}
                className="screen-heading"
                tabIndex={-1}
              >
                Auralis
              </h1>
            </div>
            <p className="tagline">See what hearing sounds like.</p>
            <p className="welcome-statement">
              Auralis turns an audiogram into a guided listening comparison.
            </p>
            <p>
              Choose a hearing profile, step into an everyday family scene, and
              hear how distance, background sound, and communication support can
              change what reaches a listener.
            </p>
            <button type="button" onClick={() => navigateTo("profile")}>
              Start the comparison
            </button>
            <p className="welcome-headphone-tip">
              Best experienced with headphones — AirPods Pro, AirPods Max, or
              any comfortable stereo headphones. Set a comfortable listening
              level before you begin.
            </p>
            <div className="agent-ready-lockup">
              <span
                className="agent-ready-badge"
                tabIndex={0}
                aria-describedby="agent-ready-help"
              >
                <span aria-hidden="true">AR</span>
                Agentic ready
              </span>
              <span
                id="agent-ready-help"
                className="agent-ready-tooltip"
                role="tooltip"
              >
                Ask your agent to guide you on this website. This badge never
                activates agent mode by itself.
              </span>
            </div>
            <p className="limitation">
              Built to help families understand an everyday listening
              experience—not to diagnose hearing or recommend treatment.
            </p>
            <details className="how-it-works">
              <summary>How it works</summary>
              <p>
                Choose a profile, load one validated family moment, compare the
                original with an illustrative result, try two communication
                changes, then review a plain-language summary.
              </p>
            </details>
          </div>
          <div className="welcome-visual" aria-hidden="true">
            <Image
              src="/media/auralis-family-scene.png"
              alt=""
              fill
              sizes="(max-width: 44rem) calc(100vw - 3rem), 34rem"
              className="welcome-family-image"
            />
            <div className="welcome-visual-scrim" />
            <div className="welcome-principle">
              <span>One family scene</span>
              <span>Two listening perspectives</span>
              <span>A clearer conversation</span>
            </div>
          </div>
        </section>
      ) : (
        <>
          <header className="experience-header">
            <h1 className="app-wordmark">Auralis</h1>
            <p
              className="progress-label"
              aria-label={`Step ${activeStep} of 6: ${screenLabels[activeScreen]}`}
              aria-current="step"
            >
              <span>
                {activeStep} of 6
              </span>
              <strong>{screenLabels[activeScreen]}</strong>
            </p>
            {showPersistentStop ? (
              <div className="persistent-stop-slot">
                <button
                  className="stop-button"
                  type="button"
                  onClick={stopPlayback}
                  disabled={!isPlaying && !isRendering}
                >
                  Stop immediately
                </button>
              </div>
            ) : (
              <div className="header-balance" aria-hidden="true" />
            )}
          </header>

          <div className="screen-stage">{renderActiveScreen()}</div>

          <nav className="screen-navigation" aria-label="Experience navigation">
            <button
              className="secondary-button"
              type="button"
              onClick={goBack}
            >
              Back
            </button>
            {activeScreen !== "completion" ? (
              <button
                type="button"
                onClick={continueExperience}
                disabled={!canContinueFrom(activeScreen)}
              >
                Continue to {screenLabels[nextScreen[activeScreen]]}
              </button>
            ) : null}
          </nav>
        </>
      )}
    </main>
  );
}
