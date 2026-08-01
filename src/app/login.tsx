/**
 * Sign-in.
 *
 * Two TV-specific concessions shape this screen: typing on a D-pad is painful,
 * so the server address is prefilled and the password can be revealed; and the
 * field order is wired explicitly with nextFocus* so Down always goes where it
 * looks like it should.
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AuthError } from '@/api/errors';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

const DEFAULT_SERVER = process.env.EXPO_PUBLIC_DEFAULT_SERVER_URL ?? '';

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const notice = useSession((s) => s.notice);
  const failures = useSession((s) => s.consecutiveFailures);

  const [server, setServer] = useState(DEFAULT_SERVER);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(server, username, password);
      // signIn only resolves on auth success; the store is now 'signed-in' but
      // nothing else navigates away from /login, so do it here.
      router.replace('/(app)/home');
      return;
    } catch (err) {
      if (err instanceof AuthError && !err.isExpired) {
        // A throttled IP and a wrong password are indistinguishable on the
        // wire -- both come back auth:0/Disabled. Since we cannot tell them
        // apart, say so, because the wait is the only real remedy.
        setError(
          'Sign-in failed. Check your details — and if they are correct, wait five minutes: the server temporarily blocks repeated failed logins.',
        );
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <FocusSection autoFocus style={styles.card}>
          <Text style={styles.heading}>Sign in</Text>
          <Text style={styles.sub}>Connect to your Xtream server.</Text>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          <Text style={styles.label}>Server address</Text>
          <TextInput
            style={styles.input}
            value={server}
            onChangeText={setServer}
            placeholder="https://example.com"
            placeholderTextColor={Palette.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            returnKeyType="next"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          <Focusable onPress={() => setShowPassword((v) => !v)} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {showPassword ? 'Hide password' : 'Show password'}
            </Text>
          </Focusable>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Focusable onPress={submit} disabled={busy} style={styles.button}>
            {({ focused }) => (
              <View style={[styles.buttonInner, focused && styles.buttonFocused]}>
                {busy ? (
                  <ActivityIndicator color={Palette.text} />
                ) : (
                  <Text style={styles.buttonText}>Sign in</Text>
                )}
              </View>
            )}
          </Focusable>

          {failures >= 2 ? (
            <Text style={styles.warn}>
              {failures} failed attempts. The server blocks an address after 10 —
              which also blocks playback, so double-check before retrying.
            </Text>
          ) : null}
        </FocusSection>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: OVERSCAN.horizontal,
  },
  card: { width: '100%', maxWidth: IS_TV ? 620 : 440 },
  heading: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  sub: {
    color: Palette.textSecondary,
    fontSize: Type.body,
    marginTop: 4,
    marginBottom: 20,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Palette.surface,
    borderRadius: Layout.radius,
    color: Palette.text,
    fontSize: Type.body,
    paddingHorizontal: 14,
    paddingVertical: IS_TV ? 14 : 10,
    borderWidth: 1,
    borderColor: Palette.surfaceRaised,
  },
  toggle: { alignSelf: 'flex-start', marginTop: 10, padding: 6 },
  toggleText: { color: Palette.accent, fontSize: Type.caption },
  button: { marginTop: 22 },
  buttonInner: {
    backgroundColor: Palette.accent,
    borderRadius: Layout.radius,
    paddingVertical: IS_TV ? 16 : 12,
    alignItems: 'center',
  },
  buttonFocused: { backgroundColor: '#5CB0FF' },
  buttonText: { color: '#04121F', fontSize: Type.body, fontWeight: '700' },
  error: { color: Palette.danger, fontSize: Type.caption, marginTop: 14 },
  warn: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 14 },
  notice: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    backgroundColor: Palette.surface,
    borderRadius: Layout.radius,
    padding: 12,
    marginBottom: 8,
  },
});
