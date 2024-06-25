import CodeBlock, { Props } from '@theme/CodeBlock';
import * as React from 'react';

const BLOCK_START_PATTERN = /^\s*\/\/\s*start-block\s+([A-Za-z_-]*)/;
const BLOCK_END_PATTERN = /^\s*\/\/\s*end-block\s+([A-Za-z_-]*)/;

interface MedplumCodeBlockProps extends Props {
  readonly selectLines?: number[][];
  readonly selectBlocks?: string;
}

export default function MedplumCodeBlock({
  children,
  selectLines,
  selectBlocks,
  ...props
}: MedplumCodeBlockProps): JSX.Element {
  let code = children as string;

  if (selectLines && selectBlocks) {
    throw new Error("Only one of 'selectLines' or 'selectBlocks' can be specified");
  }

  let codeLines: string[] = code.split('\n');

  // Get the line ranges for all the blocks that have been selected.
  const linesToRemove = new Set<number>();
  const blockRanges = extractBlocks(codeLines);

  // Save the line numbers of the magic comments, so that they can be removed later
  Object.values(blockRanges)
    .flat()
    .forEach((lineNumber) => linesToRemove.add(lineNumber));
  if (selectBlocks) {
    const selectBlockNames = selectBlocks.split(',').map((s) => s.trim());
    selectLines = selectBlockNames.map((block) => {
      if (!(block in blockRanges)) {
        throw new Error(`No such code block: '${block}'`);
      }
      return blockRanges[block];
    });
  }

  // Set all the magic comment lines to 'null' to be filtered out later
  // We do this to preserve line numbers before slicing codeLines
  linesToRemove.forEach((lineNumber) => (codeLines[lineNumber - 1] = null));

  // For each line range to be selected, grab the slice from the original code
  if (selectLines) {
    codeLines = selectLines.flatMap((range) =>
      range.length === 1 ? codeLines[range[0] - 1] : codeLines.slice(range[0] - 1, range[1])
    );
  }

  // Filter out lines that were set to null
  codeLines = codeLines.filter((line) => line !== null);

  // Find the minimum indentation
  const minIndent = findMinimumIndentation(codeLines);

  // Remove the minimum indentation from all lines
  codeLines = codeLines.map((line) => removeIndentation(line, minIndent));

  code = codeLines.join('\n');
  return <CodeBlock {...props}>{code}</CodeBlock>;
}

/**
 * Returns an map from the block name to the start and stop lines for that block
 * @param codeLines - Array of code lines.
 * @returns The code blocks.
 */
function extractBlocks(codeLines: string[]): Record<string, [number, number]> {
  const results: Record<string, [number, number | undefined]> = {};
  for (let i = 0; i < codeLines.length; i++) {
    const line = codeLines[i];

    // If we are beginning a new block, save the starting line number
    const startMatch = BLOCK_START_PATTERN.exec(line);
    if (startMatch) {
      const blockName = startMatch[1];
      if (blockName in results) {
        throw new Error(`Block ${blockName} declared more than once`);
      }
      results[blockName] = [i + 1, undefined];
    }

    const endMatch = BLOCK_END_PATTERN.exec(line);
    if (endMatch) {
      const blockName = endMatch[1];
      if (!(blockName in results)) {
        throw new Error(`Block ${blockName} is closed on line ${i + 1} before it is started`);
      }
      if (results[blockName][1]) {
        throw new Error(
          `Block ${blockName} closed more than once. First on line ${results[blockName][1]} and then on line ${i + 1})`
        );
      }
      results[blockName][1] = i + 1;
    }
  }
  const unterminatedBlocks = Object.entries(results).filter(([_, range]) => !range[1]);
  if (unterminatedBlocks.length > 0) {
    throw new Error(`Unterminated blocks: ${unterminatedBlocks.map((e) => e[0]).join(', ')}`);
  }
  return results;
}

/**
 * Finds the minimum indentation across all non-empty lines
 * @param lines - Array of code lines.
 * @returns The minimum indentation.
 */
function findMinimumIndentation(lines: string[]): number {
  const indentations = lines.filter((line) => line.trim().length > 0).map((line) => line.match(/^\s*/)[0].length);
  return Math.min(...indentations);
}

/**
 * Removes a specified amount of indentation from a line
 * @param line - The line to remove indentation from.
 * @param indent - The amount of indentation to remove.
 * @returns The line with reduced indentation.
 */
function removeIndentation(line: string, indent: number): string {
  return line.slice(indent);
}
