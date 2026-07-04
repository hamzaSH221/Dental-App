// DentaLink — mobile app (Expo / React Native)
// Talks to the same API as the website. Set API_URL in api.js before building.
import React, { useEffect, useState, createContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import DirectoryScreen from './screens/DirectoryScreen';
import ClinicScreen from './screens/ClinicScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import RegisterFormScreen from './screens/RegisterFormScreen';
import MyRegistrationsScreen from './screens/MyRegistrationsScreen';
import { api } from './api';

export const AuthContext = createContext({ user: null, setUser: () => {} });
const Stack = createNativeStackNavigator();

export default function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    api('/auth/me').then(d => setUser(d.user)).catch(() => {});
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <NavigationContainer>
        <StatusBar style="light" />
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: '#0A1220' },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
          }}
        >
          <Stack.Screen name="Directory" component={DirectoryScreen} options={{ title: 'DentaLink' }} />
          <Stack.Screen name="Clinic" component={ClinicScreen} options={{ title: 'Practice details' }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: 'Log in' }} />
          <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create account' }} />
          <Stack.Screen name="RegisterForm" component={RegisterFormScreen} options={{ title: 'Register with practice' }} />
          <Stack.Screen name="MyRegistrations" component={MyRegistrationsScreen} options={{ title: 'My registrations' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
