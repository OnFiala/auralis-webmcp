"use client";

import { useEffect, useRef } from "react";

import {
  AURALIS_WEBMCP_LIMITATION,
  type ComparisonProjection,
  type ObservationProjection,
} from "../contracts/webmcp";
import type { WebMcpSessionState } from "../core/experience";
import { AURALIS_PROFILE_PROJECTIONS } from "../core/webmcp";

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
  "original-position": "Original speaker position",
  "closer-in-front": "Speaker closer and in front",
} as const;

const focusedSpeechLabels = {
  clear: "the focused voice was clear",
  partial: "only part of the focused voice came through",
  missed: "the focused voice was missed",
  unsure: "the focused voice was hard to judge",
} as const;

const maskingLabels = {
  television: "television",
  competing_speech: "competing speech",
  room_noise: "room noise",
  none: "no clear masking source",
  unsure: "an uncertain masking source",
} as const;

const relativeLabels = {
  better: "better than the previous comparison",
  same: "about the same as the previous comparison",
  worse: "worse than the previous comparison",
  unsure: "uncertain compared with the previous comparison",
  not_compared: "the baseline observation",
} as const;

const HEARING_CONVERSATION_GUIDE = `Auralis — conversation guide for a hearing appointment

This guide is general information. It is not a diagnosis, test result, prescription, or treatment recommendation.

Before an appointment, you may want to note:
- situations where listening feels difficult;
- whether the change was gradual, sudden, or fluctuating;
- whether one or both ears seem affected;
- any ear pain, discharge, ringing, dizziness, or recent noise exposure;
- medicines and relevant health history to discuss with a qualified professional.

Questions you can ask:
- What kind of hearing assessment is appropriate?
- What do the results mean in everyday listening situations?
- Which communication strategies or assistive options could be considered?
- What follow-up is recommended, and which warning signs need urgent care?

If hearing changes suddenly or worsens rapidly, seek urgent medical care rather than relying on this guide.
`;

function comparisonConditions(comparison: ComparisonProjection): string {
  return [
    supportLabels[comparison.settings.supportMode],
    televisionLabels[comparison.settings.televisionState],
    speakerLabels[comparison.settings.speakerPosition],
  ].join(" · ");
}

function comparisonChange(comparison: ComparisonProjection): string {
  if (comparison.kind === "baseline" || comparison.changedVariable === null) {
    return "Fixed baseline — no adaptation";
  }
  if (comparison.changedVariable === "support_mode") {
    return supportLabels[comparison.settings.supportMode];
  }
  if (comparison.changedVariable === "television_state") {
    return televisionLabels[comparison.settings.televisionState];
  }
  return speakerLabels[comparison.settings.speakerPosition];
}

function observationSummary(observation: ObservationProjection): string {
  const masking = observation.maskingSources
    .map((source) => maskingLabels[source])
    .join(", ");
  return `${focusedSpeechLabels[observation.focusedSpeech]}; ${masking}; ${relativeLabels[observation.relativeToPrevious]}.`;
}

function downloadConversationGuide(): void {
  const blob = new Blob([HEARING_CONVERSATION_GUIDE], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "auralis-hearing-conversation-guide.txt";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AgentFinalSummary({
  session,
}: Readonly<{ session: WebMcpSessionState }>) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const profile = AURALIS_PROFILE_PROJECTIONS.find(
    (candidate) => candidate.profileId === session.confirmedProfileId,
  );
  const current = session.comparisons.at(-1) ?? null;
  const adaptations = session.comparisons.filter(
    (comparison) => comparison.kind === "adaptation",
  );

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      className="agent-final-summary"
      data-testid="agent-final-summary"
      aria-labelledby="agent-final-summary-heading"
    >
      <header className="agent-final-summary-hero">
        <p className="agent-kicker">Session complete · deterministic summary</p>
        <h1
          id="agent-final-summary-heading"
          ref={headingRef}
          tabIndex={-1}
        >
          Your comparison summary
        </h1>
        <p>
          You compared one fixed family moment from two listening perspectives,
          tried bounded changes, and recorded only what you noticed.
        </p>
      </header>

      <section className="agent-summary-section" aria-labelledby="compared-heading">
        <div className="agent-summary-section-heading">
          <p>01</p>
          <h2 id="compared-heading">What you compared</h2>
        </div>
        <dl className="agent-summary-facts">
          <div>
            <dt>Demo profile</dt>
            <dd>{profile?.displayName ?? "Synthetic demo profile"}</dd>
          </div>
          <div>
            <dt>A · Source reference</dt>
            <dd>Validated family scene without the selected profile applied</dd>
          </div>
          <div>
            <dt>B · Illustrative result</dt>
            <dd>The same scene and timeline with the synthetic profile applied</dd>
          </div>
          <div>
            <dt>Final listening conditions</dt>
            <dd>{current ? comparisonConditions(current) : "Unavailable"}</dd>
          </div>
        </dl>
        {adaptations.length > 0 ? (
          <div className="agent-summary-changes">
            <h3>Changes tried in this session</h3>
            <ol>
              {adaptations.map((comparison) => (
                <li key={comparison.comparisonId}>
                  <span>{comparison.comparisonId.replace("comparison-", "")}</span>
                  <strong>{comparisonChange(comparison)}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      <section className="agent-summary-section" aria-labelledby="noticed-heading">
        <div className="agent-summary-section-heading">
          <p>02</p>
          <h2 id="noticed-heading">What you reported</h2>
        </div>
        <ol className="agent-summary-observations">
          {session.observations.map((observation, index) => (
            <li key={observation.observationId}>
              <span>Observation {index + 1}</span>
              <p>{observationSummary(observation)}</p>
            </li>
          ))}
        </ol>
        <p className="agent-summary-observation-note">
          These entries restate the bounded choices recorded in this browser
          session. Auralis does not infer a diagnosis from them.
        </p>
      </section>

      <section className="agent-summary-section" aria-labelledby="journey-heading">
        <div className="agent-summary-section-heading">
          <p>03</p>
          <h2 id="journey-heading">Your session path</h2>
        </div>
        <ol className="agent-summary-path">
          {session.comparisons.map((comparison, index) => (
            <li key={comparison.comparisonId}>
              <span>{index + 1}</span>
              <div>
                <strong>
                  {comparison.kind === "baseline"
                    ? "Baseline A/B comparison"
                    : comparisonChange(comparison)}
                </strong>
                <p>{comparisonConditions(comparison)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="agent-summary-section agent-summary-meaning"
        aria-labelledby="meaning-heading"
      >
        <div className="agent-summary-section-heading">
          <p>04</p>
          <h2 id="meaning-heading">What this can—and cannot—show</h2>
        </div>
        <div className="agent-summary-meaning-grid">
          <div>
            <h3>What it illustrates</h3>
            <p>
              Background sound, distance, speaker position, and listening
              support can change how easily a voice reaches a listener in the
              same moment.
            </p>
          </div>
          <div>
            <h3>What it cannot establish</h3>
            <p>
              This synthetic result is not a hearing test, diagnosis, hearing-aid
              fitting, prescription, or prediction of one person&apos;s perception
              or benefit.
            </p>
          </div>
        </div>
        <p className="agent-summary-hard-limitation">{AURALIS_WEBMCP_LIMITATION}</p>
      </section>

      <section
        className="agent-summary-section agent-summary-next-steps"
        aria-labelledby="next-steps-heading"
      >
        <div className="agent-summary-section-heading">
          <p>05</p>
          <h2 id="next-steps-heading">Next-step options</h2>
        </div>
        <div className="agent-summary-next-step-grid">
          <article>
            <p className="agent-summary-card-status">Available now</p>
            <h3>Arrange a hearing assessment</h3>
            <p>
              If listening difficulties affect daily life, a qualified hearing
              professional can assess hearing and explain appropriate options.
              These may include communication strategies, captioning, assistive
              devices, or hearing technology after assessment.
            </p>
            <p className="agent-summary-urgent-note">
              Seek urgent medical care for sudden hearing loss or hearing that
              worsens rapidly over days or weeks.
            </p>
          </article>

          <article>
            <p className="agent-summary-card-status">Private client download</p>
            <h3>Prepare for a conversation</h3>
            <p>
              Download a general appointment guide. It is generated in this
              browser, contains no session data, and sends nothing to Auralis or
              another service.
            </p>
            <button type="button" onClick={downloadConversationGuide}>
              Download conversation guide
            </button>
          </article>

          <article className="agent-summary-disabled-card">
            <p className="agent-summary-card-status">Not active yet</p>
            <h3>Find an audiologist near you</h3>
            <p id="audiologist-placeholder-note">
              This demo is not connected to location services, search, booking,
              or an external provider directory.
            </p>
            <button
              type="button"
              disabled
              aria-describedby="audiologist-placeholder-note"
            >
              Find an audiologist near you
            </button>
          </article>
        </div>
      </section>
    </section>
  );
}
