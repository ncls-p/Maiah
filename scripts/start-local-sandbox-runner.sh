#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
runtime_root="${SANDBOX_LOCAL_RUNTIME_ROOT:-${project_root}/.data/sandbox-runner}"
venv_dir="${SANDBOX_LOCAL_VENV:-${runtime_root}/venv}"
python_bin="${venv_dir}/bin/python3"
requirements_file="${project_root}/sandbox-runner/python-requirements.txt"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required to prepare the local sandbox Python environment." >&2
  echo "Install it from https://docs.astral.sh/uv/ and retry." >&2
  exit 1
fi

mkdir -p "${runtime_root}/runs"
if [[ ! -x "${python_bin}" ]]; then
  uv venv --python 3.12 "${venv_dir}"
fi
uv pip install --python "${python_bin}" -r "${requirements_file}"

export SANDBOX_RUNNER_SOCKET="${SANDBOX_RUNNER_SOCKET:-${runtime_root}/sandbox.sock}"
export SANDBOX_RUN_ROOT="${SANDBOX_RUN_ROOT:-${runtime_root}/runs}"
export SANDBOX_PYTHON_COMMAND="${SANDBOX_PYTHON_COMMAND:-${python_bin}}"

exec node "${project_root}/scripts/sandbox-runner.mjs"
