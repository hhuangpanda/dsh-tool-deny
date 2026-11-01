import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"
import { decide, startFakeModel } from "./fake-model.mjs"

const tool = (name) => ({ type: "function", function: { name } })
const user = (content) => ({ role: "user", content })

test("replies ok without a trigger", () => {
  assert.deepEqual(decide({ messages: [user("hello")], tools: [tool("read")] }), { text: "ok" })
})

test("calls an offered tool", () => {
  const reply = decide({ messages: [user("call:read")], tools: [tool("read")] })
  assert.deepEqual(reply, { toolCall: { name: "read", arguments: "{}" } })
})

test("passes json arguments", () => {
  const reply = decide({ messages: [user('call:read {"path":"a.txt"}')], tools: [tool("read")] })
  assert.deepEqual(reply, { toolCall: { name: "read", arguments: '{"path":"a.txt"}' } })
})

test("reports a tool that was not offered", () => {
  assert.deepEqual(decide({ messages: [user("call:read")], tools: [] }), {
    text: "tool not offered: read",
  })
})

test("calls the tool only once", () => {
  const messages = [user("call:read"), { role: "tool", content: "done" }]
  assert.deepEqual(decide({ messages, tools: [tool("read")] }), { text: "ok" })
})

test("streams identical replies and logs each request", async () => {
  const logPath = join(mkdtempSync(join(tmpdir(), "fake-model-")), "log.jsonl")
  const server = await startFakeModel({ logPath })
  const url = `http://127.0.0.1:${server.address().port}/v1/chat/completions`
  const body = JSON.stringify({
    model: "m",
    messages: [{ role: "system", content: "sys" }, user("call:read")],
    tools: [tool("read")],
  })
  const send = async () => (await fetch(url, { method: "POST", body })).text()

  try {
    const first = await send()
    assert.equal(first, await send())
    assert.match(first, /"tool_calls"/)
    assert.match(first, /data: \[DONE\]/)
  } finally {
    server.close()
  }

  const entries = readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line))
  assert.equal(entries.length, 2)
  assert.deepEqual(entries[0].tools, ["read"])
  assert.equal(entries[0].system, "sys")
})

test("clears the log on start and creates its folder", async () => {
  const logPath = join(mkdtempSync(join(tmpdir(), "fake-model-")), "nested", "log.jsonl")
  const first = await startFakeModel({ logPath })
  first.close()
  writeFileSync(logPath, "old run\n")

  const second = await startFakeModel({ logPath })
  second.close()
  assert.equal(readFileSync(logPath, "utf8"), "")
})
