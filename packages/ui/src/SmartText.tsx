import React, { useRef } from 'react';
import './SmartText.css';

const KEY_TAB = 9;
const KEY_ESCAPE = 27;
const KEY_DOWN = 40;
const KEY_PERIOD = 190;

const SEARCH_API_URL = 'http://localhost:3000/search';

export interface SmartTextProps {
  id?: string;
  value?: string;
}

export const SmartText = (props: SmartTextProps) => {
  const containerRef = useRef<HTMLUListElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  let open = false;
  let ignoreInput = false;
  let search: string | null = null;
  let matches: any[] = [];
  let selectedIndex = -1;
  const conceptCache: any = {};
  const codeCache: any = {};
  let codes: any[] = [];
  let actions: any[] = [];


  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.keyCode) {
      case KEY_TAB:
        if (e.shiftKey) {
          handleShiftTabKey(e);
        } else {
          handleTabKey(e);
        }
        break;

      case KEY_ESCAPE:
        handleEscapeKey(e);
        break;

      case KEY_DOWN:
        handleDownArrow(e);
        break;

      case KEY_PERIOD:
        if (e.ctrlKey) {
          handleCreateGroup(e);
        }
        break;
    }
  }

  function onTextChange() {
    if (ignoreInput) {
      // Ignore non-user changes
      return;
    }

    // Reset the search
    selectedIndex = -1;

    // Current selection
    const range = getRange();
    if (!range || range.startContainer !== range.endContainer) {
      // Ignore selections that span multiple elements
      closeSuggestions();
      return;
    }

    // Walk backwards until first of these conditions:
    // 1) Start of input
    // 2) New line
    // 3) Period
    // 4) Comma
    // 5) 4th space (up to 4 spaces)
    const allText = range.endContainer.textContent;
    if (!allText) {
      closeSuggestions();
      return;
    }

    const endIndex = range.endOffset;
    let startIndex = 0;
    let spaceCount = 0;
    for (let index = endIndex - 1; index >= 0; index--) {
      const c = allText.charAt(index);
      if (c === '\n' || c === '.' || c === ',') {
        startIndex = index + 1;
        break;
      }
      if (c === ' ' && ++spaceCount >= 4) {
        startIndex = index + 1;
        break;
      }
    }

    const search2 = allText.substring(startIndex, endIndex).trim();
    if (search2.length >= 2 && search2 !== search) {
      search = search2;

      const url = SEARCH_API_URL + '?q=' + search2;
      const init = { method: 'GET' };
      fetch(url, init)
        .then(response => response.json())
        .then(handleSearchResults);
    } else {
      search = null;
      closeSuggestions();
    }

    // Update concepts in case of delete
    // TODO: Only do this on delete events?
    updateConcepts();
  }

  function handleSearchResults(response: any) {
    matches = response;
    updateAutoComplete();
  }

  function openSuggestions() {
    const rangeBounds = getRangeBounds();
    if (!rangeBounds) {
      closeSuggestions();
      return;
    }

    const container = containerRef.current;
    if (container) {
      const toolbarEl = document.querySelector('.ql-toolbar');
      const toolbarHeight = toolbarEl ? toolbarEl.getBoundingClientRect().height : 0;
      container.style.left = (rangeBounds.x) + 'px';
      container.style.top = (toolbarHeight + rangeBounds.top + rangeBounds.height) + 'px';
      container.style.position = 'fixed';
      container.style.display = 'block';
      open = true;
    }
  }

  function getRange() {
    const selection = window.getSelection();
    if (!selection) {
      return null;
    }

    return selection.getRangeAt(0);
  }

  function getRangeBounds() {
    const range = getRange();
    if (!range) {
      return null;
    }

    const rangeRects = range.getClientRects();
    if (!rangeRects || rangeRects.length === 0) {
      return;
    }

    return rangeRects[0];
  }

  function closeSuggestions() {
    const container = containerRef.current;
    if (container) {
      container.style.display = 'none';
    }
    open = false;
  }

  function updateAutoComplete() {
    if (!search) {
      return;
    }

    if (matches.length === 0) {
      closeSuggestions();
      return;
    }

    const searchTokens = search.split(/\s+/);
    const searchRegexes = searchTokens.map(token => new RegExp(escapeRegExp(token), 'gi'));

    let html = '';
    for (let i = 0; i < matches.length; i++) {
      const concept = matches[i].concept;
      const selected = i === selectedIndex ? ' class="selected"' : '';
      const style = concept.type === 'template' ? ' style="color:' + concept.color + '"' : '';

      let highlight = concept.name;
      for (let j = 0; j < searchRegexes.length; j++) {
        highlight = highlight.replace(searchRegexes[j], '<b>' + searchTokens[j] + '</b>');
      }

      html += '<li ' + selected + style + '">' + highlight + '</li>';
    }

    const container = containerRef.current;
    if (container) {
      container.innerHTML = html;
    }
    openSuggestions();
  }

  function handleTabKey(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      applyReplacement();
    } else {
      selectNextPlaceholder();
    }
  }

  function handleShiftTabKey(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!open) {
      selectPrevPlaceholder();
    }
  }

  function handleEscapeKey(e: React.KeyboardEvent) {
    if (open) {
      e.preventDefault();
      e.stopPropagation();
      search = null;
      closeSuggestions();
    }
  }

  function handleDownArrow(e: React.KeyboardEvent) {
    if (!open) {
      return true;
    }

    e.preventDefault();
    e.stopPropagation();
    selectedIndex = 0;
    updateAutoComplete();

    const container = containerRef.current;
    if (container) {
      container.focus();
    }
  }

  function handleCreateGroup(e: React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const oldContents = selection.getRangeAt(0).cloneContents();

    const tempDiv = document.createElement('div');
    tempDiv.appendChild(oldContents);

    const newContents = '<div class="section">' + tempDiv.innerHTML + '</div>';
    document.execCommand('insertHTML', false, newContents);
  }

  function handleContainerKey(e: React.KeyboardEvent) {
    if (!open) {
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeSuggestions();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex--;
      if (selectedIndex < 0) {
        closeSuggestions();
        const editor = editorRef.current;
        if (editor) {
          editor.focus();
        }
      } else {
        updateAutoComplete();
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = Math.min(selectedIndex + 1, matches.length - 1);
      updateAutoComplete();
    }
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      applyReplacement();
    }
  }

  function applyReplacement() {
    // Start ignoring input
    ignoreInput = true;

    selectedIndex = Math.max(0, selectedIndex);
    const match = matches[selectedIndex];
    const concept = match.concept;
    const replacement = concept.name;

    // Add the concept to the local cache
    conceptCache[concept.id] = concept;

    // Get the current selection
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const selectionRange = selection.getRangeAt(0);
    const selectionElement = selectionRange.endContainer;
    const selectionContent = selectionElement.textContent;
    if (!selectionContent) {
      return;
    }

    // Find the match term in the element
    const matchIndex = selectionContent.lastIndexOf(match.matchTerm, selectionRange.endOffset);
    const matchLength = match.matchTerm.length;

    // Select the search term
    const searchRange = new Range();
    searchRange.setStart(selectionElement, matchIndex);
    searchRange.setEnd(selectionElement, matchIndex + matchLength);
    selection.removeAllRanges();
    selection.addRange(searchRange);

    // Replace with the replacement text
    let replacementHtml = '<span class="concept"';
    replacementHtml += ' data-id="' + concept.id + '"';
    if (concept.color) {
      replacementHtml += ' style="color:' + concept.color + '"';
    }
    replacementHtml += '>';
    replacementHtml += replacement;
    replacementHtml += '</span>&nbsp;';
    document.execCommand('insertHtml', false, replacementHtml);

    // Capture the cursor at this point
    const afterSelection = window.getSelection();
    if (afterSelection) {
      const afterRange = afterSelection.getRangeAt(0);

      if (concept.type === 'template') {
        // If this is a template, add the template content
        document.execCommand('insertText', false, concept.content);
      }

      afterSelection.removeAllRanges();
      afterSelection.addRange(afterRange);
    }

    if (concept.type === 'template' && concept.content.indexOf('[') >= 0) {
      // If this is a template with placeholders, select the first placeholder
      selectNextPlaceholder();
    }

    updateConcepts();
    closeSuggestions();

    // Stop ignoring input
    ignoreInput = false;
  }

  /**
   * Diffs two arrays into "add" and "remove" elements.
   * @param {Array} oldArray
   * @param {Array} newArray
   * @return {Object} Diff object containing "add" and "remove" propeties.
   */
  function diffArrays(oldArray: any[], newArray: any[]) {
    const addList = [];
    const removeList = [];
    let i = 0;
    let j = 0;

    while (i < oldArray.length && j < newArray.length) {
      if (oldArray[i] === newArray[j]) {
        i++;
        j++;
      } else if (oldArray[i] < newArray[j]) {
        removeList.push(oldArray[i++]);
      } else {
        addList.push(newArray[j++]);
      }
    }

    while (i < oldArray.length) {
      removeList.push(oldArray[i++]);
    }

    while (j < newArray.length) {
      addList.push(newArray[j++]);
    }

    return {
      add: addList,
      remove: removeList
    };
  }

  /**
   * Scans the text for all "concepts".
   * Updates ICD-10 codes and actions based on the contents of the editor.
   */
  function updateConcepts() {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const conceptElements = editor.querySelectorAll('.concept');
    const newCodesSet = new Set();
    const newActionsSet = new Set();

    for (let i = 0; i < conceptElements.length; i++) {
      const conceptElement = conceptElements[i] as HTMLElement;
      const conceptId = conceptElement.dataset.id;
      if (!conceptId) {
        continue;
      }

      const concept = conceptCache[conceptId];

      for (let j = 0; j < concept.codes.length; j++) {
        const code = concept.codes[j];
        codeCache[code.id] = code;
        newCodesSet.add(code.id);
      }

      if (concept.type === 'rxnorm') {
        newActionsSet.add(concept.id);
      }
    }

    const oldCodes = codes;
    const newCodes = Array.from(newCodesSet);
    newCodes.sort();

    const oldActions = actions;
    const newActions = Array.from(newActionsSet);
    newActions.sort();

    const codeDiff = diffArrays(oldCodes, newCodes);
    updateCodes(codeDiff);
    codes = newCodes;

    const actionsDiff = diffArrays(oldActions, newActions);
    updateActions(actionsDiff);
    actions = newActions;
  }

  function updateCodes(codesDiff: any) {
    const container = document.querySelector('.code-list');
    if (!container) {
      return;
    }

    const children = container.querySelectorAll('.code');

    // Remove deleted codes
    for (let i = children.length - 1; i >= 0; i--) {
      for (let j = 0; j < codesDiff.remove.length; j++) {
        if ((children[i] as HTMLElement).dataset.id === codesDiff.remove[j]) {
          container.removeChild(children[i]);
          break;
        }
      }
    }

    // Add new codes
    for (let i = 0; i < codesDiff.add.length; i++) {
      const codeId = codesDiff.add[i];
      const code = codeCache[codeId];
      const el = document.createElement('div');
      el.dataset.id = codeId;
      el.className = 'code';
      el.innerHTML = '<strong>' + code.id + '</strong> ' + code.name;
      container.appendChild(el);
    }
  }

  function updateActions(actionsDiff: any) {
    const container = document.querySelector('.action-container');
    if (!container) {
      return;
    }

    const children = container.querySelectorAll('.action');

    // Remove deleted actions
    for (let i = children.length - 1; i >= 0; i--) {
      for (let j = 0; j < actionsDiff.remove.length; j++) {
        if ((children[i] as HTMLElement).dataset.id === actionsDiff.remove[j]) {
          container.removeChild(children[i]);
          break;
        }
      }
    }

    // Add new actions
    for (let i = 0; i < actionsDiff.add.length; i++) {
      const actionId = actionsDiff.add[i];
      const action = conceptCache[actionId];
      const el = document.createElement('div');
      el.dataset.id = actionId;
      el.className = 'action';
      el.innerHTML = action.name;
      container.appendChild(el);
    }
  }

  function selectNextPlaceholder() {
    const range = getRange();
    if (!range) {
      return;
    }

    const placeholderRange = searchForNextPlaceholder(
      range.endContainer as HTMLElement,
      range.endOffset);

    if (!placeholderRange) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(placeholderRange);
  }

  function selectPrevPlaceholder() {
    const range = getRange();
    if (!range) {
      return;
    }

    const placeholderRange = searchForPrevPlaceholder(
      range.startContainer as HTMLElement,
      range.startOffset);

    if (!placeholderRange) {
      return;
    }

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(placeholderRange);
  }

  function searchForNextPlaceholder(startElement: HTMLElement, startOffset: number) {
    let element = startElement;
    let offset = startOffset;
    while (element) {
      if (element.nodeName === '#text') {
        const textContent = element.textContent;
        if (textContent) {
          const startIndex = textContent.indexOf('[', offset);
          if (startIndex >= 0) {
            const closeBracketIndex = textContent.indexOf(']', startIndex);
            const endIndex = closeBracketIndex >= 0 ? closeBracketIndex + 1 : textContent.length;
            const resultRange = new Range();
            resultRange.setStart(element, startIndex);
            resultRange.setEnd(element, endIndex);
            return resultRange;
          }
        }
      }

      // Not found
      // Advance to next node
      if (element.childNodes && offset < element.childNodes.length) {
        // Search children
        element = element.childNodes[offset] as HTMLElement;
        offset = 0;

      } else if (element === editorRef.current) {
        // Top of editor, text not found
        return null;

      } else if (element.parentNode) {
        // Move up to parent
        const siblings = element.parentNode.childNodes;
        const elementIndex = indexOfNode(siblings, element);
        if (elementIndex === -1) {
          throw 'Element not found in parent list?';
        }
        element = element.parentNode as HTMLElement;
        offset = elementIndex + 1;
      } else {
        // This should not happen
        return null;
      }
    }

    return null;
  }

  function searchForPrevPlaceholder(startElement: HTMLElement, startOffset: number) {
    let element = startElement;
    let offset = startOffset;
    while (element) {
      if (element.nodeName === '#text') {
        const textContent = element.textContent;
        if (textContent) {
          const endIndex = textContent.lastIndexOf(']', offset);
          if (endIndex >= 0) {
            const startIndex = textContent.lastIndexOf('[', endIndex);
            if (startIndex >= 0) {
              const resultRange = new Range();
              resultRange.setStart(element, startIndex);
              resultRange.setEnd(element, endIndex + 1);
              return resultRange;
            }
          }
        }
      }

      // Not found
      // Advance to next node
      if (element.childNodes && offset >= 0 && offset < element.childNodes.length) {
        // Search children
        element = element.childNodes[offset] as HTMLElement;
        if (element.nodeName === '#text') {
          offset = element.textContent ? element.textContent.length : 0;
        } else if (element.childNodes) {
          offset = element.childNodes.length - 1;
        } else {
          offset = 0;
        }

      } else if (element === editorRef.current) {
        // Top of editor, text not found
        return null;

      } else if (element.parentNode) {
        // Move up to parent
        const siblings = element.parentNode.childNodes;
        const elementIndex = indexOfNode(siblings, element);
        if (elementIndex === -1) {
          throw 'Element not found in parent list?';
        }
        element = element.parentNode as HTMLElement;
        offset = elementIndex - 1;
      } else {
        // This should not happen
        return null;
      }
    }

    return null;
  }

  function indexOfNode(nodeList: NodeList, node: Node) {
    for (let i = 0; i < nodeList.length; i++) {
      if (nodeList[i] === node) {
        return i;
      }
    }
    return -1;
  }

  function escapeRegExp(text: string) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  }

  return (
    <div className="medplum-smarttext">
      <div className="medplum-smartext-editor-container">
        <div
          className="medplum-smarttext-editor"
          ref={editorRef}
          contentEditable={true}
          id={props.id}
          defaultValue={props.value || ''}
          onKeyDown={onKeyDown}
          onInput={onTextChange}
        ></div>
      </div>
      <ul
        className="medplum-smarttext-completions"
        ref={containerRef}
        tabIndex={-1}
        onKeyDown={handleContainerKey}
      >
      </ul>
      <div className="code-container">
        <div className="code-header">ICD-10 SUGGESTIONS</div>
        <div className="code-list">
        </div>
      </div>
      <div className="clear"></div>
      <div className="action-container"></div>
    </div>
  );
};
