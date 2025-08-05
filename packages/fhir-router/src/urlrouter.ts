// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type PathSegment = { value: string; param?: boolean };

export type Route<Handler, Metadata> = { method: HttpMethod; path: PathSegment[]; handler: Handler; data?: Metadata };

export type RouteResult<Handler, Metadata> = {
  handler: Handler;
  path: string;
  params: Record<string, string>;
  query?: Record<string, string | string[]>;
  data?: Metadata;
};

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
    const queryStart = pathStr.indexOf('?');
    const hasQuery = queryStart > -1;
    const path = pathStr
      .substring(0, hasQuery ? queryStart : pathStr.length)
      .split('/')
      .filter(Boolean);
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
    return {
      handler: bestRoute.handler,
      path: path.join('/'),
      params: buildParams(bestRoute, path),
      query: hasQuery ? parseQueryString(pathStr) : undefined,
      data: bestRoute.data,
    };
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

function parseQueryString(path: string): Record<string, string | string[]> {
  // Pass in dummy host for parsing purposes.
  // The host is ignored.
  const url = new URL(path, 'https://example.com/');
  const queryParams = Object.create(null);

  const raw = url.searchParams;
  for (const param of raw.keys()) {
    const values = raw.getAll(param);
    queryParams[param] = values.length === 1 ? values[0] : values;
  }

  return queryParams;
}
