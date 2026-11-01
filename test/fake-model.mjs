/**
 * Fake OpenAI-compatible model for testing against a throwaway dsh. It has no AI in it:
 * the same request always gets the same reply, and every request is logged as one JSON line.
 *
 * Replies "ok", unless a user message contains `call:<tool>` or `call:<tool> {json args}`.
 * Then it calls that tool once, and replies "ok" after the tool result comes back.
 *
 * Usage: node test/fake-model.mjs --port 8099 [--log <file>]
 * The log is cleared on start, so it only ever holds the current run.
 * It contains full system prompts, so the default location is gitignored.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { dirname } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const DEFAULT_LOG = fileURLToPath(new URL("./logs/fake-model.jsonl", import.meta.url))

const TRIGGER = /\bcall:([A-Za-z0-9_-]+)(?:\s+(\{.*?\})(?=\s|"|$))?/

const contentText = (message) =>
  typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")

export function decide(request) {
  const messages = request.messages ?? []
  const offered = (request.tools ?? []).map((tool) => tool.function?.name)
  if (messages.some((message) => message.role === "tool")) return { text: "ok" }

  const userText = messages.filter((m) => m.role === "user").map(contentText).join("\n")
  const trigger = TRIGGER.exec(userText)
  if (!trigger) return { text: "ok" }

  const [, name, args = "{}"] = trigger
  if (!offered.includes(name)) return { text: `tool not offered: ${name}` }
  return { toolCall: { name, arguments: args } }
}

export function summarize(url, request) {
  const messages = request.messages ?? []
  return {
    url,
    model: request.model,
    tools: (request.tools ?? []).map((tool) => tool.function?.name),
    system: messages.filter((m) => m.role === "system").map(contentText).join("\n"),
    toolResults: messages.filter((m) => m.role === "tool").map(contentText),
  }
}

function replyChunks(request, reply) {
  const chunk = (delta, finishReason = null) => ({
    id: "fake",
    object: "chat.completion.chunk",
    created: 0,
    model: request.model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })
  if (reply.toolCall) {
    const call = {
      index: 0,
      id: "call_1",
      type: "function",
      function: reply.toolCall,
    }
    return [chunk({ role: "assistant", tool_calls: [call] }), chunk({}, "tool_calls")]
  }
  return [chunk({ role: "assistant", content: reply.text }), chunk({}, "stop")]
}

export function startFakeModel({ port = 0, logPath } = {}) {
  if (logPath) {
    mkdirSync(dirname(logPath), { recursive: true })
    writeFileSync(logPath, "")
  }

  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (data) => (body += data))
    req.on("end", () => {
      if (!req.url.endsWith("/chat/completions")) {
        res.writeHead(200, { "content-type": "application/json" })
        res.end('{"data":[]}')
        return
      }
      const request = JSON.parse(body)
      if (logPath) appendFileSync(logPath, `${JSON.stringify(summarize(req.url, request))}\n`)

      res.writeHead(200, { "content-type": "text/event-stream" })
      for (const chunk of replyChunks(request, decide(request))) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`)
      }
      res.end("data: [DONE]\n\n")
    })
  })
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { port: { type: "string" }, log: { type: "string" } } })
  if (!values.port) {
    console.error("Usage: node test/fake-model.mjs --port <port> [--log <file>]")
    process.exit(1)
  }
  const logPath = values.log ?? DEFAULT_LOG
  await startFakeModel({ port: Number(values.port), logPath })
  console.log(`fake model on http://127.0.0.1:${values.port}/v1, logging to ${logPath}`)
}
