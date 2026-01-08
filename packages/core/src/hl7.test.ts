// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatHl7DateTime, Hl7Context, Hl7Field, Hl7Message, Hl7Segment, parseHl7DateTime } from './hl7';

describe('HL7', () => {
  test('Unsupported encoding', () => {
    expect(() => Hl7Message.parse('xyz')).toThrow();
  });

  test('Default context', () => {
    expect(Hl7Segment.parse('MSA|AA|123').toString()).toBe('MSA|AA|123');
    expect(Hl7Field.parse('x1^x2^x3~y1^y2^y3').toString()).toBe('x1^x2^x3~y1^y2^y3');
  });

  test('Minimal', () => {
    const text = 'MSH|^~\\&';
    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(1);
    expect(msg.toString()).toBe(text);
    expect(msg.header).toBeDefined();
    expect(msg.header.name).toBe('MSH');

    const msh = msg.header as Hl7Segment;
    expect(msh.getField(0)?.toString()).toBe('MSH');
    expect(msh.getField(1)?.toString()).toBe('|');
    expect(msh.getField(2)?.toString()).toBe('^~\\&');

    const ack = msg.buildAck();
    expect(ack).toBeDefined();
    expect(ack.segments.length).toBe(2);
    expect(ack.segments[0].name).toBe('MSH');
    expect(ack.segments[1].name).toBe('MSA');

    const header = ack.header;
    expect(header.name).toBe('MSH');
    expect(header.getField(0)?.toString()).toBe('MSH');
    expect(header.getField(1)?.toString()).toBe('|');
    expect(header.getField(2)?.toString()).toBe('^~\\&');
    expect(header.toString().substring(0, 9)).toBe('MSH|^~\\&|');
  });

  test('ACK', () => {
    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(2);
    expect(msg.toString()).toBe(text);
  });

  test('Build ACK', () => {
    // 1 message type components
    const text1 =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT|MSG00001|P|2.1\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';
    const msg1 = Hl7Message.parse(text1);
    expect(msg1).toBeDefined();
    expect(msg1.buildAck().getSegment('MSH')?.getField(9)?.toString()).toBe('ACK');

    // 2 message type components
    const text2 =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01|MSG00001|P|2.2\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';
    const msg2 = Hl7Message.parse(text2);
    expect(msg2).toBeDefined();
    expect(msg2.buildAck().getSegment('MSH')?.getField(9)?.toString()).toBe('ACK^A01');

    // 2 message type components
    const text3 =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT^A01^ADT_A01|MSG00001|P|2.5.1\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';
    const msg3 = Hl7Message.parse(text3);
    expect(msg3).toBeDefined();
    expect(msg3.buildAck().getSegment('MSH')?.getField(9)?.toString()).toBe('ACK^A01^ACK');
  });

  test.each(['CA', 'CR', 'CE', 'AE', 'AR'] as const)('Build ACK -- %s, no ERR segment', (ackCode) => {
    // 1 message type components
    const text1 =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT|MSG00001|P|2.1\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';
    const msg1 = Hl7Message.parse(text1);
    expect(msg1).toBeDefined();
    const ackMsg = msg1.buildAck({ ackCode });
    expect(ackMsg.getSegment('MSH')?.getField(9)?.toString()).toBe('ACK');
    expect(ackMsg.getSegment('MSA')?.getField(1)?.toString()).toBe(ackCode);
    expect(ackMsg.getSegment('ERR')).toBeUndefined();
  });

  test('Build ACK -- ERR segment defined', () => {
    // 1 message type components
    const text1 =
      'MSH|^~\\&|ADT1|MCM|LABADT|MCM|198808181126|SECURITY|ADT|MSG00001|P|2.1\r' +
      'PID|||PATID1234^5^M11||JONES^WILLIAM^A^III||19610615|M-||C|1200 N ELM STREET^^GREENSBORO^NC^27401-1020|GL|(919)379-1212|(919)271-3434||S||PATID12345001^2^M10|123456789|987654^NC\r' +
      'NK1|1|JONES^BARBARA^K|SPO|||||20011105\r' +
      'PV1|1|I|2000^2012^01||||004777^LEBAUER^SIDNEY^J.|||SUR||-||1|A0-';
    const msg1 = Hl7Message.parse(text1);
    expect(msg1).toBeDefined();
    const ackMsg = msg1.buildAck({
      ackCode: 'AE',
      errSegment: new Hl7Segment(['ERR', '^^^207&Application Error&HL70357']),
    });
    expect(ackMsg.getSegment('MSH')?.getField(9)?.toString()).toBe('ACK');
    expect(ackMsg.getSegment('MSA')?.getField(1)?.toString()).toBe('AE');
    expect(ackMsg.getSegment('MSA')?.getField(3)?.toString()).toBe('Application Error');
    expect(ackMsg.getSegment('ERR')?.getField(1)?.toString()).toBe('^^^207&Application Error&HL70357');
  });

  test('ADT', () => {
    const text = `MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|199912271408|CHARRIS|ADT^A04|1817457|D|2.5|
PID||0493575^^^2^ID 1|454721||DOE^JOHN^^^^|DOE^JOHN^^^^|19480203|M||B|254 MYSTREET AVE^^MYTOWN^OH^44123^USA||(216)123-4567|||M|NON|400003403~1129086|
NK1||ROE^MARIE^^^^|SPO||(216)123-4567||EC|||||||||||||||||||||||||||
PV1||O|168 ~219~C~PMA^^^^^^^^^||||277^ALLEN MYLASTNAME^BONNIE^^^^|||||||||| ||2688684|||||||||||||||||||||||||199912271408||||||002376853`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(4);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('NK1');
    expect(msg.segments[3].name).toBe('PV1');

    const msh = msg.getSegment('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.getField(3).toString()).toBe('EPIC');
    expect(msh.getField(4).toString()).toBe('EPICADT');

    const pid = msg.getSegment('PID') as Hl7Segment;
    expect(pid).toBeDefined();
    expect(pid.getField(2).getComponent(1)).toBe('0493575');
    expect(pid.getField(2).toString()).toBe('0493575^^^2^ID 1');
    expect(pid.getComponent(2, 1)).toBe('0493575');

    const nk1 = msg.getSegment('NK1') as Hl7Segment;
    expect(nk1).toBeDefined();
    expect(nk1.getField(2).getComponent(1)).toBe('ROE');
    expect(nk1.getField(2).getComponent(2)).toBe('MARIE');
    expect(nk1.getField(2).toString()).toBe('ROE^MARIE^^^^');

    const pv1 = msg.getSegment('PV1') as Hl7Segment;
    expect(pv1).toBeDefined();
    expect(pv1.getField(2).getComponent(1)).toBe('O');
    expect(pv1.getField(2).toString()).toBe('O');
  });

  test('QBP_Q11', () => {
    const text = `MSH|^~\\&|cobas® pro||host||20160724080600+0200||QBP^Q11^QBP_Q11|1233|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-27R^ROCHE
QPD|INISEQ^^99ROC|query1233|123|50001|1|||||SERPLAS^^99ROC|SC^^99ROC|R
RCP|I|1|R^^HL70394`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(3);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('QPD');
    expect(msg.segments[2].name).toBe('RCP');

    const msh = msg.getSegment('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.getField(3).toString()).toBe('cobas® pro');
    expect(msh.getField(5).toString()).toBe('host');
  });

  test('OUL_R22', () => {
    const text = `MSH|^~\\&|cobas pro||host||20180222150842+0100||OUL^R22^OUL_R22|97|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE
PID|||||^^^^^^U|||U
SPM|1|022&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~||||||||||PSCO^^99ROC|||SC^^99ROC
SAC|||022^BARCODE|||||||50120|2||||||||||||||||||^1^:^1
OBR|1|""||20490^^99ROC|||||||
ORC|SC||||CM
TQ1|||||||||R^^HL70485
OBX|1|NM|20490^20490^99ROC^^^IHELAW|1|32.2|mg/L^^99ROC||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|2|CE|20490^20490^99ROC^^^IHELAW|1|^^99ROC|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
TCD|20490^^99ROC|^1^:^1
INV|2049001|OK^^HL70383~CURRENT^^99ROC|R1|514|1|8||||||20181030||||256616
INV|2049001|OK^^HL70383~CURRENT^^99ROC|R3|514|1|8||||||20181030||||256616
OBX|3|DTM|PT^Pipetting_Time^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|20180222145824|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|4|EI|CalibrationID^CalibrationID^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|23|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|5|EI|QCTID^QC·Test·ID^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|62~67|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|6|CE|QCSTATE^QC·Status^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|2^^99ROC|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|7|ST|TR_TECHNICALLIMIT^TR_TECHNICALLIMIT^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|0.300·-·350|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|8|ST|TR_REPEATLIMIT^TR_REPEATLIMIT^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|-99999·-·999999|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|9|ST|TR_EXPECTEDVALUES^TR_EXPECTEDVALUES^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|-99999·-·999999|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(19);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('SPM');

    const pid = msg.getSegment('PID') as Hl7Segment;
    expect(pid).toBeDefined();
    expect(pid.toString()).toBe('PID|||||^^^^^^U|||U');

    const msh = msg.getSegment('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.getField(3).toString()).toBe('cobas pro');
    expect(msh.getField(5).toString()).toBe('host');

    const obxs = msg.getAllSegments('OBX');
    expect(obxs).toBeDefined();
    expect(obxs.length).toBe(9);

    let i = 1;
    for (const obx of obxs) {
      expect(obx.name).toBe('OBX');
      expect(obx.getField(1).toString()).toBe(i.toString());
      i++;
    }
  });

  test('Non-standard encoding', () => {
    const text =
      'MSH_^~\\&_Main_XYZ_iFW_ABC_20160915003015__ACK_9B38584D_P_2.6.1_\r' +
      'MSA_AA_9B38584D_Everything was okay dokay!_';

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(2);
    expect(msg.toString()).toBe(text);

    const msa = msg.getSegment('MSA') as Hl7Segment;
    expect(msa).toBeDefined();
    expect(msa.getField(1).toString()).toBe('AA');
    expect(msa.getField(2).toString()).toBe('9B38584D');
    expect(msa.getField(3).toString()).toBe('Everything was okay dokay!');
  });

  test('Sub-field values', () => {
    const text =
      'MSH|^~\\&|cobas pro||Host||20220812155051+0900||OUL^R22^OUL_R22|2019|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE\r' +
      'PID|||||^^^^^^U|||U\r' +
      'SPM|1|140799&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~|||||||||||||SC^^99ROC\r' +
      'SAC|||140799^BARCODE|||||||50036|1||||||||||||||||||^1^:^1\r' +
      'OBR|1|""||10020^^99ROC|||||||\r' +
      'ORC|SC||||CM\r' +
      'TQ1|||||||||R^^HL70485\r' +
      'OBX|1|NM|10020^10020^99ROC^^^IHELAW|1|112|ng/dL^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|2|CE|10020^10020^99ROC^^^IHELAW|1|^^99ROC|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'TCD|10020^^99ROC|^1^:^1\r' +
      'INV|1310020|OK^^HL70383~CURRENT^^99ROC|ASY|24308|1|19||||||20230831||||620931\r' +
      'INV|1018448|OK^^HL70383~CURRENT^^99ROC|PRC|12854|1|1||||||20231130||||620127\r' +
      'OBX|3|DTM|PT^Pipetting_Time^99ROC^S_OTHER^Other Supplemental^IHELAW|1|20220812151841|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|4|EI|CalibrationID^CalibrationID^99ROC^S_OTHER^Other Supplemental^IHELAW|1|1081|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|5|EI|QCTID^QC Test ID^99ROC^S_OTHER^Other Supplemental^IHELAW|1|19132~19112~19092|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|6|CE|QCSTATE^QC Status^99ROC^S_OTHER^Other Supplemental^IHELAW|1|1^^99ROC|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|7|ST|TR_TECHNICALLIMIT^TR_TECHNICALLIMIT^99ROC^S_OTHER^Other Supplemental^IHELAW|1|2.50 - 1500|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|8|ST|TR_REPEATLIMIT^TR_REPEATLIMIT^99ROC^S_OTHER^Other Supplemental^IHELAW|1|-9999900 - |||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|9|ST|TR_EXPECTEDVALUES^TR_EXPECTEDVALUES^99ROC^S_OTHER^Other Supplemental^IHELAW|1|-9999900 - |||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|10|NM|10020_EFS^10020_EFS^99ROC^S_RAW^Raw Supplemental^IHELAW|1|42399.210|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|11|NM|10020_EFV^10020_EFV^99ROC^S_RAW^Raw Supplemental^IHELAW|1|-116.3324|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|12|NM|10020_EFC^10020_EFC^99ROC^S_RAW^Raw Supplemental^IHELAW|1|254.4396|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|13|NM|10020_PMT^10020_PMT^99ROC^S_RAW^Raw Supplemental^IHELAW|1|13773|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT';

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(23);
    expect(msg.toString()).toBe(text);

    // Test sub-components with the "&" separator
    const spm = msg.getSegment('SPM') as Hl7Segment;
    expect(spm.getField(2).getComponent(1)).toStrictEqual('140799&BARCODE');
    expect(spm.getField(2).getComponent(1, 0)).toStrictEqual('140799');
    expect(spm.getField(2).getComponent(1, 1)).toStrictEqual('BARCODE');

    // Test repetition with the "~" separator
    const obx = msg.getSegment('OBX') as Hl7Segment;
    expect(obx.getField(18).toString()).toStrictEqual('e801^ROCHE~2037-06^ROCHE~1^ROCHE');
    expect(obx.getField(18).getComponent(1)).toStrictEqual('e801');
    expect(obx.getField(18).getComponent(1, 0, 0)).toStrictEqual('e801');
    expect(obx.getField(18).getComponent(2, 0, 0)).toStrictEqual('ROCHE');
    expect(obx.getField(18).getComponent(1, 0, 1)).toStrictEqual('2037-06');
    expect(obx.getField(18).getComponent(2, 0, 1)).toStrictEqual('ROCHE');
    expect(obx.getComponent(18, 1, 0, 0)).toStrictEqual('e801');
    expect(obx.getComponent(18, 1, 0, 1)).toStrictEqual('2037-06');
    expect(obx.getComponent(18, 2, 0, 0)).toStrictEqual('ROCHE');
    expect(obx.getComponent(18, 2, 0, 1)).toStrictEqual('ROCHE');
  });

  test('MSH segment replacement rules', () => {
    // Create a message with MSH and PID segments
    const msg = new Hl7Message([
      new Hl7Segment(
        ['MSH', '^~\\&', 'SENDING_APP', 'SENDING_FACILITY', 'RECEIVING_APP', 'RECEIVING_FACILITY'],
        new Hl7Context()
      ),
      new Hl7Segment(['PID', '1', 'PATIENT_ID'], new Hl7Context()),
    ]);

    // Test A: MSH segments can only replace MSH segments
    const newMsh = new Hl7Segment(['MSH', '^~\\&', 'NEW_APP', 'NEW_FACILITY'], new Hl7Context());
    expect(msg.setSegment(0, newMsh)).toBe(true); // Can replace MSH with MSH at index 0
    expect(msg.setSegment(1, newMsh)).toBe(false); // Cannot place MSH at non-zero index
    expect(msg.setSegment('PID', newMsh)).toBe(false); // Cannot replace non-MSH segment with MSH

    // Test B: No other segment can replace an MSH segment
    const pid = new Hl7Segment(['PID', '1', 'PATIENT_ID'], new Hl7Context());
    expect(msg.setSegment(0, pid)).toBe(false); // Cannot replace MSH with non-MSH segment
    expect(msg.setSegment('MSH', pid)).toBe(false); // Cannot replace MSH with non-MSH segment by name
  });
});

describe('Legacy HL7 getters', () => {
  test('ADT', () => {
    const text = `MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|199912271408|CHARRIS|ADT^A04|1817457|D|2.5|
PID||0493575^^^2^ID 1|454721||DOE^JOHN^^^^|DOE^JOHN^^^^|19480203|M||B|254 MYSTREET AVE^^MYTOWN^OH^44123^USA||(216)123-4567|||M|NON|400003403~1129086|
NK1||ROE^MARIE^^^^|SPO||(216)123-4567||EC|||||||||||||||||||||||||||
PV1||O|168 ~219~C~PMA^^^^^^^^^||||277^ALLEN MYLASTNAME^BONNIE^^^^|||||||||| ||2688684|||||||||||||||||||||||||199912271408||||||002376853`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(4);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('NK1');
    expect(msg.segments[3].name).toBe('PV1');

    const msh = msg.get('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.get(2).toString()).toBe('EPIC');
    expect(msh.get(3).toString()).toBe('EPICADT');

    const pid = msg.get('PID') as Hl7Segment;
    expect(pid).toBeDefined();
    expect(pid.get(2).get(0)).toBe('0493575');
    expect(pid.get(2).toString()).toBe('0493575^^^2^ID 1');

    const nk1 = msg.get('NK1') as Hl7Segment;
    expect(nk1).toBeDefined();
    expect(nk1.get(2).get(0)).toBe('ROE');
    expect(nk1.get(2).get(1)).toBe('MARIE');
    expect(nk1.get(2).toString()).toBe('ROE^MARIE^^^^');

    const pv1 = msg.get('PV1') as Hl7Segment;
    expect(pv1).toBeDefined();
    expect(pv1.get(2).get(0)).toBe('O');
    expect(pv1.get(2).toString()).toBe('O');
  });

  test('QBP_Q11', () => {
    const text = `MSH|^~\\&|cobas® pro||host||20160724080600+0200||QBP^Q11^QBP_Q11|1233|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-27R^ROCHE
QPD|INISEQ^^99ROC|query1233|123|50001|1|||||SERPLAS^^99ROC|SC^^99ROC|R
RCP|I|1|R^^HL70394`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(3);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('QPD');
    expect(msg.segments[2].name).toBe('RCP');

    const msh = msg.get('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.get(2).toString()).toBe('cobas® pro');
    expect(msh.get(4).toString()).toBe('host');
  });

  test('OUL_R22', () => {
    const text = `MSH|^~\\&|cobas pro||host||20180222150842+0100||OUL^R22^OUL_R22|97|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE
PID|||||^^^^^^U|||U
SPM|1|022&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~||||||||||PSCO^^99ROC|||SC^^99ROC
SAC|||022^BARCODE|||||||50120|2||||||||||||||||||^1^:^1
OBR|1|""||20490^^99ROC|||||||
ORC|SC||||CM
TQ1|||||||||R^^HL70485
OBX|1|NM|20490^20490^99ROC^^^IHELAW|1|32.2|mg/L^^99ROC||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|2|CE|20490^20490^99ROC^^^IHELAW|1|^^99ROC|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
TCD|20490^^99ROC|^1^:^1
INV|2049001|OK^^HL70383~CURRENT^^99ROC|R1|514|1|8||||||20181030||||256616
INV|2049001|OK^^HL70383~CURRENT^^99ROC|R3|514|1|8||||||20181030||||256616
OBX|3|DTM|PT^Pipetting_Time^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|20180222145824|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|4|EI|CalibrationID^CalibrationID^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|23|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|5|EI|QCTID^QC·Test·ID^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|62~67|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|6|CE|QCSTATE^QC·Status^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|2^^99ROC|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|7|ST|TR_TECHNICALLIMIT^TR_TECHNICALLIMIT^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|0.300·-·350|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|8|ST|TR_REPEATLIMIT^TR_REPEATLIMIT^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|-99999·-·999999|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT
OBX|9|ST|TR_EXPECTEDVALUES^TR_EXPECTEDVALUES^99ROC^S_OTHER^Other·Supplemental^IHELAW|1|-99999·-·999999|||N^^HL70078|||F|||||Admin~REALTIME||c503^ROCHE~^ROCHE~1^ROCHE|20180222150842||||||||||RSLT`;

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(19);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('SPM');
    expect(msg.get(0)).toStrictEqual(msg.get('MSH'));

    const pid = msg.get('PID') as Hl7Segment;
    expect(pid).toBeDefined();
    expect(pid.toString()).toBe('PID|||||^^^^^^U|||U');

    const msh = msg.get('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.get(2).toString()).toBe('cobas pro');
    expect(msh.get(4).toString()).toBe('host');

    const obxs = msg.getAll('OBX');
    expect(obxs).toBeDefined();
    expect(obxs.length).toBe(9);

    let i = 1;
    for (const obx of obxs) {
      expect(obx.name).toBe('OBX');
      expect(obx.get(1).toString()).toBe(i.toString());
      i++;
    }
  });

  test('Non-standard encoding', () => {
    const text =
      'MSH_^~\\&_Main_XYZ_iFW_ABC_20160915003015__ACK_9B38584D_P_2.6.1_\r' +
      'MSA_AA_9B38584D_Everything was okay dokay!_';

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(2);
    expect(msg.toString()).toBe(text);

    const msa = msg.get('MSA') as Hl7Segment;
    expect(msa).toBeDefined();
    expect(msa.get(1).toString()).toBe('AA');
    expect(msa.get(2).toString()).toBe('9B38584D');
    expect(msa.get(3).toString()).toBe('Everything was okay dokay!');
  });

  test('Sub-field values', () => {
    const text =
      'MSH|^~\\&|cobas pro||Host||20220812155051+0900||OUL^R22^OUL_R22|2019|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-29^IHE\r' +
      'PID|||||^^^^^^U|||U\r' +
      'SPM|1|140799&BARCODE||SERPLAS^^99ROC|||||||P^^HL70369|||~~~~|||||||||||||SC^^99ROC\r' +
      'SAC|||140799^BARCODE|||||||50036|1||||||||||||||||||^1^:^1\r' +
      'OBR|1|""||10020^^99ROC|||||||\r' +
      'ORC|SC||||CM\r' +
      'TQ1|||||||||R^^HL70485\r' +
      'OBX|1|NM|10020^10020^99ROC^^^IHELAW|1|112|ng/dL^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|2|CE|10020^10020^99ROC^^^IHELAW|1|^^99ROC|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'TCD|10020^^99ROC|^1^:^1\r' +
      'INV|1310020|OK^^HL70383~CURRENT^^99ROC|ASY|24308|1|19||||||20230831||||620931\r' +
      'INV|1018448|OK^^HL70383~CURRENT^^99ROC|PRC|12854|1|1||||||20231130||||620127\r' +
      'OBX|3|DTM|PT^Pipetting_Time^99ROC^S_OTHER^Other Supplemental^IHELAW|1|20220812151841|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|4|EI|CalibrationID^CalibrationID^99ROC^S_OTHER^Other Supplemental^IHELAW|1|1081|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|5|EI|QCTID^QC Test ID^99ROC^S_OTHER^Other Supplemental^IHELAW|1|19132~19112~19092|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|6|CE|QCSTATE^QC Status^99ROC^S_OTHER^Other Supplemental^IHELAW|1|1^^99ROC|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|7|ST|TR_TECHNICALLIMIT^TR_TECHNICALLIMIT^99ROC^S_OTHER^Other Supplemental^IHELAW|1|2.50 - 1500|||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|8|ST|TR_REPEATLIMIT^TR_REPEATLIMIT^99ROC^S_OTHER^Other Supplemental^IHELAW|1|-9999900 - |||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|9|ST|TR_EXPECTEDVALUES^TR_EXPECTEDVALUES^99ROC^S_OTHER^Other Supplemental^IHELAW|1|-9999900 - |||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|10|NM|10020_EFS^10020_EFS^99ROC^S_RAW^Raw Supplemental^IHELAW|1|42399.210|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|11|NM|10020_EFV^10020_EFV^99ROC^S_RAW^Raw Supplemental^IHELAW|1|-116.3324|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|12|NM|10020_EFC^10020_EFC^99ROC^S_RAW^Raw Supplemental^IHELAW|1|254.4396|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT\r' +
      'OBX|13|NM|10020_PMT^10020_PMT^99ROC^S_RAW^Raw Supplemental^IHELAW|1|13773|COUNT^^99ROC||N^^HL70078|||F|||||ADMIN~BATCH||e801^ROCHE~2037-06^ROCHE~1^ROCHE|20220812153714||||||||||RSLT';

    const msg = Hl7Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(23);
    expect(msg.toString()).toBe(text);

    // Test sub-components with the "&" separator
    const spm = msg.get('SPM') as Hl7Segment;
    expect(spm.get(2).get(0)).toStrictEqual('140799&BARCODE');
    expect(spm.get(2).get(0, 0)).toStrictEqual('140799');
    expect(spm.get(2).get(0, 1)).toStrictEqual('BARCODE');

    // Test repetition with the "~" separator
    const obx = msg.get('OBX') as Hl7Segment;
    expect(obx.get(18).toString()).toStrictEqual('e801^ROCHE~2037-06^ROCHE~1^ROCHE');
    expect(obx.get(18).get(0)).toStrictEqual('e801');
    expect(obx.get(18).get(0, 0, 0)).toStrictEqual('e801');
    expect(obx.get(18).get(1, 0, 0)).toStrictEqual('ROCHE');
    expect(obx.get(18).get(0, 0, 1)).toStrictEqual('2037-06');
    expect(obx.get(18).get(1, 0, 1)).toStrictEqual('ROCHE');
  });
});

describe('Date time parsing', () => {
  test('Undefined for empty input', () => {
    expect(parseHl7DateTime(undefined)).toBeUndefined();
  });

  test('Correct ISO-8601 format with default options', () => {
    const hl7Date = '20230508103000';
    const expectedResult = '2023-05-08T10:30:00.000Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });

  test('Correct ISO-8601 format without seconds', () => {
    const hl7Date = '202305081030';
    const options = {};
    const expectedResult = '2023-05-08T10:30:00.000Z';
    expect(parseHl7DateTime(hl7Date, options)).toBe(expectedResult);
  });

  test('Correct ISO-8601 format with custom timezone offset', () => {
    const hl7Date = '20230508103000';
    const options = { tzOffset: '+02:00' };
    const expectedResult = '2023-05-08T08:30:00.000Z';
    expect(parseHl7DateTime(hl7Date, options)).toBe(expectedResult);
  });

  test('Correct date strings with seconds', () => {
    const hl7Date = '20230508103045';
    const expectedResult = '2023-05-08T10:30:45.000Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });

  test('Correct date strings with partial seconds', () => {
    const hl7Date = '2023050810304';
    const expectedResult = '2023-05-08T10:30:04.000Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });

  test('Optional milliseconds', () => {
    const hl7Date = '20230508103004.123';
    const expectedResult = '2023-05-08T10:30:04.123Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });

  test('Plus time zone offset', () => {
    const hl7Date = '20230508103004+0200';
    const expectedResult = '2023-05-08T08:30:04.000Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });

  test('Minus time zone offset', () => {
    const hl7Date = '20230508103004-0200';
    const expectedResult = '2023-05-08T12:30:04.000Z';
    expect(parseHl7DateTime(hl7Date)).toBe(expectedResult);
  });
});

describe('Date time formatting', () => {
  test('Date object', () => {
    const isoDateTime = new Date('2023-05-08T10:30:04.000Z');
    const expectedResult = '20230508103004';
    expect(formatHl7DateTime(isoDateTime)).toBe(expectedResult);
  });

  test('ISO string', () => {
    const isoDateTime = '2023-05-08T10:30:04.000Z';
    const expectedResult = '20230508103004';
    expect(formatHl7DateTime(isoDateTime)).toBe(expectedResult);
  });

  test('With milliseconds', () => {
    const isoDateTime = '2023-05-08T10:30:04.123Z';
    const expectedResult = '20230508103004.123';
    expect(formatHl7DateTime(isoDateTime)).toBe(expectedResult);
  });
});

describe('HL7 Setter Functions', () => {
  const context = new Hl7Context();

  describe('Hl7Message.setSegment', () => {
    it('should set segment by numeric index', () => {
      const message = new Hl7Message([
        new Hl7Segment(['MSH', '|', '^~\\&'], context),
        new Hl7Segment(['PID', '1', '2'], context),
      ]);

      const newSegment = new Hl7Segment(['PID', '3', '4'], context);
      expect(message.setSegment(1, newSegment)).toBe(true);
      expect(message.segments[1].toString()).toBe('PID|3|4');
    });

    it('should set segment by name', () => {
      const message = new Hl7Message([
        new Hl7Segment(['MSH', '|', '^~\\&'], context),
        new Hl7Segment(['PID', '1', '2'], context),
      ]);

      const newSegment = new Hl7Segment(['PID', '3', '4'], context);
      expect(message.setSegment('PID', newSegment)).toBe(true);
      expect(message.segments[1].toString()).toBe('PID|3|4');
    });

    it('should return append segment to end of message if index is larger than the length of the segments array', () => {
      const message = new Hl7Message([new Hl7Segment(['MSH', '|', '^~\\&'], context)]);

      const newSegment = new Hl7Segment(['PID', '1', '2'], context);
      expect(message.setSegment(5, newSegment)).toBe(true);
      expect(message.segments[1].toString()).toBe('PID|1|2');
    });

    it('should return false for non-existent segment name', () => {
      const message = new Hl7Message([new Hl7Segment(['MSH', '|', '^~\\&'], context)]);

      const newSegment = new Hl7Segment(['PID', '1', '2'], context);
      expect(message.setSegment('NONEXISTENT', newSegment)).toBe(false);
    });
  });

  describe('Hl7Segment.setField', () => {
    it('should set field in regular segment', () => {
      const segment = new Hl7Segment(['PID', '1', '2'], context);
      expect(segment.setField(2, 'new value')).toBe(true);
      expect(segment.getField(2).toString()).toBe('new value');
    });

    it('should handle MSH segment field indexing offset correctly', () => {
      const segment = new Hl7Segment(['MSH', '|', '^~\\&', 'SENDING_APP'], context);
      // Field 3 is actually the first field after MSH.1 and MSH.2
      expect(segment.setField(3, 'NEW_APP')).toBe(true);
      expect(segment.getField(3).toString()).toBe('NEW_APP');
      // Verify MSH.1 and MSH.2 are preserved
      expect(segment.getField(1).toString()).toBe('|');
      expect(segment.getField(2).toString()).toBe('^~\\&');
    });

    it('should not allow changing MSH.1', () => {
      const segment = new Hl7Segment(['MSH', '|', '^~\\&'], context);
      expect(segment.setField(1, 'new value')).toBe(false);
    });

    it('should not allow changing MSH.2', () => {
      const segment = new Hl7Segment(['MSH', '|', '^~\\&'], context);
      expect(segment.setField(2, 'new value')).toBe(false);
    });

    it('should append field if index is larger than the length of the fields array', () => {
      const segment = new Hl7Segment(['PID', '1', '2'], context);
      expect(segment.setField(5, 'new value')).toBe(true);
      expect(segment.getField(5).toString()).toBe('new value');
    });
  });

  describe('Hl7Field.setComponent', () => {
    it('should set component value', () => {
      const field = new Hl7Field([['value1', 'value2']], context);
      expect(field.setComponent(2, 'new value')).toBe(true);
      expect(field.getComponent(2)).toBe('new value');
    });

    it('should set subcomponent value', () => {
      const field = new Hl7Field([['value1&sub1&sub2']], context);
      expect(field.setComponent(1, 'new sub', 1)).toBe(true);
      expect(field.getComponent(1, 1)).toBe('new sub');
    });

    it('should handle new repetitions', () => {
      const field = new Hl7Field([['value1']], context);
      expect(field.setComponent(1, 'new value', undefined, 1)).toBe(true);
      expect(field.getComponent(1, undefined, 1)).toBe('new value');
    });

    it('should handle new subcomponents', () => {
      const field = new Hl7Field([['value1']], context);
      expect(field.setComponent(1, 'new sub', 2)).toBe(true);
      expect(field.getComponent(1, 2)).toBe('new sub');
    });
  });

  describe('Hl7Segment.setComponent', () => {
    it('should set component value', () => {
      const segment = new Hl7Segment(['PID', '1^2^3'], context);
      expect(segment.setComponent(1, 2, 'new value')).toBe(true);
      expect(segment.getComponent(1, 2)).toBe('new value');
    });

    it('should set subcomponent value', () => {
      const segment = new Hl7Segment(['PID', '1&2&3'], context);
      expect(segment.setComponent(1, 1, 'new sub', 1)).toBe(true);
      expect(segment.getComponent(1, 1, 1)).toBe('new sub');
    });

    it('should return false for invalid field index', () => {
      const segment = new Hl7Segment(['PID', '1', '2'], context);
      expect(segment.setComponent(5, 1, 'new value')).toBe(false);
    });
  });
});
