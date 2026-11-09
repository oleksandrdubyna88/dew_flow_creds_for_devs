#!/usr/bin/env bash
# Renders the config deploy/nginx/entrypoint.sh produces — for every TLS mode, with and without a
# certificate — and asserts that each directive nginx allows only ONCE per context occurs once.
#
#   ./deploy/nginx/entrypoint.test.sh
#
# WHY: with TLS_MODE=domain|ip|custom, once a certificate existed, the config held the real_ip block
# twice (write_config wrote it, and so did vault.conf.template). nginx refuses that —
#   [emerg] "real_ip_header" directive is duplicate in /etc/nginx/conf.d/vault.conf:61
# — the reload loop's `nginx -t` failed, the previous plain-HTTP 503 config stayed, and HTTPS never
# opened (measured on a GitHub hosted runner, run 42635403255). `none` never loads the template, so it
# was never hit. A parser is what really knows; the `nginx -t` step of ci-server.yml gives it the
# rendered config. This script is the cheap tier of the same check: it needs only sh, envsubst and grep.
#
# The entrypoint is RUN, not copied: its own seams (CRED_VAULT_CERT_LIVE, CRED_VAULT_TEMPLATE,
# CRED_VAULT_CONF_DIR, CRED_VAULT_RENDER_ONLY) point it at a private folder and stop it before the
# reload loop. Nothing is written outside that folder, which is removed on exit.
set -uo pipefail

# A local run goes below interactive work (.claude/rules/shared/common/local-cpu-budget.md), the same
# way restore-archive-itest.sh does it. CI is exempt.
ci_flag="$(printf '%s' "${CI:-}" | tr '[:upper:]' '[:lower:]')"
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) nice_level=10 ;; *) nice_level=19 ;; esac
if [[ ( -z "$ci_flag" || "$ci_flag" == false || "$ci_flag" == 0 ) && -z "${LOW_PRIORITY_NICED:-}" ]] \
  && command -v nice >/dev/null 2>&1; then
  LOW_PRIORITY_NICED=1 exec nice -n "$nice_level" bash "$0" "$@"
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
ENTRYPOINT="${ENTRYPOINT:-${HERE}/entrypoint.sh}"
TEMPLATE="${TEMPLATE:-${HERE}/vault.conf.template}"
FAILS=0

pass() { printf 'ok    %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; [[ -n "${2:-}" ]] && printf '      %s\n' "$2"; FAILS=$((FAILS + 1)); }

command -v envsubst >/dev/null 2>&1 || { echo "envsubst is required (gettext-base)"; exit 2; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# render <mode> <with-cert: yes|no> -> sets RENDERED to the path of the rendered vault.conf.
# Not a command substitution: a failure must be counted in THIS shell, and its text must reach the terminal.
render() {
  local mode="$1" cert="$2" dir="${WORK}/${1}-${2}" name
  mkdir -p "${dir}/conf.d" "${dir}/live"
  # The certificate directory the entrypoint reads: <server name> for domain|ip, `custom` for custom.
  case "$mode" in custom) name=custom ;; *) name=vault.example.test ;; esac
  if [[ "$cert" == yes ]]; then
    mkdir -p "${dir}/live/${name}"
    : >"${dir}/live/${name}/fullchain.pem"
    : >"${dir}/live/${name}/privkey.pem"
  fi
  if ! TLS_MODE="$mode" SERVER_NAME=vault.example.test MAX_BODY_MB=16 HSTS_MAX_AGE=31536000 \
       CRED_VAULT_CERT_LIVE="${dir}/live" CRED_VAULT_TEMPLATE="$TEMPLATE" \
       CRED_VAULT_CONF_DIR="${dir}/conf.d" CRED_VAULT_RENDER_ONLY=1 \
       sh "$ENTRYPOINT" >"${dir}/entrypoint.log" 2>&1; then
    fail "${mode}/cert=${cert}: the entrypoint failed" "$(tail -3 "${dir}/entrypoint.log")"
    return 1
  fi
  RENDERED="${dir}/conf.d/vault.conf"
}

# count <file> <directive> -> how many lines START with the directive (comments never do)
count() { grep -cE "^[[:space:]]*$2[[:space:]]" "$1" || true; }

for mode in domain ip custom none; do
  for cert in no yes; do
    label="${mode}/cert=${cert}"
    render "$mode" "$cert" || continue
    conf="$RENDERED"

    # The case being tested must really be the one rendered: 443 only when a certificate exists
    # and TLS is ours. Without this a seam typo would test the plain config three times over.
    listens_443="$(count "$conf" 'listen 443 ssl')"
    want_443=0
    [[ "$cert" == yes && "$mode" != none ]] && want_443=1
    if [[ ( "$listens_443" -ge 1 && "$want_443" == 1 ) || ( "$listens_443" == 0 && "$want_443" == 0 ) ]]; then
      pass "${label}: premise holds, the intended state was rendered (TLS server blocks: ${listens_443})"
    else
      fail "${label}: premise broken, the wrong state was rendered; the checks below prove nothing" "TLS server blocks (listen 443 ssl): ${listens_443}, wanted a TLS server: ${want_443}"
    fi

    for d in real_ip_header real_ip_recursive; do
      n="$(count "$conf" "$d")"
      if [[ "$n" == 1 ]]; then
        pass "${label}: ${d} occurs once"
      else
        fail "${label}: ${d} occurs ${n} times, nginx allows it once per context" \
             "$(grep -nE "^[[:space:]]*${d}[[:space:]]" "$conf" | tr '\n' ' ')"
      fi
    done

    # set_real_ip_from may repeat — it is a list — but the same range twice is the same block twice.
    dups="$(grep -E '^[[:space:]]*set_real_ip_from[[:space:]]' "$conf" | sed 's/^[[:space:]]*//' | sort | uniq -d)"
    if [[ -z "$dups" ]]; then
      pass "${label}: no set_real_ip_from range is listed twice"
    else
      fail "${label}: a set_real_ip_from range is listed twice" "$(printf '%s' "$dups" | tr '\n' ' ')"
    fi

    # The block must still be there at all: one home, never zero.
    if [[ "$(count "$conf" set_real_ip_from)" == 4 ]]; then
      pass "${label}: the four private ranges are trusted"
    else
      fail "${label}: expected four set_real_ip_from lines" "got $(count "$conf" set_real_ip_from)"
    fi
  done
done

echo
if [[ "$FAILS" == 0 ]]; then
  echo "ALL ENTRYPOINT RENDER CHECKS PASSED"
  exit 0
fi
echo "${FAILS} ENTRYPOINT RENDER CHECK(S) FAILED"
exit 1
