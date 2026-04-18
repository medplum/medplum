// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { Binary } from './Binary.d.ts';
import type { DicomSeries } from './DicomSeries.d.ts';
import type { DicomStudy } from './DicomStudy.d.ts';
import type { Extension } from './Extension.d.ts';
import type { Meta } from './Meta.d.ts';
import type { Narrative } from './Narrative.d.ts';
import type { Reference } from './Reference.d.ts';
import type { Resource } from './Resource.d.ts';

/**
 * Definition of a DICOM instance, which represents a single DICOM image
 * and related metadata that are part of a DICOM series.
 */
export interface DicomInstance {

  /**
   * This is a DicomInstance resource
   */
  readonly resourceType: 'DicomInstance';

  /**
   * The logical id of the resource, as used in the URL for the resource.
   * Once assigned, this value never changes.
   */
  id?: string;

  /**
   * The metadata about the resource. This is content that is maintained by
   * the infrastructure. Changes to the content might not always be
   * associated with version changes to the resource.
   */
  meta?: Meta;

  /**
   * A reference to a set of rules that were followed when the resource was
   * constructed, and which must be understood when processing the content.
   * Often, this is a reference to an implementation guide that defines the
   * special rules along with other profiles etc.
   */
  implicitRules?: string;

  /**
   * The base language in which the resource is written.
   */
  language?: string;

  /**
   * A human-readable narrative that contains a summary of the resource and
   * can be used to represent the content of the resource to a human. The
   * narrative need not encode all the structured data, but is required to
   * contain sufficient detail to make it &quot;clinically safe&quot; for a human to
   * just read the narrative. Resource definitions may define what content
   * should be represented in the narrative to ensure clinical safety.
   */
  text?: Narrative;

  /**
   * These resources do not have an independent existence apart from the
   * resource that contains them - they cannot be identified independently,
   * and nor can they have their own independent transaction scope.
   */
  contained?: Resource[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the resource and that modifies the
   * understanding of the element that contains it and/or the understanding
   * of the containing element's descendants. Usually modifier elements
   * provide negation or qualification. To make the use of extensions safe
   * and manageable, there is a strict set of governance applied to the
   * definition and use of extensions. Though any implementer is allowed to
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension. Applications processing a
   * resource are required to check for modifier extensions.
   *
   * Modifier extensions SHALL NOT change the meaning of any elements on
   * Resource or DomainResource (including cannot change the meaning of
   * modifierExtension itself).
   */
  modifierExtension?: Extension[];

  /**
   * The study that this DICOM instance belongs to.
   */
  study: Reference<DicomStudy>;

  /**
   * The series that this DICOM instance belongs to.
   */
  series: Reference<DicomSeries>;

  /**
   * The SOP Class UID of the DICOM instance.
   */
  sopClassUid: string;

  /**
   * The SOP Instance UID of the DICOM instance.
   */
  sopInstanceUid: string;

  /**
   * The availability of the DICOM instance.
   */
  instanceAvailability?: string;

  /**
   * The timezone offset from UTC for the study (e.g., -0700).
   */
  timezoneOffsetFromUtc?: string;

  /**
   * The number of the instance in the study.
   */
  instanceNumber?: string;

  /**
   * The number of rows in the image.
   */
  rows?: number;

  /**
   * The number of columns in the image.
   */
  columns?: number;

  /**
   * The number of bits allocated for each pixel.
   */
  bitsAllocated?: number;

  /**
   * The number of frames in the image.
   */
  numberOfFrames?: string;

  /**
   * The raw binary data of the DICOM instance, typically stored as a
   * reference to a Binary resource containing the DICOM file.
   */
  rawData: Reference<Binary>;

  /**
   * The pixel data of the DICOM instance, typically stored as a reference
   * to a Binary resource containing the pixel data. This is an alternative
   * to rawData for cases where the pixel data is stored separately from
   * the full DICOM file.
   */
  pixelData?: Reference<Binary>;
}
