---
name: soda-agent-workspace
description: 接入 Soda AI Studio 并保持在线可见——setup.mjs 一键安装；Claude Code 钩子自动上报开始/进行/结束；autopilot 后台心跳零 token 零记录增长；实时事件流；任务完成同步与同名覆盖；维护所属员工目标与周报月报；领取派活；自更新。每个 profile 一个独立身份；接口失败时本地回退，避免阻塞。
---

# Soda AI Studio：Agent 接入、状态与汇报

本技能以 git 仓库分发（v2.0.0），一个主客户端脚本加五个伴生脚本，覆盖安装、接入、自动上报、实时事件、心跳与员工汇报。仅在本人授权时启用；需要 Agent 具备 Node.js 18+（soda-task.sh 另需 bash）、HTTPS 和本机文件读写能力。平台不支持时如实说明，不要假称已接入或已保存。

普通 Agent 只用第一到七节（接入与状态）；代员工写周报月报的 Agent 同时使用第八节汇报流程——报告归属于员工本人，Agent 只能读写自己所属员工的报告。

## 一、安装

### 方式 A：一键安装（推荐）

```bash
git clone https://github.com/leoliao19911017-stack/soda-agent-workspace.git
cd soda-agent-workspace
node setup.mjs
```

setup.mjs（零依赖，Node >= 18）做三件事：把仓库根的 SKILL.md 和全部 .mjs/.sh 复制到 `~/.agents/skills/soda-agent-workspace/`（目录自动创建，覆盖写，可重复执行）；从 SKILL.md 提取第一个 javascript 代码块——与服务端 self-update 的提取规则完全一致——写入 `~/.config/soda-agent-sync/bin/soda-agent.mjs`（权限 0600，目录 0700）；打印安装清单和下一步指引。校验先行：SKILL.md 缺失、没有 javascript 代码块或仓库没有脚本时直接报错退出 1，不写入任何文件，绝不写半个脚本。

仓库文件清单：

| 文件 | 用途 |
|---|---|
| `SKILL.md` | 技能文档与行为规范；内嵌 soda-agent.mjs 客户端脚本全文（第九节） |
| `setup.mjs` | 一键安装器：复制技能文件到技能目录，提取客户端脚本到 bin |
| `soda-hook.mjs` | Claude Code 钩子适配器：把会话事件翻译成实时事件 + 心跳，并维护 current_task |
| `soda-task.sh` | 给任意命令包一层：自动发 start/end/error 事件并维护 current_task（需 bash） |
| `soda-autopilot.mjs` | 跨平台后台心跳守护：每 N 秒读 current_task，决定报 working 还是 idle |
| `soda-event.mjs` | 实时事件上报：单条或 --batch NDJSON 批量（每批最多 100 条 / 16000 字节，超出自动分批） |
| `soda-ping.mjs` | 零记录心跳：一次请求只更新「最后活动时间」 |
| `README.md` | 仓库说明、装法与版本表 |

### 方式 B：人工安装（备选）

平台无法执行 setup.mjs 时，Agent 自行完成等价动作：把文末「九、客户端脚本」代码块的完整原文保存到 `~/.config/soda-agent-sync/bin/soda-agent.mjs`，创建目录时限制为当前用户访问（0700），文件仅本人可读写（0600）；伴生脚本按需从仓库复制到技能目录（建议同样放 `~/.agents/skills/soda-agent-workspace/`）。不要让用户手工复制代码，不覆盖任何已有私钥或身份。脚本更新时只替换脚本文件，不修改已有身份配置；若无法执行或保存，保留用户已提供的信息并说明限制。用 `node --check ~/.config/soda-agent-sync/bin/soda-agent.mjs` 检查脚本语法。

### 更新

- clone 用户：`git pull` 后重跑 `node setup.mjs`（覆盖写，身份与私钥不动）。
- 已接入的 Agent：直接跑 `self-update`（命令见第九节），服务端下发新版 SKILL.md、伴生脚本与客户端脚本，原地覆盖技能目录和 bin，不需要重新 clone。

## 二、首次接入

仅在本人要求或明确授权接入时执行。需要 Node.js 18+、HTTPS 网络。自行确定此 Agent 的真实名称、运行类型，勿编造。每个 Agent 使用独立的 profile；将下面的 `cortana` 换成此 Agent 固定的英文 profile 名（字母、数字、下划线或连字符，最长 40 字符），后续所有命令包括 goal-report 都保持同一 `SODA_AGENT_PROFILE`。若无法确定，问本人。

1. 执行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs connect-start "Cortana" "OpenClaw"`。**不需要任何额外权限参数**——接入拿到的就是「管理本人数据」的身份。名称与平台用真实值，不照搬示例。
2. 把输出的一次性链接发给本人，请其登录后核对权限并点一次允许；链接 15 分钟有效、仅授权一次，不发到公开群。私钥在本机自动生成并保存，不展示、不传送、不覆盖既有密钥。不要让本人复制公钥或 ID。
3. 运行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs connect-check` 检查一次；如仍在等待，立即结束当前任务并告诉本人授权后唤醒你检查，或在平台支持时安排最多 3 次非阻塞后台检查（每次间隔至少 1 分钟）；不要等待或循环至链接过期。授权后脚本自动绑定身份。失效则重新执行 connect-start 发新链接。
4. 绑定后运行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs sync idle ""` 验证。失败就如实报告，不要用测试报告覆盖正式数据。

## 三、Claude Code 自动接入（钩子）

前置条件：先完成第二节「首次接入」（钩子要用的 profile 已绑定身份）。装好后开始/进行/结束全自动上报，不需要你记得汇报。

### 装法

```bash
node ~/.agents/skills/soda-agent-workspace/soda-hook.mjs install                          # 只打印配置片段
node ~/.agents/skills/soda-agent-workspace/soda-hook.mjs install --write                 # 征得本人同意后写入
node ~/.agents/skills/soda-agent-workspace/soda-hook.mjs install --write --profile samantha
```

- 建议用安装到技能目录后的脚本执行 install：钩子 command 会固化脚本当前的绝对路径。
- 不带 `--profile` 时，若 `~/.config/soda-agent-sync/profiles/` 下恰好只有一个已接入的 profile 会自动选用，否则报错并列出可选项，需 `--profile <名字>` 指定。
- install 会把 profile 名写入 `~/.config/soda-agent-sync/hook-profile`（单行），钩子运行时据此确定身份，settings.json 里不用内嵌环境变量。
- `--write` 时先备份 `~/.claude/settings.json`（复制为 `settings.json.soda-bak-<时间戳>`），再把三个钩子合并进 hooks 字段：已有其他 hook 配置全部保留，UserPromptSubmit / PostToolUse / Stop 三个键逐键追加，相同 command 已存在则跳过；写入后下次会话生效。
- **授权纪律（本技能自己的红线）：改写 settings.json 属于修改宿主配置，必须先向本人说明并征得同意。** 不带 `--write` 时只打印片段和提示，绝不动文件；settings.json 不是合法 JSON 时直接中止，不做任何修改。

合并进 settings.json 的片段长这样（command 指向本机 soda-hook.mjs 绝对路径）：

```json
{
  "hooks": {
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node \"<soda-hook.mjs 绝对路径>\"" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node \"<soda-hook.mjs 绝对路径>\"" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node \"<soda-hook.mjs 绝对路径>\"" }] }]
  }
}
```

### 三个钩子各自做什么

| 钩子 | 触发时机 | 动作 |
|---|---|---|
| UserPromptSubmit | 用户发出新指令 | prompt 首行（≤80 字符）当任务标签；写 current_task；发 start 事件（detail=会话新任务），节流 ≥60 秒一条 |
| PostToolUse | 每次工具调用后 | 工具名 + 摘要当标签（总长 ≤200 字符）；每次都写 current_task；发 cmd 事件（detail=工具调用 x累计次数），节流 ≥90 秒一条；顺带 ping working，节流 ≥120 秒一次 |
| Stop（SessionEnd 同样处理） | 回合结束 | 读 current_task，有内容则发 end 事件（detail=回合结束）；删 current_task；发 ping idle——回合边界不节流 |

节流参数：start ≥60 秒、cmd ≥90 秒、ping working ≥120 秒；节流状态存 `<profile>/hook-state.json`，先落状态再发送（超时可能已送达，宁可少发不可重发）。其他 hook 事件一律忽略。

### 隐私与容错

- 发送前客户端脱敏：`--token` / `--key` / `--password` 等参数值、`sk-` / `pk-` / `ghp_` / `xoxb` 前缀、KEY/TOKEN/PASSWORD 形态的值都替换成 `***`；服务端入库前还会兜底涂改一次。
- 网络失败绝不自动重试（服务端 nonce 防重放，超时可能已送达）；每次请求 8 秒超时。
- 任何失败都不打断会话：退出码恒为 0，错误追加到 `<profile>/hook-errors.log`（超 50 行截断保留末 50 行）。
- profile 解析顺序（全部静默，找不到就退出，绝不报错）：环境变量 `SODA_AGENT_PROFILE` → `hook-profile` 文件 → profiles/ 下唯一目录；profile 缺 config.json 或 private.pem（未接入）也静默退出。

### 排错

```bash
node ~/.agents/skills/soda-agent-workspace/soda-hook.mjs status
```

显示 profile 及其来源、agentId、三个节流窗口的上次发送时间、待上报工具调用累计、最近任务、current_task 内容、hook-errors.log 末 5 行。仍不清楚时加 `SODA_HOOK_DEBUG=1` 看 stderr 调试信息；`SODA_BASE` 可改服务地址。

## 四、其他平台自动化（autopilot 与 soda-task）

前置条件：**先完成第二节「首次接入」**——autopilot 启动时检查 profile 已接入（缺 config.json 直接报错退出），并依赖同目录的 soda-ping.mjs（第一节安装已到位）。跨平台，Node 即可，不需要 bash。

### autopilot：一条命令开启后台心跳

```bash
SODA_AGENT_PROFILE=<profile> node ~/.agents/skills/soda-agent-workspace/soda-autopilot.mjs start          # 默认每 300 秒
SODA_AGENT_PROFILE=<profile> node ~/.agents/skills/soda-agent-workspace/soda-autopilot.mjs start 120      # 自定义间隔秒（最小 30）
SODA_AGENT_PROFILE=<profile> node ~/.agents/skills/soda-agent-workspace/soda-autopilot.mjs status
SODA_AGENT_PROFILE=<profile> node ~/.agents/skills/soda-agent-workspace/soda-autopilot.mjs stop
```

- start 把循环进程 detach 到后台，父进程立刻返回；已在运行则直接报 PID，不重复启动。日志在 `<profile>/autopilot.log`，PID 在 `<profile>/autopilot.pid`。
- 每一跳读 current_task：有内容就 ping working（任务名），空就 ping idle——**不再消耗你的 token，也不需要你记得上报**。
- status 显示心跳间隔、current_task 内容、守护进程 PID 和最近心跳日志；stop 结束守护进程。
- 可靠性：ping 连续 ≥5 次失败时自动用 soda-event 发一条 error 告警（task 名固定 `autopilot`，30 分钟内最多一次）；守护进程没有开机自启，机器重启后需要重新 start。

### soda-task.sh：给任意命令包一层事件（需 bash，Windows 用 git-bash）

```bash
SODA_AGENT_PROFILE=<profile> bash ~/.agents/skills/soda-agent-workspace/soda-task.sh "构建前端" npm run build
```

- 命令开始：写 current_task（任务名前 80 字节，保证合法 UTF-8），发 start 事件（detail 含命令前 200 字符）。
- 命令结束：退出码 0 发 end（detail=退出码 + 输出末 5 行的截断摘要），非 0 额外发 error；随后删 current_task。命令输出照常透传，退出码原样返回。
- 事件发送失败只忽略，不影响命令执行；输出末行会进事件 detail，别用它包装会回显密钥的命令（服务端会兜底涂敏，但别依赖）。
- `SODA_AGENT_PROFILE` 未设置时跳过 current_task 这层，事件照常发。

### current_task 生命周期

文件位置 `~/.config/soda-agent-sync/profiles/<profile>/current_task`，原子写（tmp + rename），一行任务标签：

| 动作 | 谁来做 |
|---|---|
| 写入（working 标签） | soda-hook（UserPromptSubmit / PostToolUse）、soda-task.sh（命令开始）、客户端脚本（sync working 成功后） |
| 删除 | soda-hook（Stop / SessionEnd）、soda-task.sh（命令结束）、客户端脚本（sync idle / done / blocked 成功后——**blocked 也清理**，否则 autopilot 下一跳会把「需支持」覆盖回 working） |
| 读取 | soda-autopilot（每一跳） |

注意：current_task 是 profile 级的单文件状态，不区分会话。**同一 profile 不要同时跑多个会话钩子或多条 soda-task.sh**——一个会话 Stop 会清掉另一个会话刚写的任务标签。多任务并行请给每个任务用独立 profile。

### 三层分工

| 你要的 | 怎么做 | 延迟 | 成本 |
|---|---|---|---|
| 看板知道我还在 | autopilot start（或 Claude Code 装钩子） | ≤1 个心跳间隔 | 0 token，一次 UPDATE |
| 看板知道我在做什么 | 钩子 / soda-task.sh 发事件 | 秒级 | 0 token，两条事件 |
| 记录任务成果 | soda-agent.mjs sync done | 秒级 | 一次调用（要写成果时才用） |

日常装一次 autopilot（或钩子）就够了；sync done 只在任务完成时用。**不要**把心跳写成 `sync`——那会每次生成一条工作记录，跑两小时就是 24 条噪音。

## 五、状态与工作

**每完成一个任务必须上报，这是收尾动作，不是可选项。**

任务做完的固定动作是 `sync done`，带两句：任务名 + 一句话成果。成果要能被核对——有数字写数字，有链接写链接，有交付物写交付物。

```bash
SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs sync done "整理汇报" "已整理并核对一份周报"
```

### 收尾三问（答不上就不要报完成）

1. **做成了什么** —— 一句话，动词开头
2. **怎么证明** —— 数字、链接、文件、可复核的结果，至少一个
3. **还差什么** —— 有就写进同一句成果里，不要藏

三问都答不上，说明任务没做完：报 `blocked` 或继续 `working`，不要报 `done`。

### 什么时候报

| 时机 | 上报内容 |
|---|---|
| 开始做一件被授权的事 | `working` + 一句话任务 |
| **任务做完** | **`done` + 一句话成果（必须）** |
| 卡住、缺权限、缺信息 | `blocked` + 卡在哪、需要谁 |
| 长任务拆成多个可交付单元 | 每个单元是一行：各自一个任务名，各报一次 |
| 手上没有任务 | `idle`；不要为了留下记录而编造工作 |

「在忙什么」的过程粒度走第六节实时事件，「还活着」走第七节心跳或第三、四节自动化，别把它们写成 sync。

### 长任务要心跳

看板根据「最后一次上报距今多久」判断你还在不在工作：

| 距上次上报 | 看板显示 |
|---|---|
| ≤ 10 分钟 | 在线 |
| 10–60 分钟 | N 分钟前 |
| 1–24 小时 | N 小时前 |
| > 24 小时 | 状态未更新 |

所以**跑超过 10 分钟的任务**，每 10–15 分钟再报一次活动（ping 同一个任务名，或事件 step）。装了钩子或 autopilot 的 Agent 这一层自动满足。否则看板会显示你「N 分钟前」，看起来像是停下来了。

任务做完立刻报 `done`，不要等下一次被调用。

### 同一个任务用同一个名字

`done` 记的是**任务**，不是流水账：任务名相同就覆盖上一条，最后留下的是这条任务的最新完成摘要。

- 任务名要稳定、具体，例如「宁波银行验收测试」「10 月月报归档」
- 同一件事有进展就再报一次，**用完全相同的任务名**，摘要换成新版本——看板上仍是这一条，只是内容更新
- 不要把同一件事拆成「开始做 A」「继续做 A」「完成 A」三条：看板只保留每个任务的最新一条，前面的会被覆盖，等于白写
- 不同任务用不同名字，才会各占一行

摘要写「做成了什么 + 怎么证明」，不写过程。看板展示的是任务清单，不是一个滚动日志。

**不允许静默跳过。** 上报失败时脚本会把内容存成本机 Markdown 并返回退出码 2，你必须在回复里说明「已本地保存、远端未确认」，不能当作已上报。也不要在同一件事上重复添加相同摘要——先查再报。

只上报真实、经授权的概括，不上传密码、私钥、Token、原始对话、客户机密、代码全文或敏感个人资料。需隐去项目名称时使用通用描述。

如运行平台支持任务钩子或定时触发，经本人授权后接入（Claude Code 用第三节，其他平台用第四节）；否则如实说明只能在被调用时上报，不能宣称全天自动监控。不要擅自安装后台服务或改动平台配置——改 settings.json 前必须征得本人同意。超过 24 小时没上报显示「状态未更新」，不等于断线。请求失败不得说已同步。不要越权修改其他人的 Agent、报告或系统权限。

### 网络优先，本地回退

- 上报先调用同步接口。每次网络请求最多等待 8 秒、不自动重试；网络错误、超时、未接入或权限失败时，脚本将当前状态和摘要保存为本机 `~/.config/soda-agent-sync/profiles/<profile>/pending/` 下的 Markdown，并以退出码 2 提示「同步未确认」。不是看板已更新。
- 上报超时可能已写入；不要自动重发摘要以免产生重复记录。恢复连接后先核对看板，再决定是否补传。不要把 MD 文件里的敏感信息发到不适当的聊天或共享目录。目录权限 700，文件权限 600；如本地保存失败，明确告知且保留原始内容。
- 只有状态变化或实际摘要需要上报；不要为每次心跳创建重复的工作摘要。不能连接或未授权时不持续轮询、不阻塞用户的其他工作。

### 所属员工的目标与计划

只在员工明确要求维护自己的目标或计划时操作；本接口只允许此 Agent 更新所属员工，不能修改其他人的目标或公司权限。目标、进度、状态、时间必须来自员工提供的事实，不推断百分比或编造完成状态。

1. 先执行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs goal-list` 读取已有目标。匹配目标不唯一时询问员工。更新已有目标使用其 ID 和最新 version。
2. 新目标执行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs goal-id` 自动生成稳定 ID；同一目标始终沿用该 ID。把完整 JSON 写入仅本人可读的临时文件。例如：

```json
{"id":"g_由goal-id命令生成的20位十六进制字符","version":0,"title":"员工明确的目标","level":"周目标","cycle":"2026-W45","status":"进行中","progress":0,"note":"员工明确的计划或说明"}
```

`level` 仅支持 `周目标`、`月度计划`；`cycle` 必填，周目标格式 `YYYY-Www`，月度计划格式 `YYYY-MM`，必须是员工确认的周期，示例不能照搬；`status` 为 `进行中`、`达成`、`未达成`、`延期` 或 `已放弃`；`progress` 必须是 0–100 的数字，未知先向员工确认（不要以示例的 0 当作事实）；`note` 为字符串。新建 version 为 0；更新使用最新版本和完整内容。不要把不同周期的目标合并或擅自改写。
3. 执行 `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs goal-write <JSON文件路径>`，再 `goal-list` 回读核对。若接口或回读失败，保留 Markdown 或原稿并说明尚未确认；不要盲目重试。目标与记录已有相同内容时，先检查，更新需基于最新版本。

### 手动上传离线文件

接口失败后生成的待同步 Markdown 可由授权用户登录 Soda AI Studio，进入「团队看板」→「导入 Markdown」，选择文件并确认归属，预览后确认导入。系统不会自动覆盖已有报告或重复创建相同目标；工作记录标注“手动导入”，不改变 Agent 实时状态。不要让用户上传私钥或完整聊天记录。导入前先核对远端是否已收到；上传不成功或存在冲突时保留文件并说明，不宣称已同步。

## 六、实时事件

状态只说明「你在忙」，事件能说明「忙到哪一步」。事件与服务端状态上报合并显示在看板「实时」里，保留 7 天——事件是过程粒度，不是档案。

### 单条上报

```bash
SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-event.mjs start "任务名" "开始执行：<一句话>"
SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-event.mjs step  "任务名" "第 2 步：<一句话进度>"
SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-event.mjs end   "任务名" "完成：<结果>"
```

### 批量上报（--batch）

从 stdin 读 NDJSON，每行一个 JSON 对象；最多 100 条（超出只报前 100 条），超过 16000 字节会自动切成多次签名上报（服务端单请求体上限 20000 字节）：

```bash
cat events.ndjson | SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-event.mjs --batch
```

输入示例（每行一个对象，kind 必填）：

```json
{"kind":"start","task":"数据清洗","detail":"开始处理 10 月明细"}
{"kind":"step","task":"数据清洗","detail":"去重完成，剩 1200 行"}
```

### kind 一览

| kind | 用途 |
|---|---|
| `start` | 任务开始 |
| `step` | 关键步骤推进 |
| `cmd` | 命令 / 工具调用（钩子与 soda-task.sh 用） |
| `end` | 任务完成 |
| `blocked` | 受阻：卡在哪、需要谁 |
| `error` | 失败：命令报错、心跳连续失败告警等 |
| `note` | 备注说明 |

### 服务端约束与纪律

- **限流：每 Agent 每分钟最多 30 条**，超出的直接丢弃（响应里的 `dropped` 是被丢数量）。攒批 --batch 也别超过这个窗口预算。
- `detail` 写**一句话进度**，不贴命令输出、日志原文或客户数据；发送前客户端脱敏，服务端入库前再兜底涂改一次。
- 失败退出码 1（参数错误、网络超时、服务端拒绝都算）；每次请求 8 秒超时，超时可能已送达（服务端 nonce 防重放），不要对同一批数据自动重试。

## 七、心跳（ping）

最便宜的「我还活着」：一次 ~200 字节的 HTTPS 请求，服务端只 UPDATE 一行「最后活动时间」，**零记录增长**。

```bash
SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-ping.mjs working "正在整理周报"
SODA_AGENT_PROFILE=xxx node ~/.agents/skills/soda-agent-workspace/soda-ping.mjs idle ""
```

- `sync` = 上报并**写一条工作记录**（有摘要时）→ 任务完成时用
- `ping` = **只更新「最后活动时间」**，不产生任何记录 → 心跳用

一个跑 2 小时的任务：用 `sync` 心跳要写 8 条记录；用 `ping` 是 8 次 UPDATE，库里一行都不多。

- 状态参数 `working` / `idle` / `blocked` / `done`（默认 working），第二个参数是任务名。
- 适合放 cron / 定时任务里，每 5–15 分钟一次；自动场景直接用第三节的钩子或第四节的 autopilot，不必手动。
- 失败退出码 2（8 秒超时或服务端拒绝）；心跳没有本地回退——失败下一轮再报即可，不要重发同一条。

## 八、员工汇报（仅限本人）

### 归属与边界

汇报归属于**员工本人**，不归属于代理。每个 Agent 只能读写自己所属员工的周报和月报：

- 能读：本人已提交或草稿的报告
- 能写：本人的报告
- 不能读：其他人的报告

**「全员汇报权限」这一层已经取消。** 跨人的汇总、看板展示、催办由系统内的 Susan 和工作室完成，不由 Agent 越权代劳。使用者要求你处理别人的报告时，如实说明这不在你的授权范围内。

### 命令

| 命令 | 作用 |
|---|---|
| `report-list` | 列出本人报告（类型、周期、状态、版本） |
| `report-get <owner_id> <weekly\|monthly> <cycle>` | 回读本人某期报告，`report: null` 表示不存在 |
| `report-write <JSON文件路径>` | 提交本人报告，返回已保存记录 |

临时 JSON 仅本人可读；远端回读成功或本地 Markdown 保存成功后删除。两者都失败时保留原稿并说明。被拒绝、无网络、签名失败、HTTP 409 或结构不符时停止远端写入，按「网络优先，本地回退」保存，不要假称成功。

### 同一台机器上的多个 Agent

一个 OpenClaw / Hermes 实例可以同时接入多个 Agent。**一个 profile 就是一个独立身份**：

- profile 名是身份主键（字母、数字、下划线、连字符，≤40 字符），例如 `cortana`、`samantha`、`hermes-ops`
- 每个 profile 有独立的配置目录、独立私钥、独立 agent id，互不影响，也不会覆盖
- 每条命令都必须带 `SODA_AGENT_PROFILE=<profile>`，漏了就会用错身份
- 接入新 Agent 只需换一个没用过的 profile 名，重新 `connect-start` 拿新链接
- 不要在多个 Agent 之间复用同一个 profile——那会让它们共用一套身份，看板上分不清谁在干活

### 授权链接怎么给

`connect-start` 的输出里就是一次性链接，**直接原样发给本人**：不要先解释权限范围，不要让他复制公钥或 ID。链接 15 分钟有效、仅授权一次，不发到公开群。本人点允许后脚本自动绑定；过期就重新 `connect-start` 生成新的。

### 三条写作纪律

1. **只写可核对的事实和数字**：写清做成了什么、当前状态、关键结果或可验证的下一步；有数字时使用真实数字和单位，不编数字、不写“做了很多事”等空话。计划、预计和风险必须标为计划、预计或风险，不能写成已完成。
2. **报喜也报忧**：成果、风险和所需援助放在同一份报告；说明问题、影响以及需要谁提供什么支持（仅在已知时）。没有风险或援助必须由员工明确确认，不能把未知写成“无”。
3. **一页纸优先**：删除过程流水、重复描述和与决策无关的细节。按项目提炼老板最需要知道的 1–3 点；如果必要的风险或决策信息放不下一页，优先保留关键信息，不为凑篇幅而丢失重要事实。

### 输入和整理

1. 明确汇报人、周报或月报、周期（周 `YYYY-Www`，月 `YYYY-MM`）及提交意图。对于“10 月”，先确认年份；不要依靠示例值推断。按当前环境的时区确定相对周期，不能确定时询问。
2. 优先使用员工已经在当前授权对话中提供的内容，不重复追问已说明的部分。必要时在授权范围内检索本人之前的汇报；不能读取时请员工补发，不编造成果、数字、日期、链接、人名或承诺。
3. 按项目提炼最重要的 1–3 点，区分完成、进行中、风险、下一步和需要的支持；保持原意。比如“已发起签字”不等于“已签字”，“构思中”不等于“方案已完成”。有歧义时确认。缺少的关键信息集中询问，不能把未知写成“无”。
4. 保留以下字段名，字段值均为字符串；同一字段多个要点使用换行编号。
   - 周报：`本周目标达成`、`本周结果`、`本周风险`、`下周目标`、`预期结果`、`潜在风险`、`所需援助`。按照已有汇报规范七项必填；仅风险和所需援助在员工明确确认没有时可写“无”。
   - 月报：`本月达成目标`、`关键成果及链接`、`Lesson Learned`、`能力成长`、`产品建议`、`市场洞察`、`开放项`、`下月计划`。交接规范要求前三项必填；其余按实际有依据的信息填写。不虚构链接；没有提供的内容询问，不默认填“无”。
5. **给员工和老板看的预览**以三块呈现：① 本周成果（事实、数字和状态）；② 风险与需要的支持；③ 下周计划与预期结果。月报对应“本月成果、复盘与待解决事项、下月计划与建议”。不把风险或援助藏到另一份报告。员工明确发送汇报用于提交，且身份、周期和必填事实清晰时，可按公司的既定流程直接提交新记录，提交后向员工发送完整整理稿与回读结果；不要为日常新汇报每次额外要求确认。若提交意图、归属、周期、关键事实有歧义，或涉及已有记录覆盖，先展示草稿和差异并确认；员工要求调整时修改并重新确认。不能把普通聊天、讨论或未经授权的第三方内容当作提交指令。
6. 三块是阅读布局，不是接口字段变更。写入时仍按上述原有字段名完整映射；相同事实不用在多个字段重复堆砌，但每个必填字段仍要准确填写、必要时询问。不要为了精简丢掉已确认的风险、支持、关键数字或其他必要事实。不得把沟通完成误说成已经归档。

### 本地回退（接口优先，不阻塞）

- 优先尝试接口；脚本每次请求最多等待 8 秒，失败不自动重试，不持续轮询。接口不可达、未授权、查人或读取失败、写入失败、409 冲突、响应无效或回读无法确认时，立即停止远端操作，保存本地 Markdown，继续其他工作并告知“仅本地保存/同步未确认”，不能称为已提交。
- `report-write` 失败时脚本自动保存完整 `fields` 至本机私有 `~/.config/soda-agent-sync/profiles/<profile>/pending/`；退出码 2 代表本地保存、远端未确认。若在查人、读取、整理或回读阶段失败，用以下命令手动保存现有整理稿：
  `SODA_AGENT_PROFILE=cortana node ~/.config/soda-agent-sync/bin/soda-agent.mjs save-local-report <JSON文件路径>`
  JSON 格式如 `{"ownerName":"员工已确认姓名","kind":"weekly","cycle":"YYYY-Www","status":"草稿","fields":{"本周结果":"已知事实"}}`。仅填已知信息；未明确的归属、周期或内容标注待确认，不凭空编造 ID。准备文件时使用仅本人可读的临时文件。若已发出写入但回读失败，MD 中注明结果未知；若脚本已自动保存，不要再重复创建同一份文件。
- 本地文件权限 600、目录权限 700，不放公开或共享目录。返回文件路径和未同步状态即可，不泄露报告正文。若连本地保存也失败，明确告知并保留原始内容，不声称已存档。
- 可让授权用户在 Soda AI Studio「团队看板」→「导入 Markdown」选择该文件，确认归属并预览后导入。已有同周期报告不会被覆盖；有冲突时保留文件并先核对。工作记录的手动导入不改变实时状态。
- 网络恢复后须先重新核实员工、周期及远端记录；超时可能已成功，先比较再决定是否提交。已有记录覆盖须明确同意，重新读取版本；禁止拿旧版本自动重发或跳过权限要求。仅在远端回读一致后标记已同步，并由 Agent 安全处理本地草稿。不得把 Markdown 存档当成看板提交。

### 写入契约与防覆盖

以下根据 2026-11-07 线上 `server.js`、`lib/store.js` 和 `lib/db.js` 核对；服务变更后需重新核验。它们接受 JSON，通过唯一键 `owner + kind + cycle` 保存；`fields` 是**整体替换**而非局部合并。

1. owner 固定为本人：签名身份直接用自己绑定的员工 id，运行 `report-get <本人id> <weekly|monthly> <cycle>` 检查同键记录；不要用 `report-people` 跨人查询。兼容账号身份可用认证后的 `GET /api/data`，确认 `loggedIn: true` 且 `people`、`reports` 均为数组。匹配不到或多人同名先询问；不要把代理当成汇报人。查询失败或数据不完整时停止远端提交，并按“本地回退”保存已有整理稿，不要虚构 owner。
2. 如已有记录，展示现有状态和变更差异，明确询问是否覆盖，保留所有用户要求保留的字段，构造完整 `fields`。未获同意不得覆盖、清空或把已提交降级为草稿。用最近回读的 `version` 作为写入版本；没有有效版本则停止。
3. 如不存在记录，本版 SQLite 首次插入版本为 1，提交时显式传 `version: 0`：该实现仅在不存在时新建；如果读取后别处先创建了同键记录，则返回版本冲突而不是覆盖。这个行为已对当前代码做隔离测试，但不是正式公开的创建条件接口；一旦服务实现或版本规则变化，必须重验，不能盲目沿用。每次提交前重新读取。
4. 签名身份将以下完整 JSON 安全写入临时文件后执行 `report-write <文件路径>`；兼容账号身份向 `POST /api/reports` 发送同一 JSON：

```json
{
  "owner": "从 people 精确匹配得到的员工 id",
  "kind": "monthly",
  "cycle": "2026-10",
  "fields": {
    "本月达成目标": "员工提供的内容",
    "关键成果及链接": "员工提供的内容",
    "Lesson Learned": "员工提供的内容"
  },
  "status": "已提交",
  "version": 0
}
```

上述是格式示例，不是真实报告；其他已确认的月报字段也放入 `fields`。周报时 `kind` 必须为 `weekly`，月报为 `monthly`；不要拼错，否则服务会按周报处理。保存草稿仅在员工明确要求时使用 `status: "草稿"`，正式提交使用 `"已提交"`。更新已有记录时 `version` 改为读取到的版本，而非 0。
5. 收到 HTTP 409 / `VERSION_CONFLICT` 时立即本地保存，恢复后重新读取、展示变化并征求新确认，不自动重试覆盖。超时或结果不明先本地保存，恢复后再回读；不要盲目重发。
6. 接口返回 `ok: true` 之后，再通过签名身份调用 `report-get owner kind cycle`（兼容账号身份则认证后查询 `GET /api/data`），核对唯一记录的状态及所有写入字段与拟提交稿一致。只有回读一致才回复“已提交并核对”，同时说明员工、周期和查看位置；否则保存本地 Markdown，说“未能确认”并说明原因。不得将汇报写入说成已自动生成目标。

### 查询与团队汇总

- 查询报告时按员工、类型、周期精确匹配，注明状态；只有成功、完整地读取后才能说“未找到”。`placeholder` 目标是示例，不当作真实目标；上下文接口若截断不能证明记录不存在。
- Cortana 后续为多名员工处理时，逐人核实提交意图和身份、逐条检查和写入，逐条回读；记录每人的成功、冲突或失败，不能把部分成功说成全部完成。团队汇总只依据有权查看且逐人按周期回读的记录，按已完成、下步、风险与所需支持汇总，不把不同人的内容合并到某个员工的报告里。
- 目前已核验的存档对象是每人的周报或月报；没有确认独立的“团队汇总归档”接口，不能声称汇总本身已被另存。用户若需要团队汇总独立存档，应先确认目标位置与接口。

### 运行环境与自动触发

安装 Skill 只提供流程，不会自动创建消息订阅、定时任务或权限。Cortana 需由其运行环境配置为接收员工主动发送的汇报，且账号需有适当写入权限。若运行环境未提供触发器、身份或 HTTPS 网络访问，明确告知不能自动运行，不假装已安装或已提交。不要自行公开收集消息或越权读取。

## 九、客户端脚本（全文）

以下为 soda-agent.mjs 客户端脚本全文，即本文档第一个 javascript 代码块——setup.mjs 与服务端 self-update 都从这里提取：

```javascript
#!/usr/bin/env node
import {generateKeyPairSync,createPrivateKey,createPublicKey,sign,randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const profile=process.env.SODA_AGENT_PROFILE||'';if(profile&&!/^[A-Za-z0-9_-]{1,40}$/.test(profile)){console.error('SODA_AGENT_PROFILE 无效');process.exit(1)}
const root=path.join(os.homedir(),'.config','soda-agent-sync');const home=profile?path.join(root,'profiles',profile):root;const priv=path.join(home,'private.pem');const config=path.join(home,'config.json');
const [cmd,...arg]=process.argv.slice(2);function die(s){throw new Error(s)}
function readConfig(){return fs.existsSync(config)?JSON.parse(fs.readFileSync(config,'utf8')):{}}
function saveConfig(o){fs.mkdirSync(home,{recursive:true,mode:0o700});const tmp=config+'.tmp-'+randomBytes(5).toString('hex');fs.writeFileSync(tmp,JSON.stringify(o)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(tmp,config)}
function ensureKey(){fs.mkdirSync(home,{recursive:true,mode:0o700});if(!fs.existsSync(priv)){const {privateKey}=generateKeyPairSync('ed25519');fs.writeFileSync(priv,privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});}return createPrivateKey(fs.readFileSync(priv));}
const testBase=process.env.SODA_TEST_BASE_URL;if(testBase && !/^http:\/\/127\.0\.0\.1:\d+$/.test(testBase))die('测试地址仅限本地');const base=testBase||'https://soda-ai-studio.ai-soda.com';
async function post(endpoint,values,headers={}){
 let r;try{r=await fetch(base+endpoint,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(values),signal:AbortSignal.timeout(8000)});}catch(e){throw new Error('连接失败或超时，提交结果可能未知');}
 let result;try{result=await r.json()}catch(e){throw new Error('接口响应无效，提交结果可能未知')}
 if(!r.ok||!result.ok)throw new Error('接口请求失败（HTTP '+r.status+'）：'+String(result.error||r.status).slice(0,200));return result;
}
function localSave(type,values,reason){
 const dir=path.join(home,'pending');fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.chmodSync(dir,0o700);
 const id=new Date().toISOString().replace(/[:.]/g,'-')+'-'+randomBytes(6).toString('hex'),file=path.join(dir,id+'.md');
 const clean=s=>String(s??'未提供').replace(/[\r\n]/g,' ').slice(0,500);
 let content='# 待同步'+(type==='report'?'报告':type==='goal'?'目标':'工作记录')+'\n\n- 保存时间：'+new Date().toISOString()+'\n- 状态：仅保存在本机；网络写入结果未确认\n- 原因：'+clean(reason)+'\n';
 if(type==='report'){
  content+='- 汇报人：'+clean(values.ownerName||values.owner)+'\n- 类型：'+clean(values.kind)+'\n- 周期：'+clean(values.cycle)+'\n- 提交状态：'+clean(values.status)+'\n';
  content+='\n> 同步前重新核对人员和周期并回读服务端；超时可能已写入。已有记录先比较，覆盖需明确同意；不要复用旧版本号或盲目重发。\n';
  const fields=values.fields&&typeof values.fields==='object'&&!Array.isArray(values.fields)?values.fields:{};
  for(const [k,v] of Object.entries(fields)){content+='\n## '+clean(k)+'\n\n'+String(v??'')+'\n';}
 }else if(type==='goal'){
  content+='- 汇报人：'+clean(values.ownerName||values.owner)+'\n- 目标 ID：'+clean(values.id)+'\n- 目标名称：'+clean(values.title)+'\n- 目标周期：'+clean(values.cycle)+'\n- 目标类型：'+clean(values.level)+'\n- 目标状态：'+clean(values.status)+'\n- 进度：'+clean(values.progress)+'\n\n## 目标说明\n\n'+String(values.note||'')+'\n\n> 同步结果未确认，请先核对看板；相同目标不会自动覆盖。\n';
 }else{
  const knownId=readConfig().id;content+='- Agent ID：'+clean(knownId)+'\n';
  content+='- 上报状态：'+clean(values.status)+'\n- 任务：'+clean(values.task)+'\n\n## 工作摘要\n\n'+String(values.summary||'（无新增摘要）')+'\n\n> 上报结果未知，重发前先核对看板，避免重复工作记录。\n';
 }
 fs.writeFileSync(file,content,{encoding:'utf8',mode:0o600,flag:'wx'});return file;
}
try {
if(cmd==='save-local-report'){
 if(!arg[0])die('需要包含报告内容的 JSON 文件路径');const values=JSON.parse(fs.readFileSync(arg[0],'utf8'));
 if(!values||typeof values!=='object'||Array.isArray(values)||!values.fields||typeof values.fields!=='object'||Array.isArray(values.fields))die('报告内容无效：需提供 fields 对象');
 const file=localSave('report',values,'接口不可用、无权限或回读未确认');console.log('仅本地保存，尚未确认同步：'+file);
}else if(cmd==='connect-start'){
 const name=(arg[0]||'').trim(),platform=(arg[1]||'').trim(),wantsReport=arg[2]==='report';if(!name||!platform||arg[2]&&!wantsReport)die('用法：connect-start "Agent 名称" "类型" [report]');
 const old=readConfig();if(old.id){console.log('此身份已连接，无需再次授权。');process.exit(0)}
 if(old.pending && Date.parse(old.pending.expiresAt)>Date.now() && (old.pending.name!==name || old.pending.platform!==platform || old.pending.wantsReport!==wantsReport))die('已有待授权请求，名称、类型或权限与本次不一致；请等待到期后重试。');
 if(old.pending && Date.parse(old.pending.expiresAt)>Date.now()){console.log('请将此一次性授权链接发给本人（15分钟内有效）：\n'+base+'/#connect='+old.pending.id+'.'+old.pending.secret);process.exit(0)}
 const key=ensureKey(),pub=createPublicKey(key).export({type:'spki',format:'pem'});const r=await post('/api/agent-connect/start',{name,platform,publicKey:pub,wantsReport});saveConfig({pending:{id:r.id,secret:r.secret,expiresAt:r.expiresAt,name,platform,wantsReport}});console.log('请将此一次性授权链接发给本人（15分钟内有效）：\n'+base+'/#connect='+r.id+'.'+r.secret);
}else if(cmd==='connect-check'){
 const c=readConfig();if(c.id){console.log('已接入，无需重新授权。');process.exit(0)}if(!c.pending||!fs.existsSync(priv))die('请先执行 connect-start');const p=c.pending,key=createPrivateKey(fs.readFileSync(priv)),signature=sign(null,Buffer.from(`SODA-ENROLL-STATUS-V1\n${p.id}\n${p.secret}`),key).toString('base64url');const r=await post('/api/agent-connect/status',{id:p.id,secret:p.secret,signature});
 if(r.status==='pending')console.log('等待本人授权');else if(r.status==='approved'){saveConfig({id:r.id});console.log('已自动绑定。'+(r.reportAccess?'已获全员汇报权限。':''))}else die('接入状态未知');
}else if(cmd==='goal-id'){
 console.log('g_'+randomBytes(10).toString('hex'));
}else if(cmd==='init'){
 if(fs.existsSync(priv))die('身份已存在；未覆盖。请用 public 查看公钥。');const key=ensureKey();console.log('公钥：\n'+createPublicKey(key).export({type:'spki',format:'pem'}));
}else if(cmd==='public'){
 if(!fs.existsSync(priv))die('请先 init');console.log(createPublicKey(createPrivateKey(fs.readFileSync(priv))).export({type:'spki',format:'pem'}));
}else if(cmd==='bind'){
 if(!/^as_[a-f0-9]{24}$/.test(arg[0]||''))die('Agent ID 无效');if(!fs.existsSync(priv))die('请先 init');if(readConfig().id)die('已有绑定，未覆盖');saveConfig({id:arg[0]});console.log('已绑定 Agent ID');
}else if(['sync','report-people','report-get','report-write','report-list','report-summary-write','report-delete','goal-list','goal-write','handoff-inbox','handoff-claim','self-update'].includes(cmd)){
 const {id}=readConfig();let purpose,values;if(cmd==='self-update'){purpose='skill-bundle';values={slug:arg[0]||'soda-agent-workspace'};}
 if(cmd==='sync'){const status=arg[0],task=arg[1]||'',summary=arg[2]||'';if(!['working','idle','blocked','done'].includes(status))die('状态必须为 working、idle、blocked 或 done');if(status==='working'&&!task.trim())die('进行中需要任务');purpose='sync';values={status,task,summary};}
 else if(cmd==='goal-list'){purpose='goal-list';values={};}
 else if(cmd==='goal-write'){purpose='goal-write';if(!arg[0])die('需要 JSON 文件路径');values=JSON.parse(fs.readFileSync(arg[0],'utf8'));}
 else if(cmd==='report-delete'){if(arg.length!==6||arg[5]!=='--confirm'||!/^\d+$/.test(arg[4]||''))die('用法：report-delete <owner_id> <weekly|monthly> <cycle> <report_id> <version> --confirm');purpose='delete';values={owner:arg[0],kind:arg[1],cycle:arg[2],reportId:arg[3],version:Number(arg[4])};}
 else if(cmd==='report-list'){purpose='list';values={};}else if(cmd==='handoff-inbox'){purpose='handoff-inbox';values={};}else if(cmd==='handoff-claim'){purpose='handoff-claim';if(!arg[0])die('需要 handoff id');values={id:String(arg[0])};}else if(cmd==='report-summary-write'){purpose='summary-write';if(!arg[0])die('需要摘要 JSON 文件路径');values=JSON.parse(fs.readFileSync(arg[0],'utf8'));}else if(cmd==='report-people'){purpose='people';values={};}else if(cmd==='report-get'){purpose='get';values={owner:arg[0],kind:arg[1],cycle:arg[2]};}else if(cmd==='self-update'){}else{purpose='write';if(!arg[0])die('需要 JSON 文件路径');values=JSON.parse(fs.readFileSync(arg[0],'utf8'));}
 try {
 if(!id||!fs.existsSync(priv))die('请先完成一次授权接入');
 const payload=Buffer.from(JSON.stringify(values));const stamp=String(Date.now()),nonce=randomBytes(16).toString('hex'),digest=createHash('sha256').update(payload).digest('hex');const msg=`SODA-AGENT-SYNC-V2\n${purpose}\n${id}\n${stamp}\n${nonce}\n${digest}`;const signature=sign(null,Buffer.from(msg),createPrivateKey(fs.readFileSync(priv))).toString('base64url');
 const result=await post(purpose==='sync'?'/api/agent-sync':purpose.startsWith('goal-')?'/api/agent-goals/'+purpose.slice(5):purpose.startsWith('handoff-')?'/api/agent-handoff/'+purpose.slice(8):purpose==='skill-bundle'?'/api/agent-skills/bundle':'/api/agent-report/'+purpose,values,{'x-soda-agent':id,'x-soda-time':stamp,'x-soda-nonce':nonce,'x-soda-signature':signature});if(purpose==='sync'){try{const ct=path.join(home,'current_task');if(values.status==='working'){const tp=ct+'.tmp-'+randomBytes(5).toString('hex');fs.writeFileSync(tp,String(values.task).slice(0,200)+'\n');fs.renameSync(tp,ct);}else if(values.status==='idle'||values.status==='done'||values.status==='blocked'){fs.unlinkSync(ct);}}catch(e){if(e.code!=='ENOENT')console.error('current_task 维护失败：'+e.message)}console.log('已同步，服务端时间 '+result.lastSeen+(result.activitySaved?'，工作记录已保存':''));}else if(purpose==='skill-bundle'){
   const dirS=path.join(os.homedir(),'.agents','skills',result.slug||values.slug);let w=0;
   for(const f of (result.files||[])){const tp=path.join(dirS,f.path);
     if(!tp.startsWith(dirS))continue;fs.mkdirSync(path.dirname(tp),{recursive:true});fs.writeFileSync(tp,f.content);w++;}
   let selfMsg='';
   if(result.clientScript){const selfPath=path.join(root,'bin','soda-agent.mjs');
     fs.mkdirSync(path.dirname(selfPath),{recursive:true});fs.writeFileSync(selfPath,result.clientScript,{mode:0o600});selfMsg='，客户端脚本已更新：'+selfPath;}
   console.log('已更新 '+result.slug+' v'+result.version+'（'+w+' 个文件）→ '+dirS+selfMsg);
  }else console.log(JSON.stringify(result));
 } catch(e) {
  if(cmd==='sync'||cmd==='report-write'||cmd==='goal-write'){
   try{const file=localSave(cmd==='sync'?'activity':cmd==='goal-write'?'goal':'report',values,e.message);console.error('同步未确认，已保存至本机 Markdown：'+file+'；原因：'+e.message);process.exitCode=2;}
   catch(saveError){throw new Error('同步失败，且本地保存失败：'+saveError.message+'；原始原因：'+e.message);}
  }else throw e;
 }
}else die('用法：connect-start | connect-check | sync | goal-id | goal-list | goal-write | report-people | report-list | report-get | report-write | report-summary-write | report-delete | handoff-inbox | handoff-claim <id> | self-update [slug] | save-local-report');
} catch(e){console.error(e.message);process.exitCode=1;}
```

## v2.0.0 变更记录

| 变更 | 说明 |
|---|---|
| 新增 soda-hook.mjs | Claude Code 三钩子（UserPromptSubmit / PostToolUse / Stop）自动上报事件与心跳，客户端 + 服务端双层脱敏，任何失败不打断会话；install --write 写 settings.json 前必须征得本人同意 |
| 新增 setup.mjs 一键安装 | clone 后一条命令装齐技能目录与客户端脚本，取代手工复制 35KB 代码块；校验先行，失败不写半个文件 |
| 新增 soda-task.sh | 给任意命令包一层 start/end/error 事件与 current_task 生命周期（需 bash） |
| soda-event.mjs --batch | stdin 读 NDJSON 批量上报，每批最多 100 条 / 16000 字节，超限自动分批多次签名 |
| autopilot 修复 | 路径含空格不再崩（改用 fileURLToPath）；status 显示心跳间隔 / current_task / 守护进程与最近日志；ping 连续 ≥5 次失败自动发 error 告警（30 分钟至多一次） |
| 客户端脚本 sync 联动 current_task | sync working 成功后原子写入任务名（tmp+rename），sync idle / done / blocked 成功后删除（ENOENT 忽略，blocked 也清是为了不被 autopilot 回写成 working）；与钩子、soda-task.sh、autopilot 共享同一状态文件 |
| soda-ping / soda-event 超时对齐 | 统一 8 秒 AbortSignal 超时；event 失败退出码统一为 1（事件无本地回退） |
| 文档重构 | 安装步骤覆盖全部伴生脚本并给出文件清单；删除悬空引用；「零、autopilot 一条命令」并入第四章并标注前置条件（先完成接入） |
