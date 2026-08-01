import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/content/privacy';
import { IS_TV, OVERSCAN, Palette, Type } from '@/ui/platform';

export default function PrivacyScreen() {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated {PRIVACY_UPDATED}</Text>

      {PRIVACY_SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.h2}>{section.heading}</Text>
          {section.body.map((para, i) => (
            <Text key={i} style={styles.para}>
              {para}
            </Text>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: OVERSCAN.horizontal,
    paddingBottom: 48,
    maxWidth: IS_TV ? 900 : undefined,
  },
  h1: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  updated: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 4 },
  section: { marginTop: 28 },
  h2: {
    color: Palette.brand,
    fontSize: Type.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  para: {
    color: Palette.textSecondary,
    fontSize: Type.body,
    lineHeight: Type.body * 1.6,
    marginBottom: 12,
  },
});
