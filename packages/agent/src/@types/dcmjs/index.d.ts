/* eslint-disable @typescript-eslint/no-extraneous-class */

// Draft TypeScript definitions from https://github.com/dcmjs-org/dcmjs/pull/165/files

declare module 'dcmjs' {
  declare namespace data {
    export class DicomMetaDictionary {
      static uid(): string;
      static date(): string;
      static time(): string;
      static dateTime(): string;
      static denaturalizeDataset(object): object;
      static naturalizeDataset(object): object;
      static namifyDataset(object): object;
      static cleanDataset(object): object;
      static punctuateTag(string): string;
      static unpunctuateTag(string): string;
    }

    export class DicomDict {
      constructor(meta: object);
      meta: object;
      dict: object;
      write(writeOptions?: object): string;
    }

    export class DicomMessage {
      static readFile(string): DicomDict;
    }
  }
}
