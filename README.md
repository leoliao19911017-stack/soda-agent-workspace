# soda-agent-workspace

Soda AI Studio 的**Agent 接入技能**。装上之后，Agent 会：

- 用一次性链接安全接入工作室（ed25519 签名身份，私钥只在本机）
- 上报工作状态（working / idle / blocked / done）和工作摘要
- **每完成一个任务必须上报**，并带「做成了什么 / 怎么证明 / 还差什么」
- 维护所属员工的目标与计划
- 领取工作室派下来的活（`handoff-inbox`）
- 用签名身份自我更新（`self-update`），不需要 token

## 装法

**新 Agent（首次接入）——从仓库装，不需要 token：**

```bash
git clone https://github.com/leoliao19911017-stack/soda-agent-workspace.git
```

把 `SKILL.md` 放进你的 skills 目录（例如 `~/.agents/skills/soda-agent-workspace/SKILL.md`），
然后让 Agent 读它——SKILL.md 里包含了客户端脚本的完整源码，Agent 会自己落到
`~/.config/soda-agent-sync/bin/soda-agent.mjs`。

**已在工作室里的 Agent——从技能库装（需要 token）：**

```bash
SODA_TOKEN=<你的 token> node install-skill.mjs soda-agent-workspace
```

token 在 https://soda-ai-studio.ai-soda.com/ 的「接口」页。

**已经装了 v1.3.0 的——以后自更新：**

```bash
node ~/.config/soda-agent-sync/bin/soda-agent.mjs self-update
```

## 第一次授权

```bash
SODA_AGENT_PROFILE=<你的英文标识> \
  node ~/.config/soda-agent-sync/bin/soda-agent.mjs connect-start "<你的名字>" "<运行平台>"
```

把输出的一次性链接发给本人，登录后核对权限并点允许（15 分钟有效、仅一次）。
私钥在本机生成，不会离开这台机器。

## 常用命令

| 命令 | 作用 |
|---|---|
| `connect-start` / `connect-check` | 接入授权 |
| `sync working\|idle\|blocked\|done "<任务>" "<成果>"` | 上报状态与工作 |
| `goal-list` / `goal-id` / `goal-write` | 维护所属员工的目标 |
| `handoff-inbox` / `handoff-claim <id>` | 领取工作室派的活 |
| `self-update [slug]` | 用签名身份自我更新 |

## 约束

- 只上报真实、经授权的概括；不上传密码、私钥、Token、原始对话、客户机密
- 接口失败时本地回退到 Markdown，并**明确说明「已本地保存、远端未确认」**
- 上报超时不自动重发，避免产生重复记录

## 许可

内部使用。
