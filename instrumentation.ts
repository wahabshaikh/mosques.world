import * as Sentry from "@sentry/cloudflare";

type RequestInfo = {
  path: string;
  method: string;
};

type ErrorContext = {
  routePath: string;
  routeType: string;
  routerKind: string;
};

export function onRequestError(error: unknown, request: RequestInfo, context: ErrorContext): void {
  Sentry.captureException(error, (scope) => {
    scope.setTag("route", context.routePath);
    scope.setContext("request", {
      path: request.path,
      method: request.method,
      routeType: context.routeType,
      routerKind: context.routerKind,
    });
    return scope;
  });
}
