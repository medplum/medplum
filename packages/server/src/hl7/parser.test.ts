import { Message } from './parser';

describe('HL7', () => {
  test('Unsupported encoding', () => {
    expect(() => Message.parse('MSH_^~\\&|')).toThrow();
  });

  test('Minimal', () => {
    const text = 'MSH|^~\\&';
    const msg = Message.parse(text);
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

    const msg = Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(2);
    expect(msg.toString()).toBe(text);
  });

  test('ADT', () => {
    const text = `MSH|^~\\&|EPIC|EPICADT|SMS|SMSADT|199912271408|CHARRIS|ADT^A04|1817457|D|2.5|
PID||0493575^^^2^ID 1|454721||DOE^JOHN^^^^|DOE^JOHN^^^^|19480203|M||B|254 MYSTREET AVE^^MYTOWN^OH^44123^USA||(216)123-4567|||M|NON|400003403~1129086|
NK1||ROE^MARIE^^^^|SPO||(216)123-4567||EC|||||||||||||||||||||||||||
PV1||O|168 ~219~C~PMA^^^^^^^^^||||277^ALLEN MYLASTNAME^BONNIE^^^^|||||||||| ||2688684|||||||||||||||||||||||||199912271408||||||002376853`;

    const msg = Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(4);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('NK1');
    expect(msg.segments[3].name).toBe('PV1');

    const msh = msg.get('MSH');
    expect(msh).toBeDefined();
    expect(msh?.get(2).toString()).toBe('EPIC');
    expect(msh?.get(3).toString()).toBe('EPICADT');

    const pid = msg.get('PID');
    expect(pid).toBeDefined();
    expect(pid?.get(2).get(0)).toBe('0493575');
    expect(pid?.get(2).toString()).toBe('0493575^^^2^ID 1');

    const nk1 = msg.get('NK1');
    expect(nk1).toBeDefined();
    expect(nk1?.get(2).get(0)).toBe('ROE');
    expect(nk1?.get(2).get(1)).toBe('MARIE');
    expect(nk1?.get(2).toString()).toBe('ROE^MARIE^^^^');

    const pv1 = msg.get('PV1');
    expect(pv1).toBeDefined();
    expect(pv1?.get(2).get(0)).toBe('O');
    expect(pv1?.get(2).toString()).toBe('O');
  });

  test('QBP_Q11', () => {
    const text = `MSH|^~\\&|cobas® pro||host||20160724080600+0200||QBP^Q11^QBP_Q11|1233|P|2.5.1|||NE|AL||UNICODE UTF-8|||LAB-27R^ROCHE
QPD|INISEQ^^99ROC|query1233|123|50001|1|||||SERPLAS^^99ROC|SC^^99ROC|R
RCP|I|1|R^^HL70394`;

    const msg = Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(3);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('QPD');
    expect(msg.segments[2].name).toBe('RCP');

    const msh = msg.get('MSH');
    expect(msh).toBeDefined();
    expect(msh?.get(2).toString()).toBe('cobas® pro');
    expect(msh?.get(4).toString()).toBe('host');
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

    const msg = Message.parse(text);
    expect(msg).toBeDefined();
    expect(msg.segments.length).toBe(19);
    expect(msg.segments[0].name).toBe('MSH');
    expect(msg.segments[1].name).toBe('PID');
    expect(msg.segments[2].name).toBe('SPM');
    expect(msg.get(0)).toEqual(msg.get('MSH'));

    const pid = msg.get('PID');
    expect(pid).toBeDefined();
    expect(pid?.toString()).toBe('PID|||||^^^^^^U|||U');

    const msh = msg.get('MSH');
    expect(msh).toBeDefined();
    expect(msh?.get(2).toString()).toBe('cobas pro');
    expect(msh?.get(4).toString()).toBe('host');

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
});
