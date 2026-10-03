#!/usr/bin/env bash
# setup.sh - one-command setup for the Hymnal Reader pipeline on Ubuntu/WSL.
#
#   1. system packages: abc2midi, FluidSynth + soundfont, SoX, LAME, Perl, git, python3-venv
#      (the only step that uses sudo; skipped when everything is already installed)
#   2. checks Node.js (needed for the lyric timing builder; install it yourself, e.g. nvm)
#   3. the Open Hymnal repo (ABC files + its scripts), configured for this machine
#   4. Python venv in .venv with requirements.txt
#   5. Node deps for pipeline/timings (abcjs, @tonejs/midi; pinned)
#   6. checks .env (repo root, or the older admin/.env) has the Supabase keys (never prints them)
#
# Usage:   ./setup.sh            (safe to re-run: finished steps are skipped)
# Options: OPENHYMNAL_DIR=...    where to clone Open Hymnal (default ~/openhymnal)

set -euo pipefail

APP="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OH="${OPENHYMNAL_DIR:-$HOME/openhymnal}"
OH_REPO="https://github.com/mzealey/openhymnal"
PACKAGES=(abcmidi fluidsynth fluid-soundfont-gm sox lame perl git python3 python3-venv)

step() { printf '\n==> %s\n' "$1"; }

# ---------------------------------------------------------------------------
step "1/6 System packages"
command -v apt-get >/dev/null || { echo "This script needs apt (Ubuntu/Debian/WSL)."; exit 1; }
missing=()
for p in "${PACKAGES[@]}"; do
  dpkg -s "$p" >/dev/null 2>&1 || missing+=("$p")
done
if ((${#missing[@]})); then
  echo "Installing: ${missing[*]} (asks for your sudo password)"
  sudo apt-get update
  sudo apt-get install -y "${missing[@]}"
else
  echo "All installed."
fi

# ---------------------------------------------------------------------------
step "2/6 Node.js"
# nvm only puts node on PATH in interactive shells; load it here if it's installed.
if ! command -v node >/dev/null && [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
  set +u; source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"; set -u
fi
if ! command -v node >/dev/null; then
  echo "Node.js not found. Install Node 20+ (e.g. https://github.com/nvm-sh/nvm), then re-run."
  exit 1
fi
node_major=$(node -p 'process.versions.node.split(".")[0]')
((node_major >= 20)) || { echo "Node $(node -v) is too old; need 20+."; exit 1; }
echo "Node $(node -v)"

# ---------------------------------------------------------------------------
step "3/6 Open Hymnal repo -> $OH"
if [[ -d "$OH/Complete" ]]; then
  echo "Already there."
else
  git clone --depth 1 "$OH_REPO" "$OH"
fi
# Its scripts find the repo through bin/ohroot, which must print this folder
# (with a trailing slash). The upstream copy points at the author's machine.
OH="$(realpath "$OH")"
cat > "$OH/bin/ohroot" <<OHROOT
#!/bin/bash
# Prints the Open Hymnal root folder (set by hymnal-reader-v2/setup.sh)
echo $OH/
OHROOT
chmod +x "$OH"/bin/*
echo "bin/ohroot -> $("$OH/bin/ohroot")"

# ---------------------------------------------------------------------------
step "4/6 Python venv (.venv)"
cd "$APP"
[[ -x .venv/bin/python ]] || python3 -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -r requirements.txt
echo "Installed: $(.venv/bin/python -m pip freeze | grep -iE '^(supabase|python-dotenv)=' | tr '\n' ' ')"

# ---------------------------------------------------------------------------
step "5/6 Timing builder deps (pipeline/timings)"
(cd pipeline/timings && npm ci --no-fund --no-audit --silent)
echo "abcjs + @tonejs/midi installed."

# ---------------------------------------------------------------------------
step "6/6 .env"
ENV_FILE=""
for f in .env admin/.env; do [[ -f "$f" ]] && { ENV_FILE="$f"; break; }; done
if [[ -n "$ENV_FILE" ]]; then
  for k in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY; do
    grep -q "^$k=." "$ENV_FILE" && echo "$k: set ($ENV_FILE)" || echo "$k: MISSING in $ENV_FILE (see .env.example)"
  done
else
  echo ".env not found: cp .env.example .env and fill it in (never commit it)."
fi

cat <<'NEXT'

Done. Next (from the repo root):
  source .venv/bin/activate
  python pipeline/import_prayers.py --dry-run && python pipeline/import_prayers.py
  python pipeline/import_hymns.py --dry-run   && python pipeline/import_hymns.py
NEXT
