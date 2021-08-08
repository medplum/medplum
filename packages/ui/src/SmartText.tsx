import { ValueSet, ValueSetContains } from '@medplum/core';
import React, { useRef, useState } from 'react';
import { useMedplum } from './MedplumProvider';
import { getRange, getRangeBounds, indexOfNode, killEvent } from './utils/dom';
import './SmartText.css';

export interface SmartTextProps {
  id?: string;
  value?: string;
  onChange?: (html: string) => void;
}

interface DropdownState {
  open: boolean;
  x: number;
  y: number;
}

export function SmartText(props: SmartTextProps) {
  const medplum = useMedplum();
  const editorRef = useRef<HTMLDivElement>(null);
  const [lastSearch, setLastSearch] = useState('');
  const [valueSet, setValueSet] = useState<ValueSet>();
  const [dropdown, setDropdown] = useState<DropdownState>({ open: false, x: 0, y: 0 });
  const [selectedIndex, setSelectedIndex] = useState(-1);

  function onKeyDown(e: React.KeyboardEvent) {
    switch (e.code) {
      case 'Enter':
        handleEnterKey(e);
        break;

      case 'Tab':
        handleTabKey(e);
        break;

      case 'Escape':
        handleEscapeKey(e);
        break;

      case 'ArrowUp':
        handleUpArrow(e);
        break;

      case 'ArrowDown':
        handleDownArrow(e);
        break;

      case 'Period':
        if (e.ctrlKey) {
          handleCreateGroup(e);
        }
        break;
    }
  }

  function onTextChange() {
    // Reset the search
    setSelectedIndex(-1);

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
    if (search2.length >= 2 && search2 !== lastSearch) {
      setLastSearch(search2);

      const url = `fhir/R4/ValueSet/$expand?url=${encodeURIComponent('https://snomed.info/sct')}&filter=${encodeURIComponent(search2)}`;
      medplum.get(url)
        .then(handleSearchResults);
    } else {
      closeSuggestions();
    }
  }

  function handleSearchResults(response: ValueSet) {
    setValueSet(response);
    if (response.expansion?.contains && response.expansion.contains.length > 0) {
      openSuggestions();
    }
  }

  function openSuggestions() {
    const rangeBounds = getRangeBounds();
    if (!rangeBounds) {
      closeSuggestions();
      return;
    }

    setDropdown({
      open: true,
      x: rangeBounds.left,
      y: rangeBounds.bottom
    });
  }

  function closeSuggestions() {
    setDropdown({ open: false, x: 0, y: 0 });
  }

  function handleEnterKey(e: React.KeyboardEvent) {
    if (dropdown.open) {
      killEvent(e);
      applyReplacement();
    }
  }

  function handleTabKey(e: React.KeyboardEvent) {
    killEvent(e);
    if (e.shiftKey) {
      selectPrevPlaceholder();
    } else if (dropdown.open) {
      applyReplacement();
    } else {
      selectNextPlaceholder();
    }
  }

  function handleEscapeKey(e: React.KeyboardEvent) {
    if (dropdown.open) {
      killEvent(e);
      closeSuggestions();
    }
  }

  function handleUpArrow(e: React.KeyboardEvent) {
    if (dropdown.open) {
      killEvent(e);
      setSelectedIndex(selectedIndex - 1);
    }
  }

  function handleDownArrow(e: React.KeyboardEvent) {
    if (dropdown.open) {
      killEvent(e);
      setSelectedIndex(selectedIndex + 1);
    }
  }

  function handleCreateGroup(e: React.KeyboardEvent) {
    killEvent(e);

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

  function applyReplacement() {
    const concept = valueSet?.expansion?.contains?.[Math.max(0, selectedIndex)] as ValueSetContains;
    const replacement = concept.display as string;

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
    const matchIndex = selectionContent.lastIndexOf(lastSearch, selectionRange.endOffset);
    const matchLength = lastSearch.length;

    // Select the search term
    const searchRange = new Range();
    searchRange.setStart(selectionElement, matchIndex);
    searchRange.setEnd(selectionElement, matchIndex + matchLength);
    selection.removeAllRanges();
    selection.addRange(searchRange);

    // Replace with the replacement text
    let replacementHtml = '<span class="concept" data-id="' + concept.code + '">';
    replacementHtml += replacement;
    replacementHtml += '</span>&nbsp;';
    document.execCommand('insertHtml', false, replacementHtml);

    // Capture the cursor at this point
    const afterSelection = window.getSelection();
    if (afterSelection) {
      const afterRange = afterSelection.getRangeAt(0);
      afterSelection.removeAllRanges();
      afterSelection.addRange(afterRange);
    }

    setLastSearch('');
    closeSuggestions();
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

  return (
    <div className="medplum-smarttext" data-testid="smarttext">
      <div className="medplum-smartext-editor-container">
        <div
          id={props.id}
          data-testid="smarttext-editor"
          className="medplum-smarttext-editor"
          ref={editorRef}
          contentEditable={true}
          defaultValue={props.value || ''}
          onKeyDown={onKeyDown}
          onInput={onTextChange}
          onBlur={onTextChange}
        ></div>
      </div>
      {dropdown.open && (
        <ul
          data-testid="smarttext-dropdown"
          className="medplum-smarttext-completions"
          tabIndex={-1}
          style={{ left: dropdown.x, top: dropdown.y }}
        >
          {valueSet?.expansion?.contains?.map((element, index) => (
            <li
              key={element.code}
              data-index={index}
              className={index === selectedIndex ? "medplum-autocomplete-row medplum-autocomplete-active" : "medplum-autocomplete-row"}
            >
              {element.display}
            </li>
          ))}
        </ul>
      )}
      <div className="code-container">
        <div className="code-header">ICD-10 SUGGESTIONS</div>
        <div className="code-list">
        </div>
      </div>
      <div className="clear"></div>
      <div className="action-container"></div>
    </div>
  );
}
