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
  awaiting_profile_confirmation: 0,
  awaiting_scene_load: 0,
  awaiting_volume_acknowledgement: 0,
  ready_for_baseline: 1,
  awaiting_baseline_listening: 1,
  awaiting_baseline_observation: 1,
  ready_for_adaptation: 2,
  awaiting_comparison_listening: 2,
  awaiting_comparison_observation: 2,
  ready_for_summary: 3,
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
  awaiting_profile_confirmation: {
    eyebrow: "Human gate",
    heading: "Review the staged profile",
    detail:
      "The agent has proposed a synthetic profile. Confirm it here or ask the agent to stage a different one.",
  },
  awaiting_scene_load: {
    eyebrow: "Human gate",
    heading: "Load the family scene",
    detail:
      "The scene remains under your control. Loading it does not start playback.",
  },
  awaiting_volume_acknowledgement: {
    eyebrow: "Human gate",
    heading: "Set a comfortable volume",
    detail:
      "Confirm the physical listening level before any comparison can play.",
  },
  ready_for_baseline: {
    eyebrow: "Agent action",
    heading: "Prepare the first comparison",
    detail:
      "Tell the agent when you are ready. It can prepare the same-source A/B baseline, but it cannot press Play for you.",
  },
  awaiting_baseline_listening: {
    eyebrow: "Human gate",
    heading: "Listen to A, then B",
    detail:
      "Use the visible controls. The people, words, and timeline stay the same; only the listening perspective changes.",
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
    eyebrow: "Human gate",
    heading: "Listen to the changed result",
    detail:
      "Play B for the current conditions. A remains available if you want to compare the source again.",
  },
  awaiting_comparison_observation: {
    eyebrow: "Tell the agent",
    heading: "Did that change help?",
    detail:
      "Share what became clearer, stayed the same, or became harder. The agent records only what you report.",
  },
  ready_for_summary: {
    eyebrow: "Human gate",
    heading: "Review before finishing",
    detail:
      "The evidence is ready. Finish only when the summary matches the session you directed.",
  },
  complete: {
    eyebrow: "Session complete",
    heading: "The guided comparison is complete",
    detail:
      "The session evidence is minimized and browser-ephemeral. You can return to the human landing page at any time.",
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
  stage_demo_session: "Stage a synthetic profile",
  prepare_comparison: "Prepare the next comparison",
  record_user_observation: "Record your stated observation",
  get_session_evidence: "Read session evidence",
};

const eventLabels = {
  consent_confirmed: "Consent confirmed",
  session_staged: "Session staged",
  profile_confirmed: "Profile confirmed",
  scene_loaded: "Scene loaded",
  volume_acknowledged: "Low volume acknowledged",
  comparison_prepared: "Comparison prepared",
  playback_started: "Playback started",
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
  onConfirmProfile: () => void;
  onFinishSession: () => void;
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
  onConfirmProfile,
  onFinishSession,
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
    (tool) => tool !== "get_auralis_state" && tool !== "get_session_evidence",
  );
  const recentEvents = session.events.slice(-5).toReversed();

  useEffect(() => {
    actionHeadingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const directGateControl = (() => {
    switch (humanGate?.kind) {
      case "confirm_consent":
        return (
          <button type="button" onClick={onConfirmConsent} disabled={controlsBusy}>
            I understand and consent
          </button>
        );
      case "confirm_profile":
        return (
          <button type="button" onClick={onConfirmProfile} disabled={controlsBusy}>
            Confirm {stagedProfile?.displayName ?? "staged profile"}
          </button>
        );
      case "finish_session":
        return (
          <button type="button" onClick={onFinishSession} disabled={controlsBusy}>
            Finish this session
          </button>
        );
      default:
        return null;
    }
  })();

  return (
    <main className="agent-session-shell" data-agent-phase={phase}>
      <div className="agent-reveal-wash" aria-hidden="true" />
      <header className="agent-session-header">
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
        <ol className="agent-chapters" aria-label="Agent-guided session progress">
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

        <section
          className="agent-next-action"
          aria-labelledby="agent-next-action-heading"
          aria-live="polite"
          aria-atomic="true"
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
          {humanGate ? (
            <div className="agent-human-gate" role="note">
              <div>
                <strong>Human authority required</strong>
                <p>{humanGate.instruction}</p>
              </div>
              {directGateControl}
            </div>
          ) : mutatingNextTools.length > 0 ? (
            <div className="agent-staged-action" role="status">
              <strong>Available to the agent</strong>
              <span>
                {mutatingNextTools
                  .map((tool) => toolLabels[tool])
                  .join(" · ")}
              </span>
            </div>
          ) : phase === "complete" ? (
            <div className="agent-staged-action" role="status">
              <strong>No pending agent action</strong>
              <span>The person can reset the experience below.</span>
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

        <div className="agent-session-grid">
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
                <dd>{stagedProfile?.displayName ?? session.stagedProfileId}</dd>
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
                  <li>{supportLabels[current.settings.supportMode]}</li>
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

        <footer className="agent-session-footer">
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
