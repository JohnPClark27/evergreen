#!/usr/bin/env bash
# setup-libs.sh - fetch the two system libraries headless Chromium needs on a bare
# Ubuntu/WSL (libnss3, libnspr4) WITHOUT sudo: download the .debs and unpack locally.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
mkdir -p .libs && cd .libs
apt-get download libnspr4 libnss3
for f in *.deb; do dpkg -x "$f" root; done
echo "Libraries unpacked in $(pwd)/root/usr/lib/x86_64-linux-gnu (launch.mjs uses them automatically)."
