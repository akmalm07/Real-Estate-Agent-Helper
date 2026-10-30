import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { act, createElement as h } from 'react'
import { create } from 'react-test-renderer'
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AuthContext } from '../src/context/auth-context.ts'
import { DashboardCacheContext } from '../src/context/dashboard-cache-context.ts'
import { AppLayout } from '../src/components/layout/AppLayout.tsx'
import { Sidebar } from '../src/components/layout/Sidebar.tsx'
import { ModalFrame } from '../src/components/leads/LeadFormShared.tsx'
import { LeadMenu } from '../src/components/leads/LeadMenu.tsx'
import { LeadModal } from '../src/components/leads/LeadModal.tsx'
import { VerifyLeadModal } from '../src/components/leads/VerifyLeadModal.tsx'
import { DeleteLeadModal } from '../src/components/leads/DeleteLeadModal.tsx'
import { DeleteUnverifiedModal } from '../src/components/leads/DeleteUnverifiedModal.tsx'
import { LeadReadyIndicator } from '../src/components/leads/LeadReadyIndicator.tsx'
import { DashboardPage } from '../src/pages/DashboardPage.tsx'
import { LeadsPage } from '../src/pages/LeadsPage.tsx'
import { LeadDetailPage } from '../src/pages/LeadDetailPage.tsx'
import { PropertiesPage } from '../src/pages/PropertiesPage.tsx'
import { BACKEND_URL } from '../src/consts.ts'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const original = { fetch: globalThis.fetch, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
let trees, requests, respond
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
const noop = () => {}
const lead = { id: '7', name: 'Jamie Fixture', email: 'jamie@example.invalid', phone: '5550100', status: 'active', source: 'zillow', score: 12, createdAt: '2026-10-29T12:00:00Z', updatedAt: '2026-10-29T12:00:00Z' }
const property = { id: '11', address: '11 Fixture Lane', addressLine1: '11 Fixture Lane', description: 'Fixture description', status: 'open', source: 'unknown', price: 450000, bedrooms: 3, bathrooms: 2, sqft: 1800, createdAt: lead.createdAt }
const rawDashboard = { totalLeads: 1, leads: [lead], leadsByStatus: [], inboundMessages: [], recentActivity: [], needsAttention: 0, aiManagedLeads: 1, totalProperties: 1, fetchedAt: lead.createdAt }
const cacheValue = (extra = {}) => ({ cache: rawDashboard, loading: false, error: null, reload: async () => {}, properties: [property], propertiesLoading: false, propertiesError: null, messages: [], messagesLoading: false, messagesError: null, addLead: noop, updateLead: noop, removeLead: noop, addProperty: noop, updateProperty: noop, removeProperty: noop, ...extra })
beforeEach(() => {
  trees = []; requests = []
  respond = () => json({})
  // Every request, including send-initial, is intercepted; no provider calls.
  globalThis.fetch = async (url, options = {}) => {
    const request = { url: String(url), ...options }
    requests.push(request)
    return respond(request)
  }
})
afterEach(async () => {
  for (const tree of trees) await act(() => tree.unmount())
  Object.assign(globalThis, original)
})
async function mount(element, options) {
  let tree
  await act(() => { tree = create(element, options) })
  trees.push(tree)
  return tree
}
const text = node => typeof node === 'string' ? node : node.children.map(text).join('')
const button = (tree, label) => tree.root.findAllByType('button').find(n => n.props['aria-label'] === label || (!n.props['aria-label'] && text(n).trim() === label))
const field = (tree, id) => tree.root.find(n => ['input', 'textarea', 'select'].includes(n.type) && n.props.id === id)
const click = async (tree, label) => {
  const node = button(tree, label)
  assert.ok(node, `Missing button: ${label}`)
  assert.notEqual(node.props.disabled, true)
  await act(async () => { await node.props.onClick() })
}
const change = async (tree, id, value) => act(() => field(tree, id).props.onChange({ target: { value } }))
function assertDialog(tree, title) {
  const dialog = tree.root.find(n => n.type === 'div' && n.props.role === 'dialog')
  assert.equal(dialog.props['aria-modal'], 'true')
  const heading = tree.root.find(n => typeof n.type === 'string' && n.props.id === dialog.props['aria-labelledby'])
  assert.equal(text(heading), title)
  return dialog
}
function assertLabels(tree) {
  for (const control of tree.root.findAll(n => ['input', 'textarea', 'select'].includes(n.type))) {
    assert.ok(control.props['aria-label'] || tree.root.findAllByType('label').some(label =>
      (control.props.id && label.props.htmlFor === control.props.id) || label.findAll(n => n === control).length), `Unlabelled ${control.type}`)
  }
}
function assertError(tree, id, message) {
  const control = field(tree, id)
  assert.equal(control.props['aria-invalid'], true)
  const ids = control.props['aria-describedby'].split(' ')
  assert.ok(ids.some(id => tree.root.findAll(n => typeof n.type === 'string' && n.props.id === id).some(n => text(n).includes(message))))
}
function assertRequest(index, path, method, body) {
  const req = requests[index]
  assert.equal(req.url, `${BACKEND_URL}${path}`)
  assert.equal(req.credentials, 'include')
  assert.equal(req.method, method)
  if (body !== undefined) {
    assert.equal(req.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(req.body), body)
  }
}
let navigate, location
function RouteProbe() { navigate = useNavigate(); location = useLocation(); return null }
const routed = (child, path = '/leads/7') => h(MemoryRouter, { initialEntries: [path] }, h(RouteProbe), child)
const cached = (child, extra) => h(DashboardCacheContext.Provider, { value: cacheValue(extra) }, child)
const authed = (child, user = { name: 'Morgan Fixture', email: 'morgan@example.invalid' }, logout = noop) => h(AuthContext.Provider, { value: { user, logout } }, child)

test('actual shell exposes mobile disclosure state, current nested route, identity and closes on navigation', async () => {
  const tree = await mount(routed(authed(h(AppLayout))))
  const trigger = () => button(tree, 'Open navigation')
  const aside = () => tree.root.findByType('aside')
  assert.equal(trigger().props['aria-expanded'], false)
  assert.equal(trigger().props['aria-controls'], aside().props.id)
  assert.equal(aside().props.inert, true)
  assert.match(text(aside()), /Morgan Fixture.*morgan@example.invalid/)
  assert.equal(tree.root.findAllByType('a').find(n => n.props['aria-current'] === 'page').props.href, '/leads')
  assert.equal(tree.root.findByType('header').findAllByType('p')[0].children[0], 'Lead Detail')
  await click(tree, 'Open navigation')
  assert.equal(trigger().props['aria-expanded'], true)
  assert.equal(aside().props.inert, false)
  assert.equal(aside().props.role, 'dialog')
  assert.equal(aside().props['aria-label'], 'Workspace navigation')
  await act(() => navigate('/properties'))
  assert.equal(trigger().props['aria-expanded'], false)
  assert.equal(aside().props.inert, true)
  assert.equal(tree.root.findAllByType('a').find(n => n.props['aria-current'] === 'page').props.href, '/properties')
  assert.equal(tree.root.findByType('main').props.id, 'crm-main')
})

test('sidebar identity fallbacks are honest and logout retains its existing navigation contract', async () => {
  let logouts = 0
  const render = user => routed(authed(h(Sidebar, { open: false, desktop: true, onClose: noop }), user, () => logouts++))
  const tree = await mount(render({ name: ' ', email: 'fallback@example.invalid' }))
  assert.match(text(tree.root), /fallback@example.invalid/)
  assert.equal(tree.root.findByType('aside').props.inert, false)
  assert.equal(tree.root.findByType('aside').props.role, undefined)
  await act(() => tree.update(render(null)))
  assert.match(text(tree.root), /Account/)
  await click(tree, 'Logout')
  assert.equal(logouts, 1)
  assert.equal(location.pathname, '/login')
  assert.equal(requests.length, 0)
})

// Minimal DOM boundary for effect contracts, not a substitute for browser checks.
function focusDOM() {
  const listeners = new Map()
  class Element {
    constructor(parent = null) { this.parentElement = parent; this.children = []; this.attrs = new Set(); this.isConnected = true; parent?.children.push(this) }
    hasAttribute(key) { return this.attrs.has(key) }
    setAttribute(key) { this.attrs.add(key) }
    removeAttribute(key) { this.attrs.delete(key) }
    closest() { return this.hasAttribute('inert') ? this : this.parentElement?.closest() ?? null }
    contains(node) { return node === this || this.children.some(child => child.contains(node)) }
    focus() { document.activeElement = this }
    getClientRects() { return [1] }
    querySelectorAll() { return this.children.filter(n => !n.disabled) }
  }
  globalThis.HTMLElement = Element
  const body = new Element()
  const background = new Element(body)
  const opener = new Element(background)
  const preInert = new Element(body); preInert.setAttribute('inert', '')
  const backdrop = new Element(body)
  const scope = new Element(backdrop)
  const first = new Element(scope), last = new Element(scope)
  globalThis.document = {
    body, activeElement: opener,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: (type, handler) => { if (listeners.get(type) === handler) listeners.delete(type) },
  }
  const key = (key, shiftKey = false) => {
    let prevented = false
    listeners.get('keydown')?.({ key, shiftKey, preventDefault() { prevented = true }, stopPropagation() {} })
    return prevented
  }
  return { scope, first, last, opener, background, preInert, listeners, key }
}

test('actual modal effect preserves inert, traps Tab/focus, handles empty scope and busy Escape, restores focus and cleans up', async () => {
  const dom = focusDOM()
  let closed = 0
  const render = busy => h(ModalFrame, { titleId: 'test-title', onClose: () => closed++, busy }, h('h3', { id: 'test-title' }, 'Focus test'))
  const tree = await mount(render(false), { createNodeMock: node => node.props.role === 'dialog' ? dom.scope : null })
  assert.equal(document.activeElement, dom.first)
  assert.ok(dom.background.hasAttribute('inert'))
  dom.last.focus(); assert.equal(dom.key('Tab'), true)
  assert.equal(document.activeElement, dom.first)
  assert.equal(dom.key('Tab', true), true)
  assert.equal(document.activeElement, dom.last)
  dom.opener.focus(); dom.listeners.get('focusin')({ target: dom.opener })
  assert.equal(document.activeElement, dom.first)
  dom.first.disabled = true; dom.last.disabled = true
  assert.equal(dom.key('Tab'), true)
  assert.equal(document.activeElement, dom.scope)
  await act(() => tree.update(render(true)))
  assert.equal(assertDialog(tree, 'Focus test').props['aria-busy'], true)
  dom.key('Escape'); assert.equal(closed, 0)
  await act(() => tree.update(render(false)))
  dom.key('Escape'); assert.equal(closed, 1)
  await act(() => tree.unmount())
  assert.equal(dom.background.hasAttribute('inert'), false)
  assert.equal(dom.preInert.hasAttribute('inert'), true)
  assert.equal(document.activeElement, dom.opener)
  assert.equal(dom.listeners.size, 0)
})

test('actual drawer shares focus/inert trapping and returns focus when closed', async () => {
  const dom = focusDOM()
  let closed = 0
  const render = open => routed(authed(h(Sidebar, { open, onClose: () => closed++ })))
  const tree = await mount(render(true), { createNodeMock: node => node.type === 'aside' ? dom.scope : null })
  assert.equal(document.activeElement, dom.first)
  assert.equal(dom.background.hasAttribute('inert'), true)
  dom.last.focus(); dom.key('Tab')
  assert.equal(document.activeElement, dom.first)
  dom.key('Escape'); assert.equal(closed, 1)
  await act(() => tree.update(render(false)))
  assert.equal(dom.background.hasAttribute('inert'), false)
  assert.equal(document.activeElement, dom.opener)
  assert.equal(dom.listeners.size, 0)
})

test('lead disclosure focuses actions, supports Escape and restores trigger before Edit/Delete callbacks', async () => {
  const events = []
  const trigger = { focus: () => events.push('trigger') }
  const container = { querySelector: () => ({ focus: () => events.push('action') }) }
  const tree = await mount(h(LeadMenu, { onEdit: () => events.push('edit'), onDelete: () => events.push('delete') }), {
    createNodeMock: node => node.type === 'button' ? trigger : container,
  })
  assert.equal(button(tree, 'Lead actions').props['aria-expanded'], false)
  await click(tree, 'Lead actions')
  assert.equal(button(tree, 'Lead actions').props['aria-expanded'], true)
  assert.deepEqual(events, ['action'])
  await act(() => tree.root.findByType('div').props.onKeyDown({ key: 'Escape', stopPropagation() {} }))
  assert.equal(button(tree, 'Lead actions').props['aria-expanded'], false)
  await click(tree, 'Lead actions'); await click(tree, 'Edit')
  assert.deepEqual(events.slice(-2), ['trigger', 'edit'])
  await click(tree, 'Lead actions'); await click(tree, 'Delete')
  assert.deepEqual(events.slice(-2), ['trigger', 'delete'])
})

test('lead form associates required/contact/referral/manual errors, labels every control and announces server failure', async () => {
  const tree = await mount(h(LeadModal, { mode: 'add', onClose: noop, onSuccess: noop, properties: [property], agentContactMethod: null }))
  assertDialog(tree, 'Refer a Lead'); assertLabels(tree)
  await click(tree, 'Add Lead')
  assertError(tree, 'lead-name', 'Full name')
  assertError(tree, 'lead-email', 'contact method')
  assertError(tree, 'lead-phone', 'contact method')
  assertError(tree, 'lead-referrer', 'Referrer name')
  assert.equal(requests.length, 0)
  await change(tree, 'lead-name', ' Jamie Fixture ')
  await change(tree, 'lead-email', 'invalid')
  await change(tree, 'lead-referrer', ' Pat ')
  await click(tree, 'Add Lead'); assertError(tree, 'lead-email', 'valid email')
  await change(tree, 'lead-email', lead.email)
  await click(tree, 'Manual')
  assert.equal(button(tree, 'Manual').props['aria-pressed'], true)
  await change(tree, 'lead-body', 'Hello')
  await click(tree, 'Add Lead'); assertError(tree, 'lead-subject', 'Subject is required')
  assertLabels(tree)
  await change(tree, 'lead-subject', 'Hello')
  respond = () => json({ error: 'Fixture save rejected' }, 422)
  await click(tree, 'Add Lead')
  assert.match(text(tree.root.find(n => n.type === 'div' && n.props.role === 'alert')), /Fixture save rejected/)
  assertRequest(0, 'api/leads', 'POST', { name: 'Jamie Fixture', email: lead.email, phone: null, source: 'referral', sourceId: 'Pat', propertyId: null })
})

test('lead creation and manual initial outreach retain exact contracts and surface send warnings', async () => {
  let saved, warning
  respond = req => req.url.endsWith('/send-initial') ? json({}, 503) : json(lead)
  const tree = await mount(h(LeadModal, { mode: 'add', onClose: noop, onSuccess: (value, w) => { saved = value; warning = w }, properties: [property], agentContactMethod: null }))
  for (const [id, value] of [['lead-name', ' Jamie Fixture '], ['lead-email', ` ${lead.email} `], ['lead-source', 'zillow'], ['lead-property', '11'], ['lead-notes', ' Context ']]) await change(tree, id, value)
  await click(tree, 'Manual')
  await change(tree, 'lead-subject', ' Subject '); await change(tree, 'lead-body', ' Body ')
  await click(tree, 'Add Lead')
  assertRequest(0, 'api/leads', 'POST', { name: lead.name, email: lead.email, phone: null, source: 'zillow', sourceId: null, propertyId: 11, notes: 'Context' })
  assertRequest(1, 'api/leads/7/send-initial', 'POST', { mode: 'manual', smsMessage: null, emailSubject: 'Subject', emailBody: 'Body' })
  assert.equal(saved.id, '7')
  assert.match(warning, /saved but the initial message could not be sent/)
})

test('edit lead uses PATCH only, with no initial-outreach request or notes mutation', async () => {
  respond = () => json(lead)
  const tree = await mount(h(LeadModal, { mode: 'edit', initial: lead, onClose: noop, onSuccess: noop, properties: [], agentContactMethod: null }))
  assertDialog(tree, 'Edit Lead'); assertLabels(tree)
  await click(tree, 'Save Changes')
  assertRequest(0, 'api/leads/7', 'PATCH', { name: lead.name, email: lead.email, phone: lead.phone, source: 'zillow', sourceId: null, propertyId: null })
  assert.equal(requests.length, 1)
})

test('verification labels/manual validation and verify/send-initial contracts remain intact', async () => {
  let warning
  respond = req => req.url.endsWith('/send-initial') ? json({ warning: 'Fixture warning' }) : json(lead)
  const tree = await mount(h(VerifyLeadModal, { lead: { ...lead, status: 'unverified' }, onClose: noop, onSuccess: w => { warning = w } }))
  assertDialog(tree, 'Verify Lead')
  assertRequest(0, 'api/leads/7', undefined)
  await click(tree, 'Manual'); assertLabels(tree)
  await click(tree, 'Verify Lead'); assertError(tree, 'verify-sms', 'at least one message')
  assert.equal(requests.length, 1)
  await change(tree, 'verify-body', ' Body ')
  await click(tree, 'Verify Lead'); assertError(tree, 'verify-subject', 'Subject is required')
  await change(tree, 'verify-subject', ' Subject ')
  await click(tree, 'Verify Lead')
  assertRequest(1, 'api/leads/verify/7', 'POST', { verify: true })
  assertRequest(2, 'api/leads/7/send-initial', 'POST', { mode: 'manual', smsMessage: null, emailSubject: 'Subject', emailBody: 'Body' })
  assert.equal(warning, 'Fixture warning')
})

test('verification None sends no outreach, while rejected verification announces its error', async () => {
  let successes = 0
  respond = req => req.url.includes('/verify/') ? json({ error: 'Fixture verify rejected' }, 422) : json(lead)
  const tree = await mount(h(VerifyLeadModal, { lead, onClose: noop, onSuccess: () => successes++ }))
  await click(tree, 'None'); await click(tree, 'Verify Lead')
  assert.match(text(tree.root.find(n => n.type === 'div' && n.props.role === 'alert')), /Fixture verify rejected/)
  assert.equal(successes, 0)
  respond = () => json({})
  await click(tree, 'Verify Lead')
  assert.equal(successes, 1)
  assert.equal(requests.length, 3)
  assert.ok(requests.every(req => !req.url.endsWith('/send-initial')))
})

test('delete dialogs are named, explain distinct consequences and disable cancellation/confirmation while busy', async () => {
  for (const [Component, title, confirm, consequence] of [
    [DeleteLeadModal, 'Delete Lead', 'Delete', /within 30 days/],
    [DeleteUnverifiedModal, 'Permanently Delete Lead', 'Permanently Delete', /cannot be undone/],
  ]) {
    let confirmed = 0, cancelled = 0
    const props = { name: lead.name, onConfirm: () => confirmed++, onCancel: () => cancelled++ }
    const tree = await mount(h(Component, { ...props, loading: false }))
    assertDialog(tree, title); assert.match(text(tree.root), consequence)
    await click(tree, confirm); await click(tree, 'Cancel')
    assert.equal(confirmed, 1); assert.equal(cancelled, 1)
    await act(() => tree.update(h(Component, { ...props, loading: true })))
    assert.ok(tree.root.findAllByType('button').every(n => n.props.disabled))
    assert.equal(assertDialog(tree, title).props['aria-busy'], true)
  }
})

test('actual leads page retains explicit detail links and both deletion request/cache contracts', async () => {
  const removed = []
  const pending = { ...lead, id: '8', name: 'Unverified Fixture', status: 'unverified' }
  const tree = await mount(routed(cached(h(LeadsPage), { cache: { ...rawDashboard, leads: [lead, pending] }, removeLead: id => removed.push(id) }), '/leads'))
  assert.equal(tree.root.findAllByType('a').filter(n => n.props.href === '/leads/7').length, 1)
  assert.equal(tree.root.findAllByType('a').filter(n => n.props.href === '/leads/8').length, 0)
  await click(tree, 'Lead actions'); await click(tree, 'Edit'); assertDialog(tree, 'Edit Lead')
  await click(tree, 'Cancel')
  await click(tree, 'Lead actions'); await click(tree, 'Delete'); assertDialog(tree, 'Delete Lead')
  await click(tree, 'Delete')
  assertRequest(0, 'api/leads/7', 'PATCH', { status: 'pending_deletion' })
  await click(tree, 'Delete Unverified Fixture'); assertDialog(tree, 'Permanently Delete Lead')
  await click(tree, 'Permanently Delete')
  assertRequest(1, 'api/leads/verify/8', 'POST', { verify: false })
  assert.deepEqual(removed, [7, 8])
  await click(tree, 'Verify Unverified Fixture'); assertDialog(tree, 'Verify Lead')
})

test('ready indicator conveys status without depending on color', async () => {
  for (const [status, expected] of [['active', 'Lead is ready'], ['converted', 'Lead is ready'], ['new', 'Lead is not ready']]) {
    const tree = await mount(h(LeadReadyIndicator, { lead: { ...lead, status } }))
    assert.equal(text(tree.root), expected)
    assert.equal(tree.root.findByType('svg').props['aria-hidden'], 'true')
  }
})

test('property cards honestly omit photos, retain view controls, and form/delete contracts', async () => {
  const removed = [], added = []
  const tree = await mount(cached(h(PropertiesPage), { removeProperty: id => removed.push(id), addProperty: p => added.push(p) }))
  assert.match(text(tree.root), /No property photo/)
  assert.equal(tree.root.findAllByType('img').length, 0)
  assert.match(text(tree.root), /11 Fixture Lane.*450,000.*3 bd.*2 ba.*1,800 sqft/)
  await click(tree, 'Table')
  assert.equal(button(tree, 'Table').props['aria-pressed'], true)
  assert.equal(tree.root.find(n => n.props['aria-label'] === 'Property comparison table').props.tabIndex, 0)
  await click(tree, 'Property actions'); await click(tree, 'Delete'); assertDialog(tree, 'Delete Property')
  await click(tree, 'Delete')
  assertRequest(0, 'api/properties/11', 'PATCH', { status: 'pending_deletion' })
  assert.deepEqual(removed, ['11'])
  await click(tree, 'Add Property'); assertDialog(tree, 'Add New Property'); assertLabels(tree)
  await click(tree, 'Create Property')
  for (const [id, msg] of [['property-address1', 'Address Line 1'], ['property-status', 'Status is required'], ['property-description', 'Description is required']]) assertError(tree, id, msg)
  assert.equal(requests.length, 1)
  for (const [id, value] of [['property-address1', ' 22 Fixture Road '], ['property-status', 'draft'], ['property-description', ' Description '], ['property-bedrooms', '1.5']]) await change(tree, id, value)
  await click(tree, 'Create Property'); assertError(tree, 'property-bedrooms', 'whole number')
  await change(tree, 'property-bedrooms', '2')
  respond = () => json({ ...property, id: '22' })
  await click(tree, 'Create Property')
  assertRequest(1, 'api/properties', 'POST', { addressLine1: '22 Fixture Road', addressLine2: null, description: 'Description', status: 'draft', source: 'unknown', externalId: null, price: null, bedrooms: 2, bathrooms: null, sqft: null })
  assert.equal(added[0].id, '22')
})

test('lead detail retains labelled message/note actions, error association, and request/refetch contracts', async () => {
  respond = req => req.url.endsWith('/api/leads/7') ? json({ ...lead, messages: [], notes: [] }) : json({})
  const tree = await mount(routed(h(Routes, null, h(Route, { path: '/leads/:id', element: h(LeadDetailPage) }), h(Route, { path: '/leads', element: h('p', null, 'Lead list destination') }))))
  assertRequest(0, 'api/leads/7', undefined)
  assertLabels(tree)
  await click(tree, 'Email')
  await change(tree, 'detail-message', ' Message ')
  await click(tree, 'Send')
  assert.equal(requests.length, 1)
  assert.equal(field(tree, 'detail-message').props['aria-describedby'], 'lead-action-error')
  assert.match(text(tree.root.find(n => n.type === 'div' && n.props.id === 'lead-action-error')), /Subject is required/)
  const subject = tree.root.findAllByType('input')[0]
  assert.equal(subject.props['aria-describedby'], 'lead-action-error')
  await act(() => subject.props.onChange({ target: { value: ' Subject ' } }))
  await click(tree, 'Send')
  assertRequest(1, 'api/messages', 'POST', { leadId: '7', content: 'Message', channel: 'email', subject: 'Subject' })
  assertRequest(2, 'api/leads/7', undefined)
  await click(tree, 'notes')
  assertLabels(tree)
  await change(tree, 'detail-note', ' Note '); await click(tree, 'Add Note')
  assertRequest(3, 'api/leads/7/notes', 'POST', { note: 'Note' })
  assertRequest(4, 'api/leads/7', undefined)
  await click(tree, 'Back to Leads')
  assert.equal(location.pathname, '/leads')
})

test('dashboard keeps genuine metrics, labelled period, attention and existing navigation targets', async () => {
  const tree = await mount(routed(cached(h(DashboardPage), { cache: { ...rawDashboard, leads: [{ ...lead, status: 'unverified' }] } }), '/dashboard?since=all&keep=1'))
  assertLabels(tree)
  assert.equal(tree.root.find(n => n.type === 'dl').props['aria-label'], 'Lead metrics')
  await act(() => tree.root.findByType('select').props.onChange({ target: { value: '7d' } }))
  assert.equal(new URLSearchParams(location.search).get('since'), '7d')
  assert.equal(new URLSearchParams(location.search).get('keep'), '1')
  await click(tree, 'Review now')
  assert.equal(location.pathname + location.search, '/leads?filter=unverified')
  await click(tree, 'Browse properties')
  assert.equal(location.pathname, '/properties')
  assert.equal(requests.length, 0)
})
