#!/bin/sh
# Nixpacks selects only a major version from nixpkgs. Install the patched
# official binary independently of that archive; do not execute unverified data.
set -eu

version=22.23.4
case "$(uname -m)" in
  x86_64)
    arch=x64
    checksum=b8492284c76a54baf58d61668dd0e41ee0fc98adabf9503d30f05d08f55b4406
    ;;
  aarch64|arm64)
    arch=arm64
    checksum=f7a1e486dbc8b286847815b477d4fb5e9fb963ed4489c3e1588853d685f589f9
    ;;
  *) echo "Unsupported Node.js architecture: $(uname -m)" >&2; exit 1 ;;
esac

archive="node-v${version}-linux-${arch}.tar.gz"
workdir=$(mktemp -d)
trap 'rm -rf "$workdir"' EXIT HUP INT TERM
cd "$workdir"
curl --fail --silent --show-error --location --retry 3 \
  "https://nodejs.org/dist/v${version}/${archive}" --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check -
mkdir -p /opt/node
tar -xzf "$archive" -C /opt/node --strip-components=1
test "$(/opt/node/bin/node --version)" = "v${version}"
