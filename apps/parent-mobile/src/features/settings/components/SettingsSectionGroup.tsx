import { Children, Fragment, type ReactNode } from "react";
import { View } from "react-native";
import { useThemeContext } from "../../../contexts/ThemeContext";
import { Card } from "../../../components/ui/Card";
import { Divider } from "../../../components/ui/Divider";
import { SectionHeader } from "../../../components/ui/SectionHeader";

export interface SettingsSectionGroupProps {
  title: string;
  children: ReactNode;
}

/** Groups a set of `NavigationRow`s under one `SectionHeader`, inside one
 * `Card`, with a `Divider` between rows — the shared layout every top-level
 * Settings section (and Legal's document list) uses. */
export function SettingsSectionGroup({ title, children }: SettingsSectionGroupProps) {
  const { theme } = useThemeContext();
  const items = Children.toArray(children);

  return (
    <View style={{ marginTop: theme.spacing.lg }}>
      <SectionHeader title={title} />
      <Card>
        {items.map((child, index) => (
          <Fragment key={index}>
            {index > 0 ? <Divider /> : null}
            {child}
          </Fragment>
        ))}
      </Card>
    </View>
  );
}
