import Module from "node:module";
import path from "node:path";

type ResolveFilename = (
  request: string,
  parent: NodeModule | null | undefined,
  isMain: boolean,
  options?: { paths?: string[] },
) => string;

const moduleWithInternals = Module as typeof Module & {
  _resolveFilename: ResolveFilename;
};

const originalResolveFilename = moduleWithInternals._resolveFilename;

moduleWithInternals._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    request = path.join(process.cwd(), ".test-dist", request.slice(2));
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};
