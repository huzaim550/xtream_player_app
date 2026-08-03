/**
 * The last line of defence against a blank screen.
 *
 * React unmounts the whole tree when a render throws and nothing catches it. In
 * a development build that is a red box; in a release build -- which is what an
 * OTA update lands on -- there is no red box, so the root view simply empties
 * and the user is left staring at the bare Android window background. That is
 * the "grey screen with no app chrome" this component exists to abolish: the
 * error is now shown, recorded, and recoverable instead of silent.
 *
 * It sits above the navigator on purpose. A boundary inside the Stack cannot
 * render if the failure is in the Stack itself, and the failures worth catching
 * are exactly the ones that take the navigator with them.
 *
 * Class component because that is the only thing React lets be a boundary --
 * there is no hook equivalent.
 */

import * as Updates from 'expo-updates';
import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCrashLog } from '@/store/crashLog';
import { Focusable } from './Focusable';
import { Layout, OVERSCAN, Palette, Type } from './platform';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Non-fatal: the process is alive, we just lost the tree. The record goes
    // through the same redact() path as everything else in the crash log, which
    // matters here because a stack can contain a stream URL -- and those carry
    // the password as a path segment.
    useCrashLog.getState().record(error, false);
  }

  /** Re-mount the tree. Enough for a transient failure; a deterministic one
   *  throws again immediately, which is itself useful information. */
  private retry = () => this.setState({ error: null });

  /** Reload the JS bundle from scratch -- the reliable way out of a broken
   *  store or a bad navigation state, and it also picks up a newer update. */
  private restart = () => {
    void Updates.reloadAsync().catch(() => this.retry());
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Something broke</Text>
          <Text style={styles.body}>
            Manzar hit an error it could not recover from on its own. The details
            below are also saved to Settings → Diagnostics.
          </Text>

          <Text style={styles.message}>{error.message || 'Unknown error'}</Text>
          {error.stack ? (
            <Text style={styles.stack} selectable>
              {error.stack}
            </Text>
          ) : null}

          <View style={styles.buttons}>
            <Focusable onPress={this.restart} style={styles.button} hasTVPreferredFocus>
              <Text style={styles.buttonText}>Restart Manzar</Text>
            </Focusable>
            <Focusable onPress={this.retry} style={styles.buttonSecondary}>
              <Text style={styles.buttonSecondaryText}>Try again</Text>
            </Focusable>
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.background },
  content: { padding: OVERSCAN.horizontal, paddingTop: 64, paddingBottom: 40 },
  title: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  body: { color: Palette.textSecondary, fontSize: Type.body, marginTop: 8 },
  message: {
    color: Palette.danger,
    fontSize: Type.body,
    fontWeight: '600',
    marginTop: 20,
  },
  stack: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    fontFamily: 'monospace',
    marginTop: 12,
  },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 28 },
  button: {
    backgroundColor: Palette.brand,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },
  buttonSecondary: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonSecondaryText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
});
