import { Redirect } from 'expo-router';
import { useSession } from '@/store/session';

/** Boot gate. `restore()` in the root layout has already settled by the time
 *  this renders, so `boot` is never 'loading' here. */
export default function Index() {
  const boot = useSession((s) => s.boot);
  return <Redirect href={boot === 'signed-in' ? '/(app)/home' : '/login'} />;
}
