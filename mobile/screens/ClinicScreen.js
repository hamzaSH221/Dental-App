import React, { useEffect, useState, useContext } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { api, COLORS, TYPE_LABEL } from '../api';
import { AuthContext } from '../App';

export default function ClinicScreen({ route, navigation }) {
  const { user } = useContext(AuthContext);
  const [clinic, setClinic] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/clinics/' + route.params.id)
      .then(d => setClinic(d.clinic))
      .catch(e => setError(e.message));
  }, [route.params.id]);

  if (error) return <Text style={s.error}>{error}</Text>;
  if (!clinic) return <Text style={s.loading}>Loading…</Text>;

  let hours = null;
  try { hours = JSON.parse(clinic.opening_hours); } catch {}

  const call = () => Linking.openURL('tel:' + clinic.phone.replace(/\s/g, ''));
  const register = () => {
    if (!user) navigation.navigate('Signup', { then: { screen: 'RegisterForm', params: { clinicId: clinic.id } } });
    else navigation.navigate('RegisterForm', { clinicId: clinic.id });
  };

  return (
    <ScrollView style={s.page} contentContainerStyle={{ padding: 14 }}>
      <View style={[s.pill, { backgroundColor: COLORS[clinic.type] }]}>
        <Text style={s.pillText}>{TYPE_LABEL[clinic.type]}</Text>
      </View>
      <Text style={s.name}>{clinic.name}{clinic.verified ? <Text style={s.vtick}> ✓</Text> : null}</Text>
      {clinic.review_count ? (
        <Text style={s.stars}>{'★'.repeat(Math.round(clinic.rating)) + '☆'.repeat(5 - Math.round(clinic.rating))}  {clinic.rating} ({clinic.review_count})</Text>
      ) : <Text style={s.noReviews}>No reviews yet</Text>}
      <Text style={s.meta}>{clinic.address}, {clinic.postcode} · {clinic.area}</Text>
      <Text style={[s.badge, clinic.accepting_new ? s.badgeOpen : s.badgeClosed]}>
        {clinic.accepting_new ? 'Accepting new patients' : 'New patient list currently full'}
      </Text>

      <View style={s.panel}>
        <Text style={s.h2}>About this practice</Text>
        <Text style={s.body}>{clinic.description || 'No description provided yet.'}</Text>
      </View>

      {hours && (
        <View style={s.panel}>
          <Text style={s.h2}>Opening hours</Text>
          {Object.entries(hours).map(([d, h]) => (
            <View key={d} style={s.hourRow}>
              <Text style={s.body}>{d}</Text>
              <Text style={s.meta}>{h}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.panel}>
        <Text style={s.h2}>Register, then ring to book</Text>
        <Text style={s.body}>1. Register so the practice has your details.{'\n'}2. Ring them to book your first appointment.</Text>
        <TouchableOpacity style={s.callBtn} onPress={call}>
          <Text style={s.callBtnText}>📞  {clinic.phone}</Text>
        </TouchableOpacity>
        {clinic.accepting_new ? (
          <TouchableOpacity style={s.primaryBtn} onPress={register}>
            <Text style={s.primaryBtnText}>Register with this practice</Text>
          </TouchableOpacity>
        ) : (
          <Text style={s.error}>This practice isn't taking new patients right now — ring them to join the waiting list.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper },
  loading: { padding: 20, color: COLORS.inkSoft },
  error: { margin: 14, backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger, padding: 12, borderRadius: 10, fontWeight: '600' },
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 8 },
  pillText: { color: '#0A1220', fontWeight: '800', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  name: { fontSize: 24, fontWeight: '800', color: COLORS.ink },
  vtick: { color: COLORS.tealBright, fontWeight: '800' },
  stars: { color: COLORS.gold, fontSize: 15, marginTop: 4 },
  noReviews: { color: COLORS.inkSoft, fontSize: 13, marginTop: 4 },
  meta: { color: COLORS.inkSoft, marginTop: 2 },
  badge: { alignSelf: 'flex-start', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginTop: 10, overflow: 'hidden' },
  badgeOpen: { backgroundColor: 'rgba(83,206,147,0.15)', color: COLORS.ok },
  badgeClosed: { backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger },
  panel: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, padding: 14, marginTop: 14 },
  h2: { fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 6 },
  body: { color: COLORS.ink, lineHeight: 21 },
  hourRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.line },
  callBtn: { marginTop: 12, borderWidth: 1.5, borderColor: COLORS.teal, borderRadius: 10, padding: 12, alignItems: 'center' },
  callBtnText: { color: COLORS.gold, fontWeight: '800', fontSize: 18 },
  primaryBtn: { marginTop: 10, backgroundColor: COLORS.teal, borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryBtnText: { color: '#0A1220', fontWeight: '800', fontSize: 16 },
});
