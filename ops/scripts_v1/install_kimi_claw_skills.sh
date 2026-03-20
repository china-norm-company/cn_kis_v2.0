#!/usr/bin/env bash
set -euo pipefail

# Install practical OpenClaw skills for personal assistant workflows.
# Usage:
#   bash scripts/install_kimi_claw_skills.sh
#   SKILLS_DIR=my-skills bash scripts/install_kimi_claw_skills.sh

WORKDIR="${WORKDIR:-$(pwd)}"
SKILLS_DIR="${SKILLS_DIR:-openclaw-skills}"

echo "[1/4] Ensure clawhub CLI is available..."
if ! command -v clawhub >/dev/null 2>&1; then
  npm install -g clawhub@latest
fi

echo "[2/4] Installing high-impact skills into ${WORKDIR}/${SKILLS_DIR} ..."
clawhub install daily-report --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install meeting-prep --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install morning-email-rollup --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install market-research --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install competitive-analysis --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install research-paper-kb --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force
clawhub install customer-success-manager --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input --force

echo "[3/4] Installed skill list:"
clawhub list --workdir "${WORKDIR}" --dir "${SKILLS_DIR}" --no-input

echo "[4/4] OpenClaw bundled skill readiness:"
openclaw skills check

echo "Done. Next: configure required credentials (Google/GitHub/Gemini) in each SKILL.md."
