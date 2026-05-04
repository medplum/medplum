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

    const msh = msg.header;
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

describe('Hl7Message.getAllSegments with segment map', () => {
  test('Returns segments by name from map', () => {
    const text =
      'MSH|^~\\&|cobas pro||host||20240102030405||OUL^R22^OUL_R22|12345|P|2.5.1\r' +
      'PID|||||^^^^^^U|||U\r' +
      'OBX|1|NM|GLU||100|mg/dL\r' +
      'OBX|2|NM|HGB||14.5|g/dL\r' +
      'OBX|3|NM|WBC||7.2|10*3/uL';
    const msg = Hl7Message.parse(text);

    const obxs = msg.getAllSegments('OBX');
    expect(obxs).toHaveLength(3);
    expect(obxs[0].getField(1).toString()).toBe('1');
    expect(obxs[1].getField(1).toString()).toBe('2');
    expect(obxs[2].getField(1).toString()).toBe('3');
  });

  test('Returns empty array for non-existent segment name', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5';
    const msg = Hl7Message.parse(text);
    expect(msg.getAllSegments('ZZZ')).toEqual([]);
  });

  test('Returns single-element array for unique segment', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||12345^^^MRN';
    const msg = Hl7Message.parse(text);

    const pids = msg.getAllSegments('PID');
    expect(pids).toHaveLength(1);
    expect(pids[0].getField(1).toString()).toBe('1');
  });

  test('getSegment by name uses segment map', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||12345^^^MRN\rPV1|1|O';
    const msg = Hl7Message.parse(text);

    expect(msg.getSegment('PID')?.name).toBe('PID');
    expect(msg.getSegment('PV1')?.getField(2).toString()).toBe('O');
    expect(msg.getSegment('ZZZ')).toBeUndefined();
  });

  test('Segment map is invalidated after setSegment', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([
      new Hl7Segment(['MSH', '^~\\&', 'APP'], context),
      new Hl7Segment(['PID', '1', 'OLD'], context),
    ]);

    expect(msg.getAllSegments('PID')).toHaveLength(1);
    expect(msg.getAllSegments('PID')[0].getField(2).toString()).toBe('OLD');

    const newPid = new Hl7Segment(['PID', '1', 'NEW'], context);
    msg.setSegment(1, newPid);

    expect(msg.getAllSegments('PID')).toHaveLength(1);
    expect(msg.getAllSegments('PID')[0].getField(2).toString()).toBe('NEW');
  });

  test('Segment map handles appended segment via setSegment', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([new Hl7Segment(['MSH', '^~\\&', 'APP'], context)]);

    expect(msg.getAllSegments('OBX')).toEqual([]);

    msg.setSegment(99, new Hl7Segment(['OBX', '1', 'NM', 'GLU'], context));
    expect(msg.getAllSegments('OBX')).toHaveLength(1);
  });

  test('getSegment returns the first segment when multiple exist', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||OUL^R22|1|P|2.5\rOBX|1|NM|GLU||100|mg/dL\rOBX|2|NM|HGB||14.5|g/dL';
    const msg = Hl7Message.parse(text);

    const first = msg.getSegment('OBX');
    expect(first?.getField(1).toString()).toBe('1');
  });

  test('Segment map updates when setSegment replaces with a different segment name', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([
      new Hl7Segment(['MSH', '^~\\&', 'APP'], context),
      new Hl7Segment(['PID', '1', 'PATIENT'], context),
    ]);

    expect(msg.getAllSegments('PID')).toHaveLength(1);
    expect(msg.getAllSegments('NK1')).toEqual([]);

    // Replace PID at index 1 with NK1
    msg.setSegment(1, new Hl7Segment(['NK1', '1', 'CONTACT'], context));

    expect(msg.getAllSegments('PID')).toEqual([]);
    expect(msg.getAllSegments('NK1')).toHaveLength(1);
    expect(msg.getSegment('NK1')?.getField(2).toString()).toBe('CONTACT');
  });
});

describe('Hl7Message.toString caching', () => {
  test('Parsed message returns original string without rebuilding', () => {
    const text =
      'MSH|^~\\&|Main_HIS|XYZ_HOSPITAL|iFW|ABC_Lab|20160915003015||ACK|9B38584D|P|2.6.1|\r' +
      'MSA|AA|9B38584D|Everything was okay dokay!|';
    const msg = Hl7Message.parse(text);

    // First call returns original text
    expect(msg.toString()).toBe(text);
    // Second call returns same result
    expect(msg.toString()).toBe(text);
  });

  test('Manually constructed message caches result after first toString', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([
      new Hl7Segment(['MSH', '^~\\&', 'APP', 'FAC'], context),
      new Hl7Segment(['PID', '1', '12345'], context),
    ]);

    // First call builds and caches the string
    const result1 = msg.toString();
    expect(result1).toBe('MSH|^~\\&|APP|FAC\rPID|1|12345');

    // Second call returns cached result
    const result2 = msg.toString();
    expect(result2).toBe(result1);
  });

  test('Cache is invalidated after setSegment', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||OLD_MRN';
    const msg = Hl7Message.parse(text);

    // Cached from parse
    expect(msg.toString()).toBe(text);

    // Mutate
    const context = msg.context;
    msg.setSegment('PID', new Hl7Segment(['PID', '1', '', 'NEW_MRN'], context));

    // Cache invalidated — rebuilt string reflects the change
    const updated = msg.toString();
    expect(updated).not.toBe(text);
    expect(updated).toContain('NEW_MRN');

    // Subsequent call returns same cached result
    expect(msg.toString()).toBe(updated);
  });

  test('Cache is invalidated when segment field is modified via setField', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||OLD_MRN';
    const msg = Hl7Message.parse(text);

    expect(msg.toString()).toBe(text);

    const pid = msg.getSegment('PID') as Hl7Segment;
    pid.setField(3, 'NEW_MRN');

    const updated = msg.toString();
    expect(updated).not.toBe(text);
    expect(updated).toContain('NEW_MRN');
  });

  test('Cache is invalidated when segment component is modified via setComponent', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||OLD^VALUE';
    const msg = Hl7Message.parse(text);

    expect(msg.toString()).toBe(text);

    const pid = msg.getSegment('PID') as Hl7Segment;
    pid.setComponent(3, 1, 'NEW');

    const updated = msg.toString();
    expect(updated).not.toBe(text);
    expect(updated).toContain('NEW^VALUE');
  });

  test('Cache is invalidated when field is modified directly via getField().setComponent()', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||OLD^COMP2';
    const msg = Hl7Message.parse(text);

    expect(msg.toString()).toBe(text);

    // Mutate a field directly, bypassing Hl7Segment.setComponent
    const pid = msg.getSegment('PID') as Hl7Segment;
    const field = pid.getField(3);
    field.setComponent(1, 'NEW');

    const updated = msg.toString();
    expect(updated).not.toBe(text);
    expect(updated).toContain('NEW^COMP2');
  });

  test('Newly added segment via setSegment also invalidates cache on mutation', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([
      new Hl7Segment(['MSH', '^~\\&', 'APP'], context),
      new Hl7Segment(['PID', '1', 'ORIG'], context),
    ]);

    const first = msg.toString();

    // Replace with a new segment
    const newPid = new Hl7Segment(['PID', '1', 'REPLACED'], context);
    msg.setSegment(1, newPid);

    const afterReplace = msg.toString();
    expect(afterReplace).not.toBe(first);

    // Now mutate the new segment directly
    newPid.setField(2, 'MUTATED');
    const afterMutate = msg.toString();
    expect(afterMutate).not.toBe(afterReplace);
    expect(afterMutate).toContain('MUTATED');
  });

  test('Field added via setField on a bound segment also invalidates message cache', () => {
    const context = new Hl7Context();
    const msg = new Hl7Message([
      new Hl7Segment(['MSH', '^~\\&', 'APP'], context),
      new Hl7Segment(['PID', '1', 'VAL'], context),
    ]);

    const first = msg.toString();

    // Add a new field to the segment
    const pid = msg.getSegment('PID') as Hl7Segment;
    pid.setField(3, 'ADDED');
    const afterAdd = msg.toString();
    expect(afterAdd).not.toBe(first);

    // Now mutate the newly added field directly
    pid.getField(3).setComponent(1, 'CHANGED');
    const afterFieldMutate = msg.toString();
    expect(afterFieldMutate).not.toBe(afterAdd);
    expect(afterFieldMutate).toContain('CHANGED');
  });
});

describe('Hl7Segment.toString caching', () => {
  test('Parsed message seeds caches on child segments and fields', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||MRN^^^AUTH||DOE^JOHN';
    const msg = Hl7Message.parse(text);

    // Segment toString returns original segment text
    const pid = msg.getSegment('PID') as Hl7Segment;
    expect(pid.toString()).toBe('PID|1||MRN^^^AUTH||DOE^JOHN');

    // Field toString returns original field text
    expect(pid.getField(3).toString()).toBe('MRN^^^AUTH');
    expect(pid.getField(5).toString()).toBe('DOE^JOHN');
  });

  test('Parsed segment returns original string without rebuilding', () => {
    const text = 'PID|1||12345^^^MRN||DOE^JOHN';
    const segment = Hl7Segment.parse(text);
    expect(segment.toString()).toBe(text);
    expect(segment.toString()).toBe(text);
  });

  test('Manually constructed segment caches after first toString', () => {
    const segment = new Hl7Segment(['PID', '1', '12345']);
    const result = segment.toString();
    expect(result).toBe('PID|1|12345');
    expect(segment.toString()).toBe(result);
  });

  test('Segment cache is invalidated by setField', () => {
    const segment = Hl7Segment.parse('PID|1||OLD_MRN');
    expect(segment.toString()).toBe('PID|1||OLD_MRN');

    segment.setField(3, 'NEW_MRN');
    const updated = segment.toString();
    expect(updated).toContain('NEW_MRN');
    expect(segment.toString()).toBe(updated);
  });

  test('Segment cache is invalidated by setComponent', () => {
    const segment = Hl7Segment.parse('PID|1||OLD^COMP');
    expect(segment.toString()).toBe('PID|1||OLD^COMP');

    segment.setComponent(3, 1, 'NEW');
    const updated = segment.toString();
    expect(updated).toContain('NEW^COMP');
    expect(segment.toString()).toBe(updated);
  });

  test('Standalone segment cache is invalidated by direct field mutation', () => {
    const segment = Hl7Segment.parse('PID|1||OLD^COMP');
    expect(segment.toString()).toBe('PID|1||OLD^COMP');

    segment.getField(3).setComponent(1, 'DIRECT');
    const updated = segment.toString();
    expect(updated).toContain('DIRECT^COMP');
  });
});

describe('Hl7Field.toString caching', () => {
  test('Parsed field returns original string without rebuilding', () => {
    const text = 'x1^x2^x3~y1^y2^y3';
    const field = Hl7Field.parse(text);
    expect(field.toString()).toBe(text);
    expect(field.toString()).toBe(text);
  });

  test('Manually constructed field caches after first toString', () => {
    const field = new Hl7Field([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    const result = field.toString();
    expect(result).toBe('a^b~c^d');
    expect(field.toString()).toBe(result);
  });

  test('Field cache is invalidated by setComponent', () => {
    const field = Hl7Field.parse('OLD^comp2');
    expect(field.toString()).toBe('OLD^comp2');

    field.setComponent(1, 'NEW');
    const updated = field.toString();
    expect(updated).toBe('NEW^comp2');
    expect(field.toString()).toBe(updated);
  });

  test('Field cache is invalidated by subcomponent mutation', () => {
    const field = Hl7Field.parse('a&b&c^comp2');
    expect(field.toString()).toBe('a&b&c^comp2');

    field.setComponent(1, 'NEW', 1);
    const updated = field.toString();
    expect(updated).toBe('a&NEW&c^comp2');
    expect(field.toString()).toBe(updated);
  });
});

describe('Hl7Message parse/toString caching', () => {
  function buildSampleMessage(obxCount: number): string {
    const segments = [
      'MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ORU^R01|MSG00001|P|2.5.1',
      'PID|1||123456^^^MRN||DOE^JOHN^A||19800101|M|||123 MAIN ST^^ANYTOWN^NY^12345||555-555-1234',
      'PV1|1|I|ICU^101^A|E|||1234^SMITH^JAMES^A^^^MD',
      'ORC|RE|ORD001|FIL001||CM',
      'OBR|1|ORD001|FIL001|80053^COMPREHENSIVE METABOLIC PANEL^CPT|||20240218120000',
    ];
    for (let i = 1; i <= obxCount; i++) {
      segments.push(`OBX|${i}|NM|${2000 + i}^Component ${i}^99LAB|1|42.0|mg/dL||N|||F`);
    }
    return segments.join('\r');
  }

  test.each([1, 10, 100])('parse → toString round-trips the input (%i OBX)', (count) => {
    const text = buildSampleMessage(count);
    const msg = Hl7Message.parse(text);
    expect(msg.toString()).toBe(text);
    // Repeat to make sure cache returns the same value
    expect(msg.toString()).toBe(text);
  });

  test.each([1, 10, 100])("getAllSegments('OBX') returns the right OBX segments (%i OBX)", (count) => {
    const text = buildSampleMessage(count);
    const msg = Hl7Message.parse(text);
    const obxs = msg.getAllSegments('OBX');
    expect(obxs).toHaveLength(count);
    for (let i = 0; i < count; i++) {
      expect(obxs[i].name).toBe('OBX');
      expect(obxs[i].getField(1).toString()).toBe(String(i + 1));
      expect(obxs[i].getField(3).getComponent(1)).toBe(String(2000 + i + 1));
      // Each parsed segment must round-trip back to the original line in the input.
      expect(obxs[i].toString()).toBe(`OBX|${i + 1}|NM|${2001 + i}^Component ${i + 1}^99LAB|1|42.0|mg/dL||N|||F`);
    }
    // Touching segments through getAllSegments must not change the message-level toString.
    expect(msg.toString()).toBe(text);
  });

  test("parse + getAllSegments('OBX') + toString round-trips the input unchanged", () => {
    const text = buildSampleMessage(50);
    const msg = Hl7Message.parse(text);

    // getAllSegments triggers per-segment parsing but does not mutate, so the
    // message-level cached string must still be the original input.
    msg.getAllSegments('OBX');
    expect(msg.toString()).toBe(text);
    expect(msg.toString()).toBe(text);
  });

  test('mutating non-OBX fields produces the exact expected toString output', () => {
    const text = buildSampleMessage(3);
    const msg = Hl7Message.parse(text);

    // Prime the cache so we know the post-mutation rebuild is doing real work.
    expect(msg.toString()).toBe(text);

    msg.getSegment('PID')?.setField(5, 'SMITH^JANE^B');
    msg.getSegment('PV1')?.setField(3, 'ICU^202^B');
    msg.getSegment('ORC')?.setField(2, 'ORD999');

    const expected = [
      'MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ORU^R01|MSG00001|P|2.5.1',
      // PID.5 (the patient name field) is replaced; surrounding empty fields and trailing fields are unchanged
      'PID|1||123456^^^MRN||SMITH^JANE^B||19800101|M|||123 MAIN ST^^ANYTOWN^NY^12345||555-555-1234',
      'PV1|1|I|ICU^202^B|E|||1234^SMITH^JAMES^A^^^MD',
      'ORC|RE|ORD999|FIL001||CM',
      'OBR|1|ORD001|FIL001|80053^COMPREHENSIVE METABOLIC PANEL^CPT|||20240218120000',
      'OBX|1|NM|2001^Component 1^99LAB|1|42.0|mg/dL||N|||F',
      'OBX|2|NM|2002^Component 2^99LAB|1|42.0|mg/dL||N|||F',
      'OBX|3|NM|2003^Component 3^99LAB|1|42.0|mg/dL||N|||F',
    ].join('\r');

    expect(msg.toString()).toBe(expected);
    // And the result is now itself cached
    expect(msg.toString()).toBe(expected);
  });

  test('mutating a single component in a field busts the cache up to the message', () => {
    const text = buildSampleMessage(2);
    const msg = Hl7Message.parse(text);
    expect(msg.toString()).toBe(text);
    // Repeat call before mutation — still identical to input
    expect(msg.toString()).toBe(text);

    // PID.5 = 'DOE^JOHN^A' — replace the first component (last name)
    msg.getSegment('PID')?.getField(5).setComponent(1, 'NEWLAST');

    const expected = text.replace('DOE^JOHN^A', 'NEWLAST^JOHN^A');
    expect(msg.toString()).toBe(expected);
    // Repeat call after mutation — cached value still matches expected
    expect(msg.toString()).toBe(expected);
  });

  test('mutating a subcomponent busts the cache up to the message', () => {
    const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||a&b&c^comp2';
    const msg = Hl7Message.parse(text);
    expect(msg.toString()).toBe(text);
    expect(msg.toString()).toBe(text);

    msg.getSegment('PID')?.getField(3).setComponent(1, 'NEW', 1);
    const expected = text.replace('a&b&c', 'a&NEW&c');
    expect(msg.toString()).toBe(expected);
    expect(msg.toString()).toBe(expected);
  });

  test('mutating an OBX segment leaves untouched segments emitted from their original strings', () => {
    const text = buildSampleMessage(5);
    const msg = Hl7Message.parse(text);
    expect(msg.toString()).toBe(text);

    // Touch a single OBX — only this segment's string form should change.
    const obxs = msg.getAllSegments('OBX');
    // Even after lazy parsing the OBX segments, the message toString is unchanged.
    expect(msg.toString()).toBe(text);

    obxs[2].setField(5, '99.9');

    const expected = text.replace('OBX|3|NM|2003^Component 3^99LAB|1|42.0', 'OBX|3|NM|2003^Component 3^99LAB|1|99.9');
    expect(msg.toString()).toBe(expected);
    expect(msg.toString()).toBe(expected);

    // The other OBX segments should still round-trip to their original line text.
    for (let i = 0; i < obxs.length; i++) {
      if (i === 2) {
        continue;
      }
      expect(obxs[i].toString()).toBe(`OBX|${i + 1}|NM|${2001 + i}^Component ${i + 1}^99LAB|1|42.0|mg/dL||N|||F`);
    }
  });

  describe('component mutations invalidate caches across every segment-access path', () => {
    // Each test grabs a segment (or a field within a segment) through one of the public
    // access paths — `segments[i]`, `getSegment(index)`, `getSegment(name)`,
    // `getAllSegments(name)[i]`, `header` — mutates a component, and asserts that:
    //   1. the message toString() reflects the mutation on the very next call
    //   2. the mutation is observed no matter which access path is used afterwards
    //   3. segment identity is stable across access paths (same instance returned)
    //   4. the cached toString() value after the mutation matches the rebuilt value

    test('setComponent via segments[index] busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(3);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      // PID is at index 1 in the source message
      const pid = msg.segments[1];
      expect(pid.name).toBe('PID');
      pid.setComponent(5, 1, 'SEGIDX');

      const expected = text.replace('DOE^JOHN^A', 'SEGIDX^JOHN^A');
      expect(msg.toString()).toBe(expected);
      // Second call should hit the cache with the same value
      expect(msg.toString()).toBe(expected);

      // All access paths must see the mutation and return the same segment instance
      expect(msg.getSegment(1)).toBe(pid);
      expect(msg.getSegment('PID')).toBe(pid);
      expect(msg.getAllSegments('PID')[0]).toBe(pid);
      expect(msg.segments[1]).toBe(pid);
      expect(msg.getSegment('PID')?.getField(5).getComponent(1)).toBe('SEGIDX');
    });

    test('setComponent via getSegment(index) busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(3);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      const pv1 = msg.getSegment(2);
      expect(pv1?.name).toBe('PV1');
      pv1?.setComponent(3, 2, '999');

      const expected = text.replace('ICU^101^A', 'ICU^999^A');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      expect(msg.getSegment(2)).toBe(pv1);
      expect(msg.getSegment('PV1')).toBe(pv1);
      expect(msg.getAllSegments('PV1')[0]).toBe(pv1);
      expect(msg.segments[2]).toBe(pv1);
      expect(msg.getSegment('PV1')?.getField(3).getComponent(2)).toBe('999');
    });

    test('setComponent via getSegment(name) busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(2);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      const orc = msg.getSegment('ORC');
      expect(orc?.name).toBe('ORC');
      orc?.getField(2).setComponent(1, 'BYNAME');

      const expected = text.replace('ORD001|FIL001||CM', 'BYNAME|FIL001||CM');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      expect(msg.getSegment('ORC')).toBe(orc);
      expect(msg.getSegment(3)).toBe(orc);
      expect(msg.getAllSegments('ORC')[0]).toBe(orc);
      expect(msg.segments[3]).toBe(orc);
      expect(msg.getSegment('ORC')?.getField(2).getComponent(1)).toBe('BYNAME');
    });

    test('setComponent via getAllSegments(name)[i] busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(4);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      const obxs = msg.getAllSegments('OBX');
      expect(obxs).toHaveLength(4);
      // Mutate OBX[2] (which is the 3rd OBX — OBX.1 = '3')
      obxs[2].setComponent(3, 2, 'RENAMED COMPONENT');

      const expected = text.replace('2003^Component 3^99LAB', '2003^RENAMED COMPONENT^99LAB');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      // Segment identity must be stable across paths — OBX[2] lives at index 7
      // (MSH, PID, PV1, ORC, OBR, OBX[0], OBX[1], OBX[2])
      const target = obxs[2];
      expect(msg.getSegment(7)).toBe(target);
      expect(msg.segments[7]).toBe(target);
      expect(msg.getAllSegments('OBX')[2]).toBe(target);
      // getSegment('OBX') returns the *first* OBX, not this one
      expect(msg.getSegment('OBX')).not.toBe(target);
      expect(msg.getAllSegments('OBX')[2].getField(3).getComponent(2)).toBe('RENAMED COMPONENT');
    });

    test('setField via getAllSegments(name)[i] busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(3);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      const obxs = msg.getAllSegments('OBX');
      obxs[1].setField(5, '77.7');

      const expected = text.replace(
        'OBX|2|NM|2002^Component 2^99LAB|1|42.0|mg/dL',
        'OBX|2|NM|2002^Component 2^99LAB|1|77.7|mg/dL'
      );
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      // OBX[1] is at message index 6
      const target = obxs[1];
      expect(msg.getSegment(6)).toBe(target);
      expect(msg.segments[6]).toBe(target);
      expect(msg.getAllSegments('OBX')[1]).toBe(target);
      expect(msg.getAllSegments('OBX')[1].getField(5).toString()).toBe('77.7');
    });

    test('setComponent via header busts message cache and is visible from every access path', () => {
      const text = buildSampleMessage(2);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      const header = msg.header;
      expect(header.name).toBe('MSH');
      // MSH.3 is the sending application — component 1
      header.getField(3).setComponent(1, 'NEW_APP');

      const expected = text.replace('|SENDING_APP|', '|NEW_APP|');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      expect(msg.header).toBe(header);
      expect(msg.getSegment(0)).toBe(header);
      expect(msg.getSegment('MSH')).toBe(header);
      expect(msg.segments[0]).toBe(header);
      expect(msg.getAllSegments('MSH')[0]).toBe(header);
    });

    test('field mutation propagates up through the field → segment → message cache chain', () => {
      const text = buildSampleMessage(2);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      // Prime the PID segment's toString cache so we know its cache actually gets busted
      const pid = msg.getSegment('PID') as Hl7Segment;
      const pidOriginal = pid.toString();
      expect(pid.toString()).toBe(pidOriginal);

      // Grab a single field reference and mutate a component on it
      const pid5 = pid.getField(5);
      const pid5Original = pid5.toString();
      expect(pid5.toString()).toBe(pid5Original);
      pid5.setComponent(2, 'JANE');

      // Field's own toString reflects the mutation
      const expectedField = 'DOE^JANE^A';
      expect(pid5.toString()).toBe(expectedField);

      // Segment toString rebuilds with the mutated field
      const expectedSegment = pidOriginal.replace(pid5Original, expectedField);
      expect(pid.toString()).toBe(expectedSegment);

      // Message toString rebuilds with the mutated segment
      const expectedMessage = text.replace(pid5Original, expectedField);
      expect(msg.toString()).toBe(expectedMessage);

      // Every cached layer now returns the mutated value on repeat access
      expect(pid5.toString()).toBe(expectedField);
      expect(pid.toString()).toBe(expectedSegment);
      expect(msg.toString()).toBe(expectedMessage);
    });

    test('subcomponent mutation propagates through the cache chain from every access path', () => {
      const text = 'MSH|^~\\&|APP||FAC||20240101||ADT^A01|123|P|2.5\rPID|1||a&b&c^comp2^comp3\rOBX|1|NM|val';
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      // Touch every access path for PID so each one holds a reference before mutation
      const viaSegments = msg.segments[1];
      const viaGetByIndex = msg.getSegment(1);
      const viaGetByName = msg.getSegment('PID');
      const viaGetAll = msg.getAllSegments('PID')[0];
      expect(viaSegments).toBe(viaGetByIndex);
      expect(viaSegments).toBe(viaGetByName);
      expect(viaSegments).toBe(viaGetAll);

      // Mutate a subcomponent via getAllSegments path
      viaGetAll.getField(3).setComponent(1, 'NEW', 1);

      const expected = text.replace('a&b&c', 'a&NEW&c');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      // Every reference we held before the mutation observes the new value
      expect(viaSegments.getField(3).getComponent(1, 1)).toBe('NEW');
      expect(viaGetByIndex?.getField(3).getComponent(1, 1)).toBe('NEW');
      expect(viaGetByName?.getField(3).getComponent(1, 1)).toBe('NEW');
      expect(viaGetAll.getField(3).getComponent(1, 1)).toBe('NEW');

      // And fresh lookups on each path return the same instance
      expect(msg.segments[1]).toBe(viaSegments);
      expect(msg.getSegment(1)).toBe(viaSegments);
      expect(msg.getSegment('PID')).toBe(viaSegments);
      expect(msg.getAllSegments('PID')[0]).toBe(viaSegments);
    });

    test('mutating the same segment from different access paths accumulates on one instance', () => {
      const text = buildSampleMessage(1);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);

      // Mutate component via segments[index]
      msg.segments[1].setComponent(5, 1, 'A');
      // Mutate a different component via getSegment(name)
      msg.getSegment('PID')?.setComponent(5, 2, 'B');
      // Mutate yet another via getAllSegments(name)[0]
      msg.getAllSegments('PID')[0].setComponent(5, 3, 'C');

      const expected = text.replace('DOE^JOHN^A', 'A^B^C');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      // All four mutations landed on the same underlying segment
      expect(msg.segments[1]).toBe(msg.getSegment('PID'));
      expect(msg.segments[1]).toBe(msg.getAllSegments('PID')[0]);
      expect(msg.segments[1]).toBe(msg.getSegment(1));
    });

    test('setField on a segment retrieved via getAllSegments busts the parent message cache', () => {
      const text = buildSampleMessage(2);
      const msg = Hl7Message.parse(text);
      expect(msg.toString()).toBe(text);
      // Prime the cache a second time so a stale cache bug would be visible
      expect(msg.toString()).toBe(text);

      // Replace an entire field on OBX[0]
      const obxs = msg.getAllSegments('OBX');
      obxs[0].setField(3, 'NEWCODE^New Label^99LAB');

      const expected = text.replace('2001^Component 1^99LAB', 'NEWCODE^New Label^99LAB');
      expect(msg.toString()).toBe(expected);
      expect(msg.toString()).toBe(expected);

      // The replaced field is observable from any path
      expect(msg.getSegment('OBX')?.getField(3).toString()).toBe('NEWCODE^New Label^99LAB');
      expect(msg.segments[5].getField(3).toString()).toBe('NEWCODE^New Label^99LAB');
      expect(msg.getAllSegments('OBX')[0].getField(3).toString()).toBe('NEWCODE^New Label^99LAB');
    });

    test('getSegment(name) after a prior getAllSegments(name) lookup returns the same parsed instance', () => {
      // Covers the lazy-parse path: getAllSegments parses every matching segment eagerly,
      // so the subsequent getSegment(name) must return the already-parsed instance (not re-parse).
      const text = buildSampleMessage(2);
      const msg = Hl7Message.parse(text);

      const obxs = msg.getAllSegments('OBX');
      const firstObx = msg.getSegment('OBX');
      expect(firstObx).toBe(obxs[0]);

      firstObx?.setComponent(5, 1, '55.5');

      const expected = text.replace('OBX|1|NM|2001^Component 1^99LAB|1|42.0', 'OBX|1|NM|2001^Component 1^99LAB|1|55.5');
      expect(msg.toString()).toBe(expected);

      // The mutated instance is what getAllSegments returns on a fresh call as well
      expect(msg.getAllSegments('OBX')[0]).toBe(firstObx);
      expect(msg.getAllSegments('OBX')[0].getField(5).toString()).toBe('55.5');
    });
  });

  test('subsequent toString() calls are at least 10x faster than the first after mutation', () => {
    const text = buildSampleMessage(500);

    // Warm up the parser, JIT, and lazy-parse paths so the measurement isn't
    // dominated by one-off compilation cost.
    for (let i = 0; i < 3; i++) {
      const warm = Hl7Message.parse(text);
      warm.getSegment('PID')?.setField(5, 'WARMUP');
      warm.toString();
      warm.toString();
    }

    const msg = Hl7Message.parse(text);
    // toString before mutation must round-trip the original input.
    expect(msg.toString()).toBe(text);

    msg.getSegment('PID')?.setField(5, 'CHANGED');

    // First toString() after mutation has to rebuild the message string.
    const firstStart = process.hrtime.bigint();
    const firstResult = msg.toString();
    const firstNs = Number(process.hrtime.bigint() - firstStart);

    // The rebuilt string must match the expected mutated form, not just be cached.
    const expected = text.replace('DOE^JOHN^A', 'CHANGED');
    expect(firstResult).toBe(expected);

    // Subsequent calls should hit the cached string.
    const repeats = 1000;
    const subsequentStart = process.hrtime.bigint();
    for (let i = 0; i < repeats; i++) {
      msg.toString();
    }
    const subsequentNs = Number(process.hrtime.bigint() - subsequentStart) / repeats;

    // Sanity: the cached value matches the rebuilt one and the expected mutation.
    expect(msg.toString()).toBe(firstResult);
    expect(msg.toString()).toBe(expected);

    // Ratio assertion. Subsequent calls should be returning a cached string,
    // which is dramatically faster than re-joining hundreds of segments.
    const ratio = firstNs / Math.max(subsequentNs, 1);
    expect(ratio).toBeGreaterThanOrEqual(10);
  });

  test('subsequent toString() calls on a manually constructed message are at least 10x faster than the first', () => {
    // A manually constructed message has no cachedString seeded by parse, so
    // the first toString() does the join work; subsequent calls hit the cache.
    const context = new Hl7Context();
    const segmentLines: string[] = ['MSH|^~\\&|APP|FAC'];
    const buildSegments = (): Hl7Segment[] => {
      const result: Hl7Segment[] = [new Hl7Segment(['MSH', '^~\\&', 'APP', 'FAC'], context)];
      for (let i = 1; i <= 500; i++) {
        result.push(new Hl7Segment(['OBX', String(i), 'NM', `${2000 + i}^Component ${i}^99LAB`, '1', '42.0'], context));
      }
      return result;
    };
    for (let i = 1; i <= 500; i++) {
      segmentLines.push(`OBX|${i}|NM|${2000 + i}^Component ${i}^99LAB|1|42.0`);
    }
    const expected = segmentLines.join('\r');

    // Warm up
    for (let i = 0; i < 3; i++) {
      new Hl7Message(buildSegments(), context).toString();
    }

    const msg = new Hl7Message(buildSegments(), context);

    const firstStart = process.hrtime.bigint();
    const firstResult = msg.toString();
    const firstNs = Number(process.hrtime.bigint() - firstStart);

    // The first toString must produce the canonical joined form.
    expect(firstResult).toBe(expected);

    const repeats = 1000;
    const subsequentStart = process.hrtime.bigint();
    for (let i = 0; i < repeats; i++) {
      msg.toString();
    }
    const subsequentNs = Number(process.hrtime.bigint() - subsequentStart) / repeats;

    // Cached values match the canonical form on every call.
    expect(msg.toString()).toBe(firstResult);
    expect(msg.toString()).toBe(expected);

    const ratio = firstNs / Math.max(subsequentNs, 1);
    expect(ratio).toBeGreaterThanOrEqual(10);
  });
});
