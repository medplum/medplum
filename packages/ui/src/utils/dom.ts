
/**
 * Kills a browser event.
 * Prevents default behavior.
 * Stops event propagation.
 * @param e The event.
 */
export function killEvent(e: React.SyntheticEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * Returns the current selection range, if one exists.
 * @returns The current selection range, if one exists.
 */
export function getRange(): Range | undefined {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return undefined;
  }
  return sel.getRangeAt(0);
}

/**
 * Returns the bounding rectangle of the current selection, if one exists.
 * @returns The bounding rectangle of the current selection, if one exists.
 */
export function getRangeBounds(): DOMRect | undefined {
  return getRange()?.getClientRects()?.[0];
}

/**
 * Returns the index of a node within a node list.
 * @param nodeList A list of nodes.
 * @param node The node to search for.
 * @returns The index of the node if found; -1 otherwise.
 */
export function indexOfNode(nodeList: NodeList, node: Node) {
  for (let i = 0; i < nodeList.length; i++) {
    if (nodeList[i] === node) {
      return i;
    }
  }
  return -1;
}
