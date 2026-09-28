import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { signIn, storedCredentials } from "./session";
import { usePalette } from "./theme";

/**
 * xId and passcode. The passcode is used for one request and never stored — only the
 * token that comes back goes into the Keychain.
 */
export default function SignInScreen() {
  const palette = usePalette();
  const [checking, setChecking] = useState(true);
  const [xid, setXid] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    storedCredentials().then((c) => (c ? router.replace("/rides") : setChecking(false)));
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await signIn(xid.trim(), pin);
      setPin("");
      router.replace("/rides");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <View style={[styles.center, { backgroundColor: palette.bg }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const input = [styles.input, { backgroundColor: palette.surface, color: palette.text }];
  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.title, { color: palette.text }]}>Sign in with your xId</Text>
      <Text style={[styles.body, { color: palette.muted }]}>
        The member number on your gym tag, and its passcode. The passcode is sent once to jfit.co and never stored.
      </Text>
      <TextInput
        style={input}
        placeholder="xId"
        placeholderTextColor={palette.muted}
        value={xid}
        onChangeText={setXid}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="number-pad"
        textContentType="username"
      />
      <TextInput
        style={input}
        placeholder="Passcode"
        placeholderTextColor={palette.muted}
        value={pin}
        onChangeText={setPin}
        secureTextEntry
        keyboardType="number-pad"
        textContentType="password"
      />
      {error ? <Text style={[styles.body, { color: palette.danger }]}>{error}</Text> : null}
      <Pressable
        onPress={submit}
        disabled={busy || !xid.trim() || !pin}
        style={({ pressed }) => [styles.button, { backgroundColor: palette.accent, opacity: busy || pressed ? 0.6 : 1 }]}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 21 },
  input: { borderRadius: 10, padding: 14, fontSize: 17 },
  button: { borderRadius: 10, padding: 16, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 17, fontWeight: "600" },
});
