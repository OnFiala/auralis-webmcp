import { expect, test, type Page } from "@playwright/test";

type ToolResult = Readonly<{
  ok: boolean;
  phase: string;
  revision: number;
  replayed?: boolean;
  data?: Record<string, unknown> | null;
  error?: Readonly<{ code: string }> | null;
}>;

type RegisteredTool = Readonly<{
  execute(input: unknown): Promise<unknown>;
}>;

const STAGED_PROFILE = "high-frequency-hearing-loss";

async function installMockWebMcpHost(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools: Record<string, unknown> = {};
    Object.defineProperty(globalThis, "__auralisWebMcpTools", {
      configurable: true,
      value: tools,
    });
    Object.defineProperty(document, "modelContext", {
      configurable: true,
      value: {
        registerTool(tool: unknown) {
          const candidate = tool as { name?: unknown };
          if (typeof candidate.name === "string") {
            tools[candidate.name] = tool;
          }
        },
      },
    });
  });
}

async function openWithMockWebMcp(page: Page): Promise<void> {
  await installMockWebMcpHost(page);
  await page.goto("/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      Object.keys(
        (globalThis as typeof globalThis & {
          __auralisWebMcpTools?: Record<string, unknown>;
        }).__auralisWebMcpTools ?? {},
      ).length === 5,
  );
}

async function callTool(
  page: Page,
  name: string,
  input: unknown,
): Promise<ToolResult> {
  return page.evaluate(
    async ({ name: requestedName, input: requestedInput }) => {
      const host = globalThis as typeof globalThis & {
        __auralisWebMcpTools?: Record<string, RegisteredTool>;
      };
      const tool = host.__auralisWebMcpTools?.[requestedName];
      if (!tool) throw new Error(`Missing registered tool: ${requestedName}`);
      return tool.execute(requestedInput);
    },
    { name, input },
  ) as Promise<ToolResult>;
}

function stageInput(requestId: string, expectedRevision: number, profileId = STAGED_PROFILE) {
  return {
    requestId,
    expectedRevision,
    profileId,
    goal: "family-understanding",
  } as const;
}

async function expectHumanLanding(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Auralis", level: 1 }),
  ).toBeVisible();
  await expect(page.locator(".agent-session-shell")).toHaveCount(0);
}

async function trackModelCalls(
  page: Page,
): Promise<Readonly<{ count: () => number }>> {
  let modelCalls = 0;
  await page.route("**/api/model", async (route) => {
    modelCalls += 1;
    await route.abort();
  });
  return Object.freeze({ count: () => modelCalls });
}

test("human fallback remains human without a WebMCP host", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await page.goto("/", { waitUntil: "networkidle" });

  await expectHumanLanding(page);
  await expect(page.locator(".agent-ready-badge")).toBeVisible();
  await page.getByRole("button", { name: "Start the comparison" }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a listening profile", level: 2 }),
  ).toBeFocused();
  await expect(page.locator(".agent-session-shell")).toHaveCount(0);
  expect(modelCalls.count()).toBe(0);
});

test("registration and failed stage requests remain inert before the sole activation edge", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);

  await expectHumanLanding(page);
  const state = await callTool(page, "get_auralis_state", {});
  expect(state).toMatchObject({
    ok: true,
    phase: "awaiting_session_stage",
    revision: 0,
  });
  await expect(page.locator(".agent-session-shell")).toHaveCount(0);

  const malformed = await callTool(page, "stage_demo_session", {
    requestId: "verify-malformed-stage",
    expectedRevision: 0,
    profileId: "not-an-approved-profile",
    goal: "family-understanding",
  });
  expect(malformed).toMatchObject({
    ok: false,
    revision: 0,
    phase: "awaiting_session_stage",
    error: { code: "INVALID_INPUT" },
  });

  const stale = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-stale-stage", 1),
  );
  expect(stale).toMatchObject({
    ok: false,
    revision: 0,
    phase: "awaiting_session_stage",
    error: { code: "STALE_REVISION" },
  });
  await expectHumanLanding(page);
  expect(modelCalls.count()).toBe(0);
});

test("a staged WebMCP session preserves human gates and completes through browser tools plus visible human controls", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWithMockWebMcp(page);

  const staged = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-stage", 0),
  );
  expect(staged).toMatchObject({ ok: true, phase: "awaiting_consent", revision: 1 });

  const shell = page.locator(".agent-session-shell");
  await expect(shell).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirm the purpose first" })).toBeFocused();
  await expect(page.locator(".agent-next-action")).toHaveAttribute("aria-live", "polite");
  await expect(
    page.getByRole("list", { name: "Agent-guided session progress" }).getByRole("listitem").getByRole("strong"),
  ).toHaveText(["Setup", "Baseline", "Adaptation", "Summary"]);
  await expect(
    page.getByLabel("Available control channels"),
  ).toHaveText("ClickType to agentVoice to agent");
  await expect(page.getByRole("button", { name: "Stop immediately" })).toBeDisabled();
  await expect(shell).toHaveCSS("animation-name", "none");
  await expect(page.locator(".agent-reveal-wash")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".agent-waiting-surface")).toHaveCSS("animation-name", "none");

  const beforeConsent = await callTool(page, "prepare_comparison", {
    requestId: "verify-baseline-before-consent",
    expectedRevision: staged.revision,
    kind: "baseline",
  });
  expect(beforeConsent).toMatchObject({
    ok: false,
    phase: "awaiting_consent",
    error: { code: "INVALID_PHASE" },
  });

  await page.getByRole("button", { name: "I understand and consent" }).click();
  await expect(page.getByRole("heading", { name: "Review the staged profile" })).toBeFocused();
  await page
    .getByRole("button", { name: "Confirm High-frequency hearing loss" })
    .click();
  await expect(page.getByRole("heading", { name: "Load the family scene" })).toBeFocused();
  await page.getByRole("button", { name: "Load family scene" }).click();
  await expect(
    page.getByRole("heading", { name: "Set a comfortable volume" }),
  ).toBeFocused({ timeout: 60_000 });
  await page
    .getByRole("checkbox", { name: /I’m listening at a low volume/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Prepare the first comparison" }),
  ).toBeFocused();

  const ready = await callTool(page, "get_auralis_state", {});
  const baseline = await callTool(page, "prepare_comparison", {
    requestId: "verify-baseline",
    expectedRevision: ready.revision,
    kind: "baseline",
  });
  expect(baseline).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_listening",
    data: {
      comparison: {
        comparisonId: "comparison-1",
        kind: "baseline",
        settings: {
          supportMode: "none",
          televisionState: "tv-on",
          speakerPosition: "original-position",
        },
        requiredPlaybackModes: ["reference", "simulated"],
        heardPlaybackModes: [],
      },
    },
  });
  await expect(page.getByRole("heading", { name: "Listen to A, then B" })).toBeFocused();
  await expect(page.locator(".agent-human-surface > .experience-screen")).toHaveCSS(
    "animation-name",
    "none",
  );

  await expect(page.getByRole("radio", { name: "Bilateral support" })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Play B — .*illustrative result/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Stop immediately" })).toBeDisabled();

  const stickyGeometry = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".agent-session-header");
    const stopButton = document.querySelector<HTMLElement>(".agent-stop-button");
    if (!header || !stopButton) throw new Error("Missing sticky Agent Reveal controls.");
    window.scrollTo(0, 0);
    const headerTopBefore = header.getBoundingClientRect().top;
    const stopTopBefore = stopButton.getBoundingClientRect().top;
    window.scrollTo(0, document.body.scrollHeight);
    const headerTopAfter = header.getBoundingClientRect().top;
    const stopTopAfter = stopButton.getBoundingClientRect().top;
    return {
      headerPosition: getComputedStyle(header).position,
      headerTopBefore,
      headerTopAfter,
      scrollY: window.scrollY,
      stopTopBefore,
      stopTopAfter,
    };
  });
  expect(stickyGeometry.headerPosition).toBe("sticky");
  expect(stickyGeometry.scrollY).toBeGreaterThan(0);
  expect(Math.abs(stickyGeometry.headerTopAfter - stickyGeometry.headerTopBefore)).toBeLessThanOrEqual(1);
  expect(Math.abs(stickyGeometry.stopTopAfter - stickyGeometry.stopTopBefore)).toBeLessThanOrEqual(1);

  const playB = page.getByRole("button", {
    name: /Play B — .*illustrative result/,
  });
  await playB.scrollIntoViewIfNeeded();
  const stop = page.getByRole("button", { name: "Stop immediately" });
  await expect(stop).toBeInViewport();
  await playB.click();
  await expect(page.getByText(/^Playing B ·/)).toBeVisible({ timeout: 60_000 });
  await expect(stop).toBeEnabled();
  await expect(stop).toBeInViewport();
  await stop.click();
  await expect(stop).toBeDisabled();

  // Current V1 records a started-and-stopped mode in `heardPlaybackModes`.
  // The gate remains closed because the reference mode was not played. This
  // assertion keeps the known naming/duration release blocker visible rather
  // than misrepresenting the current runtime as meaningful listening proof.
  const afterImmediateStop = await callTool(page, "get_auralis_state", {});
  expect(afterImmediateStop).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_listening",
    data: {
      audio: { playbackStatus: "stopped" },
      currentComparison: { heardPlaybackModes: ["simulated"] },
    },
  });
  const prematureObservation = await callTool(page, "record_user_observation", {
    requestId: "verify-premature-observation",
    expectedRevision: afterImmediateStop.revision,
    comparisonId: "comparison-1",
    focusedSpeech: "partial",
    maskingSources: ["television"],
    relativeToPrevious: "not_compared",
    nextAction: "continue",
  });
  expect(prematureObservation).toMatchObject({
    ok: false,
    phase: "awaiting_baseline_listening",
    error: { code: "INVALID_PHASE" },
  });

  const playA = page.getByRole("button", { name: "Play A — Source reference" });
  await playA.scrollIntoViewIfNeeded();
  await playA.click();
  await expect(page.getByText(/^Playing A ·/)).toBeVisible({ timeout: 60_000 });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(page.getByRole("heading", { name: "What did you notice?" })).toBeFocused();

  const baselineReadyForObservation = await callTool(page, "get_auralis_state", {});
  expect(baselineReadyForObservation).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_observation",
    data: {
      currentComparison: { heardPlaybackModes: ["simulated", "reference"] },
    },
  });
  const baselineObservation = await callTool(page, "record_user_observation", {
    requestId: "verify-baseline-observation",
    expectedRevision: baselineReadyForObservation.revision,
    comparisonId: "comparison-1",
    focusedSpeech: "partial",
    maskingSources: ["television"],
    relativeToPrevious: "not_compared",
    nextAction: "continue",
  });
  expect(baselineObservation).toMatchObject({
    ok: true,
    phase: "ready_for_adaptation",
    data: {
      observation: { comparisonId: "comparison-1" },
      nextPhase: "ready_for_adaptation",
    },
  });
  await expect(page.getByRole("heading", { name: "Choose one useful change" })).toBeFocused();

  const adaptation = await callTool(page, "prepare_comparison", {
    requestId: "verify-support-adaptation",
    expectedRevision: baselineObservation.revision,
    kind: "adaptation",
    variable: "support_mode",
    value: "bilateral",
  });
  expect(adaptation).toMatchObject({
    ok: true,
    phase: "awaiting_comparison_listening",
    data: {
      comparison: {
        comparisonId: "comparison-2",
        previousComparisonId: "comparison-1",
        changedVariable: "support_mode",
        settings: {
          supportMode: "bilateral",
          televisionState: "tv-on",
          speakerPosition: "original-position",
        },
        requiredPlaybackModes: ["simulated"],
        heardPlaybackModes: [],
      },
    },
  });
  await expect(page.getByRole("heading", { name: "Listen to the changed result" })).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Agent-guided session progress" }).getByRole("listitem").nth(2),
  ).toHaveAttribute("aria-current", "step");

  const playAdaptation = page.getByRole("button", {
    name: "Play B — Bilateral support current illustrative result",
  });
  await playAdaptation.scrollIntoViewIfNeeded();
  await playAdaptation.click();
  await expect(page.getByText(/^Playing B · Bilateral support ·/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(page.getByRole("heading", { name: "Did that change help?" })).toBeFocused();

  const adaptationReadyForObservation = await callTool(page, "get_auralis_state", {});
  expect(adaptationReadyForObservation).toMatchObject({
    ok: true,
    phase: "awaiting_comparison_observation",
    data: {
      currentComparison: {
        comparisonId: "comparison-2",
        heardPlaybackModes: ["simulated"],
      },
    },
  });
  const adaptationObservation = await callTool(page, "record_user_observation", {
    requestId: "verify-adaptation-observation",
    expectedRevision: adaptationReadyForObservation.revision,
    comparisonId: "comparison-2",
    focusedSpeech: "clear",
    maskingSources: ["television"],
    relativeToPrevious: "better",
    nextAction: "summarize",
  });
  expect(adaptationObservation).toMatchObject({
    ok: true,
    phase: "ready_for_summary",
    humanGate: { kind: "finish_session" },
    data: {
      observation: { comparisonId: "comparison-2", nextAction: "summarize" },
      nextPhase: "ready_for_summary",
    },
  });
  await expect(page.getByRole("heading", { name: "Review before finishing" })).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Agent-guided session progress" }).getByRole("listitem").nth(3),
  ).toHaveAttribute("aria-current", "step");

  const evidenceBeforeFinish = await callTool(page, "get_session_evidence", {});
  expect(evidenceBeforeFinish).toMatchObject({
    ok: true,
    phase: "ready_for_summary",
    data: {
      evidence: {
        schemaVersion: "auralis-webmcp-evidence-v1",
        completionState: "ready_for_summary",
        summaryReady: true,
        comparisons: [
          { comparisonId: "comparison-1", observationId: "observation-1" },
          { comparisonId: "comparison-2", observationId: "observation-2" },
        ],
        observations: [
          { observationId: "observation-1", comparisonId: "comparison-1" },
          { observationId: "observation-2", comparisonId: "comparison-2" },
        ],
      },
    },
  });

  await page.getByRole("button", { name: "Finish this session" }).click();
  await expect(
    page.getByRole("heading", { name: "The guided comparison is complete" }),
  ).toBeFocused();
  const finalEvidence = await callTool(page, "get_session_evidence", {});
  expect(finalEvidence).toMatchObject({
    ok: true,
    phase: "complete",
    data: {
      evidence: {
        schemaVersion: "auralis-webmcp-evidence-v1",
        completionState: "complete",
        summaryReady: true,
        comparisons: [{ comparisonId: "comparison-1" }, { comparisonId: "comparison-2" }],
        observations: [{ observationId: "observation-1" }, { observationId: "observation-2" }],
      },
    },
  });
  expect(modelCalls.count()).toBe(0);
});

test("one pre-confirmation restage is permitted and a third stage remains blocked", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);

  const first = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-restage-first", 0),
  );
  expect(first).toMatchObject({ ok: true, revision: 1 });
  const replay = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-restage-first", 0),
  );
  expect(replay).toMatchObject({ ok: true, revision: 1, replayed: true });
  const reused = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-restage-first", 1, "flat-hearing-loss"),
  );
  expect(reused).toMatchObject({
    ok: false,
    revision: 1,
    error: { code: "REQUEST_ID_REUSE" },
  });
  const second = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-restage-second", 1, "flat-hearing-loss"),
  );
  expect(second).toMatchObject({ ok: true, revision: 2 });
  const state = await callTool(page, "get_auralis_state", {});
  expect(state).toMatchObject({
    data: { session: { stagedProfileId: "flat-hearing-loss", stageCount: 2 } },
  });
  const third = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-restage-third", 2, "asymmetric-hearing-loss"),
  );
  expect(third).toMatchObject({
    ok: false,
    revision: 2,
    error: { code: "INVALID_PHASE" },
  });
  expect(modelCalls.count()).toBe(0);
});

test("reset restores the landing and stale calls cannot resurrect the prior session", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);
  const staged = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-reset-stage", 0),
  );
  expect(staged).toMatchObject({ ok: true, revision: 1 });
  await page
    .getByRole("button", { name: "Reset and return to human landing" })
    .click();
  await expectHumanLanding(page);

  const afterReset = await callTool(page, "get_auralis_state", {});
  expect(afterReset).toMatchObject({
    ok: true,
    phase: "awaiting_session_stage",
    revision: 2,
    data: { session: { presentation: "human-landing", stageCount: 0 } },
  });
  const stale = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-reset-stale", 0),
  );
  expect(stale).toMatchObject({ ok: false, error: { code: "STALE_REVISION" } });
  await expectHumanLanding(page);
  expect(modelCalls.count()).toBe(0);
});

test("a progressed human journey blocks staging and keeps its human surface intact", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);
  await page.getByRole("button", { name: "Start the comparison" }).click();
  await page
    .getByRole("radio", { name: "High-frequency hearing loss" })
    .check();
  const progressed = await callTool(page, "get_auralis_state", {});

  const blocked = await callTool(
    page,
    "stage_demo_session",
    stageInput("verify-human-progress", progressed.revision),
  );
  expect(blocked).toMatchObject({
    ok: false,
    phase: "awaiting_session_stage",
    error: { code: "INVALID_PHASE" },
  });
  await expect(
    page.getByRole("heading", { name: "Choose a listening profile", level: 2 }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "High-frequency hearing loss" })).toBeChecked();
  await expect(page.locator(".agent-session-shell")).toHaveCount(0);
  expect(modelCalls.count()).toBe(0);
});
