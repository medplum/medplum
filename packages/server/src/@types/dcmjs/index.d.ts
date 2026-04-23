// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Draft TypeScript definitions from https://github.com/dcmjs-org/dcmjs/pull/165/files

// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/* eslint-disable @typescript-eslint/no-extraneous-class */

declare module 'dcmjs' {
  //
  // Shared module-scope types
  // These exist to avoid circular / awkward references across exported namespaces.
  //

  export type DcmjsDicomTag = string;
  export type DcmjsDicomVR = string;

  export interface DcmjsDicomElement {
    vr?: DcmjsDicomVR;
    Value?: unknown[];
    InlineBinary?: string;
    BulkDataURI?: string;
    [key: string]: unknown;
  }

  export interface DcmjsDicomDataset {
    [tag: string]: DcmjsDicomElement | undefined;
  }

  export type DcmjsDicomDict = Record<string, DcmjsDicomElement>;

  export interface DcmjsDicomTagInfo {
    vr?: DcmjsDicomVR;
    length?: number;
    [key: string]: unknown;
  }

  export interface DcmjsInformationMap {
    [name: string]: unknown;
  }

  export interface DcmjsInformationFilterInitOptions {
    information?: DcmjsInformationMap;
  }

  export interface DcmjsListenerCurrentState {
    parent: DcmjsListenerCurrentState | null;
    dest: DcmjsDicomElement | DcmjsDicomDataset | unknown[] | Record<string, unknown>;
    type: string;
    tag?: string;
    vr?: DcmjsDicomVR;
    level: number;
    length?: number;
    _trackInformation?: string | null;
    pop?: () => any;
    [key: string]: unknown;
  }

  export interface DcmjsDicomInformationLike {
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

  export namespace async {
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
      isLittleEndian?: boolean;
      listener?: DcmjsDicomMetadataListener;
      untilOffset?: number;
      maxSizeMeta?: number;
      ignoreErrors?: boolean;
    }

    export interface AsyncDicomReaderTagHeaderOptions {
      untilTag?: string | null;
      includeUntilTagValue?: boolean;
    }

    export type DicomElement = DcmjsDicomElement;
    export type DicomDict = DcmjsDicomDict;

    export interface AsyncDicomReaderTagHeader {
      vrObj: DcmjsValueRepresentation;
      vr: string;
      tag: string;
      tagObj: DcmjsTag;
      vm?: string | number;
      name?: string;
      length: number;
    }

    export interface AsyncDicomReaderUntilTagHeader {
      tag: string;
      tagObj: DcmjsTag;
      vr: 0;
      values: 0;
      untilTag: true;
    }

    export type AsyncDicomReaderTagHeaderResult = AsyncDicomReaderTagHeader | AsyncDicomReaderUntilTagHeader;

    export class AsyncDicomReader {
      static PART10_NO_PREAMBLE: symbol;

      syntax: string;
      isLittleEndian?: boolean;
      maxFragmentSize: number;
      stream: ReadBufferStream;
      meta?: DcmjsDicomDict;
      dict?: DcmjsDicomDict;
      listener?: DcmjsDicomMetadataListener;

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
      readMeta(options?: AsyncDicomReaderReadOptions): Promise<DcmjsDicomDict>;

      /**
       * Reads the main dataset using the supplied listener.
       */
      read(listener: DcmjsDicomMetadataListener, options?: AsyncDicomReaderReadOptions): Promise<any>;

      /**
       * Reads a sequence tag and its items.
       */
      readSequence(
        listener: DcmjsDicomMetadataListener,
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
        listener: DcmjsDicomMetadataListener,
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

    export class BufferStream {
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

    export class ReadBufferStream extends BufferStream {
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

    export class DeflatedReadBufferStream extends ReadBufferStream {
      constructor(stream: BufferStream, options?: ReadBufferStreamOptions);
    }

    export class WriteBufferStream extends BufferStream {
      constructor(defaultSize?: number, littleEndian?: boolean);
    }

    // Best-effort placeholder: referenced in BufferStream.view but not defined in your draft.
    export interface SplitDataView {
      [key: string]: unknown;
    }
  }

  //
  // data namespace
  //

  export namespace data {
    export class DicomMetaDictionary {
      static uid(): string;
      static date(): string;
      static time(): string;
      static dateTime(): string;
      static denaturalizeDataset(object: object): object;
      static naturalizeDataset(object: object): object;
      static namifyDataset(object: object): object;
      static cleanDataset(object: object): object;
      static punctuateTag(value: string): string;
      static unpunctuateTag(value: string): string;
    }

    export class DicomDict {
      constructor(meta: object);
      meta: object;
      dict: object;
      write(writeOptions?: object): string;
    }

    export class DicomMessage {
      static readFile(value: string): DicomDict;
    }
  }

  //
  // utilities namespace
  //

  export namespace utilities {
    export type DicomTag = DcmjsDicomTag;
    export type DicomVR = DcmjsDicomVR;
    export type DicomTagInfo = DcmjsDicomTagInfo;
    export type DicomElement = DcmjsDicomElement;
    export type DicomDataset = DcmjsDicomDataset;
    export type ListenerCurrentState = DcmjsListenerCurrentState;
    export type InformationMap = DcmjsInformationMap;
    export type InformationFilterInitOptions = DcmjsInformationFilterInitOptions;

    export type AddTagNext = (tag: DicomTag, tagInfo?: DicomTagInfo) => any;
    export type StartObjectNext = (dest?: Record<string, unknown> | unknown[]) => any;
    export type PopNext = () => any;
    export type ValueNext = (value: unknown) => any;

    export interface DicomMetadataFilter {
      information?: InformationMap | null;

      _init?(this: DicomMetadataListener, options?: InformationFilterInitOptions): void;

      addTag?(this: DicomMetadataListener, next: AddTagNext, tag: DicomTag, tagInfo?: DicomTagInfo): any;

      startObject?(this: DicomMetadataListener, next: StartObjectNext, dest?: Record<string, unknown> | unknown[]): any;

      pop?(this: DicomMetadataListener, next: PopNext): any;

      value?(this: DicomMetadataListener, next: ValueNext, value: unknown): any;
    }

    export interface DicomMetadataListenerOptions {
      informationFilter?: DicomMetadataFilter;
      informationTags?: Set<string>;
      information?: InformationMap;
      [key: string]: unknown;
    }

    /**
     * Creates an information filter that tracks top-level DICOM attributes.
     * @param tags - Optional set of DICOM tags to include in the information. If not provided, a default set of common tags will be used.
     * @returns A DICOM Metadata Filter that can be used to create a DicomMetadataListener.
     */
    export function createInformationFilter(tags?: Set<string>): DicomMetadataFilter;

    /**
     * A DICOM Metadata listener implements the basic listener for creating a dicom
     * metadata instance from a stream of notification events.
     */
    export class DicomMetadataListener {
      current: ListenerCurrentState | null;
      fmi: DicomDataset | null;
      dict: DicomDataset | null;
      filters: DicomMetadataFilter[];
      information: InformationMap | null;

      /**
       * Optional backpressure (drain) function.
       */
      _drain: (() => Promise<void>) | null;

      constructor(options?: DicomMetadataListenerOptions | DicomMetadataFilter, ...filters: DicomMetadataFilter[]);

      /**
       * Set the drain (pushback) function for backpressure.
       */
      setDrain(fn: (() => Promise<void>) | null): void;

      /**
       * Returns a Promise that resolves when the drain condition is met.
       */
      awaitDrain(): Promise<void>;

      /**
       * Initializes state, allowing it to be re-used.
       */
      init(options?: InformationFilterInitOptions): void;

      /**
       * Creates method chains for each method that can be filtered.
       * @private
       */
      _createMethodChains(): void;

      /**
       * Base implementation: Adds a new tag value.
       * @private
       */
      _baseAddTag(tag: DicomTag, tagInfo?: DicomTagInfo): void;

      /**
       * Base implementation: Starts a new object, using the provided value.
       * @private
       */
      _baseStartObject(dest?: Record<string, unknown> | unknown[]): void;

      /**
       * Base implementation: Pops the current value being created off the stack.
       * @private
       */
      _basePop(): any;

      /**
       * Base implementation: Registers a new value for the current destination being created.
       * @private
       */
      _baseValue(value: unknown): void;

      /**
       * Gets the Transfer Syntax UID from the File Meta Information (FMI)
       */
      getTransferSyntaxUID(): string | undefined;

      /**
       * These are replaced at runtime by _createMethodChains().
       */
      addTag(tag: DicomTag, tagInfo?: DicomTagInfo): any;
      startObject(dest?: Record<string, unknown> | unknown[]): any;
      pop(): any;
      value(value: unknown): any;
    }

    export const DEFAULT_INFORMATION_TAGS: Set<string>;
  }
}
