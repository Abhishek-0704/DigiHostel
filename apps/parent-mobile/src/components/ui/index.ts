/**
 * Shared design-system primitives (Prompt 2 foundation). Kept to the set
 * this foundation's placeholder screens actually use — Dialog, BottomSheet,
 * Avatar, Chip, Snackbar, SearchBar, IconButton, and NavigationBar are
 * explicitly deferred until a feature actually needs one, per this
 * prompt's "do not create components that are only used once" /
 * "avoid unnecessary abstraction" instructions. Add them when a real
 * consumer exists, not speculatively.
 */
export * from "./Button";
export * from "./Card";
export * from "./TextField";
export * from "./Badge";
export * from "./Divider";
