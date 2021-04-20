import React from 'react';
import { Dialog } from './Dialog';

interface SearchSaveDialogProps {
  visible: boolean;
  onOk: () => void;
  onCancel: () => void;
}

export class SearchSaveDialog extends React.Component<SearchSaveDialogProps, {}> {

  render() {
    return (
      <Dialog visible={this.props.visible} onOk={this.props.onOk} onCancel={this.props.onCancel}>
        <div>
          <table style={{ margin: 'auto' }}>
            <tbody>
              <tr>
                <td align="center">
                  <select id="medplum-save-folders-field" size={20} style={{ width: '250px' }}>
                  </select>
                </td>
                <td align="center">
                  <select id="medplum-save-searchs-field" size={20} style={{ width: '425px' }}>
                  </select>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} align="left">
                  <label htmlFor="medplum-save-name-field" style={{ display: 'inline', float: 'left' }}>
                    Name:
            <input type="text" id="medplum-save-name-field" name="medplum-save-name-field" style={{ width: '425px', margin: '2px 8px' }} />
                  </label>
                  <label htmlFor="medplum-save-make-default" style={{ display: 'inline', float: 'right' }}>
                    <input id="medplum-save-make-default" name="medplum-save-make-default" type="checkbox" value="true" style={{ margin: '2px 8px' }} />
            Set as default
          </label>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Dialog>
    );
  }

  // /**
  //  * Shows the 'open search' dialog.
  //  */
  // openDialog() {
  //   this.refreshSearchs();
  //   this.setVisible(true);
  //   this.folderType_ = 3;
  //   this.folderEntityID_ = window['user']['id'];
  //   this.foldersField_.focus();
  // }

  // /**
  //  * Returns the folder type.
  //  * 1 - organization
  //  * 2 - group
  //  * 3 - user
  //  *
  //  * @return {number} The folder type.
  //  */
  // getFolderType() {
  //   return this.folderType_;
  // }

  // /**
  //  * Returns the folder entity ID.
  //  * 1 - organization = organization_id
  //  * 2 - group - group_id
  //  * 3 - user - user_id
  //  *
  //  * @return {string}
  //  */
  // getFolderEntityID() {
  //   return this.folderEntityID_;
  // }

  // /**
  //  * Returns the selected search name.
  //  *
  //  * @return {string}
  //  */
  // getName() {
  //   return this.nameField_.value;
  // }

  // /**
  //  * Returns whether the selected search is default.
  //  *
  //  * @return {boolean}
  //  */
  // getDefault() {
  //   return document.getElementById('medplum-save-make-default').checked;
  // }

  // /**
  //  * Returns the ID if the current selection overwrites an existing search.
  //  * Returns null otherwise.
  //  *
  //  * @return {?string} The overwrite ID if overwriting an existing search.
  //  */
  // getOverwriteID() {
  //   for (var i = 0; i < this.searchs_.length; i++) {
  //     var search = this.searchs_[i];
  //     if (search['folderType'] === this.getFolderType() &&
  //       search['folderEntityId'] === this.getFolderEntityID() &&
  //       search['name'].toLowerCase() === this.getName().toLowerCase()) {
  //       return this.searchID_;
  //     }
  //   }

  //   return null;
  // }

  // /**
  //  * Handles a 'change' event on the folder selector.
  //  */
  // onChangeFolder_() {
  //   var option = util.getSelectedElement(this.foldersField_);
  //   if (option) {
  //     var values = option.value.split(',', 2);
  //     this.folderType_ = parseInt(values[0], 10);
  //     this.folderEntityID_ = values[1];
  //     this.rebuildSearchs_();
  //   }
  // }

  // /**
  //  * Handles a 'change' event on the search selector.
  //  */
  // onChangeSearch_() {
  //   var option = util.getSelectedElement(this.searchsField_);
  //   if (option) {
  //     this.searchID_ = option.value;
  //     this.nameField_.value = option.text;
  //   }
  // }

  // /**
  //  * Handles a double click on the search selector.
  //  * This should represent a shortcut for clicking on search + click on OK.
  //  */
  // onDoubleClickSearch_() {
  //   this.onChangeSearch_();

  //   var key = ButtonSet.OK.key;
  //   var caption = ButtonSet.OK.caption;
  //   if (this.dispatchEvent(new DialogEvent(key, caption))) {
  //     this.setVisible(false);
  //   }
  // }

  // /**
  //  * Handles a key down event for the "searchs" element.
  //  *
  //  * @param {KeyboardEvent} e The key down event.
  //  * @private
  //  */
  // handleKeyDown_(e) {
  //   switch (e.keyCode) {
  //     case KeyCodes.ENTER:
  //       this.handleEnterKey_(e);
  //       break;

  //     case KeyCodes.DELETE:
  //       this.handleDeleteKey_(e);
  //       break;
  //   }
  // }

  // /**
  //  * Handles the "enter" key.  If a search is selected, submit it.
  //  *
  //  * @param {KeyboardEvent} e The key down event.
  //  * @private
  //  */
  // handleEnterKey_(e) {
  //   var option = util.getSelectedElement(this.searchsField_);
  //   if (!option) {
  //     return;
  //   }

  //   var key = ButtonSet.OK.key;
  //   var caption = ButtonSet.OK.caption;
  //   if (this.dispatchEvent(new DialogEvent(key, caption))) {
  //     this.setVisible(false);
  //   }
  // }

  // /**
  //  * Handles the "delete" key.  If a search is selected, delete it.
  //  *
  //  * @param {KeyboardEvent} e The key down event.
  //  * @private
  //  */
  // handleDeleteKey_(e) {
  //   var option = util.getSelectedElement(this.searchsField_);
  //   if (!option) {
  //     return;
  //   }

  //   /**
  //    * @desc Ask user to confirm they want to delete a search.
  //    */
  //   var MSG_SAVE_WORKLIST_CONFIRM_DELETE = getMsg(
  //     'Are you sure you want to delete "{$name}"?',
  //     { 'name': option.text });

  //   /**
  //    * @desc Inform user that search successfully deleted.
  //    */
  //   var MSG_SAVE_WORKLIST_DELETE_SUCCESS = getMsg(
  //     'Search deleted successfully.');

  //   if (confirm(MSG_SAVE_WORKLIST_CONFIRM_DELETE)) {
  //     var url = '/api/searchs/' + option.value;
  //     fetch(url, { method: 'DELETE' })
  //       .then(response => response.json())
  //       .then(_ => {
  //         Notification.show(MSG_SAVE_WORKLIST_DELETE_SUCCESS);
  //         this.refreshSearchs();
  //       })
  //       .catch(console.log);
  //   }
  // }

  // /**
  //  * Refreshes the list of searchs.
  //  */
  // refreshSearchs() {
  //   util.clearSelectOptions(this.searchsField_);

  //   var url = '/api/searchs';

  //   fetch(url)
  //     .then(response => response.json())
  //     .then(response => {
  //       this.setFolders_(response['folders']);
  //       this.setSearchs_(response['searchs']);
  //       this.rebuildFolders_();
  //       this.rebuildSearchs_();
  //     })
  //     .catch(console.log);
  // }

  // /**
  //  * Updates the list of available folders.
  //  * This only needs to be called when there is a new set of folders.
  //  * The filtering happens at the time of display, not at the time of loading.
  //  *
  //  * @param {Array} folders Array of folders.
  //  */
  // setFolders_(folders) {
  //   this.folders_ = folders;
  //   this.sortByName_(folders);
  // }

  // /**
  //  * Updates the list of available searchs.
  //  * This only needs to be called when there is a new set of searchs.
  //  * The filtering happens at the time of display, not at the time of loading.
  //  *
  //  * @param searchs
  //  */
  // setSearchs_(searchs) {
  //   this.searchs_ = searchs;
  //   this.sortByName_(searchs);
  // }

  // /**
  //  * Sorts an array of objects by the 'name' property.
  //  * Case insensitive.
  //  *
  //  * @param array
  //  */
  // sortByName_(array) {
  //   if (array) {
  //     array.sort(function (a, b) {
  //       a = a['name'].toLowerCase();
  //       b = b['name'].toLowerCase();
  //       return ((a < b) ? -1 : (a > b) ? 1 : 0);
  //     });
  //   }
  // }

  // /**
  //  * Rebuilds the folders selector.
  //  */
  // rebuildFolders_() {
  //   util.clearSelectOptions(this.foldersField_);

  //   // If no folders, then no additional options
  //   if (!this.folders_) {
  //     return;
  //   }

  //   /**
  //    * @desc Heading text for my privately saved searchs.
  //    */
  //   var MSG_MY_PRIVATE_WORKLISTS = getMsg('My private searchs');

  //   // Create the "private" option
  //   util.addSelectOption(
  //     this.foldersField_,
  //     '3,' + window['user']['id'],
  //     MSG_MY_PRIVATE_WORKLISTS,
  //     true,
  //     true);

  //   // Create the organizations
  //   // And organization "subfolders" for groups
  //   for (var i = 0; i < this.folders_.length; i++) {
  //     var folder = this.folders_[i];
  //     if (folder['folderType'] == 1) {
  //       var optgroup = util.createDom(
  //         'optgroup',
  //         { 'label': folder['name'] });

  //       util.addSelectOption(
  //         optgroup,
  //         '1,' + folder['entityId'],
  //         'Everyone at ' + folder['name']);

  //       for (var j = 0; j < this.folders_.length; j++) {
  //         var subfolder = this.folders_[j];
  //         if (subfolder['folderType'] == 2 &&
  //           subfolder['parentId'] == folder['entityId']) {
  //           util.addSelectOption(
  //             optgroup,
  //             '2,' + subfolder['entityId'],
  //             subfolder['name']);
  //         }
  //       }

  //       this.foldersField_.appendChild(optgroup);
  //     }
  //   }
  // }

  // /**
  //  * Rebuilds the searchs selector with the values in the provided array.
  //  */
  // rebuildSearchs_() {
  //   util.clearSelectOptions(this.searchsField_);

  //   if (!this.searchs_) {
  //     return;
  //   }

  //   for (var i = 0; i < this.searchs_.length; i++) {
  //     var search = this.searchs_[i];
  //     var folderType = parseInt(search['folderType'], 10);
  //     var folderEntityID = search['folderEntityId'];

  //     if (this.folderType_ != 0 && this.folderType_ != folderType) {
  //       continue;
  //     }

  //     if (this.folderEntityID_ != 0 && this.folderEntityID_ != folderEntityID) {
  //       continue;
  //     }

  //     var option = util.addSelectOption(
  //       this.searchsField_,
  //       search['id'],
  //       search['name']);
  //     option.title = 'ID = ' + search['id'];
  //   }
  // }
}
