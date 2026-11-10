#!/usr/bin/env bash
# 用一层包装器给任何命令加「实时事件」——不需要平台支持钩子。
#
#   SODA_AGENT_PROFILE=lemate soda-task.sh "整理周报" npm run build
#
# 会推送事件（脱敏由 soda-event.mjs 客户端负责）：
#   start  开始执行 <命令>
#   end    退出码 0：输出的最后 5 行
#   error  退出码非 0：尾部输出（与 end 二选一，失败时只发 error）
#
# 同时维护 current_task 生命周期（soda-autopilot 靠它区分 working / idle）：
#   命令开始          → 原子写入 ~/.config/soda-agent-sync/profiles/$SODA_AGENT_PROFILE/current_task（任务名前 80 字节，折合约 26 个汉字）
#   正常结束 / 出错   → 删除该文件
#   SODA_AGENT_PROFILE 未设置时跳过这层，事件照常发。
#
# 想连每条子命令都记（L3 全量追踪），在 bash 里加：
#   set -o functrace
#   trap 'soda_cmd "$BASH_COMMAND"' DEBUG
# 注意：DEBUG trap 会把所有展开后的命令都记下来，务必确认脱敏规则覆盖你的密钥形式。
set -uo pipefail

TASK="${1:?用法：soda-task.sh \"任务名\" <命令...>}"
shift
[ $# -ge 1 ] || { echo "没有要执行的命令" >&2; exit 1; }

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVENT=(node "$HERE/soda-event.mjs")  # 数组形式：路径含空格（如 Windows 用户目录）也不会被 IFS 拆开

# ---- current_task 生命周期（autopilot 每 N 秒读一次这个文件，有内容就报 working）----
PROFILE="${SODA_AGENT_PROFILE:-}"
CUR=""
if [ -n "$PROFILE" ]; then
  export SODA_AGENT_PROFILE
  CUR="$HOME/.config/soda-agent-sync/profiles/$PROFILE/current_task"
fi

mark_current() {
  [ -n "$CUR" ] || return 0
  mkdir -p "$(dirname "$CUR")" 2>/dev/null || return 0
  # 任务名截前 80 字节、换行压成空格；80 字节边界可能截半多字节字符，
  # 用 iconv 重编码丢掉残缺尾部，保证写出的始终是合法 UTF-8（iconv 缺席时退回原文）。
  local raw name
  raw="$(printf '%s' "$1" | head -c 80 | tr '\n\r' '  ')"
  name="$(printf '%s' "$raw" | iconv -f UTF-8 -t UTF-8 2>/dev/null || true)"
  [ -n "$name" ] || name="$raw"
  printf '%s' "$name" > "$CUR.tmp.$$" && mv -f "$CUR.tmp.$$" "$CUR" || true
}

clear_current() {
  [ -n "$CUR" ] || return 0
  rm -f "$CUR" "$CUR.tmp.$$" 2>/dev/null || true
}

send() { "$@" >/dev/null 2>&1 || true; }
CMD_DISPLAY="$*"

# 命令开始：先落任务名（autopilot 下一跳就能看到 working），再发 start 事件
mark_current "$TASK"
send "${EVENT[@]}" start "$TASK" "开始执行：${CMD_DISPLAY:0:200}"

OUT_FILE="$(mktemp)"
"$@" > >(tee "$OUT_FILE" >&2) 2> >(tee -a "$OUT_FILE" >&2)
CODE=$?

TAIL="$(tail -n 5 "$OUT_FILE" 2>/dev/null | tr '\n' ' ' | cut -c1-300)"
if [ "$CODE" -eq 0 ]; then
  send "${EVENT[@]}" end "$TASK" "完成（退出码 0）：${TAIL}"
else
  send "${EVENT[@]}" error "$TASK" "失败（退出码 $CODE）：${TAIL}"
fi
clear_current
rm -f "$OUT_FILE"
exit "$CODE"
