declare module 'archiver' {
  import type { PassThrough } from 'node:stream';

  export interface ArchiverOptions {
    zlib?: {
      level?: number;
    };
    store?: boolean;
  }

  export interface EntryData {
    name: string;
    store?: boolean;
  }

  export class Archiver extends PassThrough {
    constructor(options?: ArchiverOptions);
    append(source: string | Buffer | NodeJS.ReadableStream, data: EntryData): this;
    file(filename: string, data: EntryData): this;
    finalize(): Promise<void>;
    pointer(): number;
  }

  export class ZipArchive extends Archiver {
    constructor(options?: ArchiverOptions);
  }
}
