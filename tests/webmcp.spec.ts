import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

type ToolResult = Readonly<{
  ok: boolean;
  phase: string;
  revision: number;
  allowedNextTools?: readonly string[];
  replayed?: boolean;
  data?: Record<string, unknown> | null;
  error?: Readonly<{ code: string }> | null;
}>;

type RegisteredTool = Readonly<{
  execute(input: unknown): Promise<unknown>;
}>;

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
      ).length === 6,
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

function startInput(requestId: string, expectedRevision: number) {
  return {
    requestId,
    expectedRevision,
    action: "start",
    goal: "family-understanding",
  } as const;
}

function selectProfileInput(
  requestId: string,
  expectedRevision: number,
  profileId:
    | "high-frequency-hearing-loss"
    | "flat-hearing-loss"
    | "asymmetric-hearing-loss",
) {
  return {
    requestId,
    expectedRevision,
    action: "select-profile",
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

async function expectPrimaryAgentContentCentered(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  if (!viewport || viewport.width < 1024) return;

  const geometry = await page.evaluate(() => {
    const copy = document.querySelector<HTMLElement>(
      ".agent-next-action > div:first-child",
    );
    const lowerSurface = document.querySelector<HTMLElement>(
      ".agent-session-grid",
    );
    const heading = document.querySelector<HTMLElement>(
      "#agent-next-action-heading",
    );
    if (!copy || !lowerSurface || !heading) {
      throw new Error("Missing shared Agent Reveal alignment surfaces.");
    }
    const center = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return rect.left + rect.width / 2;
    };
    return {
      copyCenter: center(copy),
      lowerSurfaceCenter: center(lowerSurface),
      headingTextAlign: getComputedStyle(heading).textAlign,
    };
  });

  expect(
    Math.abs(geometry.copyCenter - geometry.lowerSurfaceCenter),
  ).toBeLessThanOrEqual(1);
  expect(geometry.headingTextAlign).toBe("center");
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
    allowedNextTools: expect.arrayContaining(["stage_demo_session"]),
    data: {
      capabilities: {
        agenticActivationTool: "stage_demo_session",
        stageDemoSessionAction: "start",
        preferredAgentControl: "webmcp-first",
        computerUseFallback: "human-gate-or-no-matching-tool",
        predefinedProfileSetVersion: "auralis-synthetic-presets-v2",
      },
    },
  });
  await expect(page.locator(".agent-session-shell")).toHaveCount(0);

  const malformed = await callTool(page, "stage_demo_session", {
    requestId: "verify-malformed-stage",
    expectedRevision: 0,
    action: "select-profile",
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
    startInput("verify-stale-stage", 1),
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
  test.setTimeout(120_000);
  const modelCalls = await trackModelCalls(page);
  const designQaCapture = process.env.AURALIS_DESIGN_QA_CAPTURE;
  const mobileDesignQaCapture = designQaCapture === "mobile";
  await page.setViewportSize(
    mobileDesignQaCapture
      ? { width: 390, height: 844 }
      : designQaCapture === "1"
      ? { width: 1328, height: 969 }
      : { width: 1280, height: 720 },
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWithMockWebMcp(page);

  const staged = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-stage", 0),
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
  await expect(page.getByRole("heading", { name: "Choose a demo audiogram" })).toBeFocused();
  await expect(page.locator(".agent-profile-card")).toHaveCount(3);
  await expect(page.getByTestId("agent-profile-audiogram")).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Use / })).toHaveCount(3);
  await expectPrimaryAgentContentCentered(page);
  await expect(page.getByRole("button", { name: /Load family scene/i })).toHaveCount(0);
  await expect(
    page.locator(
      '[data-profile-id="high-frequency-hearing-loss"] .audiogram-chart desc',
    ),
  ).toContainText("8000 Hz: 80 dB HL");
  await expect(
    page.locator('[data-profile-id="flat-hearing-loss"] .audiogram-chart desc'),
  ).toContainText("250 Hz: 55 dB HL");
  await expect(
    page.locator(
      '[data-profile-id="asymmetric-hearing-loss"] .audiogram-chart desc',
    ),
  ).toContainText("4000 Hz: 75 dB HL");
  if (designQaCapture) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: mobileDesignQaCapture
        ? "artifacts/design-qa/screen3-mobile-audiograms-v2.png"
        : "artifacts/design-qa/screen3-audiograms-v2.png",
      fullPage: true,
    });
  }

  const profileState = await callTool(page, "get_auralis_state", {});
  expect(profileState).toMatchObject({
    ok: true,
    phase: "awaiting_profile_selection",
    revision: 2,
    allowedNextTools: expect.arrayContaining(["stage_demo_session"]),
    data: {
      capabilities: {
        agenticActivationTool: null,
        stageDemoSessionAction: "select-profile",
        preferredAgentControl: "webmcp-first",
        computerUseFallback: "human-gate-or-no-matching-tool",
        predefinedProfileSetVersion: "auralis-synthetic-presets-v2",
      },
      session: { stagedProfileId: null, confirmedProfileId: null },
      availableProfiles: expect.arrayContaining([
        expect.objectContaining({
          profileId: "high-frequency-hearing-loss",
          predefinedProfileSetVersion: "auralis-synthetic-presets-v2",
        }),
        expect.objectContaining({
          profileId: "flat-hearing-loss",
          predefinedProfileSetVersion: "auralis-synthetic-presets-v2",
        }),
        expect.objectContaining({
          profileId: "asymmetric-hearing-loss",
          predefinedProfileSetVersion: "auralis-synthetic-presets-v2",
        }),
      ]),
    },
  });
  const selectedProfile = await callTool(
    page,
    "stage_demo_session",
    selectProfileInput(
      "verify-select-profile",
      profileState.revision,
      "high-frequency-hearing-loss",
    ),
  );
  expect(selectedProfile).toMatchObject({
    ok: true,
    data: { operation: "profile-selected" },
  });
  await expect(
    page.locator("#agent-next-action-heading"),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toContainText(
    "Set a comfortable listening level",
  );
  await expect(page.getByRole("button", { name: /Load family scene/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "My listening level is comfortable" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Reset session" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("checkbox", {
      name: /Allow agent-started playback for this session/,
    }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Reset session" })).toBeFocused();
  const backgroundStop = page.locator(".agent-stop-button");
  await backgroundStop.evaluate((element: HTMLButtonElement) => element.focus());
  await expect(backgroundStop).not.toBeFocused();
  await page
    .getByRole("button", { name: "My listening level is comfortable" })
    .focus();
  await page.getByRole("checkbox", {
    name: /Allow agent-started playback for this session/,
  }).check();
  await page
    .getByRole("button", { name: "My listening level is comfortable" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Listen to A, then B" }),
  ).toBeFocused();

  const ready = await callTool(page, "get_auralis_state", {});
  expect(ready).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_listening",
    data: {
      audio: { agentPlaybackGranted: true },
      currentComparison: {
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
  await expect(page.locator(".agent-human-surface > .experience-screen")).toHaveCSS(
    "animation-name",
    "none",
  );

  await expect(page.getByRole("radio", { name: "Bilateral support" })).toHaveCount(0);
  await expect(page.locator(".agent-staged-action")).toHaveCount(0);
  await expect(page.getByText("Scene transcript", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Comfortable listening level acknowledged", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".agent-scene-backdrop-image")).toHaveAttribute(
    "src",
    /auralis-family-scene-agent-v1/,
  );
  await expect(page.locator(".listening-transport-status")).toContainText(
    "A and B controls are ready",
  );
  await expectPrimaryAgentContentCentered(page);
  const compactPlaybackGeometry = await page.locator(".ab-playback-grid").evaluate((grid) => {
    const cards = [...grid.querySelectorAll<HTMLElement>(".ab-playback-card")];
    return {
      gridHeight: grid.getBoundingClientRect().height,
      cardHeights: cards.map((card) => card.getBoundingClientRect().height),
    };
  });
  if (designQaCapture) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: mobileDesignQaCapture
        ? "artifacts/design-qa/screen4-mobile-compact.png"
        : "artifacts/design-qa/screen4-compact.png",
      fullPage: true,
    });
  }
  expect(compactPlaybackGeometry.gridHeight).toBeLessThanOrEqual(
    mobileDesignQaCapture ? 380 : 240,
  );
  expect(compactPlaybackGeometry.cardHeights).toHaveLength(2);
  expect(Math.max(...compactPlaybackGeometry.cardHeights)).toBeLessThanOrEqual(130);
  if (!mobileDesignQaCapture) {
    const listeningDockMargin = await page
      .locator(".agent-session-grid")
      .evaluate((grid) => Number.parseFloat(getComputedStyle(grid).marginTop));
    expect(listeningDockMargin).toBeGreaterThanOrEqual(30);
  }
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
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
  await expect(page.locator(".ab-playback-card-b")).toHaveAttribute(
    "data-playback-state",
    /preparing|playing/,
    { timeout: 1_000 },
  );
  await expect(page.locator(".ab-playback-grid")).toHaveAttribute(
    "data-transport-state",
    /preparing|playing/,
    { timeout: 1_000 },
  );
  await expect(page.getByText(/^Playing B ·/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".ab-playback-card-b")).toHaveAttribute(
    "aria-current",
    "true",
  );
  if (designQaCapture) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: mobileDesignQaCapture
        ? "artifacts/design-qa/screen4-mobile-playing-b.png"
        : "artifacts/design-qa/screen4-playing-b.png",
      fullPage: true,
    });
  }
  await expect(stop).toBeEnabled();
  await expect(stop).toBeInViewport();
  await stop.click();
  await expect(stop).toBeDisabled();

  // Stop is cancellation, never listening evidence.
  const afterImmediateStop = await callTool(page, "get_auralis_state", {});
  expect(afterImmediateStop).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_listening",
    data: {
      audio: { playbackStatus: "stopped" },
      currentComparison: { heardPlaybackModes: [] },
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

  const transitionRun = await callTool(page, "play_listening_comparison", {
    requestId: "verify-transition-stop",
    expectedRevision: afterImmediateStop.revision,
    comparisonId: "comparison-1",
    playback: "reference-then-simulated",
    focus: "important-speaker",
  });
  expect(transitionRun).toMatchObject({
    ok: true,
    replayed: false,
    phase: "awaiting_baseline_listening",
    data: { status: "started", sequence: ["reference", "simulated"] },
  });
  await expect
    .poll(
      () => page.locator(".ab-playback-grid").getAttribute("data-transport-state"),
      { timeout: 20_000, intervals: [20] },
    )
    .toBe("transition");
  await expect(page.locator(".listening-transport-status")).toContainText(
    "Transition A → B",
  );
  await expect(stop).toBeEnabled();
  await stop.click();
  await expect(page.locator(".ab-playback-grid")).not.toHaveAttribute(
    "data-transport-state",
    "transition",
  );
  const afterTransitionStop = await callTool(page, "get_auralis_state", {});
  expect(afterTransitionStop).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_listening",
    data: {
      audio: { playbackStatus: "stopped" },
      currentComparison: { heardPlaybackModes: ["reference"] },
    },
  });
  const transitionEvidence = await callTool(page, "get_session_evidence", {});
  expect(transitionEvidence).toMatchObject({
    data: {
      evidence: {
        playbackRuns: expect.arrayContaining([
          expect.objectContaining({
            requestId: "verify-transition-stop",
            status: "cancelled",
          }),
        ]),
      },
    },
  });

  const guidedBaseline = await callTool(page, "play_listening_comparison", {
    requestId: "verify-guided-baseline",
    expectedRevision: afterTransitionStop.revision,
    comparisonId: "comparison-1",
    playback: "reference-then-simulated",
    focus: "important-speaker",
  });
  expect(guidedBaseline).toMatchObject({
    ok: true,
    replayed: false,
    phase: "awaiting_baseline_listening",
    data: {
      status: "started",
      sequence: ["reference", "simulated"],
      clipWindow: { startSeconds: 32.3, durationSeconds: 8 },
    },
  });
  await expect(page.getByRole("heading", { name: "What did you notice?" })).toBeFocused({
    timeout: 60_000,
  });

  const baselineReadyForObservation = await callTool(page, "get_auralis_state", {});
  expect(baselineReadyForObservation).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_observation",
    data: {
      currentComparison: { heardPlaybackModes: ["reference", "simulated"] },
    },
  });
  await page
    .getByRole("button", { name: "I do not hear a clear difference" })
    .click();
  await expect(stop).toBeEnabled({ timeout: 60_000 });
  await expect(stop).toBeDisabled({ timeout: 60_000 });
  await expect(
    page.getByRole("button", {
      name: "Continue and record that I am unsure",
    }),
  ).toBeVisible();
  const afterNoDifferenceReplay = await callTool(page, "get_auralis_state", {});
  expect(afterNoDifferenceReplay).toMatchObject({
    ok: true,
    phase: "awaiting_baseline_observation",
  });
  const baselineObservation = await callTool(page, "record_user_observation", {
    requestId: "verify-baseline-observation",
    expectedRevision: afterNoDifferenceReplay.revision,
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
  await expect(page.locator(".agent-staged-action")).toHaveCount(0);
  const adaptationOptions = page
    .getByLabel("Available adaptation options")
    .locator("article");
  await expect(adaptationOptions).toHaveCount(4);
  await expect(adaptationOptions.locator("h3")).toHaveText([
    "Turn the television off",
    "Move the speaker closer",
    "Add left-ear illustrative support",
    "Add bilateral illustrative support",
  ]);
  await expect(page.locator(".agent-session-details")).toBeHidden();
  await expectPrimaryAgentContentCentered(page);
  const adaptationOptionGeometry = await adaptationOptions.evaluateAll(
    (cards) =>
      cards.map((card) => card.getBoundingClientRect().height),
  );
  expect(Math.max(...adaptationOptionGeometry)).toBeLessThanOrEqual(
    mobileDesignQaCapture ? 180 : 150,
  );
  if (designQaCapture) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: mobileDesignQaCapture
        ? "artifacts/design-qa/screen5-mobile-adaptation-choice.png"
        : "artifacts/design-qa/screen5-adaptation-choice.png",
      fullPage: true,
    });
  }

  const adaptation = await callTool(page, "prepare_comparison", {
    requestId: "verify-support-adaptation",
    expectedRevision: baselineObservation.revision,
    kind: "adaptation",
    variable: "speaker_position",
    value: "closer-in-front",
  });
  expect(adaptation).toMatchObject({
    ok: true,
    phase: "awaiting_comparison_listening",
    data: {
      comparison: {
        comparisonId: "comparison-2",
        previousComparisonId: "comparison-1",
        changedVariable: "speaker_position",
        settings: {
          supportMode: "none",
          televisionState: "tv-on",
          speakerPosition: "closer-in-front",
        },
        requiredPlaybackModes: ["simulated"],
        heardPlaybackModes: [],
      },
    },
  });
  await expect(page.getByRole("heading", { name: "Now listen to B" })).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Agent-guided session progress" }).getByRole("listitem").nth(2),
  ).toHaveAttribute("aria-current", "step");
  await expect(page.locator(".agent-session-details")).toBeHidden();
  await expect(page.locator(".intervention-transport-status")).toHaveCSS(
    "position",
    "absolute",
  );
  await expect(page.locator(".intervention-transport-status")).toHaveCSS(
    "overflow",
    "hidden",
  );
  await expectPrimaryAgentContentCentered(page);
  if (designQaCapture) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: mobileDesignQaCapture
        ? "artifacts/design-qa/screen5-mobile-adaptation-listening.png"
        : "artifacts/design-qa/screen5-adaptation-listening.png",
      fullPage: true,
    });
  }

  const adaptationListening = await callTool(page, "play_listening_comparison", {
    requestId: "verify-guided-adaptation",
    expectedRevision: adaptation.revision,
    comparisonId: "comparison-2",
    playback: "simulated",
    focus: "important-speaker",
  });
  expect(adaptationListening).toMatchObject({
    ok: true,
    replayed: false,
    phase: "awaiting_comparison_listening",
    data: { status: "started", sequence: ["simulated"] },
  });
  await expect(page.getByRole("heading", { name: "Did that change help?" })).toBeFocused({
    timeout: 60_000,
  });

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
    phase: "complete",
    humanGate: null,
    allowedNextTools: ["get_auralis_state", "get_session_evidence"],
    data: {
      observation: { comparisonId: "comparison-2", nextAction: "summarize" },
      nextPhase: "complete",
    },
  });
  await expect(page.getByRole("heading", { name: "Your comparison summary" })).toBeFocused();
  await expect(
    page.getByRole("list", { name: "Agent-guided session progress" }).getByRole("listitem").nth(3),
  ).toHaveAttribute("aria-current", "step");
  const finalSummary = page.getByTestId("agent-final-summary");
  await expect(finalSummary).toHaveCount(1);
  await expect(page.locator(".agent-human-gate")).toHaveCount(0);
  await expect(page.locator(".agent-staged-action")).toHaveCount(0);
  await expect(page.locator(".agent-session-details")).toHaveCount(0);
  await expect(page.locator(".agent-visible-state")).toHaveCount(0);
  await expect(page.locator(".agent-scene-conditions")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Finish this session/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Generate explanation|Retry explanation/i }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Optional GPT explanation", { exact: true }),
  ).toHaveCount(0);
  if (process.env.AURALIS_SUMMARY_QA_CAPTURE) {
    await page.screenshot({
      path: process.env.AURALIS_SUMMARY_QA_CAPTURE,
      fullPage: true,
    });
  }

  const finalEvidence = await callTool(page, "get_session_evidence", {});
  expect(finalEvidence).toMatchObject({
    ok: true,
    phase: "complete",
    data: {
      evidence: {
        schemaVersion: "auralis-webmcp-evidence-v4",
        completionState: "complete",
        summaryReady: true,
        comparisons: [
          { comparisonId: "comparison-1", observationId: "observation-1" },
          { comparisonId: "comparison-2", observationId: "observation-2" },
        ],
        observations: [
          { observationId: "observation-1", comparisonId: "comparison-1" },
          { observationId: "observation-2", comparisonId: "comparison-2" },
        ],
        playbackRuns: expect.arrayContaining([
          expect.objectContaining({
            comparisonId: "comparison-1",
            playback: "reference-then-simulated",
            focus: "important-speaker",
            purpose: "initial-listening",
            status: "completed",
          }),
          expect.objectContaining({
            comparisonId: "comparison-2",
            playback: "simulated",
            focus: "important-speaker",
            purpose: "initial-listening",
            status: "completed",
          }),
        ]),
        noDifferenceRecoveries: [
          {
            comparisonId: "comparison-1",
            completedCount: 1,
            playback: "reference-then-simulated",
            focus: "important-speaker",
          },
        ],
      },
    },
  });
  const playbackEvents = (
    finalEvidence.data?.evidence as {
      events: Array<{
        action: string;
        actor: string;
        requestId: string | null;
        comparisonId: string | null;
        runId: string | null;
        revision: number;
      }>;
    }
  ).events.filter(
    (event) =>
      event.requestId !== null &&
      [
        "playback_requested",
        "playback_started",
        "playback_completed",
        "playback_cancelled",
        "playback_failed",
      ].includes(event.action),
  );
  for (const requestId of [
    "verify-guided-baseline",
    "verify-guided-adaptation",
  ]) {
    const runEvents = playbackEvents.filter(
      (event) => event.requestId === requestId,
    );
    expect(runEvents.map((event) => event.action)).toContain(
      "playback_requested",
    );
    expect(runEvents.map((event) => event.action)).toContain(
      "playback_started",
    );
    expect(runEvents.map((event) => event.action)).toContain(
      "playback_completed",
    );
    expect(new Set(runEvents.map((event) => event.runId)).size).toBe(1);
    expect(runEvents[0]?.runId).toMatch(/^playback-[0-9a-f-]{36}$/);
  }

  const terminalEvents = (
    finalEvidence.data?.evidence as {
      events: Array<{
        action: string;
        actor: string;
        requestId: string | null;
        comparisonId: string | null;
        revision: number;
      }>;
    }
  ).events.slice(-2);
  expect(terminalEvents).toMatchObject([
    {
      action: "observation_recorded",
      actor: "agent",
      requestId: "verify-adaptation-observation",
      comparisonId: "comparison-2",
    },
    {
      action: "session_finished",
      actor: "system",
      requestId: "verify-adaptation-observation",
      comparisonId: "comparison-2",
    },
  ]);
  expect(terminalEvents[0]?.revision).toBe(terminalEvents[1]?.revision);

  const geometry = await finalSummary.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hero = node.querySelector<HTMLElement>(".agent-final-summary-hero");
    const heading = node.querySelector<HTMLElement>("#agent-final-summary-heading");
    const parseRgb = (value: string) =>
      value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [];
    const luminance = (value: string) => {
      const channels = parseRgb(value).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels.length === 3
        ? 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
        : 0;
    };
    const foreground = heading
      ? getComputedStyle(heading).color
      : "rgb(0, 0, 0)";
    const background = hero
      ? getComputedStyle(hero).backgroundColor
      : "rgba(0, 0, 0, 0)";
    const lighter = Math.max(luminance(foreground), luminance(background));
    const darker = Math.min(luminance(foreground), luminance(background));
    return {
      center: rect.left + rect.width / 2,
      width: rect.width,
      viewportCenter: document.documentElement.clientWidth / 2,
      scrollOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      background,
      contrast: (lighter + 0.05) / (darker + 0.05),
    };
  });
  expect(Math.abs(geometry.center - geometry.viewportCenter)).toBeLessThanOrEqual(2);
  expect(geometry.width).toBeLessThanOrEqual(1120);
  expect(geometry.scrollOverflow).toBe(0);
  expect(geometry.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(geometry.contrast).toBeGreaterThanOrEqual(4.5);

  const downloadRequests: string[] = [];
  page.on("request", (request) => downloadRequests.push(request.url()));
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download conversation guide" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "auralis-hearing-conversation-guide.txt",
  );
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const downloadText = await readFile(downloadPath!, "utf8");
  expect(downloadText).toContain(
    "This guide is general information. It is not a diagnosis",
  );
  expect(downloadText).not.toContain("High-frequency hearing loss");
  expect(downloadText).not.toContain("comparison-2");
  expect(downloadText).not.toContain("observation-2");
  expect(downloadText).not.toContain("dB HL");
  expect(downloadRequests).toHaveLength(0);

  const audiologistPlaceholder = page.getByRole("button", {
    name: "Find an audiologist near you",
  });
  await expect(audiologistPlaceholder).toBeDisabled();
  await expect(audiologistPlaceholder).toHaveAttribute(
    "aria-describedby",
    "audiologist-placeholder-note",
  );
  await expect(page.locator("#audiologist-placeholder-note")).toContainText(
    "not connected to location services",
  );
  await expect(
    page.getByRole("link", { name: /audiologist/i }),
  ).toHaveCount(0);
  expect(modelCalls.count()).toBe(0);
});

test("one post-consent agent profile selection is permitted and a second selection remains blocked", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);

  const first = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-restage-first", 0),
  );
  expect(first).toMatchObject({ ok: true, revision: 1 });
  const replay = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-restage-first", 0),
  );
  expect(replay).toMatchObject({ ok: true, revision: 1, replayed: true });
  await page.getByRole("button", { name: "I understand and consent" }).click();
  const afterConsent = await callTool(page, "get_auralis_state", {});
  const reused = await callTool(
    page,
    "stage_demo_session",
    selectProfileInput(
      "verify-restage-first",
      afterConsent.revision,
      "flat-hearing-loss",
    ),
  );
  expect(reused).toMatchObject({
    ok: false,
    revision: afterConsent.revision,
    error: { code: "REQUEST_ID_REUSE" },
  });
  const second = await callTool(
    page,
    "stage_demo_session",
    selectProfileInput(
      "verify-restage-second",
      afterConsent.revision,
      "flat-hearing-loss",
    ),
  );
  expect(second).toMatchObject({ ok: true, revision: afterConsent.revision + 1 });
  const state = await callTool(page, "get_auralis_state", {});
  expect(state).toMatchObject({
    data: { session: { stagedProfileId: "flat-hearing-loss", stageCount: 2 } },
  });
  const third = await callTool(
    page,
    "stage_demo_session",
    selectProfileInput(
      "verify-restage-third",
      state.revision,
      "asymmetric-hearing-loss",
    ),
  );
  expect(third).toMatchObject({
    ok: false,
    revision: state.revision,
    error: { code: "INVALID_PHASE" },
  });
  expect(modelCalls.count()).toBe(0);
});

test("a direct profile click updates the same agent session and starts scene preparation", async ({ page }) => {
  await openWithMockWebMcp(page);
  const started = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-click-stage", 0),
  );
  expect(started.ok).toBe(true);
  await page.getByRole("button", { name: "I understand and consent" }).click();
  await expect(page.locator(".agent-profile-card")).toHaveCount(3);
  const beforeClick = await callTool(page, "get_auralis_state", {});

  await page
    .getByRole("button", { name: "Use Flat hearing loss" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60_000 });

  const state = await callTool(page, "get_auralis_state", {});
  expect(state).toMatchObject({
    ok: true,
    phase: "awaiting_volume_acknowledgement",
    data: {
      session: {
        stagedProfileId: "flat-hearing-loss",
        confirmedProfileId: "flat-hearing-loss",
        lastEvent: { actor: "system", action: "scene_loaded" },
      },
      audio: { sourceStatus: "ready" },
    },
  });
  const evidence = await callTool(page, "get_session_evidence", {});
  expect(evidence).toMatchObject({
    data: {
      evidence: {
        events: expect.arrayContaining([
          expect.objectContaining({ actor: "human", action: "profile_confirmed" }),
        ]),
      },
    },
  });
  const staleAgentSelection = await callTool(
    page,
    "stage_demo_session",
    selectProfileInput(
      "verify-stale-after-click",
      beforeClick.revision,
      "asymmetric-hearing-loss",
    ),
  );
  expect(staleAgentSelection).toMatchObject({
    ok: false,
    error: { code: "STALE_REVISION" },
  });
});

test("automatic scene preparation fails closed and exposes only a bounded retry", async ({ page }) => {
  await page.route("**/media/family-dinner/manifest.json", async (route) => {
    await route.abort();
  });
  await openWithMockWebMcp(page);
  const started = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-load-failure-stage", 0),
  );
  expect(started.ok).toBe(true);
  await page.getByRole("button", { name: "I understand and consent" }).click();
  await page
    .getByRole("button", { name: "Use Asymmetric hearing loss" })
    .click();

  await expect(
    page.getByRole("heading", {
      name: "The family scene could not be prepared",
    }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: /Load family scene/i })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry scene preparation" }),
  ).toBeVisible();

  await page.unroute("**/media/family-dinner/manifest.json");
  await page.getByRole("button", { name: "Retry scene preparation" }).click();
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Reset session" }).click();
  await expect(
    page.getByRole("heading", { name: "Auralis", level: 1 }),
  ).toBeFocused();
});

test("reset restores the landing and stale calls cannot resurrect the prior session", async ({ page }) => {
  const modelCalls = await trackModelCalls(page);
  await openWithMockWebMcp(page);
  const staged = await callTool(
    page,
    "stage_demo_session",
    startInput("verify-reset-stage", 0),
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
    startInput("verify-reset-stale", 0),
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
    startInput("verify-human-progress", progressed.revision),
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
