export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type PathSegment = { value: string; param?: boolean };

export type Route<Handler, Metadata> = { method: HttpMethod; path: PathSegment[]; handler: Handler; data?: Metadata };

export type RouteResult<Handler, Metadata> = { handler: Handler; params: Record<string, string>; data?: Metadata };

export class Router<Handler, Metadata> {
  readonly routes: Route<Handler, Metadata>[] = [];

  add(method: HttpMethod, pathStr: string, handler: Handler, data?: Metadata): void {
    const path = pathStr
      .split('/')
      .filter((e) => !!e)
      .map((value) => (value.startsWith(':') ? { value: value.substring(1), param: true } : { value }));
    this.routes.push({ method, path, handler, data });
  }

  find(method: HttpMethod, pathStr: string): RouteResult<Handler, Metadata> | undefined {
    const path = pathStr.split('/').filter((e) => !!e);
    let bestRoute: Route<Handler, Metadata> | undefined = undefined;
    let bestScore = -1;
    for (const route of this.routes) {
      const score = tryMatch(route, method, path);
      if (score > bestScore) {
        bestRoute = route;
        bestScore = score;
      }
    }
    if (!bestRoute) {
      return undefined;
    }
    return { handler: bestRoute.handler, params: buildParams(bestRoute, path), data: bestRoute.data };
  }
}

function tryMatch<T, U>(route: Route<T, U>, method: HttpMethod, path: string[]): number {
  if (method !== route.method || path.length !== route.path.length) {
    return -1;
  }
  let score = 0;
  for (let i = 0; i < path.length; i++) {
    if (!route.path[i].param) {
      if (path[i] !== route.path[i].value) {
        return -1;
      }
      score++;
    }
  }
  return score;
}

function buildParams<T, U>(route: Route<T, U>, path: string[]): Record<string, string> {
  const params: Record<string, string> = Object.create(null);
  for (let i = 0; i < path.length; i++) {
    if (route.path[i].param) {
      params[route.path[i].value] = path[i];
    }
  }
  return params;
}
