#!/usr/bin/env bash
set -euo pipefail

image="${OPENSANDBOX_IMAGE:-ai-hub/code-interpreter:local}"
context_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/opensandbox"

echo "Building OpenSandbox code image: ${image}"
echo "Context: ${context_dir}"

docker build \
	--file "${context_dir}/Dockerfile.code-interpreter" \
	--tag "${image}" \
	"${context_dir}"

echo "Built ${image}"
