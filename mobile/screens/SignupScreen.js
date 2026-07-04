import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { api } from '../api';
import { AuthContext } from '../App';
import { s } from './LoginScreen';

export default function SignupScreen({ navigation, route }) {
  const { setUser } = useContext(AuthContext);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const d = await api('/auth/signup', { method: 'POST', body: form });
      setUser(d.user);
      const then = route.params?.then;
      if (then) navigation.replace(then.screen, then.params);
      else navigation.replace('Directory');
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <ScrollView style={s.page}>
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Text style={s.label}>Full name</Text>
      <TextInput style={s.input} value={form.full_name} onChangeText={set('full_name')} />
      <Text style={s.label}>Email</Text>
      <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={set('email')} />
      <Text style={s.label}>UK phone (optional)</Text>
      <TextInput style={s.input} keyboardType="phone-pad" value={form.phone} onChangeText={set('phone')} />
      <Text style={s.label}>Password</Text>
      <Text style={s.hint}>At least 10 characters, with letters and numbers.</Text>
      <TextInput style={s.input} secureTextEntry value={form.password} onChangeText={set('password')} />
      <TouchableOpacity style={s.btn} onPress={submit} disabled={busy}>
        <Text style={s.btnText}>{busy ? 'Creating…' : 'Create my account'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.replace('Login', route.params)}>
        <Text style={s.link}>Already have an account? Log in</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
