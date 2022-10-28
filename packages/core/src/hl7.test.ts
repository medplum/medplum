import { Hl7Field, Hl7Message, Hl7Segment } from './hl7';

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

    const ack = msg.buildAck();
    expect(ack).toBeDefined();
    expect(ack.segments.length).toBe(2);
    expect(ack.segments[0].name).toBe('MSH');
    expect(ack.segments[1].name).toBe('MSA');
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
    expect(msg.get(0)).toEqual(msg.get('MSH'));

    const pid = msg.get('PID') as Hl7Segment;
    expect(pid).toBeDefined();
    expect(pid.toString()).toBe('PID|||||^^^^^^U|||U');

    const msh = msg.get('MSH') as Hl7Segment;
    expect(msh).toBeDefined();
    expect(msh.get(2)?.toString()).toBe('cobas pro');
    expect(msh.get(4)?.toString()).toBe('host');

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
    expect(spm.get(2).get(0)).toEqual('140799&BARCODE');
    expect(spm.get(2).get(0, 0)).toEqual('140799');
    expect(spm.get(2).get(0, 1)).toEqual('BARCODE');

    // Test repetition with the "~" separator
    const obx = msg.get('OBX') as Hl7Segment;
    expect(obx.get(18).toString()).toEqual('e801^ROCHE~2037-06^ROCHE~1^ROCHE');
    expect(obx.get(18).get(0)).toEqual('e801');
    expect(obx.get(18).get(0, 0, 0)).toEqual('e801');
    expect(obx.get(18).get(1, 0, 0)).toEqual('ROCHE');
    expect(obx.get(18).get(0, 0, 1)).toEqual('2037-06');
    expect(obx.get(18).get(1, 0, 1)).toEqual('ROCHE');
  });
});
