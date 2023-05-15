#!/usr/bin/env bash

before_merge=$1
after_merge=$2

changed_paths=""
for path in examples/*/; do
  CHANGED_FILES=$(git diff --name-only $before_merge $after_merge -- "${path}*")
  if [ -n "$CHANGED_FILES" ]; then
    changed_paths+="$path;"
  fi
done
echo "changed_paths=$changed_paths" >> $GITHUB_ENV