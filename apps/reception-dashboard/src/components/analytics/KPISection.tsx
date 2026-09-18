import { KPITile, type KPITileProps } from "./KPITile";
import styles from "./KPISection.module.css";

export interface KPISectionProps {
  title: string;
  tiles: KPITileProps[];
}

/** A titled row of `KPITile`s (Phase 6, Prompt 15) — the one generic
 * grouping component every domain section (Presence, Leave, Movement,
 * Notifications) on the Analytics page composes, rather than each domain
 * defining its own near-identical grid wrapper. */
export function KPISection({ title, tiles }: KPISectionProps) {
  return (
    <section className={styles.section} aria-labelledby={`kpi-${title}`}>
      <h2 id={`kpi-${title}`} className={styles.heading}>
        {title}
      </h2>
      <div className={styles.grid}>
        {tiles.map((tile) => (
          <KPITile key={tile.label} {...tile} />
        ))}
      </div>
    </section>
  );
}
