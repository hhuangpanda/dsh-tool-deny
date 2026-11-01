# dsh-tool-deny

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）中的每个智能体预设（preset）选择可用的工具。

在 profile 根部加载的插件会全局注册其工具，因此所有预设都会继承这些工具。预设可以添加插件，却没有移除全局工具的设置。dsh-tool-deny 用几行 YAML 补上了这个空缺。

## 功能

| 选项 | 位置 | 值 | 作用 |
|---|---|---|---|
| `hideByPreset` | 根行 | 预设 id 到工具名的映射 | 从指定预设的模型工具列表中移除工具 |
| `hide` | 预设内 | 工具名 | 同上，作用于挂载该插件的预设 |
| `deny` | 预设内 | 工具名 | 工具仍在列表中，但拒绝每一次调用 |
| `hideSections` | 两处皆可 | 段落名 | 为这些智能体清空全局系统提示词中的指定段落 |

在根行使用 `hideByPreset`，在预设行使用 `hide` 和 `deny`。如果某一行设置了 `hideByPreset`，则 `hide` 和 `deny` 会被忽略，并记录一条警告。

被隐藏的工具不消耗 token，因为其定义不会发送给模型。其他预设不受影响。子智能体、自动化运行和恢复的会话同样适用。

## 环境要求

已在 dsh 0.2.1-rc.4 上测试。

## 安装

```sh
dsh plugin --profile web add dsh-tool-deny
```

配置之前，插件不会产生任何效果。

## 快速开始

假设你安装了一个添加 `image_search` 和 `translate` 的插件，并希望 `minimal` 和 `reviewer` 预设用不到它们。将以下内容添加到 profile 的 `cordis.patch.yml`：

```yaml
- insert:
    - id: tool-deny-root
      name: dsh-tool-deny
      config:
        hideByPreset:
          minimal:
            - image_search
            - translate
          reviewer:
            - translate
```

重启 dsh。新的 `minimal` 会话将看不到这两个工具，`reviewer` 会话将看不到 `translate`，其他预设仍保留两者。

如果多个预设共用同一份列表，可以用 YAML 锚点避免重复：

```yaml
hideByPreset:
  minimal: &extra-tools
    - image_search
    - translate
  reviewer: *extra-tools
```

## 在预设内使用

当预设需要自带规则，或需要使用 `deny` 时，请这样做。将该行添加到预设的 `plugins` 列表：

```yaml
- id: tool-deny
  name: dsh-tool-deny
  config:
    hide:
      - image_search
    deny:
      - delete_records
```

`image_search` 会从列表中消失。`delete_records` 仍在列表中，调用它会返回 `"delete_records" is not available to this agent.`。

## 隐藏还是拒绝？

优先使用隐藏：模型看不到该工具，还能节省它占用的 token。对于隐藏无法覆盖的工具，请使用 `deny`。这类工具由插件直接注册在每个智能体上（通过 `agent.ctx`），而不是全局注册。若尝试隐藏它们，它们仍然可见。

## 隐藏提示词段落

有些插件会向系统提示词中添加全局段落。可以按名称为相同的智能体清空它：

```yaml
config:
  hideByPreset:
    minimal:
      - image_search
  hideSections:
    - my-plugin:notes
```

在根部，`hideSections` 适用于 `hideByPreset` 中列出的每个预设。段落名由注册它的插件定义。

## 局限性

- **失效时不会报错。** 如果移除了该行，或插件无法加载，工具会悄悄恢复。不要把它作为敏感智能体的唯一保护措施。
- **按名称列出。** 插件更新新增的工具在你添加之前仍然可见。
- **未知名称会被跳过。** 不存在的工具名只会记录一条警告，其余情况下被忽略，请仔细检查拼写。
- **隐藏的是工具，而不是插件。** 插件仍在运行。它在工具之外的行为（例如作为 `web_search` 背后的提供方）不会改变。
- **切换预设可能丢失工具。** 将新会话切换到另一个预设再切回来，可能会丢失 `subagent`，这是 dsh 本身的行为。开启新会话即可恢复。

## 工作原理

在根模式下，插件监听 `agent/created` 和 `agent-preset/selected`，查找该智能体的预设，并对该智能体调用 `ctx.tools.restrict({ deny })`。之后 dsh 在构建该智能体的工具列表时会过滤这些工具。工具仍保持注册状态，因此其他智能体不受影响。`deny` 使用 `ctx.tools.guard`，在执行时拒绝调用。

## 许可证

[MIT](LICENSE)
