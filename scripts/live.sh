#!/usr/bin/env bash
# The public demo at wallet.elazdi.com, partner.elazdi.com and slides.elazdi.com, also served on localhost:3000.
# It runs in the repository's main checkout (bsa-the-hackathon), whichever worktree calls it: npm run local -- --prod,
# the Cloudflare tunnel and the slides, in tmux session sq-live. That checkout's data/ and .env.local are the live
# chain, so npm run status, fund, e2e and the rest run there act on the live demo.
#
#   npm run live         rebuild what the checkout holds, restart everything, then check every URL
#   npm run live fresh   the same on a new chain; the old data/ and .env.local move to data-<time>/
#   npm run live check   check every URL
#   npm run live stop    stop everything
set -euo pipefail

LIVE=${LIVE_DIR:-$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")}
SESSION=sq-live
TUNNEL=$HOME/.cloudflared/swissquote-wallet.yml
APP=3000 PARTNER=4002 RPC=8545 SLIDES=4091
PORTS=tcp:$APP,$PARTNER,$RPC,$SLIDES
LOG=/tmp/sq-live
SERVICES="app https://wallet.elazdi.com http://localhost:$APP /api/config
partner https://partner.elazdi.com http://localhost:$PARTNER /exit
slides https://slides.elazdi.com http://localhost:$SLIDES /"

check() {
  local down=0 name public local path at_public at_local
  while read -r name public local path; do
    curl -fs -o /dev/null --max-time 5 "$public$path" && at_public=up || { at_public=down; down=1; }
    curl -fs -o /dev/null --max-time 5 "$local$path" && at_local=up || { at_local=down; down=1; }
    printf '  %-8s %-28s %-5s %-24s %s\n' "$name" "$public" "$at_public" "$local" "$at_local"
  done <<<"$SERVICES"
  return $down
}

stop() {
  # SIGTERM lets anvil save the chain and npm run local stop what it started. Closing tmux alone orphans them.
  pkill -f "cloudflared tunnel --config $TUNNEL" || true
  lsof -ti $PORTS -sTCP:LISTEN | xargs kill 2>/dev/null || true
  for _ in {1..40}; do lsof -ti $PORTS -sTCP:LISTEN >/dev/null || break; sleep 0.25; done
  lsof -ti $PORTS -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
  tmux kill-session -t $SESSION 2>/dev/null || true
}

case ${1:-start} in
  check) check; exit ;;
  stop) stop; echo "Stopped the demo."; exit ;;
  start | fresh) ;;
  *) echo "Usage: npm run live [fresh | check | stop]"; exit 1 ;;
esac

for tool in tmux cloudflared; do command -v $tool >/dev/null || { echo "$tool is not installed."; exit 1; }; done
[ -f "$TUNNEL" ] || { echo "No tunnel config at $TUNNEL."; exit 1; }
[ "$(git -C "$LIVE" branch --show-current)" = main ] || { echo "$LIVE is not on main. Check out main there first."; exit 1; }
[ -z "$(git -C "$LIVE" status --porcelain --untracked-files=no)" ] || { echo "$LIVE has uncommitted changes. Commit or stash them first."; exit 1; }
[ "$LIVE/node_modules/.package-lock.json" -nt "$LIVE/package-lock.json" ] || (cd "$LIVE" && npm install)

stop
if [ "${1:-}" = fresh ] && [ -d "$LIVE/data" ]; then
  old=$LIVE/data-$(date +%Y%m%d-%H%M%S)
  mv "$LIVE/data" "$old"
  mv "$LIVE/.env.local" "$old/" 2>/dev/null || true
  echo "The old chain is in $old. To bring it back: npm run live stop, mv $old $LIVE/data, mv $LIVE/data/.env.local $LIVE/, npm run live."
fi

rm -f $LOG-stack.log $LOG-tunnel.log
tmux new-session -d -s $SESSION -n stack -c "$LIVE" \
  "caffeinate -is env PORT=$APP RPC_PORT=$RPC PARTNER_PORT=$PARTNER PUBLIC_PARTNER_URL=https://partner.elazdi.com npm run local -- --prod 2>&1 | tee $LOG-stack.log" \; \
  set-option -t $SESSION:stack remain-on-exit on \; \
  new-window -d -t $SESSION: -n tunnel "cloudflared tunnel --config $TUNNEL run 2>&1 | tee $LOG-tunnel.log" \; \
  set-option -t $SESSION:tunnel remain-on-exit on \; \
  new-window -d -t $SESSION: -n slides -c "$LIVE/slides" "python3 -m http.server $SLIDES --bind 127.0.0.1" \; \
  set-option -t $SESSION:slides remain-on-exit on

echo "Building and starting $(git -C "$LIVE" log -1 --format='%h %s')"
echo "This takes a few minutes. Watch it with: tmux attach -t $SESSION"
until grep -q "Swissquote Wallet is running" $LOG-stack.log 2>/dev/null; do
  if [ "$(tmux display -p -t $SESSION:stack '#{pane_dead}')" = 1 ]; then
    tail -20 $LOG-stack.log
    echo "The stack stopped. Its log is $LOG-stack.log."
    exit 1
  fi
  sleep 2
done

for _ in {1..30}; do check >/dev/null && break; sleep 2; done
if check; then
  echo "Swissquote Wallet is live: https://wallet.elazdi.com/onboarding-welcome"
  echo "Logs: tmux attach -t $SESSION. CLI on this chain: cd $LIVE && npm run status"
else
  echo "Something above is down. Logs: tmux attach -t $SESSION, $LOG-stack.log, $LOG-tunnel.log"
  exit 1
fi
