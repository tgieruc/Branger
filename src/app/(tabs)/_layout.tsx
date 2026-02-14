import { Tabs } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';

export default function TabLayout() {
  const { signOut } = useAuth();

  const headerRight = () => (
    <TouchableOpacity onPress={signOut} style={{ marginRight: 16 }}>
      <Ionicons name="log-out-outline" size={24} color="#007AFF" />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#007AFF',
      }}
    >
      <Tabs.Screen
        name="recipes"
        options={{
          title: 'Recipes',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="book-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="lists"
        options={{
          title: 'Lists',
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
