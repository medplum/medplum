// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/*
 * This is a generated file
 * Do not edit manually.
 */

import type { CodeableConcept } from './CodeableConcept.d.ts';
import type { Coding } from './Coding.d.ts';
import type { Extension } from './Extension.d.ts';
import type { Group } from './Group.d.ts';
import type { HealthcareService } from './HealthcareService.d.ts';
import type { InsurancePlan } from './InsurancePlan.d.ts';
import type { Location } from './Location.d.ts';
import type { Organization } from './Organization.d.ts';
import type { PlanDefinition } from './PlanDefinition.d.ts';
import type { Quantity } from './Quantity.d.ts';
import type { Range } from './Range.d.ts';
import type { Reference } from './Reference.d.ts';
import type { ResearchStudy } from './ResearchStudy.d.ts';

/**
 * Specifies clinical/business/etc. metadata that can be used to
 * retrieve, index and/or categorize an artifact. This metadata can
 * either be specific to the applicable population (e.g., age category,
 * DRG) or the specific context of care (e.g., venue, care setting,
 * provider of care).
 */
export interface UsageContext {

  /**
   * Unique id for the element within a resource (for internal references).
   * This may be any string value that does not contain spaces.
   */
  id?: string;

  /**
   * May be used to represent additional information that is not part of
   * the basic definition of the element. To make the use of extensions
   * safe and manageable, there is a strict set of governance  applied to
   * the definition and use of extensions. Though any implementer can
   * define an extension, there is a set of requirements that SHALL be met
   * as part of the definition of the extension.
   */
  extension?: Extension[];

  /**
   * A code that identifies the type of context being specified by this
   * usage context.
   */
  code: Coding;

  /**
   * A value that defines the context specified in this context of use. The
   * interpretation of the value is defined by the code.
   */
  valueCodeableConcept?: CodeableConcept;

  /**
   * A value that defines the context specified in this context of use. The
   * interpretation of the value is defined by the code.
   */
  valueQuantity?: Quantity;

  /**
   * A value that defines the context specified in this context of use. The
   * interpretation of the value is defined by the code.
   */
  valueRange?: Range;

  /**
   * A value that defines the context specified in this context of use. The
   * interpretation of the value is defined by the code.
   */
  valueReference?: Reference<PlanDefinition | ResearchStudy | InsurancePlan | HealthcareService | Group | Location | Organization>;
}

/**
 * A value that defines the context specified in this context of use. The
 * interpretation of the value is defined by the code.
 */
export type UsageContextValue = CodeableConcept | Quantity | Range | Reference<PlanDefinition | ResearchStudy |
    InsurancePlan | HealthcareService | Group | Location | Organization>;
