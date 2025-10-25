#!/usr/bin/env bash

# Based on: https://stackoverflow.com/a/56026209

# Check if the --dryrun option is passed
DRYRUN=false
if [[ "$1" == "--dryrun" ]]; then
  DRYRUN=true
fi

# Quietly checkout the main branch
git checkout -q main

# Iterate over each branch in refs/heads/ and format the output to show the short name of each branch
git for-each-ref refs/heads/ "--format=%(refname:short)" | while read branch; do

  # Find the merge base (common ancestor) between main and the current branch
  mergeBase=$(git merge-base main $branch)

  # Create a new commit object from the tree of the current branch and the merge base, and compare it to main
  # If the commit is already in main, it means the branch has been fully merged
  if [[ $(git cherry main $(git commit-tree $(git rev-parse "$branch^{tree}") -p $mergeBase -m _)) == "-"* ]]; then
    if $DRYRUN; then
      # If dryrun, print that the branch can be deleted
      echo "$branch is merged into main and can be deleted"
    else
      # Otherwise, delete the branch
      git branch -D $branch
    fi
  fi

done
