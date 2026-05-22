// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

const transactionMethodNames = new Set(['withTransaction', 'ensureInTransaction']);
const ignoredTraversalKeys = new Set([
  'comments',
  'decorators',
  'loc',
  'parent',
  'range',
  'returnType',
  'tokens',
  'typeAnnotation',
  'typeArguments',
  'typeParameters',
]);

/**
 * @param context - ESLint rule context.
 * @returns ESLint rule listener.
 */
function create(context) {
  const sourceCode = context.sourceCode;

  /**
   * @param node - The AST node.
   * @returns The unwrapped expression.
   */
  function unwrapExpression(node) {
    let result = node;
    while (
      result?.type === 'ChainExpression' ||
      result?.type === 'TSAsExpression' ||
      result?.type === 'TSNonNullExpression' ||
      result?.type === 'TSTypeAssertion'
    ) {
      result = result.expression;
    }
    return result;
  }

  /**
   * @param node - The AST node.
   * @returns The scope for the AST node.
   */
  function getScope(node) {
    return sourceCode.getScope(node);
  }

  /**
   * @param node - The identifier node.
   * @returns The variable represented by the identifier.
   */
  function findVariable(node) {
    let scope = getScope(node);
    while (scope) {
      const variable = scope.set.get(node.name);
      if (variable) {
        return variable;
      }
      scope = scope.upper;
    }
    return undefined;
  }

  /**
   * @param node - The identifier node.
   * @returns True if the identifier is an expression reference.
   */
  function isReferenceIdentifier(node) {
    const parent = node.parent;
    if (!parent) {
      return true;
    }

    switch (parent.type) {
      case 'ArrayPattern':
      case 'ImportDefaultSpecifier':
      case 'ImportNamespaceSpecifier':
      case 'LabeledStatement':
      case 'MetaProperty':
      case 'RestElement':
      case 'TSTypeReference':
      case 'VariableDeclarator':
        return false;
      case 'AssignmentPattern':
        return parent.right === node;
      case 'ClassDeclaration':
      case 'ClassExpression':
      case 'FunctionDeclaration':
      case 'FunctionExpression':
        return parent.id !== node;
      case 'ImportSpecifier':
        return parent.local !== node;
      case 'MemberExpression':
        return parent.object === node || parent.computed;
      case 'MethodDefinition':
      case 'Property':
      case 'PropertyDefinition':
        return parent.value === node || parent.computed;
      default:
        return true;
    }
  }

  /**
   * @param node - The member expression.
   * @returns The static property name.
   */
  function getStaticPropertyName(node) {
    if (node.computed) {
      const property = unwrapExpression(node.property);
      return property?.type === 'Literal' && typeof property.value === 'string' ? property.value : undefined;
    }
    if (node.property.type === 'Identifier' || node.property.type === 'PrivateIdentifier') {
      return node.property.name;
    }
    return undefined;
  }

  /**
   * @param expected - The expected member expression.
   * @param candidate - The candidate member expression.
   * @returns True if the member expressions use the same property.
   */
  function hasSameProperty(expected, candidate) {
    if (expected.computed || candidate.computed) {
      return (
        expected.computed === candidate.computed &&
        sourceCode.getText(expected.property) === sourceCode.getText(candidate.property)
      );
    }
    return getStaticPropertyName(expected) === getStaticPropertyName(candidate);
  }

  /**
   * @param expected - The expected expression.
   * @param candidate - The candidate expression.
   * @returns True if both expressions refer to the same expression.
   */
  function isSameExpression(expected, candidate) {
    const unwrappedExpected = unwrapExpression(expected);
    const unwrappedCandidate = unwrapExpression(candidate);
    if (!unwrappedExpected || !unwrappedCandidate || unwrappedExpected.type !== unwrappedCandidate.type) {
      return false;
    }

    switch (unwrappedExpected.type) {
      case 'Identifier':
        return (
          isReferenceIdentifier(unwrappedCandidate) &&
          unwrappedExpected.name === unwrappedCandidate.name &&
          findVariable(unwrappedExpected) === findVariable(unwrappedCandidate)
        );
      case 'ThisExpression':
        return true;
      case 'Super':
        return true;
      case 'MemberExpression':
        return (
          hasSameProperty(unwrappedExpected, unwrappedCandidate) &&
          isSameExpression(unwrappedExpected.object, unwrappedCandidate.object)
        );
      default:
        return sourceCode.getText(unwrappedExpected) === sourceCode.getText(unwrappedCandidate);
    }
  }

  /**
   * @param node - The AST node.
   * @returns True if the node is a function expression.
   */
  function isCallbackFunction(node) {
    return node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';
  }

  /**
   * @param node - The AST node.
   * @param callback - The visitor callback.
   */
  function visit(node, callback) {
    if (callback(node)) {
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (ignoredTraversalKeys.has(key)) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child?.type) {
            visit(child, callback);
          }
        }
      } else if (value?.type) {
        visit(value, callback);
      }
    }
  }

  return {
    CallExpression(node) {
      const callee = unwrapExpression(node.callee);
      if (callee?.type !== 'MemberExpression') {
        return;
      }

      const methodName = getStaticPropertyName(callee);
      if (!methodName || !transactionMethodNames.has(methodName)) {
        return;
      }

      const invokingRepo = unwrapExpression(callee.object);
      const callback = unwrapExpression(node.arguments[0]);
      if (!invokingRepo || !callback || !isCallbackFunction(callback)) {
        return;
      }

      visit(callback.body, (candidate) => {
        if (!isSameExpression(invokingRepo, candidate)) {
          return false;
        }

        context.report({
          node: candidate,
          messageId: 'useCallbackRepo',
          data: {
            methodName,
            repoName: sourceCode.getText(invokingRepo),
          },
        });
        return true;
      });
    },
  };
}

/** @type {import('eslint').Rule.RuleModule} */
const noTransactionCallbackInvokingRepoRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require transaction callbacks to use the repository parameter instead of the invoking repository',
    },
    messages: {
      useCallbackRepo: 'Use the repository passed to the {{methodName}} callback instead of `{{repoName}}`.',
    },
    schema: [],
  },
  create,
};

export default noTransactionCallbackInvokingRepoRule;
