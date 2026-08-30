"use client";

import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";

import type {
  AuralisToolName,
  AuralisWebMcpPhase,
  HumanGateProjection,
} from "../contracts/webmcp";
import type { WebMcpSessionState } from "../core/experience";
import { AURALIS_PROFILE_PROJECTIONS } from "../core/webmcp";

const chapters = [
  "Setup",
  "Baseline",
  "Adaptation",
  "Summary",
] as const;

const chapterForPhase: Record<AuralisWebMcpPhase, number> = {
  awaiting_session_stage: 0,
  awaiting_consent: 0,
  awaiting_profile_selection: 0,
  awaiting_scene_load: 0,
  awaiting_volume_acknowledgement: 0,
  ready_for_baseline: 1,
  awaiting_baseline_listening: 1,
  awaiting_baseline_observation: 1,
  ready_for_adaptation: 2,
  awaiting_comparison_listening: 2,
  awaiting_comparison_observation: 2,
  complete: 3,
};

const phaseCopy: Record<
  AuralisWebMcpPhase,
  Readonly<{ eyebrow: string; heading: string; detail: string }>
> = {
  awaiting_session_stage: {
    eyebrow: "Waiting for the agent",
    heading: "Stage a guided session",
    detail: "No agent-guided session has been staged yet.",
  },
  awaiting_consent: {
    eyebrow: "Human gate",
    heading: "Confirm the purpose first",
    detail:
      "Auralis is an illustrative family comparison, not a diagnosis or treatment recommendation.",
  },
  awaiting_profile_selection: {
    eyebrow: "Shared choice",
    heading: "Choose a demo audiogram",
    detail:
      "Choose one of the same three options shown to the agent. You can click here or direct the agent by text or voice.",
  },
  awaiting_scene_load: {
    eyebrow: "Agent preparation",
    heading: "Preparing the family scene",
    detail:
      "The selected profile is locked for this run and the validated scene is loading automatically. Nothing will play.",
  },
  awaiting_volume_acknowledgement: {
    eyebrow: "Human gate",
    heading: "Set a comfortable volume",
    detail:
      "Confirm the physical listening level before any comparison can play.",
  },
  ready_for_baseline: {
    eyebrow: "Recovery action",
    heading: "Prepare the fixed baseline",
    detail:
      "The baseline normally appears with the volume confirmation. If it is missing, use the visible recovery control.",
  },
  awaiting_baseline_listening: {
    eyebrow: "Shared listening",
    heading: "Listen to A, then B",
    detail:
      "Use the visible controls or ask the agent to play A, B, or the guided A-then-B sequence if you granted playback.",
  },
  awaiting_baseline_observation: {
    eyebrow: "Tell the agent",
    heading: "What did you notice?",
    detail:
      "Describe the focused voice and any masking sound by typing or speaking to the agent.",
  },
  ready_for_adaptation: {
    eyebrow: "Agent action",
    heading: "Choose one useful change",
    detail:
      "The agent can propose one bounded change based on what you noticed. You remain in control of the next listening step.",
  },
  awaiting_comparison_listening: {
    eyebrow: "Shared listening",
    heading: "Now listen to B",
    detail:
      "Listen directly or ask the agent to replay the same eight-second moment. Focus on the important speaker.",
  },
  awaiting_comparison_observation: {
    eyebrow: "Tell the agent",
    heading: "Did that change help?",
    detail:
      "Share what became clearer, stayed the same, or became harder. The agent records only what you report.",
  },
  complete: {
    eyebrow: "Session complete",
    heading: "Your comparison summary",
    detail:
      "The final observation completed this browser-ephemeral session and its evidence.",
  },
};

const supportLabels = {
  none: "No illustrative support",
  "left-one-sided": "Left-ear illustrative support",
  bilateral: "Bilateral illustrative support",
} as const;

const televisionLabels = {
  "tv-on": "TV on",
  "tv-off": "TV off",
} as const;

const speakerLabels = {
  "original-position": "Original position",
  "closer-in-front": "Speaker closer and in front",
} as const;

const changeLabels = {
  support_mode: "Listening support",
  television_state: "Television",
  speaker_position: "Speaker position",
} as const;

const toolLabels: Record<AuralisToolName, string> = {
  get_auralis_state: "Read current Auralis state",
  stage_demo_session: "Start the session or choose a demo audiogram",
  prepare_comparison: "Prepare the next comparison",
  play_listening_comparison: "Play A, B, or the guided A then B sequence",
  record_user_observation: "Record your stated observation",
  get_session_evidence: "Read session evidence",
  wait_for_session_change: "Wait for session change",
};

const eventLabels = {
  consent_confirmed: "Consent confirmed",
  session_staged: "Session staged",
  profile_confirmed: "Profile confirmed",
  scene_loaded: "Scene loaded",
  volume_acknowledged: "Comfortable volume acknowledged",
  comparison_prepared: "Comparison prepared",
  playback_requested: "Playback requested",
  playback_started: "Playback started",
  playback_completed: "Playback completed",
  playback_cancelled: "Playback cancelled",
  playback_failed: "Playback failed",
  observation_recorded: "Observation recorded",
  session_finished: "Session finished",
} as const;

export type AgentSessionShellProps = Readonly<{
  phase: AuralisWebMcpPhase;
  revision: number;
  session: WebMcpSessionState;
  humanGate: HumanGateProjection | null;
  allowedNextTools: readonly AuralisToolName[];
  controlsBusy: boolean;
  stopAvailable: boolean;
  onStopImmediately: () => void;
  onConfirmConsent: () => void;
  onResetSession: () => void;
  children: ReactNode;
}>;

export function AgentSessionShell({
  phase,
  revision,
  session,
  humanGate,
  allowedNextTools,
  controlsBusy,
  stopAvailable,
  onStopImmediately,
  onConfirmConsent,
  onResetSession,
  children,
}: AgentSessionShellProps) {
  const actionHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const activeChapter = chapterForPhase[phase];
  const current = session.comparisons.at(-1) ?? null;
  const stagedProfile = AURALIS_PROFILE_PROJECTIONS.find(
    (profile) => profile.profileId === session.stagedProfileId,
  );
  const copy = phaseCopy[phase];
  const mutatingNextTools = allowedNextTools.filter(
    (tool) =>
      tool !== "get_auralis_state" &&
      tool !== "get_session_evidence" &&
      tool !== "wait_for_session_change",
  );
  const recentEvents = session.events.slice(-5).toReversed();
  const acousticFocusActive =
    phase === "awaiting_baseline_listening" ||
    phase === "awaiting_comparison_listening";
  const volumeModalOpen = phase === "awaiting_volume_acknowledgement";

  useEffect(() => {
    if (phase !== "awaiting_volume_acknowledgement") {
      actionHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [phase]);

  const directGateControl = (() => {
    switch (humanGate?.kind) {
      case "confirm_consent":
        return (
          <button type="button" onClick={onConfirmConsent} disabled={controlsBusy}>
            I understand and consent
          </button>
        );
      default:
        return null;
    }
  })();

  return (
    <main className="agent-session-shell" data-agent-phase={phase}>
      <div className="agent-scene-backdrop" aria-hidden="true">
        <Image
          src={
            acousticFocusActive
              ? "/media/auralis-family-scene-agent-v1.webp"
              : "/media/auralis-family-scene.png"
          }
          fill
          sizes="100vw"
          className="agent-scene-backdrop-image"
          alt=""
          priority
        />
      </div>
      <div className="agent-scene-scrim" aria-hidden="true" />
      <div className="agent-reveal-wash" aria-hidden="true" />
      <header
        className="agent-session-header"
        inert={volumeModalOpen ? true : undefined}
        aria-hidden={volumeModalOpen ? true : undefined}
      >
        <div className="agent-session-brand">
          <Image
            src="/media/auralis-mark.png"
            width={48}
            height={48}
            sizes="48px"
            alt=""
            aria-hidden="true"
          />
          <span>Auralis</span>
        </div>
        <div className="agent-session-mode" aria-live="polite">
          <strong>Agent-guided session</strong>
          <span>WebMCP active · revision {revision}</span>
        </div>
        <button
          className="agent-stop-button"
          type="button"
          onClick={onStopImmediately}
          disabled={!stopAvailable}
        >
          Stop immediately
        </button>
      </header>

      <div className="agent-session-content">
        <ol
          className="agent-chapters"
          aria-label="Agent-guided session progress"
          inert={volumeModalOpen ? true : undefined}
          aria-hidden={volumeModalOpen ? true : undefined}
        >
          {chapters.map((chapter, index) => {
            const status =
              index < activeChapter
                ? "complete"
                : index === activeChapter
                  ? "current"
                  : "upcoming";
            return (
              <li
                key={chapter}
                data-status={status}
                aria-current={status === "current" ? "step" : undefined}
              >
                <span aria-hidden="true">
                  {status === "complete" ? "✓" : index + 1}
                </span>
                <strong>{chapter}</strong>
              </li>
            );
          })}
        </ol>

        {phase === "complete" ? null : (
          <section
            className="agent-next-action"
            aria-labelledby="agent-next-action-heading"
            aria-live="polite"
            aria-atomic="true"
            inert={volumeModalOpen ? true : undefined}
            aria-hidden={volumeModalOpen ? true : undefined}
          >
          <div>
            <p className="agent-kicker">{copy.eyebrow}</p>
            <h1
              id="agent-next-action-heading"
              ref={actionHeadingRef}
              tabIndex={-1}
            >
              {copy.heading}
            </h1>
            <p>{copy.detail}</p>
          </div>
          <div
            className="agent-control-channels"
            aria-label="Available control channels"
          >
            <span>Click</span>
            <span>Type to agent</span>
            <span>Voice to agent</span>
          </div>
          <dl
            className="agent-visible-state"
            aria-label="Current agent session state"
          >
            <div>
              <dt>Profile</dt>
              <dd>{stagedProfile?.displayName ?? "Not selected"}</dd>
            </div>
            <div>
              <dt>Session</dt>
              <dd>{session.completionState.replaceAll("_", " ")}</dd>
            </div>
            <div>
              <dt>Comparisons</dt>
              <dd>{session.comparisons.length} / 3</dd>
            </div>
            <div>
              <dt>Observations</dt>
              <dd>{session.observations.length}</dd>
            </div>
          </dl>
          {humanGate && humanGate.kind !== "acknowledge_comfortable_volume" ? (
            <div className="agent-human-gate" role="note">
              <div>
                <strong>Human authority required</strong>
                <p>{humanGate.instruction}</p>
              </div>
              {directGateControl}
            </div>
          ) : humanGate?.kind === "acknowledge_comfortable_volume" ||
            phase === "awaiting_scene_load" ||
            phase === "awaiting_profile_selection" ||
            phase === "ready_for_adaptation" ||
            acousticFocusActive ? null : mutatingNextTools.length > 0 ? (
            <div className="agent-staged-action" role="status">
              <strong>Available to the agent</strong>
              <span>
                {mutatingNextTools
                  .map((tool) => toolLabels[tool])
                  .join(" · ")}
              </span>
            </div>
          ) : (
            <div className="agent-staged-action" role="status">
              <strong>Waiting for your direction</strong>
              <span>
                Tell the agent what you noticed before it records the next
                step.
              </span>
            </div>
          )}
          </section>
        )}

        {current && phase !== "complete" ? (
          <div
            className="agent-scene-conditions"
            aria-label="Current listening conditions"
          >
              {current.kind === "adaptation" ? (
                <span data-condition="support">
                  {supportLabels[current.settings.supportMode]}
                </span>
              ) : null}
              <span data-condition="television">
                {televisionLabels[current.settings.televisionState]}
              </span>
              <span data-condition="speaker">
                {speakerLabels[current.settings.speakerPosition]}
              </span>
          </div>
        ) : null}

        <div className="agent-session-grid">
          <div className="agent-human-surface">
            {children ?? (
              <section
                className="agent-waiting-surface"
                aria-label="Agent guidance status"
              >
                <p className="agent-kicker">Page controls</p>
                <h2>Continue through the active control above</h2>
                <p>
                  Auralis exposes semantic options to the agent while all
                  protected human actions remain visible on this page.
                </p>
              </section>
            )}
          </div>
        </div>

        {phase === "complete" ? null : (
          <details
            className="agent-session-details"
            inert={volumeModalOpen ? true : undefined}
            aria-hidden={volumeModalOpen ? true : undefined}
          >
          <summary>
            <span>Session details</span>
            <small>State, conditions, and recent experiment history</small>
          </summary>
          <aside
            className="agent-state-panel"
            aria-labelledby="agent-state-heading"
          >
            <div className="agent-panel-heading">
              <p className="agent-kicker">Live semantic state</p>
              <h2 id="agent-state-heading">Current session</h2>
            </div>

            <dl className="agent-state-list">
              <div>
                <dt>Profile</dt>
                <dd>{stagedProfile?.displayName ?? "Not selected"}</dd>
              </div>
              <div>
                <dt>Session</dt>
                <dd>{session.completionState.replaceAll("_", " ")}</dd>
              </div>
              <div>
                <dt>Comparisons</dt>
                <dd>{session.comparisons.length} of 3 maximum</dd>
              </div>
              <div>
                <dt>Observations</dt>
                <dd>{session.observations.length} recorded</dd>
              </div>
            </dl>

            <div className="agent-condition-card">
              <h3>Current conditions</h3>
              {current ? (
                <ul>
                  <li>
                    {current.kind === "baseline"
                      ? "Synthetic profile only · no adaptation"
                      : supportLabels[current.settings.supportMode]}
                  </li>
                  <li>{televisionLabels[current.settings.televisionState]}</li>
                  <li>{speakerLabels[current.settings.speakerPosition]}</li>
                </ul>
              ) : (
                <p>The agent has not prepared a comparison yet.</p>
              )}
            </div>

            <div className="agent-condition-card agent-change-card">
              <h3>Changed this round</h3>
              <p>
                {current?.changedVariable
                  ? changeLabels[current.changedVariable]
                  : current
                    ? "Baseline · no adaptation yet"
                    : "No prepared comparison"}
              </p>
            </div>

            <details className="agent-history">
              <summary>Experiment history</summary>
              {recentEvents.length > 0 ? (
                <ol>
                  {recentEvents.map((event) => (
                    <li key={`${event.sequence}-${event.action}`}>
                      <span>{event.sequence}</span>
                      <div>
                        <strong>{eventLabels[event.action]}</strong>
                        <small>{event.actor} · revision {event.revision}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No session events yet.</p>
              )}
            </details>
          </aside>
          </details>
        )}

        <footer
          className="agent-session-footer"
          inert={volumeModalOpen ? true : undefined}
          aria-hidden={volumeModalOpen ? true : undefined}
        >
          <p>
            Synthetic and illustrative only · not a diagnosis, prediction, or
            treatment recommendation.
          </p>
          <button
            className="agent-reset-button"
            type="button"
            onClick={onResetSession}
            disabled={controlsBusy}
          >
            Reset and return to human landing
          </button>
        </footer>
      </div>
    </main>
  );
}
