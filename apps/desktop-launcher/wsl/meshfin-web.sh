#!/usr/bin/env bash
# ============================================================================
#  meshfin web -- the WSL side of the "Meshfin Web" desktop shortcut.
#
#  This script is the *lifetime owner* of the server. It runs in the foreground
#  of the console window opened by launch.cmd, so the window IS the lifetime:
#
#    * closing the browser window    -> dsh keeps running (nothing else changes)
#    * closing that console window   -> SIGHUP  -> trap -> dsh stops
#    * Ctrl+C in that console window -> SIGINT  -> trap -> dsh stops
#
#  The browser is opened by a background child that polls the port until the
#  server actually accepts connections, so it never lands on a dead page.
#
#  Environment / arguments:
#    --port N | --port=N    forwarded to `dsh web` and used for the port check
#    DSH_WEB_PORT=8080      port to use when no --port argument is given
#    DSH_WEB_NO_BROWSER=1   do not open a browser (debugging)
#    MESHFIN_CMD="..."      command to start instead of this distribution's launcher
# ============================================================================

set -uo pipefail

# A fresh GUI server must not inherit an agent session's identity, in case this
# script is ever invoked from inside a dsh tool shell instead of the shortcut.
unset DSH_SESSION_ID DSH_SESSION_JSONL DSH_SHELL DSH_WEB_URL

PORT="${DSH_WEB_PORT:-3080}"

# Honour an explicit --port / --port=N in the arguments we forward to dsh.
prev=''
for a in "$@"; do
  case "$a" in
    --port=*) PORT="${a#--port=}" ;;
    --port)   : ;;
    *)        [ "$prev" = '--port' ] && PORT="$a" ;;
  esac
  prev="$a"
done
case "$PORT" in '' | *[!0-9]*) PORT=3080 ;; esac
URL="http://127.0.0.1:${PORT}/"

# True once something accepts TCP connections on the port (bash /dev/tcp).
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/${PORT}") >/dev/null 2>&1; }

open_browser() {
  local i
  for i in $(seq 1 240); do          # wait up to ~2 minutes
    port_open && break
    sleep 0.5
  done
  if ! port_open; then
    printf '[launcher] 端口 %s 一直没起来，请手动打开 %s\n' "$PORT" "$URL" >&2
    return 1
  fi
  sleep 0.5                          # let the HTTP listener finish binding
  [ -n "${DSH_WEB_NO_BROWSER:-}" ] && return 0
  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$URL" >/dev/null 2>&1 && return 0
  fi
  if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -NoProfile -Command "Start-Process '$URL'" >/dev/null 2>&1 && return 0
  fi
  printf '[launcher] 无法自动打开浏览器，请手动打开 %s\n' "$URL" >&2
  return 1
}

# Which harness to run, in order: an explicit override, the launcher of the
# distribution this script was shipped inside (two directories up), then a `dsh`
# on PATH for a checkout install.
SELF_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
DIST_ROOT="$(cd -- "$SELF_DIR/../.." && pwd)"
if [ -n "${MESHFIN_CMD:-}" ]; then
  LAUNCH="$MESHFIN_CMD"
elif [ -x "$DIST_ROOT/meshfin" ]; then
  LAUNCH="$DIST_ROOT/meshfin"
elif [ -n "$(command -v dsh || true)" ]; then
  LAUNCH="$(command -v dsh)"
else
  LAUNCH=""
fi

printf '\n[launcher] distro    : %s\n' "${WSL_DISTRO_NAME:-unknown}"
printf '[launcher] workspace : %s\n' "$PWD"
printf '[launcher] url       : %s\n' "$URL"
printf '[launcher] harness   : %s\n' "${LAUNCH:-NOT FOUND}"

if [ -z "$LAUNCH" ]; then
  printf '\n[launcher] 找不到 harness：既没有随包附带的 meshfin，PATH 里也没有 dsh。\n' >&2
  printf '[launcher] 请从发行包根目录运行，或设置 MESHFIN_CMD 指向一个启动器。\n' >&2
  exit 127
fi

# ---------------------------------------------------------------------------
# Already running? Then do not start a second server -- just open the browser.
# ---------------------------------------------------------------------------
if port_open; then
  printf '\n[launcher] 端口 %s 已经在监听：服务似乎已经跑起来了。\n' "$PORT"
  printf '[launcher] 只打开浏览器，不会再启动第二个 dsh。\n'
  open_browser
  printf '\n[launcher] 按任意键关闭本窗口（已经在运行的 dsh 不受影响）。'
  if [ -t 0 ]; then read -r -n 1 -s; else sleep 10; fi
  printf '\n'
  exit 0
fi

# ---------------------------------------------------------------------------
# Normal start: browser opener in the background, dsh in the foreground.
# ---------------------------------------------------------------------------
open_browser &
OPENER=$!

cleanup() {
  trap - HUP INT TERM EXIT
  kill "$OPENER" 2>/dev/null
  if [ -n "${DSH_PID:-}" ] && kill -0 "$DSH_PID" 2>/dev/null; then
    printf '\n[launcher] stopping the server (pid %s) ...\n' "$DSH_PID"
    kill -TERM "$DSH_PID" 2>/dev/null
    for _ in $(seq 1 30); do
      kill -0 "$DSH_PID" 2>/dev/null || break
      sleep 0.2
    done
    kill -KILL "$DSH_PID" 2>/dev/null
  fi
  printf '[launcher] stopped.\n'
}
trap cleanup HUP INT TERM EXIT

# The port this script resolves is the port the server must actually serve on:
# without this the harness falls back to its own composed default and the
# launcher would open a browser on a port nothing is listening on.
case " $* " in
  *' --port '*) ;;
  *) set -- --port "$PORT" "$@" ;;
esac

printf '\n[launcher] starting : %s web %s\n' "$LAUNCH" "$*"
printf '[launcher] 关闭浏览器不影响它；关闭本窗口或按 Ctrl+C 才会停止。\n\n'

# shellcheck disable=SC2086
"$LAUNCH" web "$@" &
DSH_PID=$!

wait "$DSH_PID"
