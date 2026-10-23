#!/bin/sh
# Tests du relais (Node, sans dépendance)
set -eu
cd "$(dirname "$0")"
node --test
