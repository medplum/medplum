// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable @typescript-eslint/no-extraneous-class */

// Draft TypeScript definitions from https://github.com/dcmjs-org/dcmjs/pull/165/files

declare module 'dcmjs' {
  declare namespace async {
    export interface AsyncDicomReaderConstructorOptions {
      isLittleEndian?: boolean;
      maxFragmentSize?: number;
      clearBuffers?: boolean;
      defaultSize?: number;
      start?: number | null;
      stop?: number | null;
      noCopy?: boolean;
    }

    export interface AsyncDicomReaderReadOptions {
      listener?: DicomMetadataListenerLike;
      untilOffset?: number;
      maxSizeMeta?: number;
      ignoreErrors?: boolean;
    }

    export interface AsyncDicomReaderTagHeaderOptions {
      untilTag?: string | null;
      includeUntilTagValue?: boolean;
    }

    export interface DicomInformationLike {
      transferSyntaxUid?: string;
      sopInstanceUid?: string;
      numberOfFrames?: string | number;
      rows?: number;
      columns?: number;
      samplesPerPixel?: number;
      bitsAllocated?: number;
      pixelRepresentation?: number;
      [key: string]: unknown;
    }

    export interface DicomMetadataListenerLike {
      information?: DicomInformationLike;

      startObject?(obj?: unknown): void;
      addTag?(tag: string, tagInfo: AsyncDicomReaderTagHeader): { expectsRaw?: boolean } | undefined;
      value?(value: unknown): void;
      pop?(): any;
      awaitDrain?(): Promise<void>;
    }

    export interface ValueRepresentationLike {
      type: string;
      maxLength: number;
      noMultiple?: boolean;

      isLength32(): boolean;
      isBinary(): boolean;
      dropPadByte?(values: string[]): string[];

      read(stream: ReadBufferStream, length: number, syntax: string): { value: unknown } | undefined;

      readBytes?(stream: ReadBufferStream): number;
    }

    export interface TagLike {
      cleanString: string;
      length: number;

      group(): number;
      isInstruction(): boolean;
      isPixelDataTag(): boolean;
      isPrivateCreator(): boolean;
    }

    export interface AsyncDicomReaderTagHeader {
      vrObj: ValueRepresentationLike;
      vr: string;
      tag: string;
      tagObj: TagLike;
      vm?: string | number;
      name?: string;
      length: number;
    }

    export interface AsyncDicomReaderUntilTagHeader {
      tag: string;
      tagObj: TagLike;
      vr: 0;
      values: 0;
      untilTag: true;
    }

    export type AsyncDicomReaderTagHeaderResult = AsyncDicomReaderTagHeader | AsyncDicomReaderUntilTagHeader;

    export type DicomElement = {
      vr?: string;
      Value?: unknown[];
      InlineBinary?: string;
      BulkDataURI?: string;
      [key: string]: unknown;
    };

    export type DicomDict = Record<string, DicomElement>;

    export declare class AsyncDicomReader {
      static PART10_NO_PREAMBLE: symbol;

      syntax: string;
      isLittleEndian?: boolean;
      maxFragmentSize: number;
      stream: ReadBufferStream;
      meta?: DicomDict;
      dict?: DicomDict;
      listener?: DicomMetadataListenerLike;

      constructor(options?: AsyncDicomReaderConstructorOptions);

      /**
       * Reads the preamble and checks for the DICM marker.
       * Returns:
       * - true if Part 10 preamble was found
       * - AsyncDicomReader.PART10_NO_PREAMBLE if stream starts with meta group 0002
       * - false for raw dataset
       */
      readPreamble(): Promise<boolean | symbol>;

      /**
       * Detects whether a raw dataset is implicit or explicit little endian.
       */
      detectRawEncoding(): Promise<void>;

      /**
       * Reads the full DICOM file into meta/dict and returns this reader.
       */
      readFile(options?: AsyncDicomReaderReadOptions): Promise<this>;

      /**
       * Reads the file meta information.
       */
      readMeta(options?: AsyncDicomReaderReadOptions): Promise<DicomDict>;

      /**
       * Reads the main dataset using the supplied listener.
       */
      read(listener: DicomMetadataListenerLike, options?: AsyncDicomReaderReadOptions): Promise<any>;

      /**
       * Reads a sequence tag and its items.
       */
      readSequence(
        listener: DicomMetadataListenerLike,
        sqTagInfo: AsyncDicomReaderTagHeader,
        options?: AsyncDicomReaderReadOptions
      ): Promise<void>;

      /**
       * Reads pixel data, dispatching to compressed or uncompressed handling.
       */
      readPixelData(tagInfo: AsyncDicomReaderTagHeader): Promise<void> | void;

      /**
       * Emits one or more listener.value() calls for a fragment, splitting if needed.
       */
      _emitSplitValues(length: number): Promise<void>;

      /**
       * Reads compressed pixel data stream fragments.
       */
      readCompressed(tagInfo: AsyncDicomReaderTagHeader): Promise<void>;

      /**
       * Reads the basic offset table for encapsulated pixel data.
       */
      readOffsets(): Promise<number[] | undefined>;

      /**
       * Reads uncompressed pixel data frames.
       */
      readUncompressed(tagInfo: AsyncDicomReaderTagHeader): Promise<void>;

      /**
       * Reads odd-length bit-packed uncompressed pixel data frames.
       */
      readUncompressedBitFrame(tagInfo: AsyncDicomReaderTagHeader): Promise<void>;

      /**
       * Reads raw binary data in chunks and delivers it to the listener.
       */
      readRawBinary(tagInfo: AsyncDicomReaderTagHeader): Promise<void>;

      /**
       * Returns true if the tag should be interpreted as a sequence.
       */
      isSequence(tagInfo: Pick<AsyncDicomReaderTagHeader, 'vr' | 'length'>): boolean;

      /**
       * Reads a tag header from the current stream offset.
       */
      readTagHeader(options?: AsyncDicomReaderTagHeaderOptions): AsyncDicomReaderTagHeaderResult;

      /**
       * Reads a single tag's values and delivers them to the listener.
       */
      readSingle(
        tagInfo: AsyncDicomReaderTagHeader,
        listener: DicomMetadataListenerLike,
        options?: AsyncDicomReaderReadOptions
      ): Promise<unknown[]>;
    }

    export interface BufferStreamConstructorOptions {
      littleEndian?: boolean;
      defaultSize?: number;
      clearBuffers?: boolean;
    }

    export interface EnsureAvailablePromise extends Promise<boolean> {}

    export interface AddBufferOptions {
      start?: number | null;
      end?: number | null;
      transfer?: boolean;
    }

    export interface ReadBufferStreamOptions {
      start?: number | null;
      stop?: number | null;
      noCopy?: boolean;
    }

    export interface BufferMemoryInfo {
      bufferCount: number;
      totalSize: number;
      consumeOffset: number;
      buffersBeforeOffset: number;
    }

    export type AvailableListener = () => void;

    export declare class BufferStream {
      offset: number;
      startOffset: number;
      isLittleEndian: boolean;
      size: number;
      endOffset: number;
      view: SplitDataView;
      availableListeners: AvailableListener[];
      isComplete: boolean;
      clearBuffers: boolean;
      encoder: TextEncoder;

      /** Present on some subclasses / instances */
      decoder?: TextDecoder;
      noCopy?: boolean;

      constructor(options?: BufferStreamConstructorOptions | null);

      /**
       * Mark this stream as having finished being written or read from.
       */
      setComplete(value?: boolean): void;

      /**
       * Indicates if the requested length is currently available.
       */
      isAvailable(length: number, orComplete?: boolean): boolean;

      /**
       * Ensures that the specified number of bytes are available OR that it is EOF.
       * Returns true immediately if already available, otherwise a promise.
       */
      ensureAvailable(bytes?: number): true | Promise<boolean>;

      setEndian(isLittle: boolean): void;

      slice(start?: number, end?: number): ArrayBuffer;

      /**
       * @deprecated Gets the entire buffer at once.
       */
      getBuffer(start?: number, end?: number): Uint8Array | ArrayBuffer;

      readonly buffer: Uint8Array | ArrayBuffer;
      readonly available: number;

      writeUint8(value: number): number;
      writeUint8Repeat(value: number, count: number): number;
      writeInt8(value: number): number;
      writeUint16(value: number): number;
      writeTwoUint16s(value: number): number;
      writeInt16(value: number): number;
      writeUint32(value: number): number;
      writeInt32(value: number): number;
      writeFloat(value: number): number;
      writeDouble(value: number): number;
      writeUTF8String(value: string): number;
      writeAsciiString(value?: string): number;

      readUint32(): number;
      readUint16(): number;
      readUint8(): number;
      peekUint8(offset: number): number;
      readUint8Array(length: number): Uint8Array;
      readArrayBuffer(length: number): ArrayBuffer;
      readUint16Array(length: number): Uint16Array;
      readInt8(): number;
      readInt16(): number;
      readInt32(): number;
      readFloat(): number;
      readDouble(): number;
      readAsciiString(length: number): string;
      readVR(): string;
      readEncodedString(length: number): string;
      readHex(length: number): string;

      checkSize(step: number): void;

      /**
       * Concatenates another stream into this one.
       * Returns the available size from the underlying view.
       */
      concat(stream: BufferStream): number;

      increment(step: number): number;

      /**
       * Reads from an async iterable stream delivering chunks to addBuffer.
       */
      fromAsyncStream(
        stream: AsyncIterable<{
          buffer: ArrayBufferLike;
          byteOffset: number;
          byteLength: number;
        }>
      ): Promise<void>;

      /**
       * Adds a buffer to the end of the current buffers list.
       */
      addBuffer(
        buffer: ArrayBufferLike | ArrayBufferView | null | undefined,
        options?: AddBufferOptions | null
      ): number | undefined;

      notifyAvailableListeners(): void;

      /**
       * Consumes data up to the given offset.
       */
      consume(offset?: number): void;

      /**
       * Returns true if the stream has data in the given range.
       */
      hasData(start: number, end?: number): boolean;

      more(length: number): ReadBufferStream;

      reset(): this;

      end(): boolean;

      toEnd(): void;

      /**
       * Reports on the amount of memory held by the buffers in the view.
       */
      getBufferMemoryInfo(): BufferMemoryInfo;
    }

    export declare class ReadBufferStream extends BufferStream {
      decoder: TextDecoder;
      noCopy?: boolean;

      constructor(
        buffer?:
          | BufferStream
          | ArrayBufferLike
          | ArrayBufferView
          | { offset?: number; size?: number; byteLength?: number }
          | null,
        littleEndian?: boolean,
        options?: ReadBufferStreamOptions
      );

      setDecoder(decoder: TextDecoder): void;

      reset(): this;
      end(): boolean;
      toEnd(): void;

      writeUint8(value: number): never;
      writeUint8Repeat(value: number, count: number): never;
      writeInt8(value: number): never;
      writeUint16(value: number): never;
      writeTwoUint16s(value: number): never;
      writeInt16(value: number): never;
      writeUint32(value: number): never;
      writeInt32(value: number): never;
      writeFloat(value: number): never;
      writeDouble(value: number): never;
      writeAsciiString(value: string): never;
      writeUTF8String(value: string): never;
      checkSize(step: number): never;
      concat(stream: BufferStream): never;
    }

    export declare class DeflatedReadBufferStream extends ReadBufferStream {
      constructor(stream: BufferStream, options?: ReadBufferStreamOptions);
    }

    export declare class WriteBufferStream extends BufferStream {
      constructor(defaultSize?: number, littleEndian?: boolean);
    }
  }

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
