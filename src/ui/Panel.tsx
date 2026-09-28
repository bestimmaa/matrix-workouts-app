import { StyleSheet, Text, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { LAYOUT, PANEL_HEIGHT, type PanelGeometry } from "matrix-workouts-core";
import { usePalette } from "./theme";

/**
 * One of core's panels, drawn with react-native-svg. The geometry — paths, ticks,
 * scales — is core's; this only paints it. Do not add chart maths here.
 *
 * The SVG stretches horizontally, so no text goes inside it; the label and range
 * summary sit above as ordinary text, the way the extension keeps text out of the
 * stretched band.
 */
export function Panel({ panel }: { panel: PanelGeometry }) {
  const palette = usePalette();
  const color = palette.series[panel.spec.colorVar];
  return (
    <View style={styles.panel} accessible accessibilityLabel={panel.ariaLabel}>
      <View style={styles.header}>
        <Text style={[styles.label, { color }]}>{panel.spec.label}</Text>
        <Text style={[styles.summary, { color: palette.muted }]}>{panel.summary}</Text>
      </View>
      <Svg width="100%" height={96} viewBox={`0 0 ${LAYOUT.viewWidth} ${PANEL_HEIGHT}`} preserveAspectRatio="none">
        {panel.yTicks.map((tick) => (
          <Line
            key={tick.value}
            x1={LAYOUT.plotLeft}
            x2={LAYOUT.plotRight}
            y1={tick.y}
            y2={tick.y}
            stroke={palette.grid}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {panel.areaPath ? <Path d={panel.areaPath} fill={color} fillOpacity={0.15} /> : null}
        <Path d={panel.seriesPath} stroke={color} strokeWidth={1.5} fill="none" vectorEffect="non-scaling-stroke" />
      </Svg>
      {panel.spec.note ? <Text style={[styles.note, { color: palette.muted }]}>{panel.spec.note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { marginBottom: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  label: { fontSize: 15, fontWeight: "600" },
  summary: { fontSize: 13, fontVariant: ["tabular-nums"] },
  note: { fontSize: 12, marginTop: 2 },
});
