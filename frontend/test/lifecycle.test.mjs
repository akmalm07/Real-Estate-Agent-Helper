import assert from 'node:assert/strict'
import { test, beforeEach, afterEach } from 'node:test'
import { createElement as h, act, StrictMode } from 'react'
import { create } from 'react-test-renderer'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { useApi } from '../src/hooks/useApi.ts'
import { AuthProvider } from '../src/context/AuthContext.tsx'
import { useAuth } from '../src/hooks/useAuth.ts'
import { DashboardCacheProvider } from '../src/context/DashboardCacheContext.tsx'
import { useDashboardCache } from '../src/hooks/useDashboardCache.ts'
import { VerifyLeadModal } from '../src/components/leads/VerifyLeadModal.tsx'
import { SettingsPage } from '../src/pages/SettingsPage.tsx'
import { ChangePasswordPage } from '../src/pages/ChangePasswordPage.tsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let requests, trees, storage
const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
beforeEach(() => {
  requests = []
  trees = []
  storage = new Map()
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    requests.push({ url: String(url), options, resolve, reject })
  })
})
afterEach(async () => {
  for (const tree of trees) await act(() => tree.unmount())
  globalThis.fetch = originalFetch
  globalThis.localStorage = originalStorage
})
async function mount(element) {
  let tree
  await act(() => { tree = create(element) })
  trees.push(tree)
  return tree
}
async function reply(index, data, status = 200) {
  await act(async () => requests[index].resolve(new Response(JSON.stringify(data), { status })))
}
async function fail(index) {
  await act(async () => requests[index].reject(new Error('offline')))
}
const text = tree => JSON.stringify(tree.toJSON())
const button = (tree, label) => tree.root.findAllByType('button').find(n => n.children.includes(label))
const lead = id => ({ id, name: `Lead ${id}`, phone: '5550100', email: '', status: 'unverified', source: 'zillow', createdAt: '2026-01-01', updatedAt: '2026-01-01', score: 0 })

test('useApi pending, success, refetch, error and URL reset', async () => {
  let value
  function Probe({ url }) { value = useApi(url); return null }
  const tree = await mount(h(Probe, { url: '/one' }))
  assert.equal(value.loading, true)
  assert.equal(requests[0].options.credentials, 'include')
  await reply(0, { name: 'one' })
  assert.deepEqual(value.data, { name: 'one' })
  assert.equal(value.loading, false)
  await act(() => { value.refetch() })
  assert.equal(value.loading, true)
  await reply(1, {}, 503)
  assert.equal(value.error, 'HTTP 503')
  await act(() => tree.update(h(Probe, { url: '/two' })))
  assert.equal(value.loading, true)
  assert.equal(value.error, null)
  assert.equal(value.data, null)
  await reply(2, { name: 'two' })
  assert.deepEqual(value.data, { name: 'two' })
})

test('useApi ignores stale URL responses and cleaned-up requests', async () => {
  let value
  function Probe({ url }) { value = useApi(url); return null }
  const tree = await mount(h(Probe, { url: '/old' }))
  await act(() => tree.update(h(Probe, { url: '/new' })))
  await reply(1, 'new')
  await reply(0, 'old')
  assert.equal(value.data, 'new')
  await act(() => { value.refetch() })
  await act(() => tree.unmount())
  await fail(2)
  assert.equal(value.error, null)
})

test('useApi resets pending/error before effects commit and ignores superseded refetch', async () => {
  let value
  const renders = []
  function Probe({ url }) { value = useApi(url); renders.push(value); return null }
  const tree = await mount(h(Probe, { url: '/one' }))
  await fail(0)
  assert.equal(value.error, 'offline')
  renders.length = 0
  await act(() => tree.update(h(Probe, { url: '/two' })))
  assert.equal(renders[0].loading, true)
  assert.equal(renders[0].error, null)
  await act(() => { value.refetch() })
  await reply(2, 'latest')
  await fail(1)
  assert.equal(value.data, 'latest')
  assert.equal(value.error, null)
})

test('useApi returning to a prior URL starts a new pending request', async () => {
  let value
  function Probe({ url }) { value = useApi(url); return null }
  const tree = await mount(h(Probe, { url: '/one' }))
  await reply(0, {}, 503)
  await act(() => tree.update(h(Probe, { url: '/two' })))
  await act(() => tree.update(h(Probe, { url: '/one' })))
  assert.equal(value.loading, true)
  assert.equal(value.error, null)
  await reply(2, 'returned')
  await fail(1)
  assert.equal(value.data, 'returned')
})

test('verify modal pending/error resets for another lead and ignores stale detail', async () => {
  const props = { onClose() {}, onSuccess() {} }
  const tree = await mount(h(VerifyLeadModal, { ...props, lead: lead('1') }))
  assert.equal(button(tree, 'Verify Lead').props.disabled, true)
  await fail(0)
  assert.match(text(tree), /Could not load lead details/)
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: lead('2') })))
  assert.doesNotMatch(text(tree), /Could not load lead details/)
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: lead('3') })))
  await reply(2, lead('3'))
  await reply(1, { ...lead('2'), phone: 'stale-phone' })
  assert.doesNotMatch(text(tree), /stale-phone/)
  assert.equal(button(tree, 'Verify Lead').props.disabled, false)
})

test('verify modal preserves same-lead draft but resets it on identity change', async () => {
  const props = { onClose() {}, onSuccess() {} }
  const tree = await mount(h(VerifyLeadModal, { ...props, lead: lead('1') }))
  await reply(0, lead('1'))
  await act(() => button(tree, 'Manual').props.onClick())
  await act(() => tree.root.findByType('textarea').props.onChange({ target: { value: 'My draft' } }))
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: { ...lead('1') } })))
  assert.equal(tree.root.findByType('textarea').props.value, 'My draft')
  assert.equal(requests.length, 1)
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: lead('2') })))
  await reply(1, lead('2'))
  await act(() => button(tree, 'Manual').props.onClick())
  assert.equal(tree.root.findByType('textarea').props.value, '')
})

test('verify modal preserves draft across same-identity detail-context refresh', async () => {
  const props = { onClose() {}, onSuccess() {} }
  const tree = await mount(h(VerifyLeadModal, { ...props, lead: lead('1') }))
  await reply(0, lead('1'))
  await act(() => button(tree, 'Manual').props.onClick())
  await act(() => tree.root.findByType('textarea').props.onChange({ target: { value: 'Keep draft' } }))
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: { ...lead('1'), updatedAt: '2026-02-01' } })))
  assert.equal(button(tree, 'Verify Lead').props.disabled, true)
  await reply(1, lead('1'))
  assert.equal(tree.root.findByType('textarea').props.value, 'Keep draft')
})

test('verify modal revisiting detail context resets its old error to pending', async () => {
  const props = { onClose() {}, onSuccess() {} }
  const tree = await mount(h(VerifyLeadModal, { ...props, lead: lead('1') }))
  await fail(0)
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: { ...lead('1'), updatedAt: '2026-02-01' } })))
  await act(() => tree.update(h(VerifyLeadModal, { ...props, lead: lead('1') })))
  assert.doesNotMatch(text(tree), /Could not load lead details/)
  assert.equal(button(tree, 'Verify Lead').props.disabled, true)
  await reply(2, lead('1'))
  await fail(1)
  assert.equal(button(tree, 'Verify Lead').props.disabled, false)
})

let auth
function AuthProbe() { auth = useAuth(); return null }
const user = (id = '1', preference = 'email') => ({ id, name: `User ${id}`, email: 'fixture@example.invalid', source: 'manual', onboardComplete: true, emailConfirmed: true, newLeadNotify: preference, newMessageReplyNotify: 'off', weeklySummeryNotify: 'off' })
test('auth checks initially, accepts session result and refreshes/rejects session', async () => {
  await mount(h(AuthProvider, null, h(AuthProbe)))
  assert.equal(auth.initializing, true)
  await reply(0, { user: user() })
  assert.equal(auth.initializing, false)
  assert.equal(auth.isAuthenticated, true)
  let refresh
  await act(() => { refresh = auth.refreshUser() })
  await reply(1, {}, 401)
  assert.equal(await refresh, false)
  assert.equal(auth.user, null)
  assert.equal(auth.isAuthenticated, false)
})
test('auth network failure ends initial checking', async () => {
  await mount(h(AuthProvider, null, h(AuthProbe)))
  await fail(0)
  assert.equal(auth.initializing, false)
  assert.equal(auth.isAuthenticated, false)
})
test('auth StrictMode cleanup ignores the first session request', async () => {
  await mount(h(StrictMode, null, h(AuthProvider, null, h(AuthProbe))))
  assert.equal(requests.length, 2)
  await reply(1, { user: user('2') })
  await reply(0, { user: user('1') })
  assert.equal(auth.user.id, '2')
})
test('settings preserves unchanged-user draft; resets changed preferences/user and null context', async () => {
  const tree = await mount(h(MemoryRouter, null, h(AuthProvider, null, h(AuthProbe), h(SettingsPage))))
  await reply(0, { user: user() })
  const select = () => tree.root.findAllByType('select')[0]
  assert.equal(select().props.value, 'email')
  await act(() => select().props.onChange({ target: { value: 'sms' } }))
  async function refresh(data, status = 200) {
    let pending
    await act(() => { pending = auth.refreshUser() })
    await reply(requests.length - 1, data, status)
    await pending
  }
  await refresh({ user: user() })
  assert.equal(select().props.value, 'sms')
  await refresh({ user: user('1', 'off') })
  assert.equal(select().props.value, 'off')
  await refresh({ user: user('2') })
  assert.equal(select().props.value, 'email')
  await refresh({}, 401)
  assert.equal(select().props.value, 'off')
})

test('reset URL invalid/valid transitions clear URL errors and preserve same-context draft', async () => {
  let navigate
  function Navigation() { navigate = useNavigate(); return null }
  const tree = await mount(h(MemoryRouter, { initialEntries: ['/reset'] }, h(Navigation), h(ChangePasswordPage)))
  assert.match(text(tree), /Invalid Reset Link/)
  await act(() => navigate('/reset?token=one&changePassword=true'))
  assert.doesNotMatch(text(tree), /invalid or has expired/)
  await act(() => tree.root.findAllByType('input')[0].props.onChange({ target: { value: 'draft-value' } }))
  await act(() => navigate('/reset?token=one&changePassword=true&unrelated=1'))
  assert.equal(tree.root.findAllByType('input')[0].props.value, 'draft-value')
  await act(() => navigate('/reset'))
  assert.match(text(tree), /Invalid Reset Link/)
  await act(() => navigate('/reset?token=two&changePassword=true'))
  assert.equal(tree.root.findAllByType('input')[0].props.value, '')
})

test('reset URL changes ignore an old submission success', async () => {
  let navigate
  function Navigation() { navigate = useNavigate(); return null }
  const tree = await mount(h(MemoryRouter, { initialEntries: ['/reset?token=one&changePassword=true'] }, h(Navigation), h(ChangePasswordPage)))
  for (const input of tree.root.findAllByType('input')) {
    await act(() => input.props.onChange({ target: { value: 'password-fixture' } }))
  }
  let pending
  await act(() => { pending = tree.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  assert.match(text(tree), /Updating Password/)
  assert.deepEqual(JSON.parse(requests[0].options.body), { token: 'one', newPassword: 'password-fixture' })
  await act(() => navigate('/reset'))
  await reply(0, {})
  await pending
  assert.match(text(tree), /Invalid Reset Link/)
  assert.doesNotMatch(text(tree), /Password Changed/)
})

const dashboard = { totalLeads: 0, leads: [], leadsByStatus: [], inboundMessages: [], recentActivity: [], needsAttention: 0, aiManagedLeads: 0, totalProperties: 0, fetchedAt: '2026-01-01' }
let cache
function CacheProbe() { cache = useDashboardCache(); return null }
function persist(age = 0) {
  for (const [key, data] of [['dashboard_cache', dashboard], ['properties_cache', []], ['messages_cache', []]]) {
    storage.set(key, JSON.stringify({ data, cachedAt: Date.now() - age }))
  }
}
test('dashboard missing cache loads all resources; errors and manual reload reset', async () => {
  await mount(h(DashboardCacheProvider, null, h(CacheProbe)))
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [true, true, true])
  assert.match(requests[0].url, /since=1m$/)
  await fail(0); await fail(1); await fail(2)
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [false, false, false])
  assert.equal(cache.error, 'offline')
  let pending
  await act(() => { pending = cache.reload() })
  assert.equal(cache.error, null)
  assert.equal(cache.propertiesError, null)
  assert.equal(cache.messagesError, null)
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [true, true, true])
  await reply(3, dashboard); await reply(4, []); await reply(5, [])
  await pending
  assert.deepEqual(cache.cache, dashboard)
  assert.equal(cache.loading, false)
  assert.ok(storage.has('dashboard_cache'))
})
test('dashboard stale cache starts blocking loads with cached data still available', async () => {
  persist(31 * 60 * 1000)
  const renders = []
  function Probe() { cache = useDashboardCache(); renders.push(cache); return null }
  await mount(h(DashboardCacheProvider, null, h(Probe)))
  assert.deepEqual([renders[0].loading, renders[0].propertiesLoading, renders[0].messagesLoading], [true, true, true])
  assert.deepEqual(cache.cache, dashboard)
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [true, true, true])
  assert.match(requests[0].url, /since=1m$/)
  await reply(0, dashboard); await reply(1, []); await reply(2, [])
  assert.equal(cache.loading, false)
})

test('dashboard partial cache loads missing resources without changing the dashboard window', async () => {
  persist()
  storage.delete('properties_cache')
  storage.delete('messages_cache')
  await mount(h(DashboardCacheProvider, null, h(CacheProbe)))
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [false, true, true])
  assert.match(requests[0].url, /since=1d$/)
  await reply(1, []); await reply(2, [])
  assert.equal(cache.propertiesLoading, false)
  await reply(0, dashboard)
  await reply(3, []); await reply(4, [])
  assert.equal(requests.length, 5)
})

test('dashboard blocking request cleanup does not write storage', async () => {
  const tree = await mount(h(DashboardCacheProvider, null, h(CacheProbe)))
  await act(() => tree.unmount())
  await reply(0, dashboard); await reply(1, []); await reply(2, [])
  assert.equal(storage.size, 0)
})

test('dashboard manual reload cleanup does not write storage', async () => {
  const tree = await mount(h(DashboardCacheProvider, null, h(CacheProbe)))
  await reply(0, dashboard); await reply(1, []); await reply(2, [])
  let pending
  await act(() => { pending = cache.reload() })
  await act(() => tree.unmount())
  const before = new Map(storage)
  await reply(3, { ...dashboard, totalLeads: 99 }); await reply(4, []); await reply(5, [])
  await pending
  assert.deepEqual(storage, before)
})
test('dashboard fresh cache refreshes silently on mount and interval; cleanup ignores results', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  persist()
  const tree = await mount(h(DashboardCacheProvider, null, h(CacheProbe)))
  assert.deepEqual([cache.loading, cache.propertiesLoading, cache.messagesLoading], [false, false, false])
  assert.match(requests[0].url, /since=1d$/)
  await fail(0)
  await fail(1); await fail(2)
  assert.equal(cache.error, null)
  assert.deepEqual(cache.cache, dashboard)
  await act(() => t.mock.timers.tick(60000))
  await reply(3, { ...dashboard, totalLeads: 5 })
  await reply(4, []); await reply(5, [])
  assert.equal(cache.cache.totalLeads, 5)
  assert.equal(cache.loading, false)
  await act(() => t.mock.timers.tick(60000))
  await act(() => tree.unmount())
  const before = storage.get('dashboard_cache')
  await reply(6, { ...dashboard, totalLeads: 99 })
  assert.equal(storage.get('dashboard_cache'), before)
  const count = requests.length
  await act(() => t.mock.timers.tick(60000))
  assert.equal(requests.length, count)
})
