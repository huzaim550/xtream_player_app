/**
 * Search, entirely client-side.
 *
 * The server has no search action and `get_vod_streams` returns the whole list
 * regardless, so there is nothing a round trip could add. On TV this is a
 * convenience only -- every title must remain reachable by browsing, because
 * typing on a remote is miserable.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSearch } from '@/hooks/useSearch';
import { MediaRow } from '@/ui/MediaRow';
import { FocusSection } from '@/ui/FocusSection';
import { Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

export default function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { movies, series, empty } = useSearch(query);

  const nothing = !empty && movies.length === 0 && series.length === 0;

  return (
    <View style={styles.flex}>
      <FocusSection style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies and series"
          placeholderTextColor={Palette.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </FocusSection>

      <ScrollView contentContainerStyle={styles.results}>
        {empty ? (
          <Text style={styles.hint}>Type to search your library.</Text>
        ) : nothing ? (
          <Text style={styles.hint}>Nothing matched “{query}”.</Text>
        ) : (
          <>
            <MediaRow
              title="Movies"
              items={movies.map((m) => ({
                key: `m-${m.id}`,
                title: m.displayName,
                posterUrl: m.posterUrl,
                qualityLabel: m.qualityLabel,
              }))}
              onSelect={(i) => router.push(`/movie/${movies[i].id}`)}
            />
            <MediaRow
              title="Series"
              items={series.map((s) => ({
                key: `s-${s.id}`,
                title: s.displayName,
                posterUrl: s.posterUrl,
              }))}
              onSelect={(i) => router.push(`/series/${series[i].id}`)}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  inputWrap: {
    paddingHorizontal: OVERSCAN.horizontal,
    paddingTop: OVERSCAN.vertical,
    paddingBottom: 8,
  },
  input: {
    backgroundColor: Palette.surface,
    borderRadius: Layout.radius,
    color: Palette.text,
    fontSize: Type.body,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Palette.surfaceRaised,
  },
  results: { paddingVertical: 12 },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    marginTop: 48,
  },
});
