// Metro bundler config (Prompt 3). Required because workspace packages this
// app consumes (@digihostel/api-client-react, @digihostel/api-zod) are
// written using TypeScript's NodeNext module resolution convention:
// relative imports carry a literal ".js" extension that resolves to the
// sibling ".ts"/".tsx" source file (e.g. packages/api-client-react/src/index.ts's
// `export * from "./generated/api.js"`, where only api.ts actually exists
// on disk). This is correct and necessary for this repo's tsc/Node
// consumers (apps/api, each package's own `typecheck` script), but Metro
// (Expo/React Native's bundler) has no built-in understanding of that
// convention — it treats ".js" as a literal, exact filename to resolve,
// and fails when only the ".ts" sibling exists.
//
// This was never previously exercised: nothing in apps/parent-mobile's
// code actually imported anything from @digihostel/api-client-react's
// internals until Prompt 3 wired the app's auth session into the
// generated API client's fetch mutator (src/services/api/authTokenProvider.ts)
// — surfaced here, not introduced by it. Discovered via a full `expo
// export` production bundle (this repo's standard buildability check),
// not assumed.
//
// The fix below teaches Metro the same ".js" -> ".ts"/".tsx" fallback rule
// TypeScript's own resolver already applies — scoped to relative imports
// only (never touches real npm-package resolution), so it cannot mask an
// actually-missing module.
const { getDefaultConfig } = require("expo/metro-config");
const fs = require("fs");
const path = require("path");

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith(".") && moduleName.endsWith(".js")) {
    const withoutExt = moduleName.slice(0, -3);
    const basePath = path.join(path.dirname(context.originModulePath), withoutExt);
    for (const ext of [".ts", ".tsx"]) {
      if (fs.existsSync(basePath + ext)) {
        return (defaultResolveRequest ?? context.resolveRequest)(
          context,
          withoutExt + ext,
          platform,
        );
      }
    }
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
