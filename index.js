/**
 * Limits which tools an agent gets. See README.md for the config options.
 */
export const name = "dsh-tool-deny"
export const inject = ["tools", "systemPrompt"]

function refuseCalls(ctx, toolNames) {
  if (toolNames.length === 0) return
  const refused = new Set(toolNames)
  ctx.tools.guard((execution) =>
    refused.has(execution?.name)
      ? `"${execution.name}" is not available to this agent.`
      : undefined,
  )
}

// dsh names this filter "deny", but it hides the tool. It is unrelated to our `deny` option.
function removeFromToolList(ctx, toolName) {
  return ctx.tools.restrict({ deny: [toolName] })
}

function hide(ctx, logger, toolNames, sectionNames) {
  const undo = []
  for (const toolName of toolNames) {
    // One call per name: restrict() throws on an unknown tool, which would fail the agent.
    try {
      undo.push(removeFromToolList(ctx, toolName))
    } catch (error) {
      logger?.warn?.(`dsh-tool-deny: cannot hide "${toolName}": ${error}`)
    }
  }
  for (const sectionName of sectionNames) {
    undo.push(ctx.systemPrompt.section({ name: sectionName, order: 500, text: "" }))
  }
  return undo
}

function hideByPreset(ctx, toolNamesByPreset, sectionNames) {
  ctx.inject(["agents", "agentPresets"], (sctx) => {
    const undoByAgent = new Map()

    const unhide = (agent) => {
      for (const undo of undoByAgent.get(agent) ?? []) undo()
      undoByAgent.delete(agent)
    }
    const refresh = (agent) => {
      unhide(agent)
      const preset = sctx.agentPresets.composedPreset(agent.ctx)
      const toolNames = toolNamesByPreset[preset]
      if (toolNames) undoByAgent.set(agent, hide(agent.ctx, sctx.logger, toolNames, sectionNames))
    }

    for (const agent of sctx.agents.list()) refresh(agent)
    sctx.on("agent/created", ({ agent }) => {
      refresh(agent)
      return undefined
    })
    // A session can change preset before its first turn, after agent/created fired.
    sctx.on("agent-preset/selected", (sessionId) => {
      const agent = sctx.agents.get(sessionId)
      if (agent) refresh(agent)
    })
    sctx.on("agent/disposed", ({ agent }) => unhide(agent))
    sctx.effect(() => () => {
      for (const agent of [...undoByAgent.keys()]) unhide(agent)
    }, "dsh-tool-deny: hide by preset")
  })
}

export function apply(ctx, config = {}) {
  const sectionNames = config.hideSections ?? []
  if (config.hideByPreset) {
    if (config.hide || config.deny) {
      ctx.logger?.warn?.("dsh-tool-deny: hide and deny only work inside a preset; ignoring them")
    }
    hideByPreset(ctx, config.hideByPreset, sectionNames)
    return
  }
  refuseCalls(ctx, config.deny ?? [])
  hide(ctx, ctx.logger, config.hide ?? [], sectionNames)
}
