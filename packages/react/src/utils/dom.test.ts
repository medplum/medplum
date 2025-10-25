// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { exportJsonFile, isCheckboxCell, killEvent } from './dom';

describe('DOM utils', () => {
  test('killEvent', () => {
    const e = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };

    killEvent(e as unknown as Event);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });

  test('isCheckboxCell', () => {
    const div = document.createElement('div');
    div.innerHTML = `
      <table>
        <tbody>
          <tr>
            <td id="td1"><input id="input1" type="checkbox"></td>
            <td id="td2"><input id="input2" type="text"></td>
            <td id="td3">
              <input id="input3" type="checkbox">
              <input id="input4" type="checkbox">
            </td>
            <td id="td4">hello</td>
          </tr>
        </tbody>
      </table>
    `;

    expect(isCheckboxCell(div.querySelector('#td1') as Element)).toBe(true);
    expect(isCheckboxCell(div.querySelector('#td2') as Element)).toBe(false);
    expect(isCheckboxCell(div.querySelector('#td3') as Element)).toBe(false);
    expect(isCheckboxCell(div.querySelector('#td4') as Element)).toBe(false);

    expect(isCheckboxCell(div.querySelector('#input1') as Element)).toBe(true);
    expect(isCheckboxCell(div.querySelector('#input2') as Element)).toBe(false);
  });

  describe('JSON File Download', () => {
    let jsonFile: any;

    beforeEach(() => {
      jsonFile = {
        entry: [
          {
            fullUrl: 'medplum.com',
            resource: {
              meta: {},
              id: '123',
              resourceType: 'Patient',
            },
          },
          {
            fullUrl: 'app.medplum.com/123',
            resource: {
              meta: {
                id: '123',
              },
              id: '456',
              resourceType: 'Patient',
            },
          },
        ],
      };
    });

    test('download a JSON file', () => {
      URL.createObjectURL = jest.fn(() => 'blob:http://localhost/blob');
      URL.revokeObjectURL = jest.fn();

      exportJsonFile(jsonFile.entry);

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});
