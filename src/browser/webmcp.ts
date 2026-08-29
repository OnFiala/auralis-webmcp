import { z, type ZodType } from "zod";

import {
  AURALIS_TOOL_NAMES,
  AURALIS_WEBMCP_CONTRACT_VERSION,
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
} from "../contracts/webmcp";
import type { ExperienceController } from "../core/experience";
import {
  getAuralisState,
  getSessionEvidence,
  prepareComparison,
  recordUserObservation,
  stageDemoSession,
} from "../core/webmcp";

type ToolExecuteOptions = Readonly<{ signal?: AbortSignal }>;

export type AuralisWebMcpTool = Readonly<{
  name: AuralisToolName;
  title: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  annotations: Readonly<{
    readOnlyHint: boolean;
    untrustedContentHint: false;
  }>;
  execute(input: unknown, options?: ToolExecuteOptions): Promise<unknown>;
}>;

export type AuralisModelContext = Readonly<{
  registerTool(
    tool: AuralisWebMcpTool,
    options?: Readonly<{ signal?: AbortSignal }>,
  ): void | Promise<void>;
}>;

export type AuralisWebMcpHostDocument = Readonly<{
  modelContext?: AuralisModelContext;
  defaultView?: Readonly<{ top: unknown; self: unknown }> | null;
}>;

type ToolExecutor = (
  controller: ExperienceController,
  input: unknown,
  options: ToolExecuteOptions,
) => unknown;

export type AuralisWebMcpExecutorOverrides = Partial<
  Readonly<Record<AuralisToolName, ToolExecutor>>
>;

export type AuralisWebMcpRegistrationStatus =
  | "registered"
  | "unsupported"
  | "rejected";

export type AuralisWebMcpBinding = Readonly<{
  status: Promise<AuralisWebMcpRegistrationStatus>;
  dispose(): void;
}>;

type ToolMetadata = Readonly<{
  title: string;
  description: string;
  readOnly: boolean;
  inputSchema: ZodType;
  dataSchema: ZodType;
}>;

const TOOL_METADATA: Readonly<Record<AuralisToolName, ToolMetadata>> =
  Object.freeze({
    get_auralis_state: Object.freeze({
      title: "Read Auralis state",
      description:
        "Read the current Auralis family-demo phase, revision, approved synthetic profiles, human-authority gate, audio readiness, current comparison, and allowed next tools. This tool has no side effects.",
      readOnly: true,
      inputSchema: emptyToolInputSchema,
      dataSchema: getAuralisStateDataSchema,
    }),
    stage_demo_session: Object.freeze({
      title: "Stage family demo",
      description:
        "Start or restage the bounded agent-guided family demo with one approved synthetic illustrative hearing profile. The first successful call activates the visible Agent Reveal. This tool does not supply consent, confirm the profile, load audio, acknowledge physical volume, or start playback.",
      readOnly: false,
      inputSchema: stageDemoSessionInputSchema,
      dataSchema: stageDemoSessionDataSchema,
    }),
    prepare_comparison: Object.freeze({
      title: "Prepare listening comparison",
      description:
        "Prepare the fixed baseline or one deterministic adaptation that changes exactly one allowed variable. This tool does not load or play audio.",
      readOnly: false,
      inputSchema: prepareComparisonInputSchema,
      dataSchema: prepareComparisonDataSchema,
    }),
    record_user_observation: Object.freeze({
      title: "Record listening observation",
      description:
        "Record a bounded report that the human explicitly provided after hearing the current comparison. This tool does not infer hearing ability or provide a diagnosis.",
      readOnly: false,
      inputSchema: recordUserObservationInputSchema,
      dataSchema: recordUserObservationDataSchema,
    }),
    get_session_evidence: Object.freeze({
      title: "Read session evidence",
      description:
        "Read sanitized ordered session evidence and summary readiness. This tool has no side effects and returns no raw audiogram thresholds or free text.",
      readOnly: true,
      inputSchema: emptyToolInputSchema,
      dataSchema: getSessionEvidenceDataSchema,
    }),
  });

const DEFAULT_EXECUTORS: Readonly<Record<AuralisToolName, ToolExecutor>> =
  Object.freeze({
    get_auralis_state: (controller, input) =>
      getAuralisState(controller, input),
    stage_demo_session: (controller, input, options) =>
      stageDemoSession(controller, input, options),
    prepare_comparison: (controller, input, options) =>
      prepareComparison(controller, input, options),
    record_user_observation: (controller, input, options) =>
      recordUserObservation(controller, input, options),
    get_session_evidence: (controller, input) =>
      getSessionEvidence(controller, input),
  });

const FAILURE_DETAILS = Object.freeze({
  ABORTED: Object.freeze({
    message: "The request was aborted before the semantic commit.",
    retryable: true,
    recovery: "Read the current state, then retry with a new requestId.",
  }),
  INTERNAL_ERROR: Object.freeze({
    message: "The semantic command failed closed.",
    retryable: false,
    recovery: "Preserve the state and inspect the local implementation.",
  }),
});

function safeFailure(
  tool: AuralisToolName,
  controller: ExperienceController,
  code: keyof typeof FAILURE_DETAILS,
): AuralisToolResult<never> {
  const context = getAuralisState(controller, {});
  return Object.freeze({
    contractVersion: AURALIS_WEBMCP_CONTRACT_VERSION,
    ok: false as const,
    tool,
    requestId: null,
    revision: context.revision,
    phase: context.phase,
    sessionId: context.sessionId,
    replayed: false as const,
    allowedNextTools: context.allowedNextTools,
    humanGate: context.humanGate,
    data: null,
    error: Object.freeze({ code, ...FAILURE_DETAILS[code] }),
  });
}

function jsonSchema(schema: ZodType): Readonly<Record<string, unknown>> {
  return Object.freeze(
    z.toJSONSchema(schema) as Readonly<Record<string, unknown>>,
  );
}

export function createAuralisWebMcpTools(
  controller: ExperienceController,
  executorOverrides: AuralisWebMcpExecutorOverrides = {},
): readonly AuralisWebMcpTool[] {
  const executors = Object.freeze({
    ...DEFAULT_EXECUTORS,
    ...executorOverrides,
  });

  return Object.freeze(
    AURALIS_TOOL_NAMES.map((name) => {
      const metadata = TOOL_METADATA[name];
      const resultSchema = auralisToolResultSchema(metadata.dataSchema);

      return Object.freeze({
        name,
        title: metadata.title,
        description: metadata.description,
        inputSchema: jsonSchema(metadata.inputSchema),
        annotations: Object.freeze({
          readOnlyHint: metadata.readOnly,
          untrustedContentHint: false as const,
        }),
        execute: async (
          input: unknown,
          options: ToolExecuteOptions = {},
        ): Promise<unknown> => {
          if (options.signal?.aborted) {
            return safeFailure(name, controller, "ABORTED");
          }

          try {
            const result = await executors[name](controller, input, options);
            return resultSchema.safeParse(result).success
              ? result
              : safeFailure(name, controller, "INTERNAL_ERROR");
          } catch {
            return safeFailure(name, controller, "INTERNAL_ERROR");
          }
        },
      });
    }),
  );
}

type RegistrationLifecycle = {
  controller: ExperienceController;
  abortController: AbortController | null;
  references: number;
  teardownQueued: boolean;
  status: Promise<AuralisWebMcpRegistrationStatus>;
};

const registrationLifecycles = new WeakMap<object, RegistrationLifecycle>();

function topLevel(host: AuralisWebMcpHostDocument): boolean {
  const view = host.defaultView;
  return !view || (view.top === view.self && view.self === view);
}

function inertBinding(
  status: AuralisWebMcpRegistrationStatus,
): AuralisWebMcpBinding {
  return Object.freeze({
    status: Promise.resolve(status),
    dispose: () => undefined,
  });
}

function bindingFor(
  host: object,
  lifecycle: RegistrationLifecycle,
): AuralisWebMcpBinding {
  let disposed = false;
  return Object.freeze({
    status: lifecycle.status,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      lifecycle.references = Math.max(0, lifecycle.references - 1);
      if (lifecycle.references !== 0 || lifecycle.teardownQueued) return;

      lifecycle.teardownQueued = true;
      queueMicrotask(() => {
        lifecycle.teardownQueued = false;
        if (lifecycle.references !== 0) return;

        if (lifecycle.abortController) {
          lifecycle.abortController.abort();
          if (registrationLifecycles.get(host) === lifecycle) {
            registrationLifecycles.delete(host);
          }
        }
      });
    },
  });
}

export function registerAuralisWebMcpTools(options: {
  controller: ExperienceController;
  document?: AuralisWebMcpHostDocument | null;
}): AuralisWebMcpBinding {
  const host =
    options.document ??
    (typeof document === "undefined"
      ? null
      : (document as unknown as AuralisWebMcpHostDocument));
  const modelContext = host?.modelContext;

  if (!host || !modelContext || typeof modelContext.registerTool !== "function") {
    return inertBinding("unsupported");
  }
  if (!topLevel(host)) {
    return inertBinding("unsupported");
  }

  const hostKey = host as object;
  const existing = registrationLifecycles.get(hostKey);
  if (existing) {
    if (existing.controller !== options.controller) {
      return inertBinding("rejected");
    }
    existing.references += 1;
    return bindingFor(hostKey, existing);
  }

  const abortController =
    typeof AbortController === "function" ? new AbortController() : null;
  const lifecycle = {
    controller: options.controller,
    abortController,
    references: 1,
    teardownQueued: false,
    status: Promise.resolve("unsupported" as AuralisWebMcpRegistrationStatus),
  } satisfies RegistrationLifecycle;

  lifecycle.status = (async () => {
    try {
      for (const tool of createAuralisWebMcpTools(options.controller)) {
        if (abortController?.signal.aborted) return "rejected";
        await modelContext.registerTool(
          tool,
          abortController ? { signal: abortController.signal } : undefined,
        );
      }
      return "registered";
    } catch {
      abortController?.abort();
      return "rejected";
    }
  })();

  registrationLifecycles.set(hostKey, lifecycle);
  return bindingFor(hostKey, lifecycle);
}
