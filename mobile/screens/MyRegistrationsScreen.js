import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { api, COLORS } from '../api';

const STATUS_COLORS = { pending: '#8A5A10', contacted: COLORS.nhs, accepted: COLORS.ok, declined: COLORS.danger };

export default function MyRegistrationsScreen() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/registrations/mine').then(d => setRows(d.registrations)).catch(e => setError(e.message));
  }, []);

  if (error) return <Text style={st.error}>{error}</Text>;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: COLORS.paper }}
      contentContainerStyle={{ padding: 12 }}
      data={rows}
      keyExtractor={r => String(r.id)}
      ListEmptyComponent={<Text style={st.empty}>You haven't registered with a practice yet.</Text>}
      renderItem={({ item }) => (
        <View style={st.card}>
          <Text style={st.name}>{item.clinic_name}</Text>
          <Text style={st.meta}>{item.area} · Seeking {item.patient_type.toUpperCase()} · {item.created_at.slice(0, 10)}</Text>
          <Text style={[st.status, { color: STATUS_COLORS[item.status] }]}>Status: {item.status}</Text>
          <TouchableOpacity onPress={() => Linking.openURL('tel:' + item.clinic_phone.replace(/\s/g, ''))}>
            <Text style={st.call}>📞 Ring to book: {item.clinic_phone}</Text>
          </TouchableOpacity>
        </View>
      )}
    />
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: COLORS.card, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line, padding: 14, marginBottom: 10 },
  name: { fontSize: 17, fontWeight: '800', color: COLORS.ink },
  meta: { color: COLORS.inkSoft, marginTop: 2 },
  status: { fontWeight: '800', marginTop: 8, textTransform: 'capitalize' },
  call: { color: COLORS.tealBright, fontWeight: '700', marginTop: 8, fontSize: 16 },
  empty: { textAlign: 'center', color: COLORS.inkSoft, marginTop: 40 },
  error: { margin: 14, backgroundColor: 'rgba(240,128,120,0.15)', color: COLORS.danger, padding: 12, borderRadius: 10, fontWeight: '600' },
});
