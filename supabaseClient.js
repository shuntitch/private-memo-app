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

// 비밀번호 재설정 메일의 링크로 들어오면 URL에 토큰(#type=recovery...) 또는
// 인증 코드(?code=...)가 실려온다. createClient가 이를 소비하면서 URL을 지워버리기
// 때문에, 클라이언트를 만들기 전에 먼저 읽어둔다.
const readAuthParamsFromUrl = () => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return {};

  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const get = (key) => hash.get(key) || query.get(key);

  return {
    isRecovery: get('type') === 'recovery' || !!query.get('code'),
    errorCode: get('error_code'),
    errorDescription: get('error_description'),
  };
};

export const initialAuthUrlParams = readAuthParamsFromUrl();

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storage,
    autoRefreshToken: true,
    persistSession: true,
    // 웹에서는 재설정 링크의 토큰을 세션으로 교환해야 하므로 켜둔다
    detectSessionInUrl: Platform.OS === 'web',
  },
});
