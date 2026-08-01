/**
 * Native modules the stores pull in transitively.
 *
 * src/store/persist.ts is imported by every store, and it reaches for
 * AsyncStorage and SecureStore at module scope. Neither exists in a Node test
 * process, so both are stubbed with in-memory equivalents that behave like the
 * real thing well enough for the state machines under test.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k, v) => {
        store[k] = v;
      }),
      multiRemove: jest.fn(async (keys) => {
        for (const k of keys) delete store[k];
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));
