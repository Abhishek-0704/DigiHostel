/**
 * Shared design-system primitives (Prompt 2 foundation, extended in Prompt
 * 4A with OTPInput — its real first consumer). Dialog, BottomSheet, Avatar,
 * Chip, Snackbar, SearchBar, IconButton, and NavigationBar remain
 * deliberately deferred until a feature actually needs one, per this
 * prompt's "do not create components that are only used once" /
 * "avoid unnecessary abstraction" instructions. Add them when a real
 * consumer exists, not speculatively.
 */
export * from "./Button";
export * from "./Card";
export * from "./TextField";
export * from "./Badge";
export * from "./Divider";
export * from "./OTPInput";
