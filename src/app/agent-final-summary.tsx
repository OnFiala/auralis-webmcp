"use client";

import Image from "next/image";
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

function comparisonChange(comparison: ComparisonProjection): string {
  if (comparison.kind === "baseline" || comparison.changedVariable === null) {
    return "Baseline A/B";
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

export function AgentFinalSummary({
  session,
}: Readonly<{ session: WebMcpSessionState }>) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const profile = AURALIS_PROFILE_PROJECTIONS.find(
    (candidate) => candidate.profileId === session.confirmedProfileId,
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
        <p className="agent-kicker">Session complete · your observations</p>
        <h1 id="agent-final-summary-heading" ref={headingRef} tabIndex={-1}>
          What you heard
        </h1>
        <p>
          Auralis records only the differences you described in this synthetic
          family-scene comparison.
        </p>
        <div className="agent-summary-context" aria-label="Session context">
          <span>{profile?.displayName ?? "Synthetic demo profile"}</span>
          <span>{session.comparisons.length} comparisons</span>
          <span>{session.observations.length} observations</span>
        </div>
      </header>

      <section
        className="agent-summary-section agent-summary-observation-section"
        aria-labelledby="noticed-heading"
      >
        <div className="agent-summary-section-heading">
          <p>What you told Auralis</p>
          <h2 id="noticed-heading">Your listening notes</h2>
        </div>
        <ol className="agent-summary-observations">
          {session.observations.map((observation, index) => {
            const comparison = session.comparisons.find(
              (candidate) =>
                candidate.comparisonId === observation.comparisonId,
            );
            return (
              <li key={observation.observationId}>
                <span>
                  {index + 1}. {comparison ? comparisonChange(comparison) : "Comparison"}
                </span>
                <p>{observationSummary(observation)}</p>
              </li>
            );
          })}
        </ol>
        <p className="agent-summary-observation-note">
          These notes restate the bounded choices recorded in this browser
          session. They are not an assessment of your hearing.
        </p>
      </section>

      <section
        className="agent-summary-section agent-summary-purpose"
        aria-labelledby="purpose-heading"
      >
        <div className="agent-summary-section-heading">
          <p>Why you compared A and B</p>
          <h2 id="purpose-heading">What the illustration was for</h2>
        </div>
        <div className="agent-summary-purpose-copy">
          <p>
            A was the validated source scene. B kept the same people, words, and
            timeline while applying a synthetic listening profile. The bounded
            changes showed how television, distance, speaker position, or
            illustrative support can alter what reaches a listener.
          </p>
          <p className="agent-summary-hard-limitation">
            {AURALIS_WEBMCP_LIMITATION}
          </p>
        </div>
      </section>

      <section
        className="agent-summary-section agent-summary-future"
        aria-labelledby="future-heading"
      >
        <div className="agent-summary-section-heading">
          <p>Clearly marked future functions</p>
          <h2 id="future-heading">Future Auralis directions</h2>
        </div>
        <div className="agent-summary-future-grid">
          <article className="agent-summary-hearing-tech-card">
            <div className="agent-summary-hearing-tech-copy">
              <p className="agent-summary-card-status">Future illustration</p>
              <h3>Hearing technology, explained visually</h3>
              <p>
                A future Auralis step may explain general hearing-technology
                concepts after an assessment. This static illustration is not
                based on your session and does not simulate a device, fitting,
                or expected benefit.
              </p>
            </div>
            <Image
              src="/media/auralis-hearing-aid-education-bte-v2.webp"
              alt="Side view of an ear wearing a behind-the-ear hearing aid with its body behind the ear and an earmould seated in the ear"
              width={1254}
              height={1254}
              sizes="(max-width: 700px) 38vw, 12rem"
            />
          </article>

          <article>
            <p className="agent-summary-card-status">General information</p>
            <h3>Understanding correction options</h3>
            <p>
              After a qualified assessment, a hearing professional may discuss
              communication strategies, assistive listening tools, or hearing
              technology. Auralis does not select a device or predict benefit.
            </p>
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
