import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { colors } from '../../design-system/colors';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary.trackOrange,
        tabBarInactiveTintColor: colors.text.tertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.backgrounds.white,
          borderTopWidth: 4,
          borderTopColor: colors.borders.thick,
          height: 70,
          paddingBottom: 12,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '900',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons size={26} name={focused ? 'home' : 'home-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="meets"
        options={{
          title: 'Meets',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons size={26} name={focused ? 'calendar' : 'calendar-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="athletes"
        options={{
          title: 'Athletes',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons size={26} name={focused ? 'people' : 'people-outline'} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community"
        options={{
          title: 'Community',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons size={26} name={focused ? 'chatbubbles' : 'chatbubbles-outline'} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
