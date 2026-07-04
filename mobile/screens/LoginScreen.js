import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { api, COLORS } from '../api';
import { AuthContext } from '../App';

export default function LoginScreen({ navigation, route }) {
  const { setUser } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email, password } });
      setUser(d.user);
      const then = route.params?.then;
      if (then) navigation.replace(then.screen, then.params);
      else navigation.replace('Directory');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <View style={s.page}>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Text style={s.label}>Password</Text>
      <TextInput style={s.input} secureTextEntry value={password} onChangeText={setPassword} />
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Logging in…' : 'Log in'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.replace('Signup', route.params)}>
        <Text style={s.link}>New here? Create an account</Text>
      </TouchableOpacity>
    </View>
  );
}

export const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper, padding: 16 },
  label: { fontWeight: '700', color: COLORS.ink, marginTop: 12, marginBottom: 4 },
  input: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 10, padding: 12, fontSize: 15 },
  btn: { backgroundColor: COLORS.teal, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 18 },
  btnText: { color: '#0A1220', fontWeight: '800', fontSize: 16 },
  link: { color: COLORS.tealBright, textAlign: 'center', marginTop: 14, fontWeight: '600' },
  error: { backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger, padding: 12, borderRadius: 10, fontWeight: '600' },
  hint: { color: COLORS.inkSoft, fontSize: 12, marginTop: 2 },
});
