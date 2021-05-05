import { schema, SearchDefinition, SearchFilterDefinition } from 'medplum';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { Dialog } from './Dialog';
import { addFilter, buildFieldNameString, deleteFilter, getOpString } from './SearchUtils';

/**
 * @desc Filter editor dialog title.
 * @type {string}
 */
// const MSG_FILTERS_TITLE = getMsg('Filters');
const MSG_FILTERS_TITLE = 'Filters';

/**
 * @desc Edit button text.
 * @type {string}
 */
// const MSG_EDIT = getMsg('Edit');
const MSG_EDIT = 'Edit';

/**
 * @desc Delete button text.
 * @type {string}
 */
// const MSG_DELETE = getMsg('Delete');
const MSG_DELETE = 'Delete';

interface FilterRowProps {
  resourceType: string;
  definition: SearchFilterDefinition;
  onAdd: (filter: SearchFilterDefinition) => void;
  onDelete: (filter: SearchFilterDefinition) => void;
}

interface FilterRowState {
  editing: boolean;
  field?: string;
  op?: string;
  value?: any;
}

class FilterRow extends React.Component<FilterRowProps, FilterRowState> {

  constructor(props: FilterRowProps) {
    super(props);

    this.state = {
      editing: props.definition.key === '',
      field: props.definition.key,
      op: props.definition.op,
      value: props.definition.value
    };
  }

  render() {
    if (!this.state.editing) {
      const resourceType = this.props.resourceType;
      const filter = this.props.definition;
      return (
        <tr>
          <td>{buildFieldNameString(resourceType, filter.key)}</td>
          <td>{getOpString(filter.op)}</td>
          <td>{filter.value}</td>
          <td>
            <button
              className="btn btn-small"
              onClick={() => this.setState({
                editing: true,
                field: this.props.definition.key,
                op: this.props.definition.op,
                value: this.props.definition.value
              })}
            >Edit</button>
            <button
              className="btn btn-small"
              onClick={() => this.props.onDelete(filter)}
            >Delete</button>
          </td>
        </tr>
      );
    }

    // Otherwise, we're editing:
    return (
      <tr>
        <td>{this.renderField()}</td>
        <td>{this.renderOperation()}</td>
        <td>{this.renderValue()}</td>
        <td>
          <button
            className="btn btn-small"
            onClick={() => this.onAddClick()}
          >Add</button>
          <button
            className="btn btn-small"
            onClick={() => this.setState({ editing: false })}
          >Cancel</button>
        </td>
      </tr>
    );
  }

  private renderField() {
    const resourceType = this.props.resourceType;
    const typeSchema = schema[resourceType];
    return (
      <select defaultValue={this.state.field} onChange={e => this.setState({ field: e.target.value })}>
        <option value=""></option>
        {Object.values(typeSchema.properties)
          .sort((a, b) => (a.display > b.display) ? 1 : -1)
          .map(field => (
            <option key={field.key} value={field.key}>{buildFieldNameString(resourceType, field.key)}</option>
          ))}
      </select>
    );
  }

  private renderOperation() {
    if (!this.state.field) {
      return null;
    }

    return (
      <select defaultValue={this.state.op} onChange={e => this.setState({ op: e.target.value })}>
        {this.renderOperationOptions()}
      </select>
    );
  }

  private renderOperationOptions() {
    const fieldKey = this.state.field;
    if (!fieldKey) {
      return null;
    }

    const typeSchema = schema[this.props.resourceType];
    if (!typeSchema) {
      return null;
    }

    const fieldDefinition = typeSchema.properties[fieldKey];
    if (!fieldDefinition) {
      return null;
    }

    switch (fieldDefinition.type) {
      case 'string':
      case 'fulltext':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="not_equals">Is not</option>
            <option value="contains">Contains</option>
            <option value="not_contains">Does not contain</option>
          </>
        );

      case 'numeric':
        return (
          <>
            <option value=""></option>
            <option value="equals">Equalsa</option>
            <option value="not_equals">Not equals</option>
          </>
        );

      case 'date':
      case 'datetime':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="before_datetime">Before date/time</option>
            <option value="after_datetime">After date/time</option>
            <option value="newer_than_interval">Newer than</option>
            <option value="older_than_interval">Older than</option>
            <option value="is_set">Is set</option>
            <option value="is_not_set">Is not set</option>
          </>
        );

      case 'enum':
      case 'user':
      case 'organization':
      case 'site':
        return (
          <>
            <option value=""></option>
            <option value="equals">Is</option>
            <option value="not_equals">Is not</option>
          </>
        );

      case 'bool':
        return (
          <>
            <option value=""></option>
            <option value="is_set">Is set</option>
            <option value="is_not_set">Is not set</option>
          </>
        );
    }
  }

  private renderValue() {
    const fieldKey = this.state.field;
    if (!fieldKey) {
      return null;
    }

    const typeSchema = schema[this.props.resourceType];
    if (!typeSchema) {
      return null;
    }

    const fieldDefinition = typeSchema.properties[fieldKey];
    if (!fieldDefinition) {
      return null;
    }

    const op = this.state.op;
    if (!op) {
      return null;
    }

    switch (fieldDefinition.type) {
      case 'string':
      case 'fulltext':
        return (
          <input type="text" onChange={e => this.setState({ value: e.target.value })} />
        );

      case 'numeric':
        return (
          <input type="text" onChange={e => this.setState({ value: e.target.value })} />
        );

      case 'date':
      case 'datetime':
        return (
          <input type="datetime-local" step="1" defaultValue="" onChange={e => this.setState({ value: e.target.value })} />
        );

      case 'enum':
      case 'user':
      case 'organization':
      case 'site':
        return (
          <Autocomplete id="dataEntryUser" resourceType="Practitioner" />
        );

      case 'bool':
        return (
          <input type="text" onChange={e => this.setState({ value: e.target.value })} />
        );
    }
  }

  private onAddClick() {
    const key = this.state.field;
    if (!key) {
      return;
    }

    const op = this.state.op;
    if (!op) {
      return;
    }

    this.props.onAdd({
      key: key,
      op: op,
      value: this.state.value
    });

    this.setState({
      field: '',
      op: '',
      value: undefined
    });
  }
}

interface SearchFilterEditorProps {
  visible: boolean;
  definition: SearchDefinition;
  onOk: (definition: SearchDefinition) => void;
  onCancel: () => void;
}

interface SearchFilterEditorState {
  definition: SearchDefinition;
}

export class SearchFilterEditor extends React.Component<SearchFilterEditorProps, SearchFilterEditorState> {

  constructor(props: SearchFilterEditorProps) {
    super(props);

    this.state = {
      definition: JSON.parse(JSON.stringify(props.definition))
    };

    // this.getDialogElement().style.width = '900px';
    // this.setTitle(MSG_FILTERS_TITLE);
    // this.setSafeHtmlContent(TEMPLATE);
    // this.setButtonSet(ButtonSet.createOkCancel());

    // /**
    //  * The search.
    //  * @type {Search}
    //  * @private
    //  */
    // this.search_ = new Search();

    // // Force render - calling getContentElement()
    // // forces the dialog box to create all child elements
    // var el = this.getContentElement();

    // this.filtersTable_ = el.querySelector('.medplum-filter-editor-table');
    // this.fields_ = el.querySelector('.medplum-field-list');
    // this.ops_ = el.querySelector('.medplum-ops-list');
    // this.stringInput_ = el.querySelector('.medplum-string-value');

    // this.userInput_ = el.querySelector('.medplum-user-control');
    // this.userAutocomplete_ = new Autocomplete('user_id', { 'params': { 'resourceType': 'User' }, 'multiple': true });
    // this.userAutocomplete_.decorate(this.userInput_);

    // this.organizationInput_ = el.querySelector('.medplum-organization-control');
    // this.organizationAutocomplete_ = new Autocomplete('organization_id', { 'params': { 'resourceType': 'Organization' }, 'multiple': true });
    // this.organizationAutocomplete_.decorate(this.organizationInput_);

    // this.siteInput_ = el.querySelector('.medplum-site-control');
    // this.siteAutocomplete_ = new Autocomplete('site_id', { 'params': { 'resourceType': 'Location' }, 'multiple': true });
    // this.siteAutocomplete_.decorate(this.siteInput_);

    // this.enumInput_ = el.querySelector('.medplum-enum-control');
    // this.addButton_ = el.querySelector('.medplum-add-button');

    // this.intervalControl_ = el.querySelector('.medplum-interval-control');
    // this.intervalInput_ = el.querySelector('.medplum-interval-value');
    // this.intervalUnits_ = el.querySelector('.medplum-interval-units');

    // this.dateTimeControl_ = el.querySelector('.medplum-datetime-control');
    // this.dateInput_ = el.querySelector('.medplum-datetime-date-field');
    // this.timeInput_ = el.querySelector('.medplum-datetime-time-field');

    // var PATTERN = "yyyy'-'MM'-'dd";
    // var idp1 = new InputDatePicker();
    // idp1.decorate(this.dateInput_);

    // this.populate_();
    // this.rebuildTable_();
    // this.resetForm_();

    // this.fields_.addEventListener(EventType.CHANGE, _ => this.onChangeField_());

    // this.ops_.addEventListener(EventType.CHANGE, _ => this.onChangeOp_());

    // this.addButton_.addEventListener(EventType.CLICK, _ => this.onAddFilter_());
  }

  render() {
    if (!this.props.visible) {
      return null;
    }

    // if (!this.state.definition) {
    //   this.setState({
    //     definition: JSON.parse(JSON.stringify(this.props.definition))
    //   });
    //   return null;
    // }

    const filters = this.state.definition.filters || [];
    // console.log('filters', filters);

    return (
      <Dialog
        visible={this.props.visible}
        onOk={() => this.props.onOk(this.state.definition)}
        onCancel={this.props.onCancel}>
        <div className="medplum-filter-editor">
          <table className="medplum-filter-editor-table">
            <thead>
              <tr>
                <th style={{ width: '235px' }}>Field</th>
                <th style={{ width: '120px' }}>Operation</th>
                <th style={{ width: '400px' }}>Value</th>
                <th style={{ width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filters.map((filter: SearchFilterDefinition) => (
                <FilterRow
                  resourceType={this.props.definition.resourceType}
                  key={JSON.stringify(filter)}
                  definition={filter}
                  onAdd={f => this.onAddFilter(f)}
                  onDelete={f => this.onDeleteFilter(f)}
                />
              ))}
              <FilterRow
                resourceType={this.props.definition.resourceType}
                definition={{ key: '', op: '' }}
                onAdd={f => this.onAddFilter(f)}
                onDelete={f => this.onDeleteFilter(f)}
              />
            </tbody>
          </table>
        </div>
      </Dialog>
    );
  }

  componentDidUpdate(prevProps: SearchFilterEditorProps) {
    if (!prevProps.visible && this.props.visible) {
      this.setState({
        definition: JSON.parse(JSON.stringify(this.props.definition))
      });
    }
  }

  private onAddFilter(filter: SearchFilterDefinition) {
    this.setState({ definition: addFilter(this.state.definition, filter.key, filter.op, filter.value) });
  }

  private onDeleteFilter(filter: SearchFilterDefinition) {
    if (!this.state.definition.filters) {
      return;
    }
    const index = this.state.definition.filters.findIndex(f => Object.is(f, filter));
    this.setState({ definition: deleteFilter(this.state.definition, index) });
  }

  // /**
  //  * Returns the current search.
  //  *
  //  * @return {Search} The current search.
  //  */
  // getSearch() {
  //   this.tryAddFilter_();
  //   return this.search_;
  // }

  // /**
  //  * Sets the search to edit.
  //  * Makes a copy (does NOT edit the object).
  //  *
  //  * @param {Search} search The search to edit.
  //  */
  // setSearch(search) {
  //   this.search_.copy(search);
  //   this.rebuildTable_();
  //   this.resetForm_();
  // }

  // /**
  //  * Populates the select boxes with available values.
  //  * Most importantly, populate the field list with available fields.
  //  *
  //  * @private
  //  */
  // populate_() {
  //   for (var key in schema) {
  //     if (schema.hasOwnProperty(key)) {
  //       util.addSelectOption(this.fields_, key, schema[key].display);
  //     }
  //   }

  //   util.sortSelect(this.fields_);
  // }

  // /**
  //  * Rebuilds the filter table.
  //  *
  //  * This is called every time there is a change to the filters.
  //  * Every time, we rebuild the table from scratch.
  //  *
  //  * @private
  //  */
  // rebuildTable_() {
  //   this.sortFilters_();
  //   this.clearTable_();

  //   var filters = this.search_.getFilters();
  //   if (filters) {
  //     for (var i = 0; i < filters.length; i++) {
  //       var filter = filters[i];
  //       this.addFilterRow_(filter['key'], filter['op'], filter['value']);
  //     }
  //   }
  // }

  // /**
  //  * Sorts the list of filters by name.
  //  *
  //  * @private
  //  */
  // sortFilters_() {
  //   var filters = this.search_.getFilters();
  //   filters.sort(function (a, b) {
  //     if (a.key < b.key)
  //       return -1;
  //     if (a.key > b.key)
  //       return 1;
  //     return 0;
  //   });
  // }

  // /**
  //  * Clears the filters table.  Removes all rows (except for the headers).
  //  *
  //  * @private
  //  */
  // clearTable_() {
  //   util.clearTableRows(this.filtersTable_, 2);
  // }

  // /**
  //  * Resets the active input row.
  //  *
  //  * @private
  //  */
  // resetForm_() {
  //   util.reset(this.fields_);
  //   this.setOpList_(null);
  //   this.hideValueFields_();
  //   this.fields_.focus();
  // }

  // /**
  //  * Adds a filter row to the table.
  //  * Creates the DOM elements and adds them to the DOM.
  //  *
  //  * @param {string} key The field key.
  //  * @param {string} op The filter operation (e.g., "equals").
  //  * @param {string} value The filter value
  //  * @private
  //  */
  // addFilterRow_(key, op, value) {
  //   var rowCount = this.filtersTable_.rows.length - 1;
  //   var row = this.filtersTable_.insertRow(rowCount);

  //   var cell1 = row.insertCell(0);
  //   cell1.innerHTML = Search.getFieldString(key);

  //   var cell2 = row.insertCell(1);
  //   cell2.innerHTML = Search.getOpString(op);

  //   var cell3 = row.insertCell(2);
  //   cell3.innerHTML = Search.getFilterValueString(key, op, value);

  //   var cell4 = row.insertCell(3);

  //   var editButton = util.createDom(
  //     'button',
  //     'btn btn-small',
  //     MSG_EDIT);

  //   editButton.addEventListener(EventType.CLICK, e => function (e) {
  //     this.editFilter_(rowCount - 1);
  //   }(e));
  //   cell4.appendChild(editButton);

  //   var deleteButton = util.createDom(
  //     'button',
  //     'btn btn-small',
  //     MSG_DELETE);

  //   deleteButton.addEventListener(EventType.CLICK, e => function (e) {
  //     this.deleteFilter_(rowCount - 1);
  //   }(e));
  //   cell4.appendChild(deleteButton);
  // }

  // /**
  //  * Handles a change to the selected field.
  //  * Updates the downstream input controls such as the operation list.
  //  *
  //  * @private
  //  */
  // onChangeField_() {
  //   var field = schema[this.fields_.value];
  //   if (field) {
  //     this.setOpList_(field);
  //   } else {
  //     this.setOpList_(null);
  //   }
  // }

  // /**
  //  * Handles a change to the operation.
  //  * Updates the downstream input controls such as the input boxes.
  //  *
  //  * @private
  //  */
  // onChangeOp_() {
  //   var field = schema[this.fields_.value];
  //   if (!field) {
  //     return;
  //   }

  //   switch (field.type) {
  //     case 'date':
  //     case 'datetime':
  //       this.onChangeDateTimeOp_();
  //       break;
  //   }
  // }

  // /**
  //  * Handles a change to the operation, when the field is a date/time field.
  //  * Updates the input controls depending on whether this is an "absolute" or
  //  * "relative" date time operation.
  //  *
  //  * "Absolute" means "before or after a specific point in time".
  //  * For example, "all orders after April 15, 2013".
  //  *
  //  * "Relative" means "within an interval relative to now".
  //  * For example, "all orders within the last 60 minutes".
  //  *
  //  * @private
  //  */
  // onChangeDateTimeOp_() {
  //   this.hideValueFields_();
  //   var op = this.ops_.value;

  //   if (op == 'equals') {
  //     util.showAndReset(this.dateTimeControl_);
  //     util.showAndReset(this.dateInput_);
  //     util.hide(this.timeInput_);

  //   } else if (op == 'before_datetime' || op == 'after_datetime') {
  //     util.showAndReset(this.dateTimeControl_);
  //     util.showAndReset(this.dateInput_);
  //     util.show(this.timeInput_);

  //   } else if (op == 'newer_than_interval' || op == 'older_than_interval') {
  //     util.showAndReset(this.intervalControl_);
  //     util.showAndReset(this.intervalInput_);
  //     util.showAndReset(this.intervalUnits_);
  //   }

  //   util.enable(this.addButton_);
  // }

  // /**
  //  * Handles a click on the "Add" button.
  //  * Adds a filter based on the users input.
  //  *
  //  * @private
  //  */
  // onAddFilter_() {
  //   this.tryAddFilter_();
  // }

  // /**
  //  * Tries to create a filter from the current form values.
  //  *
  //  * @private
  //  */
  // tryAddFilter_() {
  //   var fieldName = this.fields_.value;
  //   if (!fieldName) {
  //     return;
  //   }

  //   var opName = this.ops_.value;
  //   if (!opName) {
  //     return;
  //   }

  //   var field = schema[fieldName];
  //   if (field) {
  //     switch (field.type) {
  //       case 'string':
  //       case 'fulltext':
  //         this.addStringFilter_(field);
  //         break;

  //       case 'numeric':
  //         this.addNumericFilter_(field);
  //         break;

  //       case 'date':
  //       case 'datetime':
  //         this.addDateTimeFilter_(field);
  //         break;

  //       case 'user':
  //         this.addUserFilter_(field);
  //         break;

  //       case 'enum':
  //         this.addEnumFilter_(field);
  //         break;

  //       case 'bool':
  //         this.addBooleanFilter_(field);
  //         break;

  //       case 'organization':
  //         this.addOrganizationFilter_(field);
  //         break;

  //       case 'site':
  //         this.addSiteFilter_(field);
  //         break;
  //     }
  //   }
  // }

  // /**
  //  * Adds a string filter.
  //  *
  //  * @param {Object} field The string field.
  //  * @private
  //  */
  // addStringFilter_(field) {
  //   var op = this.ops_.value;

  //   var value = this.stringInput_.value;
  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds a numeric filter.
  //  *
  //  * @param {Object} field The numeric field.
  //  * @private
  //  */
  // addNumericFilter_(field) {
  //   var op = this.ops_.value;

  //   var value = this.stringInput_.value;

  //   if (!util.isInteger(value)) {
  //     /**
  //      * @desc Error message for invalid number format.
  //      * @type {string}
  //      */
  //     var MSG_INVALID_FORMAT = getMsg(
  //       'Invalid number format: {$value}',
  //       { 'value': value });
  //     alert(MSG_INVALID_FORMAT);
  //     return;
  //   }

  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds a date/time filter.
  //  * This includes both absolute filters (before_datetime and after_datetime)
  //  * and relative filters (newer_than_interval and older_than_interval).
  //  *
  //  * @param {Object} field The user field.
  //  * @private
  //  */
  // addDateTimeFilter_(field) {
  //   var op = this.ops_.value;

  //   if (op == 'equals') {
  //     var date = this.dateInput_.value;
  //     this.addFilter_(field, op, date);

  //   } else if (op == 'before_datetime' || op == 'after_datetime') {
  //     var value = this.dateInput_.value;
  //     this.addFilter_(field, op, value);

  //   } else if (op == 'newer_than_interval' || op == 'older_than_interval') {
  //     var value = this.intervalInput_.value + ' ' + this.intervalUnits_.value;
  //     this.addFilter_(field, op, value);

  //   } else if (op == 'is_set') {
  //     this.addFilter_(field, op, null);

  //   } else if (op == 'is_not_set') {
  //     this.addFilter_(field, op, null);
  //   }
  // }

  // /**
  //  * Adds a user filter.
  //  *
  //  * @param {Object} field The user field.
  //  * @private
  //  */
  // addUserFilter_(field) {
  //   var op = this.ops_.value;
  //   var value = this.userAutocomplete_.getResourceString();
  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds a organization filter.
  //  *
  //  * @param {Object} field The organization field.
  //  * @private
  //  */
  // addOrganizationFilter_(
  //   field) {
  //   var op = this.ops_.value;
  //   var value = this.organizationAutocomplete_.getResourceString();
  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds a site filter.
  //  *
  //  * @param {Object} field The organization field.
  //  * @private
  //  */
  // addSiteFilter_(field) {
  //   var op = this.ops_.value;
  //   var value = this.siteAutocomplete_.getResourceString();
  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds an enum filter.
  //  *
  //  * @param field
  //  * @private
  //  */
  // addEnumFilter_(field) {
  //   var op = this.ops_.value;

  //   var value = this.enumInput_.value;
  //   this.addFilter_(field, op, value);
  // }

  // /**
  //  * Adds a boolean filter.
  //  *
  //  * @param field
  //  * @private
  //  */
  // addBooleanFilter_(field) {
  //   var op = this.ops_.value;

  //   this.addFilter_(field, op, '');
  // }

  // /**
  //  * Hides all of the "value" fields, which refers to all of the controls
  //  * that accept the "value" portion of filters.
  //  *
  //  * @private
  //  */
  // hideValueFields_() {
  //   util.hide(this.stringInput_);
  //   util.hide(this.userInput_);
  //   util.hide(this.organizationInput_);
  //   util.hide(this.siteInput_);
  //   util.hide(this.enumInput_);
  //   util.hide(this.dateTimeControl_);
  //   util.hide(this.intervalControl_);
  // }

  // /**
  //  * Updates the operations list based on the selected field.
  //  *
  //  * For example, if the user selected a "string" typed field,
  //  * update the operations list with "equals", "not equals", "contains", etc.
  //  *
  //  * @param field
  //  * @private
  //  */
  // setOpList_(field) {
  //   util.clearSelectOptions(this.ops_);
  //   util.disable(this.addButton_);
  //   this.hideValueFields_();

  //   if (!field) {
  //     util.hide(this.ops_);
  //     return;
  //   }

  //   var type = field['type'];

  //   switch (type) {
  //     case 'string':
  //     case 'fulltext':
  //       util.addSelectOption(this.ops_, '', '');
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Is not');
  //       util.addSelectOption(this.ops_, 'contains', 'Contains', false, true);
  //       util.addSelectOption(this.ops_, 'not_contains', 'Does not contain');
  //       util.show(this.stringInput_);
  //       break;

  //     case 'numeric':
  //       util.addSelectOption(this.ops_, 'equals', 'Equals');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Does not equals');
  //       util.showAndReset(this.stringInput_);
  //       break;

  //     case 'date':
  //     case 'datetime':
  //       util.addSelectOption(this.ops_, '', '');
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'before_datetime', 'Before date/time');
  //       util.addSelectOption(this.ops_, 'after_datetime', 'After date/time');
  //       util.addSelectOption(this.ops_, 'newer_than_interval', 'Newer than');
  //       util.addSelectOption(this.ops_, 'older_than_interval', 'Older than');
  //       util.addSelectOption(this.ops_, 'is_set', 'Is set');
  //       util.addSelectOption(this.ops_, 'is_not_set', 'Is not set');
  //       break;

  //     case 'user':
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Is not');
  //       util.show(this.userInput_);
  //       break;

  //     case 'enum':
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Is not');
  //       util.clearSelectOptions(this.enumInput_);
  //       util.addSelectOptions(this.enumInput_, field['options']);
  //       util.show(this.enumInput_);
  //       break;

  //     case 'bool':
  //       util.addSelectOption(this.ops_, 'is_set', 'Is set');
  //       util.addSelectOption(this.ops_, 'is_not_set', 'Is not set');
  //       break;

  //     case 'organization':
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Is not');
  //       util.show(this.organizationInput_);
  //       break;

  //     case 'site':
  //       util.addSelectOption(this.ops_, 'equals', 'Is');
  //       util.addSelectOption(this.ops_, 'not_equals', 'Is not');
  //       util.show(this.siteInput_);
  //       break;

  //     default:
  //       alert('Unexpected type: ' + type);
  //   }

  //   util.show(this.ops_);
  //   util.enable(this.addButton_);
  // }

  // /**
  //  * Adds a filter to the underlying search.
  //  * Rebuilds the UI.
  //  *
  //  * @param {Object} field The field object.
  //  * @param {string} op The operation code.
  //  * @param {? string} value The value.
  //  * @private
  //  */
  // addFilter_(field, op, value) {
  //   this.search_.addFilter(field.key, op, value);
  //   this.rebuildTable_();
  //   this.resetForm_();
  // }

  // /**
  //  * Starts editing one of the existing filters.
  //  *
  //  * How this works:
  //  *  1) Removes the specified filter from the search.
  //  *  2) Rebuilds the table with that modified search.
  //  *  3) Updates the value control with the previous value.
  //  *
  //  * @param {number} index The index of the filter to edit.
  //  * @private
  //  */
  // editFilter_(index) {
  //   var filters = this.search_.getFilters();
  //   var filter = filters.splice(index, 1)[0];
  //   this.rebuildTable_();

  //   var field = schema[filter['key']];
  //   var op = filter['op'];
  //   var value = filter['value'];

  //   // Set the field
  //   this.fields_.value = filter.key;

  //   if (field) {
  //     this.setOpList_(field);
  //     util.selectOption(this.ops_, op);
  //     this.onChangeOp_();

  //     switch (field.type) {
  //       case 'string':
  //       case 'fulltext':
  //         this.stringInput_.value = value;
  //         break;

  //       case 'date':
  //       case 'datetime':
  //         if (op === 'before_datetime' || op === 'after_datetime') {
  //           this.dateInput_.value = value;

  //         } else if (op === 'newer_than_interval' || op === 'older_than_interval') {
  //           this.intervalInput_.value = value;
  //           this.intervalUnits_.value = value;
  //         }
  //         break;

  //       case 'user':
  //         this.userAutocomplete_.setResourceString(value);
  //         break;

  //       case 'organization':
  //         this.organizationAutocomplete_.setResourceString(value);
  //         break;

  //       case 'site':
  //         this.siteAutocomplete_.setResourceString(value);
  //         break;

  //       case 'enum':
  //         util.show(this.enumInput_);
  //         util.selectOption(this.enumInput_, value);
  //         break;

  //       case 'bool':
  //         break;
  //     }

  //   } else {
  //     this.setOpList_(null);
  //   }
  // }

  // /**
  //  * Deletes a filter at the specified index, and then rebuilds the table.
  //  *
  //  * @param {number} index The filter index.
  //  */
  // deleteFilter_(index) {
  //   this.search_.deleteFilter(index);
  //   this.rebuildTable_();
  // }
}
