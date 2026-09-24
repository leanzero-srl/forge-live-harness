#!/bin/bash
# usage: api.sh METHOD "query=string" [json-body]
S=/Users/mihaiperdum/Projects/forge-live-harness/scratchpad/live-6700
TOK=$(node -e 'console.log(require("'$S'/token.json").token)')
URL=$(node -e 'console.log(require("'$S'/token.json").url)')
M=$1; Q=$2; B=$3
if [ -n "$B" ]; then
  curl -s -X "$M" -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" -d "$B" "$URL?$Q"
else
  curl -s -X "$M" -H "Authorization: Bearer $TOK" "$URL?$Q"
fi
