// AgLlmAdapter that routes AG Studio's agent turns through our backend (/api/studio/turn),
// so LLM keys stay server-side. Our backend talks to Gemini (Groq fallback).
import type { AgLlmAdapter } from "ag-studio";

let seq = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${(seq++).toString(36)}`;

export const mandateAdapter: AgLlmAdapter = {
  executeTurn(request: any, options?: { signal?: AbortSignal }) {
    const res: Promise<any> = fetch("/api/studio/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: options?.signal,
    }).then((r) => r.json());
    const messageId = nid("msg");

    const stream = {
      async *[Symbol.asyncIterator]() {
        const r = await res;
        if (r.text) {
          yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" } as any;
          yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: r.text } as any;
          yield { type: "TEXT_MESSAGE_END", messageId } as any;
        }
        for (const tc of r.tool_calls ?? []) {
          yield { type: "TOOL_CALL_START", toolCallId: tc.id, toolCallName: tc.name, parentMessageId: messageId } as any;
          yield { type: "TOOL_CALL_ARGS", toolCallId: tc.id, delta: tc.arguments } as any;
          yield { type: "TOOL_CALL_END", toolCallId: tc.id } as any;
        }
      },
    };

    const complete = res.then((r) => ({
      id: nid("resp"),
      createdAt: Date.now(),
      status: r.error ? "failed" : "completed",
      error: r.error ? { code: "llm_error", message: r.error } : undefined,
      output: [
        ...(r.text
          ? [{ id: messageId, kind: "output", type: "message", role: "assistant", status: "completed",
               content: [{ type: "text", text: r.text, annotations: [] }] }]
          : []),
        ...(r.tool_calls ?? []).map((tc: any) => ({
          id: tc.id, kind: "output", type: "function_call", callId: tc.id, name: tc.name, arguments: tc.arguments, status: "completed",
        })),
      ],
    })) as any;

    return { stream, complete } as any;
  },
};
