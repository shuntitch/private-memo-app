import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const SUPABASE_URL = 'https://fhuoyuuoewbuhjzpdnug.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZodW95dXVvZXdidWhqenBkbnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDI3MTMsImV4cCI6MjA4OTE3ODcxM30.WgZJOjVUnYuFzbAqQVmSNH0OqmjVvfQjKYMlcnxiuZ0';

const storage = Platform.OS === 'web'
  ? {
      getItem: (key) => {
        const value = localStorage.getItem(key);
        return Promise.resolve(value);
      },
      setItem: (key, value) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    }
  : AsyncStorage;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
