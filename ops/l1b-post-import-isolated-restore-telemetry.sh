#!/usr/bin/env bash
# Safe B-2 failure telemetry, sourced only through BASH_ENV for the disposable
# restore command. It reports script basenames, line numbers, and exit status;
# it never prints commands, arguments, environment values, SQL, or row data.

trap 'rc=$?; trap - ERR; printf "::error::L1B_B2_SAFE_FAILURE source=%s line=%s rc=%s\\n" "${BASH_SOURCE[0]##*/}" "$LINENO" "$rc" >&2; exit "$rc"' ERR
