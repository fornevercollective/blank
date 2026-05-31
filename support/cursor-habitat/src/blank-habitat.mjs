#!/usr/bin/env node
/**
 * blank-??? · Cursor SDK “habitat” — Blank’s haunted terminal counterpart.
 */

import path from "node:path";
import tty from "node:tty";
import { Agent, CursorAgentError } from "@cursor/sdk";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { BOOTSTRAP_ACK_PROMPT, RECIPES_HABITAT_VOWS } from "./prompts.mjs";

function usage() {
  console.error(`blank-cursor-habitat (@cursor/sdk REPL · optional one-shot)

ENV
  CURSOR_API_KEY               required (Dashboard → Integrations / service account)
  BLANK_AGENT_NAME             Agent list title (default: blank-??? · habitat/recipes ◌)
  BLANK_HABITAT_CWD            fallback cwd when --cwd omitted
  CURSOR_AGENT_MODEL           default composer-2.5

USAGE
  CURSOR_API_KEY=… npm run habitat -- [options]
  npm run habitat -- --cwd ~/dev/mustream-desktop --one-shot Paste a yt URL and propose mustream recipes

OPTIONS
  --cwd PATH                  local filesystem root for Agent (default \$BLANK_HABITAT_CWD or cwd)
  --resume AGENT_ID           Agent.resume(…) instead of create
  --one-shot [...text]        non-interactive Agent.prompt(...) then exit
  --help                      this text

stdin REPL: type /quit to exit. Bootstrap sends one pact message so the persona sticks.

macOS · Terminal.app (Finder): double-click Launch-Habitat.command in the Blank repo root
(same pattern as Launch.command for the static server).

SDK: https://cursor.com/docs/sdk/typescript`);
}

function parseArgs(argv) {
  let cwdArg;
  let resumeId;
  const positional = [];

  let i = 0;
  while (i < argv.length) {
    const x = argv[i];
    if (x === "--cwd") {
      cwdArg = argv[i + 1];
      i += 2;
      continue;
    }
    if (x === "--resume") {
      resumeId = argv[i + 1];
      i += 2;
      continue;
    }
    if (x === "--one-shot") {
      const rest = argv.slice(i + 1).join(" ").trim();
      return {
        cwdArg,
        resumeId,
        mode: /** @type {const} */ ("one-shot"),
        oneShotBody: rest,
      };
    }
    if (x === "--help" || x === "-h") return { cwdArg: null, resumeId: null, mode: "help", oneShotBody: "" };
    positional.push(x);
    i++;
  }

  const joined = positional.join(" ").trim();
  if (joined) {
    return { cwdArg, resumeId, mode: /** @type {const} */ ("one-shot"), oneShotBody: joined };
  }
  return { cwdArg, resumeId, mode: /** @type {const} */ ("repl"), oneShotBody: "" };
}

async function streamAssistantToStdout(run) {
  let acc = "";
  for await (const event of run.stream()) {
    if (event.type === "assistant") {
      for (const block of event.message.content) {
        if (block.type === "text") {
          acc += block.text;
          process.stdout.write(block.text);
        }
      }
    } else if (event.type === "thinking") {
      process.stderr.write(event.text ?? "");
    }
  }
  process.stdout.write("\n");
  return acc;
}

async function bootstrapAgent(agent) {
  const run = await agent.send(BOOTSTRAP_ACK_PROMPT);
  await streamAssistantToStdout(run);
  const fin = await run.wait();
  if (fin.status === "error") {
    console.error("bootstrap failed:", fin.id);
    process.exit(2);
  }
}

async function main() {
  const rawArgv = process.argv.slice(2);
  const parsed = parseArgs(rawArgv);

  if (parsed.mode === "help") {
    usage();
    process.exit(0);
  }

  const apiKey =
    process.env.CURSOR_API_KEY?.trim() ||
    (() => {
      console.error("Missing CURSOR_API_KEY.");
      usage();
      process.exit(1);
    })();

  const cwdResolved = path.resolve(
    parsed.cwdArg?.trim() || process.env.BLANK_HABITAT_CWD?.trim() || process.cwd(),
  );

  const agentName =
    process.env.BLANK_AGENT_NAME?.trim() || "blank-??? · habitat/recipes ◌";

  const baseOpts = {
    apiKey,
    model: { id: process.env.CURSOR_AGENT_MODEL?.trim() || "composer-2.5" },
    name: agentName,
    local: /** @type {const} */ ({ cwd: cwdResolved, settingSources: [] }),
  };

  console.error(`→ cwd: ${cwdResolved}`);
  console.error(`→ title: ${agentName}`);
  console.error("(usage: Cursor usage & billing applies — see Dashboard)\n");

  const composeOneShot = (body) =>
    `${RECIPES_HABITAT_VOWS}\n\n---\nUser task:\n${body}`;

  if (parsed.mode === "one-shot") {
    try {
      if (!parsed.oneShotBody.trim()) {
        usage();
        console.error("(add text after --one-shot, or a bare quoted question)");
        process.exit(2);
      }
      const result = await Agent.prompt(composeOneShot(parsed.oneShotBody), baseOpts);
      if (result.status === "error") {
        console.error("run ended in error:", result.id);
        process.exit(2);
      }
      if (result.result?.trim())
        console.log("\n===== final =====\n" + result.result.trim());
      process.exit(0);
    } catch (err) {
      if (err instanceof CursorAgentError) {
        console.error("startup failed:", err.message);
        process.exit(1);
      }
      throw err;
    }
  }

  if (parsed.mode === "repl" && !tty.isatty(0)) {
    console.error(
      "[habitat] stdin is not a TTY — the REPL needs an interactive Terminal window.",
    );
    console.error(
      "→ macOS: double-click **Launch-Habitat.command** at the Blank repo root (starts Terminal.app here).",
    );
    console.error(
      "→ Or: Terminal → Shell → cd …/support/cursor-habitat && CURSOR_API_KEY=… npm run habitat",
    );
    process.exit(2);
  }

  /** @type {import("@cursor/sdk").SDKAgent | undefined} */
  let agent;
  try {
    agent = parsed.resumeId
      ? await Agent.resume(parsed.resumeId, {
          apiKey,
          local: { cwd: cwdResolved },
        })
      : await Agent.create(baseOpts);

    console.error("agentId:", agent.agentId, "(resume via --resume if this process exits)\n");

    if (!parsed.resumeId) await bootstrapAgent(agent);

    const rl = readline.createInterface({ input, output, terminal: true });
    console.error("blank-habitat · type /quit to leave the page that isn’t blank\n");

    try {
      for (;;) {
        const line = await rl.question("you › ");
        const t = line.trim();
        if (!t || t === "/quit" || t === "/exit") break;
        try {
          const run = await agent.send(t);
          await streamAssistantToStdout(run);
          const res = await run.wait();
          if (res.status === "error") console.error("[run error]", run.id);
        } catch (e) {
          if (e instanceof CursorAgentError)
            console.error("send failed:", e.message);
          else throw e;
        }
      }
    } finally {
      rl.close();
    }
  } finally {
    if (agent) {
      try {
        if (typeof agent[Symbol.asyncDispose] === "function")
          await agent[Symbol.asyncDispose]();
        else agent.close();
      } catch {
        agent.close();
      }
    }
  }
}

await main().catch((e) => {
  console.error(e);
  process.exit(1);
});

