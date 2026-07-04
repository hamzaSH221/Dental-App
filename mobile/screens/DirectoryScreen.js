import React, { useEffect, useState, useContext, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { api, COLORS, TYPE_LABEL } from '../api';
import { AuthContext } from '../App';

const CHIPS = [
  { value: '', label: 'All' },
  { value: 'nhs', label: 'NHS' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'private', label: 'Private' },
];

export default function DirectoryScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [clinics, setClinics] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (type) qs.set('type', type);
    api('/clinics?' + qs.toString())
      .then(d => setClinics(d.clinics))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, type]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={s.page}>
      <View style={s.topRow}>
        <TextInput
          style={s.search}
          placeholder="Area, postcode or practice name"
          value={q}
          onChangeText={setQ}
          returnKeyType="search"
        />
        <TouchableOpacity
          style={s.accountBtn}
          onPress={() => navigation.navigate(user ? 'MyRegistrations' : 'Login')}
        >
          <Text style={s.accountBtnText}>{user ? 'My regs' : 'Log in'}</Text>
        </TouchableOpacity>
      </View>
      <View style={s.chips}>
        {CHIPS.map(c => (
          <TouchableOpacity
            key={c.value}
            style={[s.chip, type === c.value && s.chipOn]}
            onPress={() => setType(c.value)}
          >
            <Text style={[s.chipText, type === c.value && s.chipTextOn]}>{c.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={clinics}
        keyExtractor={item => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={<Text style={s.empty}>No practices match yet — try widening your search.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={[s.card, item.featured && s.cardFeatured]} onPress={() => navigation.navigate('Clinic', { id: item.id })}>
            <View style={[s.spine, { backgroundColor: COLORS[item.type] }]} />
            <View style={s.cardBody}>
              {item.featured ? <Text style={s.featuredFlag}>✦ FEATURED</Text> : null}
              <View style={s.nameRow}>
                <Text style={s.name}>{item.name}{item.verified ? <Text style={s.vtick}> ✓</Text> : null}</Text>
                <Text style={[s.typeTag, { backgroundColor: COLORS[item.type] }]}>{TYPE_LABEL[item.type]}</Text>
              </View>
              <Text style={s.stars}>
                {item.review_count ? '★'.repeat(Math.round(item.rating)) + '☆'.repeat(5 - Math.round(item.rating)) + '  ' + item.rating + ' (' + item.review_count + ')' : 'No reviews yet'}
              </Text>
              <Text style={s.meta}>{item.area} · {item.postcode}</Text>
              <View style={s.badgeRow}>
                <Text style={[s.badge, item.accepting_new ? s.badgeOpen : s.badgeClosed]}>
                  {item.accepting_new ? '✓ Accepting new patients' : 'List full'}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.paper, padding: 12 },
  topRow: { flexDirection: 'row', gap: 8 },
  search: { flex: 1, backgroundColor: COLORS.card, borderWidth: 1.5, borderColor: COLORS.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  accountBtn: { backgroundColor: COLORS.teal, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 12 },
  accountBtnText: { color: '#0A1220', fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 8, marginVertical: 10 },
  chip: { borderWidth: 1.5, borderColor: COLORS.line, backgroundColor: COLORS.card, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  chipOn: { backgroundColor: COLORS.tealBright, borderColor: COLORS.tealBright },
  chipText: { color: COLORS.ink, fontWeight: '600' },
  chipTextOn: { color: '#0A1220' },
  card: { flexDirection: 'row', backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, marginBottom: 10, overflow: 'hidden' },
  cardFeatured: { borderColor: 'rgba(217,179,107,0.7)' },
  spine: { width: 8 },
  cardBody: { flex: 1, padding: 12 },
  featuredFlag: { color: COLORS.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 17, fontWeight: '700', color: COLORS.ink, flex: 1 },
  vtick: { color: COLORS.tealBright, fontWeight: '800' },
  typeTag: { color: '#0A1220', fontSize: 10, fontWeight: '800', letterSpacing: 0.5, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  stars: { color: COLORS.gold, fontSize: 13, marginTop: 3 },
  meta: { color: COLORS.inkSoft, marginTop: 2, marginBottom: 8 },
  badgeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  badge: { fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },
  badgeOpen: { backgroundColor: 'rgba(83,206,147,0.15)', color: COLORS.ok },
  badgeClosed: { backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger },
  badgePlain: { backgroundColor: COLORS.paper, color: COLORS.inkSoft },
  empty: { textAlign: 'center', color: COLORS.inkSoft, marginTop: 40 },
});
