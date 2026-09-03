import { PlaceholderScreen } from "@/src/components/layout/PlaceholderScreen";

/** Not established by the current authoritative SDD/ADR documentation as a
 * named module — included only because this prompt's routing_foundation
 * section explicitly lists "About" as a destination to scaffold. */
export default function About() {
  return <PlaceholderScreen title="About" description="Not yet implemented." />;
}
