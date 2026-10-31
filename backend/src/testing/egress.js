import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

export function installEgressGuard(socketDirectory) {
  const deny = () => { throw new Error('LOCAL_EGRESS_DENIED'); };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    const path = typeof options === 'string' ? options : options?.path;
    if (path !== `${socketDirectory}/.s.PGSQL.5432` || options?.fd != null) deny();
    return connect.apply(this, args);
  };
  for (const module of [http, https]) {
    module.request = deny;
    module.get = deny;
    module.Agent.prototype.createConnection = deny;
  }
  tls.connect = deny;
  const lookup = dns.lookup;
  for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6']) {
    dns[key] = deny;
    dns.promises[key] = deny;
  }
  // Node's listener uses lookup even for an IP literal. No outbound socket is
  // authorized by this; Socket.connect above still denies every TCP connection.
  dns.lookup = (host, ...args) => host === '127.0.0.1' ? lookup(host, ...args) : deny();
  const captures = [];
  globalThis.fetch = async (url, options) => {
    if (url !== 'https://comms.twilio.com/v1/Emails' || options?.method !== 'POST') deny();
    const envelope = JSON.parse(options.body);
    if (!Array.isArray(envelope.to) || envelope.to.length !== 1 ||
        !/^[a-z0-9._+-]+@example\.invalid$/.test(envelope.to[0]?.address) ||
        typeof envelope.content?.subject !== 'string' ||
        typeof envelope.content?.html !== 'string') deny();
    // Never retain Authorization headers, even synthetic ones.
    captures.push(envelope);
    return new Response(JSON.stringify({ local: true, captured: true }), { status: 200 });
  };
  syncBuiltinESMExports();
  return captures;
}
