import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { z, type ZodType } from "zod";

import {
  AURALIS_TOOL_NAMES,
  auralisToolResultSchema,
  emptyToolInputSchema,
  getAuralisStateDataSchema,
  getSessionEvidenceDataSchema,
  prepareComparisonDataSchema,
  prepareComparisonInputSchema,
  recordUserObservationDataSchema,
  recordUserObservationInputSchema,
  stageDemoSessionDataSchema,
  stageDemoSessionInputSchema,
  type AuralisToolName,
  type AuralisToolResult,
  type GetAuralisStateData,
} from "../contracts/webmcp";
import { createExperienceController } from "../core/experience";
import {
  createAuralisWebMcpTools,
  registerAuralisWebMcpTools,
  type AuralisWebMcpHostDocument,
  type AuralisWebMcpTool,
} from "./webmcp";

const source = readFileSync(new URL("./webmcp.ts", import.meta.url), "utf8");

function topLevelView() {
  const view: { top: unknown; self: unknown } = { top: null, self: null };
  view.top = view;
  view.self = view;
  return view;
}

function hostHarness(options: { reject?: boolean } = {}) {
  const tools: AuralisWebMcpTool[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const registerTool = vi.fn(
    async (
      tool: AuralisWebMcpTool,
      registration?: Readonly<{ signal?: AbortSignal }>,
    ) => {
      if (options.reject) throw new Error("host detail must stay private");
      tools.push(tool);
      signals.push(registration?.signal);
    },
  );
  const host: AuralisWebMcpHostDocument = {
    defaultView: topLevelView(),
    modelContext: { registerTool },
  };
  return { host, registerTool, signals, tools };
}

function byName(
  tools: readonly AuralisWebMcpTool[],
  name: AuralisToolName,
): AuralisWebMcpTool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`Missing ${name}`);
  return tool;
}

function asResult<T = unknown>(value: unknown): AuralisToolResult<T> {
  return value as AuralisToolResult<T>;
}

async function flushCleanup() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("Auralis WebMCP browser adapter", () => {
  it("keeps absence and registration rejection inert", async () => {
    const controller = createExperienceController();
    const initial = controller.getSnapshot();
    const unsupported = registerAuralisWebMcpTools({
      controller,
      document: { defaultView: topLevelView() },
    });
    expect(await unsupported.status).toBe("unsupported");

    const frameView: { top: unknown; self: unknown } = {
      top: {},
      self: null,
    };
    frameView.self = frameView;
    const frameRegisterTool = vi.fn(async (_tool: AuralisWebMcpTool) => undefined);
    const framed = registerAuralisWebMcpTools({
      controller,
      document: {
        defaultView: frameView,
        modelContext: { registerTool: frameRegisterTool },
      },
    });
    expect(await framed.status).toBe("unsupported");
    expect(frameRegisterTool).not.toHaveBeenCalled();

    const rejectedHost = hostHarness({ reject: true });
    const rejected = registerAuralisWebMcpTools({
      controller,
      document: rejectedHost.host,
    });
    expect(await rejected.status).toBe("rejected");
    expect(controller.getSnapshot()).toBe(initial);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
  });

  it("preserves human presentation when capability registration succeeds", async () => {
    const controller = createExperienceController();
    const initial = controller.getSnapshot();
    const harness = hostHarness();
    const binding = registerAuralisWebMcpTools({
      controller,
      document: harness.host,
    });

    expect(await binding.status).toBe("registered");
    expect(controller.getSnapshot()).toBe(initial);
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
    binding.dispose();
  });

  it("registers the exact five frozen names, metadata, schemas and annotations", () => {
    const tools = createAuralisWebMcpTools(createExperienceController());
    const expected = {
      get_auralis_state: [
        "Read Auralis state",
        "Read the current Auralis family-demo phase, revision, approved synthetic profiles, human-authority gate, audio readiness, current comparison, and allowed next tools. This tool has no side effects.",
        true,
        emptyToolInputSchema,
      ],
      stage_demo_session: [
        "Stage family demo",
        "Start or restage the bounded agent-guided family demo with one approved synthetic illustrative hearing profile. The first successful call activates the visible Agent Reveal. This tool does not supply consent, confirm the profile, load audio, acknowledge physical volume, or start playback.",
        false,
        stageDemoSessionInputSchema,
      ],
      prepare_comparison: [
        "Prepare listening comparison",
        "Prepare the fixed baseline or one deterministic adaptation that changes exactly one allowed variable. This tool does not load or play audio.",
        false,
        prepareComparisonInputSchema,
      ],
      record_user_observation: [
        "Record listening observation",
        "Record a bounded report that the human explicitly provided after hearing the current comparison. This tool does not infer hearing ability or provide a diagnosis.",
        false,
        recordUserObservationInputSchema,
      ],
      get_session_evidence: [
        "Read session evidence",
        "Read sanitized ordered session evidence and summary readiness. This tool has no side effects and returns no raw audiogram thresholds or free text.",
        true,
        emptyToolInputSchema,
      ],
    } as const;

    expect(tools.map((tool) => tool.name)).toEqual(AURALIS_TOOL_NAMES);
    expect(tools).toHaveLength(5);
    for (const tool of tools) {
      const [title, description, readOnly, inputSchema] = expected[tool.name];
      expect(tool.title).toBe(title);
      expect(tool.description).toBe(description);
      expect(tool.annotations).toEqual({
        readOnlyHint: readOnly,
        untrustedContentHint: false,
      });
      expect(tool.inputSchema).toEqual(z.toJSONSchema(inputSchema));
    }
  });

  it("coalesces duplicate React lifecycle attachment without duplicate tools", async () => {
    const controller = createExperienceController();
    const harness = hostHarness();
    const first = registerAuralisWebMcpTools({
      controller,
      document: harness.host,
    });
    const duplicate = registerAuralisWebMcpTools({
      controller,
      document: harness.host,
    });

    expect(await first.status).toBe("registered");
    expect(await duplicate.status).toBe("registered");
    first.dispose();
    const strictModeRemount = registerAuralisWebMcpTools({
      controller,
      document: harness.host,
    });
    await flushCleanup();
    expect(await strictModeRemount.status).toBe("registered");
    expect(harness.registerTool).toHaveBeenCalledTimes(5);
    duplicate.dispose();
    strictModeRemount.dispose();
  });

  it("aborts the supported registration lifecycle during final cleanup", async () => {
    const harness = hostHarness();
    const binding = registerAuralisWebMcpTools({
      controller: createExperienceController(),
      document: harness.host,
    });
    expect(await binding.status).toBe("registered");
    expect(harness.signals).toHaveLength(5);
    expect(new Set(harness.signals).size).toBe(1);
    expect(harness.signals[0]?.aborted).toBe(false);

    binding.dispose();
    await flushCleanup();
    expect(harness.signals[0]?.aborted).toBe(true);
  });

  it("honors an execute abort signal before any semantic mutation", async () => {
    const controller = createExperienceController();
    const abortController = new AbortController();
    abortController.abort();
    const stage = byName(
      createAuralisWebMcpTools(controller),
      "stage_demo_session",
    );

    const result = asResult(
      await stage.execute(
        {
          requestId: "stage-aborted",
          expectedRevision: 0,
          profileId: "high-frequency-hearing-loss",
          goal: "family-understanding",
        },
        { signal: abortController.signal },
      ),
    );
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("ABORTED");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
    expect(controller.getSnapshot().webMcp.session).toBeNull();
  });

  it("keeps both read-only handlers presentation- and revision-neutral", async () => {
    const controller = createExperienceController();
    const tools = createAuralisWebMcpTools(controller);
    const initial = controller.getSnapshot();

    const state = asResult(await byName(tools, "get_auralis_state").execute({}));
    const evidence = asResult(
      await byName(tools, "get_session_evidence").execute({}),
    );
    expect(state.ok).toBe(true);
    expect(evidence.ok).toBe(true);
    expect(controller.getSnapshot()).toBe(initial);
    expect(state.revision).toBe(0);
    expect(evidence.revision).toBe(0);
  });

  it("routes staging to the pure core activation without a presentation setter", async () => {
    const controller = createExperienceController();
    const stage = byName(
      createAuralisWebMcpTools(controller),
      "stage_demo_session",
    );
    const result = asResult(
      await stage.execute({
        requestId: "stage-1",
        expectedRevision: 0,
        profileId: "flat-hearing-loss",
        goal: "family-understanding",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.revision).toBe(1);
    expect(controller.getSnapshot().webMcp.session?.stagedProfileId).toBe(
      "flat-hearing-loss",
    );
    const projected = asResult<GetAuralisStateData>(
      await byName(
        createAuralisWebMcpTools(controller),
        "get_auralis_state",
      ).execute({}),
    );
    expect(projected.ok && projected.data.session.presentation).toBe(
      "agent-guided",
    );
  });

  it("binds every handler to core commands and contains no selector or click path", () => {
    for (const handler of [
      "getAuralisState",
      "stageDemoSession",
      "prepareComparison",
      "recordUserObservation",
      "getSessionEvidence",
    ]) {
      expect(source).toContain(handler);
    }
    expect(source).not.toMatch(/querySelector|querySelectorAll|\.click\s*\(/);
    expect(source).not.toContain("../app/");
  });

  it("resolves expected domain errors through the frozen envelope", async () => {
    const stage = byName(
      createAuralisWebMcpTools(createExperienceController()),
      "stage_demo_session",
    );
    const result = asResult(await stage.execute({}));

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_INPUT");
    expect(auralisToolResultSchema(stageDemoSessionDataSchema).safeParse(result).success).toBe(
      true,
    );
  });

  it("sanitizes unexpected failures without stack or arbitrary exception text", async () => {
    const controller = createExperienceController();
    const tools = createAuralisWebMcpTools(controller, {
      stage_demo_session: () => {
        throw new Error("private-host-stack-detail");
      },
    });
    const result = asResult(
      await byName(tools, "stage_demo_session").execute({
        requestId: "stage-throws",
        expectedRevision: 0,
        profileId: "asymmetric-hearing-loss",
        goal: "family-understanding",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toContain("private-host-stack-detail");
    expect(controller.getSnapshot().webMcp.revision).toBe(0);
  });

  it("validates every returned value with its frozen runtime result schema", async () => {
    const controller = createExperienceController();
    const tools = createAuralisWebMcpTools(controller);
    const dataSchemas: Readonly<Record<AuralisToolName, ZodType>> = {
      get_auralis_state: getAuralisStateDataSchema,
      stage_demo_session: stageDemoSessionDataSchema,
      prepare_comparison: prepareComparisonDataSchema,
      record_user_observation: recordUserObservationDataSchema,
      get_session_evidence: getSessionEvidenceDataSchema,
    };

    for (const tool of tools) {
      const input =
        tool.name === "get_auralis_state" ||
        tool.name === "get_session_evidence"
          ? {}
          : { invalid: true };
      const result = await tool.execute(input);
      expect(
        auralisToolResultSchema(dataSchemas[tool.name]).safeParse(result).success,
      ).toBe(true);
    }
  });

  it("has no browser-audio import or playback invocation", () => {
    expect(source).not.toMatch(/from\s+["']\.\/audio["']/);
    expect(source).not.toContain("BrowserAudioEngine");
    expect(source).not.toContain("playback-started");
    expect(source).not.toMatch(/\.play\s*\(/);
  });

  it("publishes the exact committed gateway snapshot before returning it", async () => {
    const controller = createExperienceController();
    let published = null as ReturnType<typeof controller.getSnapshot> | null;
    controller.subscribe((snapshot) => {
      published = snapshot;
    });
    const stage = byName(
      createAuralisWebMcpTools(controller),
      "stage_demo_session",
    );

    const result = asResult(
      await stage.execute({
        requestId: "stage-publish",
        expectedRevision: 0,
        profileId: "high-frequency-hearing-loss",
        goal: "family-understanding",
      }),
    );
    expect(result.ok).toBe(true);
    expect(published).toBe(controller.getSnapshot());
    expect(published?.webMcp.revision).toBe(result.revision);
    expect(result.sessionId).toBe(published?.webMcp.session?.sessionId);
  });
});
