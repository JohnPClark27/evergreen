#!/usr/bin/env bash
# render_mp3.sh - render ONE Open Hymnal ABC file to an MP3.
# Ported from v1 (audio-setup/render_mp3s.sh), one file at a time so the Python
# importer can decide what to render.
#
# Pipeline:
#   ABC --mk-abc-for-midi--> intro + one pass per stanza --abc2midi--> MIDI
#       --fluidsynth--> WAV --sox--> trailing silence trimmed --lame--> MP3
#
# Keep the steps up to the WAV exactly as they are: pipeline/timings/build_timings.mjs
# rebuilds the same MIDI to time the sing-along words. Only the LAME settings
# changed from v1 (stereo -V2 -> mono CBR), which doesn't move any note.
#
# Usage:  render_mp3.sh <file.abc> <out.mp3>
# Env:    OPENHYMNAL_DIR   (default ~/openhymnal)
#         MP3_BITRATE_KBPS (default 96)
#         SF2              (default FluidR3_GM soundfont)
# Exit:   0 ok, 1 failed. Prints "single-pass" on stdout if only one stanza could be built.

set -uo pipefail

abc="$(realpath "$1")"
dest="$2"
OH="$(realpath "${OPENHYMNAL_DIR:-$HOME/openhymnal}")"
OHROOT="$OH/"
BITRATE="${MP3_BITRATE_KBPS:-96}"
SF2="${SF2:-/usr/share/sounds/sf2/FluidR3_GM.sf2}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Open Hymnal's scripts (mk-abc-for-midi, ohroot) live in its bin/.
export PATH="$OH/bin:$PATH"

for cmd in abc2midi fluidsynth sox lame mk-abc-for-midi; do
  command -v "$cmd" >/dev/null || { echo "Missing tool: $cmd (run ./setup.sh)" >&2; exit 1; }
done
[[ -f "$SF2" ]] || { echo "Soundfont not found: $SF2" >&2; exit 1; }

name="$(basename "$abc" .abc)"            # e.g. Amazing_Grace-New_Britain
hymn="$(basename "$(dirname "$abc")")"    # e.g. Amazing_Grace

# --- ABC -> full-length ABC (one pass per stanza) ---
# 1st choice: the Open Hymnal expander (writes temp.abc into the current dir)
# 2nd choice: a hand-built version in Build-Midi/ (if the repo has one)
# fallback:   raw file (single stanza, short)
rel="${abc#"$OHROOT"}"
handbuilt="${OHROOT}Build-Midi/${rel%.abc}-for-midi.abc"
( cd "$TMP" && mk-abc-for-midi "$abc" >/dev/null 2>&1 )

if   [[ -s "$TMP/temp.abc" ]]; then src="$TMP/temp.abc"
elif [[ -f "$handbuilt"    ]]; then src="$handbuilt"
else                                src="$abc"; echo "single-pass"
fi

# --- ABC -> MIDI -> WAV -> trimmed WAV -> mono MP3 ---
# abc2midi warns a lot on notation quirks; judge success by the output file.
abc2midi "$src" -o "$TMP/t.mid" >/dev/null 2>&1
mkdir -p "$(dirname "$dest")"

if [[ -s "$TMP/t.mid" ]] \
   && fluidsynth -ni -q -F "$TMP/t.wav" -r 44100 "$SF2" "$TMP/t.mid" >/dev/null 2>&1 \
   && [[ -s "$TMP/t.wav" ]] \
   && sox "$TMP/t.wav" "$TMP/trim.wav" reverse silence 1 0.1 0.1% reverse \
   && [[ -s "$TMP/trim.wav" ]] \
   && lame --quiet -m m -b "$BITRATE" \
        --tt "${name//_/ }" --ta "Open Hymnal" --tl "${hymn//_/ }" \
        "$TMP/trim.wav" "$TMP/out.mp3"; then
  mv "$TMP/out.mp3" "$dest"
  exit 0
fi
echo "render failed: $abc" >&2
exit 1
