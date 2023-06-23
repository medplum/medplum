/*
 * Myers Diff algorithm
 * Based on: https://github.com/KengoTODA/java-diff-utils/blob/master/src/main/java/difflib/myers/MyersDiff.java
 * Apache Software License, Version 1.1
 */

export function diff(original: string[], revised: string[]): Delta[] {
  const path = buildPath(original, revised) as PathNode;
  return buildRevisions(path, original, revised);
}

export interface PathNode {
  readonly i: number;
  readonly j: number;
  readonly prev: PathNode | undefined;
  readonly snake: boolean;
}

export interface Delta {
  readonly original: Chunk;
  readonly revised: Chunk;
  readonly type: 'change' | 'delete' | 'insert';
}

export interface Chunk {
  readonly position: number;
  readonly lines: string[];
}

function buildPath(orig: string[], rev: string[]): PathNode | undefined {
  const N = orig.length;
  const M = rev.length;
  const MAX = N + M + 1;
  const size = 1 + 2 * MAX;
  const middle = (size / 2) | 0;
  const diagonal: (PathNode | undefined)[] = new Array(size);

  diagonal[middle + 1] = {
    i: 0,
    j: -1,
    prev: undefined,
    snake: true,
  };

  for (let d = 0; d < MAX; d++) {
    for (let k = -d; k <= d; k += 2) {
      const kmiddle = middle + k;
      const kplus = kmiddle + 1;
      const kminus = kmiddle - 1;
      const kplusNode = diagonal[kplus] as PathNode;
      const kminusNode = diagonal[kminus] as PathNode;
      let prev: PathNode | undefined = undefined;
      let i = 0;

      if (k === -d || (k !== d && kminusNode.i < kplusNode.i)) {
        i = kplusNode.i;
        prev = kplusNode;
      } else {
        i = kminusNode.i + 1;
        prev = kminusNode;
      }

      diagonal[kminus] = undefined; // no longer used

      let j = i - k;
      let node = {
        i,
        j,
        prev: previousSnake(prev),
        snake: false,
      };

      // orig and rev are zero-based
      // but the algorithm is one-based
      // that's why there's no +1 when indexing the sequences
      while (i < N && j < M && orig[i] === rev[j]) {
        i++;
        j++;
      }

      if (i > node.i) {
        node = {
          i,
          j,
          prev: node,
          snake: true,
        };
      }

      diagonal[kmiddle] = node;

      if (i >= N && j >= M) {
        return diagonal[kmiddle] as PathNode;
      }
    }
    diagonal[middle + d - 1] = undefined;
  }

  // According to Myers, this cannot happen
  return undefined;
}

function buildRevisions(startNode: PathNode, orig: string[], rev: string[]): Delta[] {
  const deltas: Delta[] = [];
  let path: PathNode | undefined = startNode;

  if (path.snake) {
    path = path.prev;
  }

  while (path?.prev && path.prev.j >= 0) {
    const i = path.i;
    const j = path.j;

    path = path.prev;
    const ianchor = path.i;
    const janchor = path.j;

    const original = {
      position: ianchor,
      lines: orig.slice(ianchor, i),
    };

    const revised = {
      position: janchor,
      lines: rev.slice(janchor, j),
    };

    let type: 'insert' | 'delete' | 'change';

    if (original.lines.length === 0 && revised.lines.length > 0) {
      type = 'insert';
    } else if (original.lines.length > 0 && revised.lines.length === 0) {
      type = 'delete';
    } else {
      type = 'change';
    }

    deltas.push({ original, revised, type });

    if (path.snake) {
      path = path.prev;
    }
  }

  return deltas;
}

function previousSnake(node: PathNode): PathNode {
  if (node && !node.snake && node.prev) {
    return node.prev;
  }
  return node;
}
