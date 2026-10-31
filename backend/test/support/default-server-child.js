import { mock } from 'node:test';
import net from 'node:net';

mock.module('dotenv', { defaultExport: { config() {} } });
mock.module('dotenv/config', { defaultExport: {} });
const connect = net.connect;
net.connect = function (...args) {
  throw new Error(`LOCAL_EGRESS_DENIED: ${String(args[0])}`);
};
await import('../../src/server.js');
if (process.env.PORT === '0') {
  const timer = setInterval(() => {
    const listener = process._getActiveHandles().find(handle => handle instanceof net.Server && handle.listening && handle.address()?.port);
    if (listener) {
      clearInterval(timer);
      process.send({ ready: true, port: listener.address().port });
    }
  }, 10);
}
