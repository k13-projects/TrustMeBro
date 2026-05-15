import "server-only";

import { GoogleGenAI, type Part } from "@google/genai";
import {
  LOOKUP_PLAYER_DECLARATION,
  runLookupPlayer,
  summarizeToolResult,
} from "./tools";
import type { ChatMessage, ChatStreamEvent } from "./types";

const MODEL = "gemini-2.5-flash";
const MAX_TOOL_ITERATIONS = 4;

function client(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Get a free key at https://aistudio.google.com and add it to .env.local.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

function toContents(messages: ChatMessage[]) {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }] as Part[],
  }));
}

async function runToolByName(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === "lookup_player") {
    return runLookupPlayer({ name: String(args.name ?? "") });
  }
  return { ok: false, reason: `Unknown tool: ${name}` };
}

/**
 * Stream a chat response from Gemini, with one round of tool-call resolution
 * if the model decides to call lookup_player. Yields text chunks plus
 * tool-call lifecycle events the UI can render inline.
 */
export async function* streamChat(args: {
  systemInstruction: string;
  messages: ChatMessage[];
}): AsyncGenerator<ChatStreamEvent> {
  const ai = client();
  const config = {
    systemInstruction: args.systemInstruction,
    tools: [{ functionDeclarations: [LOOKUP_PLAYER_DECLARATION] }],
  };

  const contents = toContents(args.messages);

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    const stream = await ai.models.generateContentStream({
      model: MODEL,
      contents,
      config,
    });

    const modelParts: Part[] = [];
    const pendingCalls: Array<{
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        yield { type: "text", value: text };
        modelParts.push({ text });
      }
      const calls = chunk.functionCalls;
      if (calls && calls.length > 0) {
        for (const fc of calls) {
          const callArgs = (fc.args ?? {}) as Record<string, unknown>;
          pendingCalls.push({
            id: fc.id,
            name: fc.name ?? "",
            args: callArgs,
          });
          modelParts.push({ functionCall: fc });
        }
      }
    }

    if (pendingCalls.length === 0) {
      yield { type: "done" };
      return;
    }

    contents.push({ role: "model", parts: modelParts });

    for (const call of pendingCalls) {
      yield { type: "tool_call", name: call.name, args: call.args };
      const result = await runToolByName(call.name, call.args);
      yield {
        type: "tool_result",
        name: call.name,
        summary: summarizeToolResult(call.name, result),
      };
      contents.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: call.id,
              name: call.name,
              response: { result },
            },
          },
        ],
      });
    }
  }

  yield {
    type: "error",
    message: "Tool loop exceeded max iterations.",
  };
}
