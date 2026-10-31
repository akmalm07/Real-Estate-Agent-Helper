// Only the trusted local entrypoint can install this process-local capability.
let local;
export function localRuntime() { return local; }
export function installLocalRuntime(config) {
  if (local) throw new Error('Local runtime already installed');
  local = Object.freeze(config);
}

// Defer SDK validation until use; production still constructs the original SDK.
export function lazyClient(factory) {
  let client;
  return new Proxy({}, {
    get(_target, key) {
      client ??= factory();
      const value = client[key];
      return typeof value === 'function' ? value.bind(client) : value;
    },
  });
}
