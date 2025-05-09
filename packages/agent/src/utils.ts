import { open, stat } from 'node:fs/promises';

/**
 * Reads the last N lines of a file starting from the end
 * @param filePath - Path to the file
 * @param lineCount - Number of lines to read from the end
 * @returns Promise resolving to an array of the last N lines
 */
export async function readLastNLines(filePath: string, lineCount: number): Promise<string[]> {
  // Validate inputs
  if (lineCount <= 0) {
    throw new Error('Line count must be greater than 0');
  }

  // Get file stats to determine size
  const stats = await stat(filePath);
  const fileSize = stats.size;

  if (fileSize === 0) {
    return []; // Empty file
  }

  // Setup
  const lines: string[] = [];
  let position = fileSize;
  const buffer = Buffer.alloc(1024 * 64); // Read in 64KB chunks
  let bytesRead = 0;
  let newLineCount = 0;
  let leftover = '';

  // Open file for reading
  const fileHandle = await open(filePath, 'r');

  try {
    // Read chunks from end of file until we have enough lines
    while (position > 0 && newLineCount <= lineCount) {
      // Calculate position and bytes to read for this chunk
      const chunkSize = Math.min(position, buffer.length);
      position -= chunkSize;

      // Read chunk from file
      bytesRead = (await fileHandle.read(buffer, 0, chunkSize, position)).bytesRead;

      if (bytesRead <= 0) {
        break;
      }

      // Convert buffer to string and prepend to leftover content
      let content = buffer.subarray(0, bytesRead).toString();
      content += leftover;

      // Split by newlines and count them
      const chunk = content.split(/\r?\n/);

      // The first element could be a partial line
      // that connects to the last element of the previous chunk
      leftover = chunk[0];

      // Process lines in reverse (since we're reading backwards)
      if (chunk.length > 1) {
        for (let i = chunk.length - 1; i > 0; i--) {
          if (newLineCount >= lineCount) {
            break;
          }
          lines.unshift(chunk[i]);
          newLineCount++;
        }
      }
    }

    // Add the leftover content as the first line if we have room
    if (leftover && newLineCount < lineCount) {
      lines.unshift(leftover);
    }

    return lines.slice(-lineCount); // Ensure we return exactly lineCount lines
  } finally {
    await fileHandle.close();
  }
}
