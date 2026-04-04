/**
 * MEDrecord Version Configuration
 * 
 * Single source of truth for version information.
 */

export const VERSION = {
  /** MEDrecord version */
  version: '1.0.0',
  
  /** Build identifier (set at build time) */
  build: process.env.NEXT_PUBLIC_BUILD_ID || 'dev',
  
  /** Full display string */
  get display(): string {
    return `MEDrecord ${this.version}`;
  },
  
  /** Short display for footer */
  get short(): string {
    return `${this.version}-${this.build.slice(0, 7)}`;
  },
} as const;
