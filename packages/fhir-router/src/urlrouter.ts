export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type PathSegment = { value: string; param?: boolean };

export type Route<T> = { method: HttpMethod; path: PathSegment[]; handler: T };

export type RouteResult<T> = { handler: T; params: Record<string, string> };

export class Router<T> {
  readonly routes: Route<T>[] = [];

  add(method: HttpMethod, pathStr: string, handler: T): void {
    const path = pathStr
      .split('/')
      .filter((e) => !!e)
      .map((value) => (value.startsWith(':') ? { value: value.substring(1), param: true } : { value }));
    this.routes.push({ method, path, handler });
  }

  find(method: HttpMethod, pathStr: string): RouteResult<T> | undefined {
    const path = pathStr.split('/').filter((e) => !!e);
    let bestRoute: Route<T> | undefined = undefined;
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
    return { handler: bestRoute.handler, params: buildParams(bestRoute, path) };
  }
}

function tryMatch<T>(route: Route<T>, method: HttpMethod, path: string[]): number {
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

function buildParams<T>(route: Route<T>, path: string[]): Record<string, string> {
  const params: Record<string, string> = Object.create(null);
  for (let i = 0; i < path.length; i++) {
    if (route.path[i].param) {
      params[route.path[i].value] = path[i];
    }
  }
  return params;
}
