import { Atom } from '../fhirlexer';

abstract class DefaultFhirMapperAtom implements Atom {
  eval(): never {
    throw new Error('Not implemented');
  }
}

export class MappingLanguageAtom extends DefaultFhirMapperAtom {
  constructor(public readonly original: string, public readonly child: Atom) {
    super();
  }
}

export class MapAtom extends DefaultFhirMapperAtom {
  constructor(public readonly url: string, public readonly identifier: string) {
    super();
  }
}

export class UsesAtom extends DefaultFhirMapperAtom {
  constructor(public readonly url: string, public readonly modelMode: string) {
    super();
  }
}

export class GroupAtom extends DefaultFhirMapperAtom {
  constructor(
    public readonly identifier: string,
    public readonly parameters: ParameterAtom[],
    public readonly rules: RuleAtom[]
  ) {
    super();
  }
}

export class ParameterAtom extends DefaultFhirMapperAtom {
  constructor(public readonly inputMode: string, public readonly identifier: string, public readonly type: string) {
    super();
  }
}

export class RuleAtom extends DefaultFhirMapperAtom {
  constructor(
    public readonly sources: RuleSourceAtom[],
    public readonly targets: RuleTargetAtom[] | undefined,
    public readonly dependent: RuleDependentAtom | undefined,
    public readonly name: string | undefined
  ) {
    super();
  }
}

export class RuleSourceAtom extends DefaultFhirMapperAtom {
  constructor(
    public readonly context: string | undefined,
    public readonly sourceType: string | undefined,
    public readonly sourceDefault: Atom | undefined,
    public readonly sourceListMode: string | undefined,
    public readonly alias: string | undefined,
    public readonly whereClause: Atom | undefined,
    public readonly checkClause: Atom | undefined,
    public readonly log: Atom | undefined
  ) {
    super();
  }
}

export class RuleTargetAtom extends DefaultFhirMapperAtom {
  constructor(
    public readonly context: string,
    public readonly transform: Atom | undefined,
    public readonly alias: string | undefined,
    public readonly targetListMode: string | undefined
  ) {
    super();
  }
}

export class RuleInvocationAtom extends DefaultFhirMapperAtom {
  constructor(public readonly identifier: string, public readonly parameters: Atom[]) {
    super();
  }
}

export class RuleDependentAtom extends DefaultFhirMapperAtom {
  constructor(public readonly invocation: RuleInvocationAtom, public readonly rules: RuleAtom[]) {
    super();
  }
}
