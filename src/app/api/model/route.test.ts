import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_MODEL_REQUEST_BYTES,
  type ModelExplanationRequest,
} from "../../../contracts/runtime";

const { providerGenerate } = vi.hoisted(() => ({
  providerGenerate: vi.fn(),
}));

vi.mock("../../../server/openai", () => ({
  OpenAIExplanationProvider: class {
    generate = providerGenerate;
  },
}));

import { POST } from "./route";

const validRequest: ModelExplanationRequest = {
  operation: "explain-current-experience",
  runId: "run-1",
  attemptId: "attempt-1",
  attemptNumber: 1,
  groundingRevision: 4,
  sourceIdentity: "family-source:abc123",
  resultIdentity: "result:abc123",
  profile: {
    origin: "manual",
    predefinedProfileId: null,
    pattern: "higher-frequency-emphasis",
    earBalance: "left-more-attenuated",
  },
  supportMode: "left-one-sided",
  interventionState: "tv-off",
  speakerPositionState: "closer-in-front",
  transformation: {
    support: "left-ear-partial-compensation",
    television: "removed",
    focusedSpeechPosition: "closer-in-front",
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
};

function streamingRequest(
  chunks: Uint8Array[],
  contentLength?: string,
): { request: Request; wasCancelled: () => boolean } {
  let index = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index];
      index += 1;

      if (chunk) {
        controller.enqueue(chunk);
      } else {
        controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  const headers = contentLength
    ? { "content-length": contentLength }
    : undefined;
  const request = new Request("http://localhost/api/model", {
    method: "POST",
    body,
    headers,
    duplex: "half",
  } as RequestInit & { duplex: "half" });

  return { request, wasCancelled: () => cancelled };
}

describe("POST /api/model bounded request body", () => {
  beforeEach(() => {
    providerGenerate.mockReset();
    providerGenerate.mockResolvedValue({
      status: "configuration-unavailable",
      responseId: null,
    });
  });

  it.each([undefined, "1"])(
    "cancels an over-limit stream with declared length %s",
    async (contentLength) => {
      const { request, wasCancelled } = streamingRequest(
        [
          new Uint8Array(4_096),
          new Uint8Array(4_096),
          new Uint8Array(1),
          new Uint8Array(1),
        ],
        contentLength,
      );

      const response = await POST(request);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({
        error: "invalid-request",
      });
      expect(wasCancelled()).toBe(true);
      expect(providerGenerate).not.toHaveBeenCalled();
    },
  );

  it("rejects a declared over-limit body before provider use", async () => {
    const response = await POST(
      new Request("http://localhost/api/model", {
        method: "POST",
        body: "{}",
        headers: {
          "content-length": String(MAX_MODEL_REQUEST_BYTES + 1),
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(providerGenerate).not.toHaveBeenCalled();
  });

  it("accepts a valid request at the exact UTF-8 byte limit", async () => {
    const serialized = JSON.stringify(validRequest);
    const body = `${serialized}${" ".repeat(
      MAX_MODEL_REQUEST_BYTES - new TextEncoder().encode(serialized).byteLength,
    )}`;

    expect(new TextEncoder().encode(body)).toHaveLength(
      MAX_MODEL_REQUEST_BYTES,
    );

    const response = await POST(
      new Request("http://localhost/api/model", {
        method: "POST",
        body,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      reason: "configuration-unavailable",
    });
    expect(providerGenerate).toHaveBeenCalledOnce();
  });

  it("preserves the existing boundary-failure response for stream errors", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("stream failed"));
      },
    });
    const request = new Request("http://localhost/api/model", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await POST(request);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "model-boundary-failure",
    });
    expect(providerGenerate).not.toHaveBeenCalled();
  });
});
