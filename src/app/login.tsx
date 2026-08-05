/**
 * Sign-in.
 *
 * The logic here is unchanged and deliberately conservative: the server answers
 * bad credentials with HTTP 200 and auth:0, and it throttles an IP after 10
 * failures in 5 minutes -- a throttle that also blocks /movie and /series. So
 * nothing on this screen ever retries automatically, and the failure copy says
 * plainly that waiting is the remedy, because a wrong password and a throttled
 * IP are indistinguishable on the wire.
 *
 * Two TV concessions shape the layout: typing on a D-pad is painful, so the
 * server address is prefilled and the password can be revealed.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
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
import { ABSOLUTE_FILL, IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

/*
 * No default server, deliberately.
 *
 * This field used to be prefilled from EXPO_PUBLIC_DEFAULT_SERVER_URL, which
 * was a kindness on a TV remote and a liability everywhere else: a player that
 * describes itself as working with any Xtream server, but opens with one
 * particular service already typed in, argues against its own description --
 * to a Play reviewer above all. The address is remembered after the first
 * successful sign-in, so this costs one typing, once.
 */
const GLOW = require('@/assets/images/logo-glow.png') as number;

export default function LoginScreen() {
  const router = useRouter();
  const signIn = useSession((s) => s.signIn);
  const notice = useSession((s) => s.notice);
  const failures = useSession((s) => s.consecutiveFailures);

  const [server, setServer] = useState('');
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
    <View style={styles.flex}>
      {/* A wash of brand red bleeding out of the top, so the screen reads as
          Manzar before a single word is typed. */}
      <LinearGradient
        colors={['rgba(225,29,46,0.22)', 'rgba(225,29,46,0.05)', Palette.background]}
        locations={[0, 0.35, 1]}
        style={ABSOLUTE_FILL}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={GLOW} style={styles.glow} contentFit="contain" />
            <Text style={styles.wordmark}>MANZAR</Text>
            <Text style={styles.tagline}>Your library, everywhere.</Text>
          </View>

          <FocusSection autoFocus style={styles.card}>
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
              placeholder="username"
              placeholderTextColor={Palette.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="password"
              placeholderTextColor={Palette.textMuted}
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

            <Focusable onPress={submit} disabled={busy} showFocusRing={false} style={styles.button}>
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

          <Focusable
            onPress={() => router.push('/(app)/privacy')}
            showFocusRing={false}
            style={styles.legal}
          >
            {({ focused }) => (
              <Text style={[styles.legalText, focused && styles.legalTextFocused]}>
                Privacy Policy
              </Text>
            )}
          </Focusable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: OVERSCAN.horizontal,
    paddingVertical: 32,
  },
  brand: { alignItems: 'center', marginBottom: 8 },
  glow: { width: 168, height: 168 },
  wordmark: {
    marginTop: -22,
    color: Palette.brand,
    fontSize: IS_TV ? 40 : 32,
    fontWeight: '900',
    letterSpacing: 6,
  },
  tagline: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    marginTop: 6,
    letterSpacing: 1,
  },
  card: {
    width: '100%',
    maxWidth: IS_TV ? 620 : 440,
    marginTop: 22,
    backgroundColor: 'rgba(22,25,31,0.86)',
    borderRadius: Layout.radius * 2,
    borderWidth: 1,
    borderColor: Palette.surfaceRaised,
    padding: 22,
  },
  label: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Palette.background,
    borderRadius: Layout.radius,
    color: Palette.text,
    fontSize: Type.body,
    paddingHorizontal: 14,
    paddingVertical: IS_TV ? 14 : 12,
    borderWidth: 1,
    borderColor: Palette.surfaceRaised,
  },
  toggle: { alignSelf: 'flex-start', marginTop: 10, padding: 6 },
  toggleText: { color: Palette.accent, fontSize: Type.caption },
  button: { marginTop: 20 },
  buttonInner: {
    backgroundColor: Palette.brand,
    borderRadius: Layout.radius,
    paddingVertical: IS_TV ? 16 : 14,
    alignItems: 'center',
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  buttonFocused: { borderColor: Palette.focus, backgroundColor: Palette.brandBright },
  buttonText: {
    color: Palette.text,
    fontSize: Type.body,
    fontWeight: '800',
    letterSpacing: 1,
  },
  error: { color: Palette.danger, fontSize: Type.caption, marginTop: 14 },
  warn: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 14 },
  notice: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    backgroundColor: Palette.background,
    borderRadius: Layout.radius,
    padding: 12,
    marginBottom: 4,
  },
  legal: { marginTop: 24, padding: 8 },
  legalText: { color: Palette.textMuted, fontSize: Type.caption },
  legalTextFocused: { color: Palette.text },
});
