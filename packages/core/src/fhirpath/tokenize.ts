
export interface TokenMatcher {
  id: string;
  pattern: RegExp;
}

export interface Token extends TokenMatcher {
  value: string
}

const matchers: TokenMatcher[] = [
  // { id: 'Comment', pattern: /\/\/.*$/ },
  { id: 'Quantity', pattern: /-?\d{1,9}(\.\d{1,9})? ('[^']+'|years?|months?|weeks?|days?|hours?|minutes?|seconds?|milliseconds?)/ },
  { id: 'String', pattern: /'[^']*'/ },
  { id: 'DateTime', pattern: /@[a-zA-Z0-9:_+-]*(.\d+)?/ },
  { id: 'Number', pattern: /-?\d{1,9}(\.\d{1,9})?/ },
  { id: 'EmptySet', pattern: /\{\}/ },
  { id: '(', pattern: /\(/ },
  { id: ')', pattern: /\)/ },
  { id: '*', pattern: /\*/ },
  { id: '/', pattern: /\// },
  { id: '+', pattern: /\+/ },
  { id: '-', pattern: /-/ },
  { id: '^', pattern: /\^/ },
  { id: '.', pattern: /\./ },
  { id: '|', pattern: /\|/ },
  { id: '!=', pattern: /!=/ },
  { id: '!~', pattern: /!~/ },
  { id: '<=', pattern: /<=/ },
  { id: '<', pattern: /</ },
  { id: '>=', pattern: />=/ },
  { id: '>', pattern: />/ },
  { id: '=', pattern: /=/ },
  { id: '~', pattern: /~/ },
  { id: '!', pattern: /!/ },
  { id: '&', pattern: /&/ },
  { id: ',', pattern: /,/ },
  { id: 'Symbol', pattern: /\w+/ },
];

export class Tokenizer {
  private matchAll: RegExp

  public constructor() {
    this.matchAll = new RegExp(matchers.map(matcher => matcher.pattern.source).join('|'), 'g');
  }

  public tokenize(str: string): Token[] {
    // Double-execing the RegExp is actually not that slow. Faster than my attempted alternative implementation.
    // https://jsperf.com/tokenization-strategies-jkearl-pratt/1

    const tokens = str.match(this.matchAll);
    if (!tokens) {
      throw new Error('Could not tokenize');
    }

    return tokens.map(value => {
      return {
        ...(matchers.find(matcher => matcher.pattern.test(value)) as TokenMatcher),
        value
      };
    });
  }
}

export const tokenizer = new Tokenizer();
