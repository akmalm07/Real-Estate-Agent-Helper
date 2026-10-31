import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { act, createElement as h } from 'react'
import { create } from 'react-test-renderer'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../src/context/auth-context.ts'
import { DashboardCacheContext } from '../src/context/dashboard-cache-context.ts'
import { LoginPage } from '../src/pages/LoginPage.tsx'
import { GoogleCallbackPage } from '../src/pages/GoogleCallbackPage.tsx'
import { ChangePasswordPage } from '../src/pages/ChangePasswordPage.tsx'
import { OnboardingPage } from '../src/pages/OnboardingPage.tsx'
import { MessagesPage } from '../src/pages/MessagesPage.tsx'
import { SettingsPage } from '../src/pages/SettingsPage.tsx'
import PrivacyPolicyPage from '../src/pages/PrivacyPolicyPage.tsx'
import TermsOfServicePage from '../src/pages/TermsOfServicePage.tsx'
import { BACKEND_URL } from '../src/consts.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const originalFetch = globalThis.fetch
const user = { id: 1, name: 'Morgan Fixture', email: 'morgan@example.invalid', source: 'manual', newLeadNotify: 'off', newMessageReplyNotify: 'email', weeklySummeryNotify: 'sms' }
const noop = () => {}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
let trees, requests, respond
beforeEach(() => {
  trees = []; requests = []
  respond = () => json({})
  // All HTTP is intercepted; these are actual-component tests, not live auth/provider tests.
  globalThis.fetch = async (url, options = {}) => {
    const req = { url: String(url), ...options }
    requests.push(req)
    return respond(req)
  }
})
afterEach(async () => {
  for (const tree of trees) await act(() => tree.unmount())
  globalThis.fetch = originalFetch
})
const text = node => typeof node === 'string' ? node : node.children.map(text).join('')
const button = (tree, label) => tree.root.findAllByType('button').find(n => text(n).trim() === label)
const field = (tree, id) => tree.root.find(n => ['input', 'select', 'textarea'].includes(n.type) && n.props.id === id)
const change = async (tree, id, value) => act(() => field(tree, id).props.onChange({ target: { value } }))
const click = async (tree, label) => {
  const node = button(tree, label)
  assert.ok(node, `Missing button ${label}`)
  assert.notEqual(node.props.disabled, true)
  await act(async () => { await node.props.onClick() })
}
const submit = async tree => act(async () => { await tree.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
const authed = (child, extra = {}) => h(AuthContext.Provider, { value: { user, login: noop, signup: noop, refreshUser: async () => true, logout: noop, authLoading: false, isAuthenticated: false, ...extra } }, child)
const routed = (child, path = '/login') => h(MemoryRouter, { initialEntries: [path] }, child)
async function mount(child, options) {
  let tree
  await act(() => { tree = create(child, options) })
  trees.push(tree)
  return tree
}
function labels(tree) {
  for (const control of tree.root.findAll(n => ['input', 'select', 'textarea'].includes(n.type))) {
    assert.ok(control.props['aria-label'] || tree.root.findAllByType('label').some(n => n.props.htmlFor === control.props.id), `Unlabelled ${control.type}`)
  }
}
function describedError(tree, id, message) {
  const node = field(tree, id)
  assert.equal(node.props['aria-invalid'], true)
  assert.ok(node.props['aria-describedby'].split(' ').some(id => tree.root.findAll(n => typeof n.type === 'string' && n.props.id === id).some(n => text(n).includes(message))))
}
function request(index, path, body, credentials = 'include') {
  const req = requests[index]
  assert.equal(req.url, `${BACKEND_URL}${path}`)
  assert.equal(req.method, 'POST')
  assert.equal(req.credentials, credentials === false ? undefined : credentials)
  assert.equal(req.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(req.body), body)
}

test('login/signup labels, validation and exact auth argument contracts remain intact', async () => {
  const calls = []
  const tree = await mount(routed(authed(h(LoginPage), { login: (...args) => calls.push(['login', ...args]), signup: (...args) => calls.push(['signup', ...args]) })))
  labels(tree)
  await change(tree, 'auth-email', user.email); await change(tree, 'auth-password', 'password8')
  await submit(tree)
  assert.deepEqual(calls, [['login', user.email, 'password8']])
  await click(tree, 'Sign Up'); labels(tree)
  assert.equal(button(tree, 'Sign Up').props['aria-pressed'], true)
  await submit(tree); describedError(tree, 'auth-name', 'full name')
  await change(tree, 'auth-name', ' Morgan Fixture ')
  await submit(tree); describedError(tree, 'auth-confirm', 'do not match')
  await change(tree, 'auth-password', 'short'); await change(tree, 'auth-confirm', 'short')
  await submit(tree); describedError(tree, 'auth-password', 'at least 8')
  assert.equal(calls.length, 1)
  await change(tree, 'auth-password', 'password8'); await change(tree, 'auth-confirm', 'password8')
  await submit(tree)
  assert.deepEqual(calls[1], ['signup', ' Morgan Fixture ', user.email, 'password8'])
  assert.ok(tree.root.findAllByType('a').some(n => n.props.href === '/terms'))
  assert.ok(tree.root.findAllByType('a').some(n => n.props.href === '/privacy'))
  assert.equal(requests.length, 0)
})

test('auth busy disables modes, Google, fields and submit; context errors are described', async () => {
  const render = extra => routed(authed(h(LoginPage), extra))
  const tree = await mount(render({ authLoading: true }))
  assert.equal(tree.root.findByType('form').props['aria-busy'], true)
  assert.ok(tree.root.findAllByType('button').every(n => n.props.disabled))
  assert.ok(tree.root.findAllByType('input').every(n => n.props.disabled))
  await act(() => tree.update(render({ authError: 'Fixture authentication rejected' })))
  describedError(tree, 'auth-email', 'Fixture authentication rejected')
})

test('Google callback keeps exchange request and busy status without contacting a provider', async () => {
  let refreshed = 0
  const tree = await mount(routed(authed(h(GoogleCallbackPage), { refreshUser: async () => { refreshed++; return true } }), '/auth/google/callback?tempToken=fixture-token&firstTime=true'))
  request(0, 'auth/google/exchange', { tempToken: 'fixture-token' })
  assert.equal(refreshed, 1)
  assert.match(text(tree.root.find(n => n.type === 'p' && n.props.role === 'status')), /sign-in/)
  assert.equal(tree.root.findAllByType('main').length, 1)
})

test('password reset rejects invalid links and validates length/mismatch before any request', async () => {
  const invalid = await mount(routed(h(ChangePasswordPage), '/change-password?token=fixture'))
  assert.match(text(invalid.root), /Invalid Reset Link/)
  assert.equal(invalid.root.findAllByType('form').length, 0)
  assert.ok(invalid.root.findAllByType('a').some(n => n.props.href === '/login'))
  const tree = await mount(routed(h(ChangePasswordPage), '/change-password?token=fixture&changePassword=true'))
  labels(tree)
  await submit(tree); describedError(tree, 'newPassword', 'at least 8')
  await change(tree, 'newPassword', 'password8'); await change(tree, 'confirmPassword', 'different8')
  await submit(tree); describedError(tree, 'confirmPassword', 'do not match')
  assert.equal(requests.length, 0)
})

test('password reset keeps exact request shape and exposes busy, rejection and network errors', async () => {
  let release
  respond = () => new Promise(resolve => { release = resolve })
  const tree = await mount(routed(h(ChangePasswordPage), '/change-password?token=fixture&changePassword=true'))
  await change(tree, 'newPassword', 'password8'); await change(tree, 'confirmPassword', 'password8')
  let pending
  await act(() => { pending = tree.root.findByType('form').props.onSubmit({ preventDefault() {} }) })
  assert.equal(tree.root.findByType('form').props['aria-busy'], true)
  assert.ok(field(tree, 'newPassword').props.disabled)
  assert.ok(button(tree, 'Updating Password…').props.disabled)
  request(0, 'api/auth/change-password/confirm', { token: 'fixture', newPassword: 'password8' }, false)
  await act(async () => { release(json({ error: 'Fixture reset rejected' }, 422)); await pending })
  describedError(tree, 'newPassword', 'Fixture reset rejected')
  respond = () => { throw new Error('offline') }
  await submit(tree); describedError(tree, 'newPassword', 'Network error')
})

test('onboarding uses fetched true only, never nonmanual identity as connection evidence', async () => {
  respond = () => json({ gmailConnected: false })
  const tree = await mount(routed(authed(h(OnboardingPage), { user: { ...user, source: 'google' } })))
  assert.doesNotMatch(text(tree.root), /Gmail connected|never shared|later in Settings/)
  assert.match(text(tree.root), /Connect your Gmail/)
  respond = () => json({ gmailConnected: true })
  const connected = await mount(routed(authed(h(OnboardingPage))))
  assert.match(text(connected.root), /Gmail connected/)
})

test('all six onboarding steps preserve guards, pressed options, disabled phone, progress and final payload', async () => {
  let refreshed = 0, focused = 0
  respond = () => json({ gmailConnected: false })
  const tree = await mount(routed(authed(h(OnboardingPage), { refreshUser: async () => { refreshed++; return true } })), { createNodeMock: node => node.props.role === 'group' ? { querySelector: () => ({ focus: () => focused++ }) } : null })
  const progress = () => tree.root.find(n => n.props.role === 'progressbar')
  assert.equal(progress().props['aria-valuenow'], 1)
  assert.equal(progress().props['aria-valuemax'], 6)
  await click(tree, 'Continue')
  assert.ok(button(tree, 'Continue').props.disabled); labels(tree)
  await change(tree, 'onboard-brokerage', 'Fixture Realty'); await change(tree, 'onboard-market', 'Fixture City')
  await click(tree, '0 – 25'); assert.equal(button(tree, '0 – 25').props['aria-pressed'], true)
  await click(tree, 'Continue'); assert.equal(progress().props['aria-valuenow'], 3)
  assert.ok(button(tree, 'Continue').props.disabled)
  await click(tree, 'Other'); labels(tree)
  assert.ok(button(tree, 'Continue').props.disabled)
  await change(tree, 'onboard-source-other', 'Local referrals')
  await click(tree, 'Continue'); assert.equal(progress().props['aria-valuenow'], 4)
  assert.ok(tree.root.findAllByType('button').find(n => text(n).includes('Phone call first')).props.disabled)
  assert.match(text(tree.root), /Coming soon/)
  await click(tree, 'Email first'); await click(tree, 'Continue')
  assert.equal(progress().props['aria-valuenow'], 5)
  await click(tree, 'Just me'); await click(tree, 'Continue')
  assert.equal(progress().props['aria-valuenow'], 6)
  assert.ok(button(tree, 'Finish setup').props.disabled)
  await click(tree, 'Following up fast enough')
  await click(tree, 'Back'); assert.equal(progress().props['aria-valuenow'], 5)
  await click(tree, 'Continue')
  let release
  respond = () => new Promise(resolve => { release = resolve })
  let pending
  await act(() => { pending = button(tree, 'Finish setup').props.onClick() })
  assert.ok(button(tree, 'Saving…').props.disabled)
  assert.ok(button(tree, 'Back').props.disabled)
  request(1, 'api/onboarding', { brokerage: 'Fixture Realty', primaryMarket: 'Fixture City', leadsPerMonth: '0_25', leadSources: ['other'], leadSourceOther: 'Local referrals', contactMethod: 'email', teamSize: 'just_me', biggestChallenge: 'following_up', completed: true })
  await act(async () => { release(json({ error: 'Fixture onboarding rejected' }, 422)); await pending })
  assert.match(text(tree.root), /Fixture onboarding rejected/)
  assert.equal(refreshed, 0)
  respond = () => json({})
  await click(tree, 'Finish setup'); assert.equal(refreshed, 1)
  assert.ok(focused >= 6)
})

test('inbox groups real messages, labels selection/unread, searches all bodies and keeps nonfunctional send disabled with draft', async () => {
  const longBody = 'Long body\n' + 'context'.repeat(150)
  const longName = 'LongName'.repeat(30)
  const messages = [
    { id: '1', leadId: '7', conversationId: 'a', leadName: longName, channel: 'email', direction: 'outbound', body: longBody, sentAt: '2026-10-29T12:00:00Z' },
    { id: '2', leadId: '7', conversationId: 'a', leadName: longName, channel: 'email', direction: 'inbound', body: 'Latest incoming', sentAt: '2026-10-30T12:00:00Z' },
    { id: '3', leadId: '8', leadName: 'Second Fixture', channel: 'sms', direction: 'outbound', body: 'Different message', sentAt: '2026-10-28T12:00:00Z' },
  ]
  const tree = await mount(h(DashboardCacheContext.Provider, { value: { messages, messagesLoading: false, messagesError: null, reload: noop } }, h(MessagesPage)))
  labels(tree)
  assert.match(text(tree.root), /2 of 2 conversations/)
  assert.match(text(tree.root), /Unread · Latest inbound/)
  assert.match(text(tree.root), /not tracked read status/)
  assert.ok(tree.root.findAllByType('p').some(n => text(n) === longBody))
  assert.ok(tree.root.findAllByType('h2').some(n => text(n) === longName))
  const conversations = () => tree.root.findAllByType('button').filter(n => n.props['aria-pressed'] !== undefined)
  assert.equal(conversations().length, 2)
  assert.equal(conversations()[0].props['aria-pressed'], true)
  await act(() => conversations()[1].props.onClick())
  assert.equal(conversations()[1].props['aria-pressed'], true)
  await change(tree, 'inbox-reply', 'Keep this draft')
  assert.equal(button(tree, 'Send').props.disabled, true)
  assert.equal(button(tree, 'Send').props.onClick, undefined)
  assert.equal(field(tree, 'inbox-reply').props.onKeyDown, undefined)
  assert.match(text(tree.root), /Sending is not connected yet/)
  assert.equal(field(tree, 'inbox-reply').props.value, 'Keep this draft')
  await change(tree, 'inbox-search', 'contextcontext')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 240)) })
  assert.match(text(tree.root), /1 of 2 conversations/)
  assert.equal(conversations().length, 1)
  assert.equal(requests.length, 0)
})

test('settings labels, disabled truthful integration, busy/rejected save and unchanged notification keys', async () => {
  const tree = await mount(routed(authed(h(SettingsPage))))
  labels(tree)
  assert.match(text(tree.root), /Connection status unavailable/)
  assert.match(text(tree.root), /configuration pending/)
  for (const label of ['Connect', 'Disconnect']) {
    assert.equal(button(tree, label).props.disabled, true)
    assert.equal(button(tree, label).props.onClick, undefined)
  }
  assert.equal(requests.length, 0)
  await change(tree, 'notify-newLeadNotify', 'email')
  await change(tree, 'notify-weeklySummaryNotify', 'off')
  let release, pending
  respond = () => new Promise(resolve => { release = resolve })
  await act(() => { pending = button(tree, 'Save Changes').props.onClick() })
  assert.ok(button(tree, 'Saving…').props.disabled)
  assert.ok(tree.root.findAllByType('select').every(n => n.props.disabled))
  request(0, 'api/settings/preferences', { newLeadNotify: 'email', newMessageReplyNotify: 'email', weeklySummeryNotify: 'sms', weeklySummaryNotify: 'off' })
  await act(async () => { release(json({}, 422)); await pending })
  assert.match(text(tree.root), /Preferences could not be saved/)
  assert.doesNotMatch(text(tree.root), /Saved!/)
  respond = () => { throw new Error('Fixture network rejected') }
  await click(tree, 'Save Changes')
  assert.match(text(tree.root), /Fixture network rejected/)
  assert.doesNotMatch(text(tree.root), /Saved!/)
  respond = () => json({})
  await click(tree, 'Save Changes'); assert.match(text(tree.root), /Saved!/)
  await change(tree, 'notify-newLeadNotify', 'off'); assert.doesNotMatch(text(tree.root), /Saved!/)
})

test('settings profile badge bounds initials for long names and tolerates whitespace-only names', async () => {
  const longName = 'Samantha Amelia Marie Louise Ann Morgan'
  const longTree = await mount(routed(authed(h(SettingsPage), { user: { ...user, name: longName } })))
  const badge = tree => tree.root.find(n => n.type === 'div' && n.props['aria-hidden'] === 'true')
  assert.equal(badge(longTree).children.map(text).join(''), 'SA')
  assert.ok(badge(longTree).children.map(text).join('').length <= 2)
  assert.ok(longTree.root.findAllByType('p').some(n => text(n) === longName))

  const whitespaceName = '   \t  '
  const whitespaceTree = await mount(routed(authed(h(SettingsPage), { user: { ...user, name: whitespaceName } })))
  assert.equal(badge(whitespaceTree).children.map(text).join(''), '')
  assert.ok(badge(whitespaceTree).children.map(text).join('').length <= 2)
  assert.ok(whitespaceTree.root.findAllByType('p').some(n => text(n) === whitespaceName))
})

test('settings password request preserves shape, busy and visible rejection without unhandled promise', async () => {
  const tree = await mount(routed(authed(h(SettingsPage))))
  let release, pending
  respond = () => new Promise(resolve => { release = resolve })
  await act(() => { pending = button(tree, 'Change Password').props.onClick() })
  assert.ok(button(tree, 'Change Password').props.disabled)
  request(0, 'api/auth/change-password', { email: user.email })
  await act(async () => { release(json({}, 422)); await pending })
  assert.match(text(tree.root), /Failed to send password reset/)
  assert.doesNotMatch(text(tree.root), /Email successfully sent/)
  respond = () => { throw new Error('Fixture offline') }
  await click(tree, 'Change Password')
  assert.match(text(tree.root), /Fixture offline/)
  assert.doesNotMatch(text(tree.root), /Email successfully sent/)
})

test('legal actual pages expose named main landmarks and real home links, preserving placeholder content', async () => {
  for (const [Page, heading] of [[PrivacyPolicyPage, 'Privacy Policy'], [TermsOfServicePage, 'Terms of Service']]) {
    const tree = await mount(routed(h(Page)))
    const main = tree.root.findByType('main')
    const title = tree.root.findByType('h1')
    assert.equal(text(title), heading)
    assert.equal(main.props['aria-labelledby'], title.props.id)
    assert.ok(tree.root.findAllByType('a').every(n => n.props.href === '/'))
    assert.match(text(tree.root), /Go back to Home/)
    if (Page === PrivacyPolicyPage) assert.match(text(tree.root), /\[Your Website URL\]/)
  }
  assert.equal(requests.length, 0)
})
