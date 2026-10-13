// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, within } from '../test-utils/render';
import { CcdaViewer } from './CcdaViewer';

function ccda(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ClinicalDocument xmlns="urn:hl7-org:v3">
  <title>Test Summary</title>
  <effectiveTime value="20150722"/>
  <recordTarget>
    <patientRole>
      <id root="2.16.840.1.113883.4.1" extension="112233334"/>
      <patient>
        <name><given>Thomas</given><family>Manfred</family></name>
        <administrativeGenderCode code="M"/>
        <birthTime value="19800701"/>
      </patient>
    </patientRole>
  </recordTarget>
  <component>${body}</component>
</ClinicalDocument>`;
}

function section(code: string, title: string, text: string): string {
  return `<component><section><code code="${code}"/><title>${title}</title><text>${text}</text></section></component>`;
}

const THREE_SECTIONS = ccda(
  `<structuredBody>
    ${section('48765-2', 'ALLERGIES', '<paragraph>No known allergies</paragraph>')}
    ${section('10160-0', 'MEDICATIONS', '<paragraph>Aspirin 81mg</paragraph>')}
    ${section('11450-4', 'PROBLEMS', '<paragraph>Asthma</paragraph>')}
  </structuredBody>`
);

function sectionTitles(): string[] {
  return screen.getAllByTestId('ccda-section').map((el) => el.querySelector('p')?.textContent ?? '');
}

describe('CcdaViewer', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('Renders a full C-CDA sample', () => {
    const xml = readFileSync(
      resolve(import.meta.dirname, '../../../ccda/testdata/170.315_b1_toc_amb_ccd_r21_sample2_v11.xml'),
      'utf8'
    );
    render(<CcdaViewer xml={xml} />);
    expect(screen.getByText('170.315_b1_toc_amb_ccd_r21_sample2 test data')).toBeInTheDocument();
    expect(screen.getByText('Thomas V Manfred jr')).toBeInTheDocument();
    expect(screen.getByText('Allergies and adverse reactions')).toBeInTheDocument();
    expect(screen.getByText('Mental status')).toBeInTheDocument();
    expect(screen.getAllByTestId('ccda-section')).toHaveLength(16);
  });

  test('Shows an error for invalid XML', () => {
    render(<CcdaViewer xml="<ClinicalDocument><unclosed>" />);
    expect(screen.getByText('Unable to display C-CDA')).toBeInTheDocument();
  });

  test('Shows an error for a non-CDA document', () => {
    render(<CcdaViewer xml="<Bundle/>" />);
    expect(screen.getByText(/missing ClinicalDocument root/)).toBeInTheDocument();
  });

  test('Patient detail toggle', () => {
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    expect(screen.getByText('Thomas Manfred')).toBeInTheDocument();
    expect(screen.queryByText('Patient IDs')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Patient detail'));
    expect(screen.getByText('112233334 (2.16.840.1.113883.4.1)')).toBeInTheDocument();
  });

  test('Hide and show sections', async () => {
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    expect(screen.getByText('Aspirin 81mg')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByLabelText('Hide Medications')));
    expect(screen.queryByText('Aspirin 81mg')).not.toBeInTheDocument();
    expect(screen.getByText('1 hidden')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('medplum-ccda-viewer-hidden') ?? '[]')).toStrictEqual(['10160-0']);

    await act(async () => fireEvent.click(screen.getByText('Table of contents')));
    const medicationsCheckbox = screen.getByLabelText('Medications');
    expect(medicationsCheckbox).not.toBeChecked();
    await act(async () => fireEvent.click(medicationsCheckbox));
    expect(screen.getByText('Aspirin 81mg')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByLabelText('Problems')));
    expect(screen.queryByText('Asthma')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText('Show all')));
    expect(screen.getByText('Asthma')).toBeInTheDocument();
  });

  test('Hidden sections carry over to the next document', () => {
    localStorage.setItem('medplum-ccda-viewer-hidden', JSON.stringify(['11450-4']));
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    expect(screen.queryByText('Asthma')).not.toBeInTheDocument();
  });

  test('Collapse and expand sections', async () => {
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    await act(async () => fireEvent.click(screen.getByLabelText('Collapse Allergies')));
    expect(screen.queryByText('No known allergies')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByLabelText('Expand Allergies')));
    expect(screen.getByText('No known allergies')).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText('Collapse all')));
    expect(screen.queryByText('No known allergies')).not.toBeInTheDocument();
    expect(screen.queryByText('Asthma')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByText('Expand all')));
    expect(screen.getByText('Asthma')).toBeInTheDocument();
  });

  test('Reorder sections', async () => {
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    expect(sectionTitles()).toStrictEqual(['Allergies', 'Medications', 'Problems']);

    await act(async () => fireEvent.click(screen.getByLabelText('Move Problems to top')));
    expect(sectionTitles()).toStrictEqual(['Problems', 'Allergies', 'Medications']);

    await act(async () => fireEvent.click(screen.getByLabelText('Move Allergies down')));
    expect(sectionTitles()).toStrictEqual(['Problems', 'Medications', 'Allergies']);
    expect(JSON.parse(localStorage.getItem('medplum-ccda-viewer-order') ?? '[]')).toStrictEqual([
      '11450-4',
      '10160-0',
      '48765-2',
    ]);

    await act(async () => fireEvent.click(screen.getByText('Table of contents')));
    await act(async () => fireEvent.click(screen.getByText('Restore original order')));
    expect(sectionTitles()).toStrictEqual(['Allergies', 'Medications', 'Problems']);
  });

  test('Drag and drop sections', async () => {
    render(<CcdaViewer xml={THREE_SECTIONS} />);
    const card = (title: string): HTMLElement =>
      screen.getAllByTestId('ccda-section').find((el) => el.querySelector('p')?.textContent === title) as HTMLElement;
    const drag = async (from: string, to: string): Promise<void> => {
      const handle = screen.getByLabelText(`Drag ${from}`);
      await act(async () => fireEvent.dragStart(handle, { dataTransfer: { setData: vi.fn(), effectAllowed: '' } }));
      expect(card(from)).toHaveAttribute('data-dragging');
      await act(async () => fireEvent.dragOver(card(to)));
      expect(card(to)).toHaveAttribute('data-drop-target');
      await act(async () => fireEvent.drop(card(to)));
      await act(async () => fireEvent.dragEnd(handle));
    };

    await drag('Problems', 'Allergies');
    expect(sectionTitles()).toStrictEqual(['Problems', 'Allergies', 'Medications']);

    await drag('Problems', 'Medications');
    expect(sectionTitles()).toStrictEqual(['Allergies', 'Medications', 'Problems']);

    await drag('Allergies', 'Medications');
    expect(sectionTitles()).toStrictEqual(['Medications', 'Allergies', 'Problems']);
    expect(JSON.parse(localStorage.getItem('medplum-ccda-viewer-order') ?? '[]')).toStrictEqual([
      '10160-0',
      '48765-2',
      '11450-4',
    ]);
    expect(card('Allergies')).not.toHaveAttribute('data-dragging');

    // A drop with no section being dragged (e.g. a file from the desktop) is ignored
    await act(async () => fireEvent.drop(card('Problems')));
    expect(sectionTitles()).toStrictEqual(['Medications', 'Allergies', 'Problems']);
  });

  test('Duplicate table rows', async () => {
    const table = `<table>
      <thead><tr><th>Name</th><th>Dose</th></tr></thead>
      <tbody>
        <tr><td>Aspirin</td><td>81mg</td></tr>
        <tr><td>Aspirin</td><td>81mg</td></tr>
        <tr><td>Aspirin</td><td>325mg</td></tr>
      </tbody>
    </table>`;
    render(<CcdaViewer xml={ccda(`<structuredBody>${section('10160-0', 'Medications', table)}</structuredBody>`)} />);

    const narrativeTable = screen.getByText('Dose').closest('table') as HTMLTableElement;
    const body = within(narrativeTable).getAllByRole('rowgroup')[1];
    expect(within(body).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText(/1 duplicate row hidden/)).toBeInTheDocument();
    expect(screen.getByText(/1 potential duplicate row/)).toBeInTheDocument();

    await act(async () => fireEvent.click(screen.getByText('Show duplicates')));
    expect(within(body).getAllByRole('row')).toHaveLength(3);

    await act(async () => fireEvent.click(screen.getByText('Hide potential duplicates')));
    expect(within(body).queryByText('325mg')).not.toBeInTheDocument();
  });

  test('Renders narrative markup', () => {
    const text = `
      <paragraph styleCode="Bold">Bold text</paragraph>
      <content revised="delete">Deleted text</content>
      <list listType="ordered"><caption>Steps</caption><item>First</item><item>Second</item></list>
      <paragraph>H<sub>2</sub>O and x<sup>2</sup><br/>Next line</paragraph>
      <pre>col1  col2
val1  val2</pre>`;
    const { container } = render(
      <CcdaViewer xml={ccda(`<structuredBody>${section('1', 'Notes', text)}</structuredBody>`)} />
    );
    expect(container.querySelector('pre')?.textContent).toBe('col1  col2\nval1  val2');
    expect(screen.getByText('Bold text')).toHaveClass('bold');
    expect(screen.queryByText('Deleted text')).not.toBeInTheDocument();
    expect(screen.getByText('Steps')).toBeInTheDocument();
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  test('Only renders safe links and images', () => {
    const text = `
      <linkHtml href="javascript:alert(1)">Bad link</linkHtml>
      <linkHtml href="https://example.com/info">Good link</linkHtml>
      <renderMultiMedia referencedObject="IMG1"/>
      <renderMultiMedia referencedObject="IMG2"/>`;
    const media = `
      <entry><observationMedia ID="IMG1"><value mediaType="image/png"><reference value="https://example.com/a.png"/></value></observationMedia></entry>
      <entry><observationMedia ID="IMG2"><value mediaType="image/png"><reference value="javascript:alert(1)"/></value></observationMedia></entry>`;
    const xml = ccda(
      `<structuredBody><component><section><code code="1"/><title>Notes</title><text>${text}</text>${media}</section></component></structuredBody>`
    );
    const { container } = render(<CcdaViewer xml={xml} />);
    expect(screen.getByText('Bad link').closest('a')).toBeNull();
    expect(screen.getByRole('link', { name: 'Good link' })).toHaveAttribute('href', 'https://example.com/info');
    const images = container.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/a.png');
  });

  test('Renders nested sections and section authors', () => {
    const xml = ccda(`<structuredBody><component><section>
      <code code="1"/><title>Plan</title>
      <author><assignedAuthor><assignedPerson><name><given>Henry</given><family>Seven</family></name></assignedPerson></assignedAuthor></author>
      <text>Outer</text>
      <component><section><title>Follow up</title><text>Inner</text></section></component>
    </section></component></structuredBody>`);
    render(<CcdaViewer xml={xml} />);
    expect(screen.getByText('Section author: Henry Seven')).toBeInTheDocument();
    expect(screen.getByText('Follow up')).toBeInTheDocument();
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });

  test('Non-XML body', () => {
    const xml = ccda(
      `<nonXMLBody><text mediaType="application/pdf"><reference value="https://example.com/doc.pdf"/></text></nonXMLBody>`
    );
    render(<CcdaViewer xml={xml} />);
    expect(screen.getByRole('link', { name: 'Open attached document' })).toHaveAttribute(
      'href',
      'https://example.com/doc.pdf'
    );
  });
});
