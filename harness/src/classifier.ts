import Anthropic from "@anthropic-ai/sdk";
import { FAILURE_TAGS } from "./types.js";
import type { FailureTag, FailureTagName, TranscriptItem, TestOutput } from "./types.js";

/**
 * Failure-mode classifier.
 *
 * IMPORTANT: this NEVER decides pass/fail. The tests already did that. This
 * only explains an already-failed task by tagging it with one or more buckets
 * from a FIXED taxonomy, each with a one-line justification. It is an analysis
 * aid for the capability-gap view - not a grader.
 *
 * We force structured output via a tool call so the model can only return tags
 * from the allowed set.
 */

const TAXONOMY_DESC: Record<FailureTagName, string> = {
  misread_spec: "solved the wrong problem / misunderstood the requirement",
  missed_edge_case: "handled the happy path but failed an edge case",
  regression: "fixed the target but broke a previously passing test",
  hallucinated_api: "used a function/module/method that does not exist",
  incomplete: "gave up, left a TODO, or did not finish",
  wrong_approach: "fundamentally wrong algorithm or strategy",
  flaky_or_timeout: "nondeterministic behavior or exceeded the timeout",
};

const classifyTool: Anthropic.Tool = {
  name: "classify_failure",
  description:
    "Return the failure-mode tags that best explain why this coding task failed its tests.",
  input_schema: {
    type: "object",
    properties: {
      tags: {
        type: "array",
        description: "One or more failure tags from the fixed taxonomy.",
        items: {
          type: "object",
          properties: {
            tag: { type: "string", enum: FAILURE_TAGS },
            justification: {
              type: "string",
              description: "One concise sentence citing transcript/test evidence.",
            },
          },
          required: ["tag", "justification"],
        },
      },
    },
    required: ["tags"],
  },
};

export async function classifyFailure(opts: {
  client: Anthropic;
  model: string;
  taskPrompt: string;
  transcript: TranscriptItem[];
  finalTestOutput: TestOutput;
}): Promise<FailureTag[]> {
  if (opts.finalTestOutput.timedOut) {
    // deterministic shortcut - a timeout is unambiguous, no LLM needed
    return [
      {
        tag: "flaky_or_timeout",
        justification: "The final verification exceeded the sandbox timeout.",
      },
    ];
  }

  const taxonomyText = FAILURE_TAGS.map((t) => `- ${t}: ${TAXONOMY_DESC[t]}`).join("\n");
  const transcriptText = renderTranscript(opts.transcript);

  const prompt = [
    `A coding agent attempted a task and FAILED the deterministic tests.`,
    `Classify WHY using only this fixed taxonomy:`,
    taxonomyText,
    ``,
    `## Task prompt`,
    opts.taskPrompt,
    ``,
    `## Final test output (the authoritative verdict - already FAIL)`,
    `exit_code: ${opts.finalTestOutput.exitCode}`,
    opts.finalTestOutput.stdout.slice(0, 4000),
    opts.finalTestOutput.stderr.slice(0, 4000),
    ``,
    `## Agent transcript (abridged)`,
    transcriptText.slice(0, 12000),
    ``,
    `Call classify_failure with 1-3 tags that best explain the failure. Cite concrete evidence.`,
  ].join("\n");

  try {
    const resp = await opts.client.messages.create({
      model: opts.model,
      max_tokens: 1024,
      temperature: 0,
      tools: [classifyTool],
      tool_choice: { type: "tool", name: "classify_failure" },
      messages: [{ role: "user", content: prompt }],
    });

    for (const block of resp.content) {
      if (block.type === "tool_use" && block.name === "classify_failure") {
        const input = block.input as { tags?: Array<{ tag: string; justification: string }> };
        const tags = (input.tags ?? [])
          .filter((t) => (FAILURE_TAGS as string[]).includes(t.tag))
          .map((t) => ({ tag: t.tag as FailureTagName, justification: t.justification }));
        if (tags.length) return tags;
      }
    }
  } catch {
    /* fall through to default */
  }

  return [
    {
      tag: "wrong_approach",
      justification: "Classifier unavailable; defaulted. Tests failed for an unclassified reason.",
    },
  ];
}

function renderTranscript(items: TranscriptItem[]): string {
  const lines: string[] = [];
  for (const it of items) {
    switch (it.type) {
      case "assistant_text":
        lines.push(`ASSISTANT: ${it.text}`);
        break;
      case "tool_use":
        lines.push(`TOOL_CALL ${it.tool}(${JSON.stringify(it.input).slice(0, 500)})`);
        break;
      case "tool_result":
        lines.push(`TOOL_RESULT[${it.tool}]: ${it.content.slice(0, 800)}`);
        break;
      default:
        break;
    }
  }
  return lines.join("\n");
}
