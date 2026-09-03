/**
 * Component barrel (Prompt 2 foundation).
 *
 * Structural note: the Prompt 1/Prompt 2 proposed skeleton listed separate
 * `common/` and `navigation/` component directories alongside `ui/`,
 * `feedback/`, and `layout/`. Neither has any genuinely distinct content in
 * this foundation pass — generic screen-chrome pieces (header, safe-area
 * container, offline banner) all live in `layout/`, and no navigation-bar
 * component is needed yet beyond what Expo Router's own Stack/Tabs headers
 * provide. Consolidated to avoid two near-empty directories; split them out
 * again if a feature genuinely needs distinct content there.
 */
export * from "./ui";
export * from "./feedback";
export * from "./layout";
