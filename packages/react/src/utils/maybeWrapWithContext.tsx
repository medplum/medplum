export function maybeWrapWithContext<T>(
  ContextProvider: React.Context<T>['Provider'],
  contextValue: T | undefined,
  contents: JSX.Element
): JSX.Element {
  if (contextValue !== undefined) {
    return <ContextProvider value={contextValue}>{contents}</ContextProvider>;
  }

  return contents;
}
