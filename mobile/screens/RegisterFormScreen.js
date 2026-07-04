import React, { useEffect, useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch, Linking } from 'react-native';
import { api, COLORS } from '../api';
import { AuthContext } from '../App';

const PATIENT_TYPES = [
  { value: 'nhs', label: 'NHS' },
  { value: 'private', label: 'Private' },
  { value: 'either', label: 'Either' },
];

export default function RegisterFormScreen({ route, navigation }) {
  const { user } = useContext(AuthContext);
  const [clinic, setClinic] = useState(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.full_name || '', dob: '', address: '', postcode: '',
    phone: user?.phone || '', email: user?.email || '', patient_type: 'nhs',
    nhs_number: '', exemption_status: '', gp_practice: '',
    medical_conditions: '', medications: '', allergies: '',
    dental_concerns: '', last_dental_visit: '',
    emergency_contact_name: '', emergency_contact_phone: '',
  });
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api('/clinics/' + route.params.clinicId).then(d => setClinic(d.clinic)).catch(e => setError(e.message));
  }, [route.params.clinicId]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const d = await api('/registrations', {
        method: 'POST',
        body: { ...form, clinic_id: clinic.id, consent },
      });
      setDone(d.next_step);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  if (!clinic && !error) return <Text style={st.loading}>Loading…</Text>;

  if (done) {
    return (
      <View style={[st.page, { padding: 20 }]}>
        <Text style={st.doneTitle}>You're registered ✔</Text>
        <Text style={st.body}>{done}</Text>
        <TouchableOpacity style={st.callBtn} onPress={() => Linking.openURL('tel:' + clinic.phone.replace(/\s/g, ''))}>
          <Text style={st.callBtnText}>📞  {clinic.phone}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.btn} onPress={() => navigation.replace('MyRegistrations')}>
          <Text style={st.btnText}>View my registrations</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const F = ({ label, k, hint, ...props }) => (
    <View>
      <Text style={st.label}>{label}{hint ? <Text style={st.hint}>  — {hint}</Text> : null}</Text>
      <TextInput style={st.input} value={form[k]} onChangeText={set(k)} {...props} />
    </View>
  );

  return (
    <ScrollView style={st.page} contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <Text style={st.intro}>This is the same information {clinic.name} would ask for on their new-patient form. Optional fields can be completed at your first visit.</Text>
      {error ? <Text style={st.error}>{error}</Text> : null}

      <Text style={st.section}>Your details</Text>
      <F label="Full name" k="full_name" />
      <F label="Date of birth" k="dob" hint="YYYY-MM-DD" placeholder="1990-06-21" />
      <F label="Home address" k="address" />
      <F label="Postcode" k="postcode" autoCapitalize="characters" />
      <F label="Phone" k="phone" keyboardType="phone-pad" />
      <F label="Email" k="email" keyboardType="email-address" autoCapitalize="none" />

      <Text style={st.section}>Care you're looking for</Text>
      <View style={st.chips}>
        {PATIENT_TYPES.map(t => (
          <TouchableOpacity key={t.value} style={[st.chip, form.patient_type === t.value && st.chipOn]} onPress={() => set('patient_type')(t.value)}>
            <Text style={[st.chipText, form.patient_type === t.value && st.chipTextOn]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <F label="NHS number" k="nhs_number" hint="optional" placeholder="485 777 3456" keyboardType="number-pad" />
      <F label="NHS charge exemption" k="exemption_status" hint="optional — e.g. HC2 certificate, maternity, Universal Credit" />
      <F label="Your GP practice" k="gp_practice" hint="optional" />
      <F label="Last dental visit" k="last_dental_visit" hint="optional" placeholder="about 2 years ago" />
      <F label="Anything the dentist should know?" k="dental_concerns" hint="optional" multiline />

      <Text style={st.section}>Medical history</Text>
      <F label="Medical conditions" k="medical_conditions" hint="optional" multiline />
      <F label="Current medications" k="medications" hint="optional" multiline />
      <F label="Allergies" k="allergies" hint="optional" />
      <F label="Emergency contact name" k="emergency_contact_name" hint="optional" />
      <F label="Emergency contact phone" k="emergency_contact_phone" hint="optional" keyboardType="phone-pad" />

      <View style={st.consentRow}>
        <Switch value={consent} onValueChange={setConsent} trackColor={{ true: COLORS.tealBright }} />
        <Text style={st.consentText}>I consent to DentaLink sharing these details with {clinic.name} so they can register me as a patient.</Text>
      </View>

      <TouchableOpacity style={[st.btn, (!consent || busy) && { opacity: 0.5 }]} onPress={submit} disabled={!consent || busy}>
        <Text style={st.btnText}>{busy ? 'Sending…' : 'Register with ' + clinic.name}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper },
  loading: { padding: 20, color: COLORS.inkSoft },
  intro: { color: COLORS.inkSoft, marginBottom: 10, lineHeight: 20 },
  section: { fontSize: 17, fontWeight: '800', color: COLORS.ink, marginTop: 18, marginBottom: 4 },
  label: { fontWeight: '700', color: COLORS.ink, marginTop: 10, marginBottom: 4 },
  hint: { fontWeight: '400', color: COLORS.inkSoft, fontSize: 12 },
  input: { backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 10, padding: 12, fontSize: 15 },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 6 },
  chip: { borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.card, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  chipOn: { backgroundColor: COLORS.tealBright, borderColor: COLORS.tealBright },
  chipText: { color: COLORS.ink, fontWeight: '600' },
  chipTextOn: { color: '#0A1220' },
  consentRow: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 18 },
  consentText: { flex: 1, color: COLORS.ink, lineHeight: 19 },
  btn: { backgroundColor: COLORS.teal, borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#0A1220', fontWeight: '800', fontSize: 16 },
  callBtn: { marginTop: 14, borderWidth: 1.5, borderColor: COLORS.teal, borderRadius: 10, padding: 12, alignItems: 'center' },
  callBtnText: { color: COLORS.gold, fontWeight: '800', fontSize: 18 },
  error: { backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger, padding: 12, borderRadius: 10, fontWeight: '600', marginBottom: 8 },
  doneTitle: { fontSize: 24, fontWeight: '800', color: COLORS.ink, marginBottom: 8 },
  body: { color: COLORS.ink, lineHeight: 21 },
});
