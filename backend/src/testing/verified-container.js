import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

export const CONTAINER = 'reah-bootstrap-t9d4a7723-review40';
export function docker(...args) {
  return execFileSync('docker', args, {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, HOME: process.env.HOME },
    timeout: 15000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

export function verifyContainer(name) {
  assert.equal(name, CONTAINER, 'Exact retained task container opt-in required');
  const [container] = JSON.parse(docker('inspect', name));
  assert.equal(container.Name, `/${CONTAINER}`);
  assert.equal(container.Config.Labels.task, 't_9d4a7723');
  assert.equal(container.Config.Image, 'postgres:17.7-alpine');
  const [image] = JSON.parse(docker('image', 'inspect', 'postgres:17.7-alpine'));
  assert.equal(container.Image, image.Id);
  assert.equal(container.State.Running, true);
  assert.equal(container.HostConfig.NetworkMode, 'none');
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), ['none']);
  assert.deepEqual(container.HostConfig.PortBindings, {});
  assert.deepEqual(container.NetworkSettings.Ports, {});
  assert.deepEqual(container.Mounts, []);
  assert.ok(!container.HostConfig.Binds?.length);
  assert.deepEqual(Object.keys(container.HostConfig.Tmpfs), ['/var/lib/postgresql/data']);
  assert.ok(container.Config.Env.includes('PGDATA=/var/lib/postgresql/data'));
  assert.ok(!container.Config.Env.some(value => /^(DATABASE_URL|PGHOST|PGSERVICE)=/.test(value)));
  assert.ok(Number.isSafeInteger(container.State.Pid) && container.State.Pid > 1);
  const socketDirectory = `/proc/${container.State.Pid}/root/var/run/postgresql`;
  assert.ok(statSync(`${socketDirectory}/.s.PGSQL.5432`).isSocket());
  return socketDirectory;
}
