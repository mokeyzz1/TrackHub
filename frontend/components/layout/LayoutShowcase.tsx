import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Container } from './Container';
import { Stack } from './Stack';
import { Card } from './Card';
import { Section } from './Section';
import { Grid } from './Grid';
import { colors, spacing } from '../../design-system';

export const LayoutShowcase: React.FC = () => {
  return (
    <ScrollView style={styles.screen}>
      <Container>
        <Stack gap="xxxl">
          {/* Section with Cards */}
          <Section
            title="Card Variants"
            subtitle="Different card styles"
            action={{
              label: 'View All',
              onPress: () => console.log('View all pressed'),
              icon: 'arrow-forward',
            }}
          >
            <Stack gap="md">
              <Card>
                <Text style={styles.cardText}>Default Card</Text>
              </Card>

              <Card variant="outlined">
                <Text style={styles.cardText}>Outlined Card</Text>
              </Card>

              <Card variant="filled">
                <Text style={styles.cardText}>Filled Card</Text>
              </Card>

              <Card onPress={() => console.log('Card pressed')}>
                <Text style={styles.cardText}>Pressable Card (with haptics)</Text>
              </Card>
            </Stack>
          </Section>

          {/* Shadow Examples */}
          <Section title="Shadow Styles">
            <Stack gap="md">
              <Card shadow="hard" shadowSize="sm">
                <Text style={styles.cardText}>Hard Shadow - Small</Text>
              </Card>

              <Card shadow="hard" shadowSize="md">
                <Text style={styles.cardText}>Hard Shadow - Medium</Text>
              </Card>

              <Card shadow="soft" shadowSize="lg">
                <Text style={styles.cardText}>Soft Shadow - Large</Text>
              </Card>
            </Stack>
          </Section>

          {/* Grid Layout */}
          <Section title="Grid Layouts">
            <Grid columns={2} gap="md">
              <Card padding="md">
                <Text style={styles.cardText}>Grid 1</Text>
              </Card>
              <Card padding="md">
                <Text style={styles.cardText}>Grid 2</Text>
              </Card>
              <Card padding="md">
                <Text style={styles.cardText}>Grid 3</Text>
              </Card>
              <Card padding="md">
                <Text style={styles.cardText}>Grid 4</Text>
              </Card>
            </Grid>
          </Section>

          {/* Horizontal Stack */}
          <Section title="Horizontal Stack">
            <Stack horizontal gap="md" align="center">
              <Card padding="md" style={{ flex: 1 }}>
                <Text style={styles.cardText}>Item 1</Text>
              </Card>
              <Card padding="md" style={{ flex: 1 }}>
                <Text style={styles.cardText}>Item 2</Text>
              </Card>
              <Card padding="md" style={{ flex: 1 }}>
                <Text style={styles.cardText}>Item 3</Text>
              </Card>
            </Stack>
          </Section>

          {/* Spacing Examples */}
          <Section title="Spacing System">
            <Stack gap="xs">
              <View style={styles.spacingDemo}>
                <Text style={styles.label}>xs (4px)</Text>
              </View>
            </Stack>
            <Stack gap="sm">
              <View style={styles.spacingDemo}>
                <Text style={styles.label}>sm (8px)</Text>
              </View>
            </Stack>
            <Stack gap="md">
              <View style={styles.spacingDemo}>
                <Text style={styles.label}>md (12px)</Text>
              </View>
            </Stack>
            <Stack gap="lg">
              <View style={styles.spacingDemo}>
                <Text style={styles.label}>lg (16px)</Text>
              </View>
            </Stack>
          </Section>
        </Stack>
      </Container>

      <View style={{ height: spacing.bottomSpacing }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.backgrounds.cream,
    paddingTop: spacing.xl,
  },
  cardText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  spacingDemo: {
    backgroundColor: colors.primary.trackOrange,
    padding: spacing.md,
    borderRadius: spacing.radiusSm,
    borderWidth: 2,
    borderColor: colors.borders.thick,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text.white,
  },
});
