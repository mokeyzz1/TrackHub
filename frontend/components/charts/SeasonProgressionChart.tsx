import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Line, Path, Skia, LinearGradient as SkiaLinearGradient, vec } from '@shopify/react-native-skia';
import { colors } from '../../design-system/colors';
import { spacing } from '../../design-system/spacing';

interface PerformanceData {
  date: string;
  time: number; // in seconds for easier comparison
  displayTime: string; // formatted time like "2:02.15"
  meet: string;
  isPR?: boolean;
}

interface SeasonProgressionChartProps {
  data: PerformanceData[];
  eventName: string;
}

export const SeasonProgressionChart: React.FC<SeasonProgressionChartProps> = ({ data, eventName }) => {

  if (data.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyText}>No performance data yet</Text>
      </View>
    );
  }

  // Find min and max for scaling
  const times = data.map((d) => d.time);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const range = maxTime - minTime || 1;

  // Calculate chart dimensions
  const chartHeight = 160;
  const chartWidth = 260;
  const padding = { top: 20, bottom: 10, left: 10, right: 10 };

  // Calculate points for actual data
  const points = data.map((point, index) => {
    const y = padding.top + ((maxTime - point.time) / range) * (chartHeight - padding.top - padding.bottom);
    const x = padding.left + (index / (data.length - 1 || 1)) * (chartWidth - padding.left - padding.right);
    return { x, y, isPR: point.isPR };
  });

  // Create smooth trend line using many interpolated points
  const path = Skia.Path.Make();
  const numInterpolationPoints = 100; // More points = smoother curve

  if (points.length > 0) {
    // Generate smooth curve through all points
    const smoothPoints: { x: number; y: number }[] = [];

    for (let t = 0; t <= numInterpolationPoints; t++) {
      const progress = t / numInterpolationPoints;
      const segmentFloat = progress * (points.length - 1);
      const segmentIndex = Math.floor(segmentFloat);
      const segmentProgress = segmentFloat - segmentIndex;

      if (segmentIndex >= points.length - 1) {
        smoothPoints.push(points[points.length - 1]);
        break;
      }

      // Get surrounding points for smooth interpolation
      const p0 = points[Math.max(segmentIndex - 1, 0)];
      const p1 = points[segmentIndex];
      const p2 = points[segmentIndex + 1];
      const p3 = points[Math.min(segmentIndex + 2, points.length - 1)];

      // Catmull-Rom spline interpolation
      const t2 = segmentProgress * segmentProgress;
      const t3 = t2 * segmentProgress;

      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * segmentProgress +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );

      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * segmentProgress +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );

      smoothPoints.push({ x, y });
    }

    // Draw the smooth path
    if (smoothPoints.length > 0) {
      path.moveTo(smoothPoints[0].x, smoothPoints[0].y);
      for (let i = 1; i < smoothPoints.length; i++) {
        path.lineTo(smoothPoints[i].x, smoothPoints[i].y);
      }
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Progression</Text>
        <Text style={styles.subtitle}>{eventName}</Text>
      </View>

      <View style={styles.chartContainer}>
        {/* Y-axis labels */}
        <View style={styles.yAxis}>
          <Text style={styles.axisLabel}>{minTime ? Math.floor(minTime / 60) : ''}</Text>
          <Text style={styles.axisLabel}>Time</Text>
          <Text style={styles.axisLabel}>{maxTime ? Math.floor(maxTime / 60) : ''}</Text>
        </View>

        {/* Skia Chart */}
        <View style={styles.canvasWrapper}>
          <Canvas style={{ width: chartWidth, height: chartHeight }}>
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
              const y = padding.top + ratio * (chartHeight - padding.top - padding.bottom);
              return (
                <Line
                  key={i}
                  p1={vec(padding.left, y)}
                  p2={vec(chartWidth - padding.right, y)}
                  color={colors.borders.light}
                  strokeWidth={1}
                  opacity={0.5}
                />
              );
            })}

            {/* Gradient line */}
            <Path
              path={path}
              style="stroke"
              strokeWidth={4}
              strokeCap="round"
              strokeJoin="round"
            >
              <SkiaLinearGradient
                start={vec(0, 0)}
                end={vec(chartWidth, 0)}
                colors={['#FF6B35', '#FF1B8D']}
              />
            </Path>

            {/* Data points */}
            {points.map((point, index) => (
              <React.Fragment key={index}>
                {/* Outer circle (white border) */}
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={point.isPR ? 8 : 6}
                  color={colors.backgrounds.white}
                />
                {/* Inner circle */}
                <Circle
                  cx={point.x}
                  cy={point.y}
                  r={point.isPR ? 5 : 4}
                  color={point.isPR ? colors.performance.newPR : colors.primary.trackOrange}
                />
                {/* PR star indicator */}
                {point.isPR && (
                  <Circle
                    cx={point.x}
                    cy={point.y}
                    r={2}
                    color={colors.text.white}
                  />
                )}
              </React.Fragment>
            ))}
          </Canvas>

          {/* Time labels overlay - only show for PR points */}
          <View style={styles.labelsOverlay}>
            {data.map((point, index) => {
              const pos = points[index];
              // Only show label if it's a PR
              if (!point.isPR) return null;
              return (
                <Text
                  key={index}
                  style={[
                    styles.timeLabel,
                    {
                      position: 'absolute',
                      left: pos.x - 24,
                      top: pos.y - 28,
                    },
                  ]}
                >
                  {point.displayTime}
                </Text>
              );
            })}
          </View>
        </View>

        {/* X-axis labels (dates) */}
        <View style={styles.xAxisContainer}>
          <View style={styles.xAxis}>
            {data.map((point, index) => {
              if (index % Math.ceil(data.length / 4) === 0 || index === data.length - 1) {
                const pos = points[index];
                return (
                  <Text
                    key={index}
                    style={[
                      styles.dateLabel,
                      {
                        position: 'absolute',
                        left: pos.x - 20,
                      },
                    ]}
                  >
                    {point.date}
                  </Text>
                );
              }
              return null;
            })}
          </View>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, styles.legendDotPR]} />
          <Text style={styles.legendText}>Personal Record</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendDot} />
          <Text style={styles.legendText}>Performance</Text>
        </View>
      </View>

      {/* Stats summary */}
      <View style={styles.stats}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Best Time</Text>
          <Text style={styles.statValue}>{data.reduce((best, curr) => curr.time < best.time ? curr : best, data[0])?.displayTime}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Latest</Text>
          <Text style={styles.statValue}>{data[data.length - 1]?.displayTime}</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Improvement</Text>
          <Text style={styles.statValue}>
            {(() => {
              const firstTime = data[0]?.time || 0;
              const bestTime = Math.min(...times);
              const diff = firstTime - bestTime;
              return diff > 0 ? `-${diff.toFixed(2)}s` : '+0.00s';
            })()}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.backgrounds.white,
    borderRadius: spacing.radiusLg,
    borderWidth: 4,
    borderColor: colors.borders.thick,
    padding: spacing.lg,
    shadowColor: colors.borders.thick,
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  header: {
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: colors.text.primary,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  chartContainer: {
    flexDirection: 'row',
    marginBottom: spacing.lg,
  },
  yAxis: {
    width: 35,
    height: 160,
    justifyContent: 'space-between',
    paddingRight: 6,
  },
  axisLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  canvasWrapper: {
    position: 'relative',
  },
  labelsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 260,
    height: 160,
    pointerEvents: 'none',
  },
  timeLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.text.primary,
    fontFamily: 'Courier',
    textAlign: 'center',
    width: 44,
  },
  xAxisContainer: {
    position: 'absolute',
    bottom: -25,
    left: 35,
    width: 260,
  },
  xAxis: {
    position: 'relative',
    height: 20,
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.text.tertiary,
    width: 36,
    textAlign: 'center',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 2,
    borderTopColor: colors.borders.light,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary.trackOrange,
  },
  legendDotPR: {
    backgroundColor: colors.performance.newPR,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
  stats: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
    minWidth: 0, // Allow flex to shrink
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.text.tertiary,
    marginBottom: 2,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: colors.primary.trackOrange,
    fontFamily: 'Courier',
    textAlign: 'center',
    numberOfLines: 1,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.tertiary,
  },
});
