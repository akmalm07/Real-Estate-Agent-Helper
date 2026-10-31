import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { act, createElement as h } from 'react';
import { create } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '../src/components/ui/Button.tsx';
import { Card, CardTitle } from '../src/components/ui/Card.tsx';
import { Input, Textarea } from '../src/components/ui/Input.tsx';
import { Badge, LeadStatusBadge } from '../src/components/ui/Badge.tsx';
import { EmptyState } from '../src/components/ui/EmptyState.tsx';
import { ErrorState } from '../src/components/ui/ErrorState.tsx';
import { Skeleton, SkeletonCard, SkeletonRow, SkeletonTable } from '../src/components/ui/Skeleton.tsx';
import HomePage from '../src/pages/HomePage.tsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const trees = [];
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(() => tree.unmount());
});
async function mount(element) {
  let tree;
  await act(() => { tree = create(element); });
  trees.push(tree);
  return tree;
}

test('Button preserves safe form default, explicit submit type and caller handlers', async () => {
  let clicks = 0;
  const onClick = () => { clicks++; };
  const tree = await mount(h('form', null, h(Button, { onClick }, 'Save')));
  const button = tree.root.findByType('button');
  assert.equal(button.props.type, 'button');
  assert.equal(button.props.disabled, false);
  assert.equal(button.props.onClick, onClick);
  await act(() => button.props.onClick());
  assert.equal(clicks, 1);
  const markup = renderToStaticMarkup(h('form', null,
    h(Button, null, 'Cancel'), h(Button, { type: 'submit' }, 'Submit')));
  assert.match(markup, /type="button"/);
  assert.match(markup, /type="submit"/);
});

test('Button loading and disabled use native disabled semantics and retain visible label', async () => {
  const tree = await mount(h(Button, { loading: true, icon: h(Search) }, 'Save changes'));
  const button = tree.root.findByType('button');
  assert.equal(button.props.disabled, true);
  assert.equal(button.props['aria-busy'], true);
  assert.ok(button.children.includes('Save changes'));
  assert.equal(tree.root.findByType('svg').props['aria-hidden'], 'true');
  assert.match(tree.root.findByType('svg').props.className, /motion-reduce:animate-none/);
  await act(() => tree.update(h(Button, { disabled: true, loading: false }, 'Save changes')));
  assert.equal(tree.root.findByType('button').props.disabled, true);
  assert.equal(tree.root.findByType('button').props['aria-busy'], undefined);
  await act(() => tree.update(h(Button, { icon: h(Search), 'aria-busy': true }, 'Find')));
  assert.equal(tree.root.findByType('button').props['aria-busy'], true);
  assert.equal(tree.root.findByType('span').props['aria-hidden'], 'true');
});

test('shared controls retain caller Tailwind overrides', async () => {
  const tree = await mount(h('div', null,
    h(Button, { className: 'bg-black rounded-none px-8' }, 'Action'),
    h(Input, { className: 'bg-black rounded-none', 'aria-label': 'Search' }),
    h(Card, { className: 'bg-black rounded-none' }, 'Record'),
    h(Badge, { className: 'bg-black rounded-none' }, 'Status')));
  for (const type of ['button', 'input']) {
    const classes = tree.root.findByType(type).props.className.split(' ');
    assert.ok(classes.includes('bg-black'));
    assert.ok(classes.includes('rounded-none'));
    assert.ok(!classes.includes('bg-primary') && !classes.includes('bg-card'));
  }
  for (const component of [Card, Badge]) {
    const classes = tree.root.findByType(component).findAll(n => typeof n.type === 'string')[0].props.className;
    assert.match(classes, /bg-black/);
    assert.match(classes, /rounded-none/);
    assert.doesNotMatch(classes, /bg-card|bg-muted/);
  }
});

test('Input error is associated, invalid and merged with caller description', async () => {
  const onChange = () => {};
  const tree = await mount(h(Input, {
    id: 'email', error: 'Enter an email address.', 'aria-describedby': 'email-hint',
    'aria-invalid': false, icon: Search, onChange,
  }));
  const input = tree.root.findByType('input');
  assert.equal(input.props.id, 'email');
  assert.equal(input.props.onChange, onChange);
  assert.equal(input.props['aria-invalid'], true);
  assert.equal(input.props['aria-describedby'], 'email-hint email-error');
  assert.equal(tree.root.findByType('p').props.id, 'email-error');
  assert.deepEqual(tree.root.findByType('p').children, ['Enter an email address.']);
  const iconWrapper = tree.root.find(n => n.type === 'div' && n.props['aria-hidden'] === 'true');
  assert.equal(iconWrapper.findAllByType('svg').length, 1);
  await act(() => tree.update(h(Input, {
    id: 'email', 'aria-describedby': 'email-hint', 'aria-invalid': 'grammar',
  })));
  assert.equal(tree.root.findByType('input').props['aria-describedby'], 'email-hint');
  assert.equal(tree.root.findByType('input').props['aria-invalid'], 'grammar');
  assert.equal(tree.root.findAllByType('p').length, 0);
});

test('Input generates unique stable IDs and removes only the error description on recovery', async () => {
  const fields = error => h('div', null,
    h(Input, { error, 'aria-label': 'First' }),
    h(Input, { error: 'Second error', 'aria-label': 'Second' }));
  const tree = await mount(fields('First error'));
  const inputs = tree.root.findAllByType('input');
  const ids = inputs.map(n => n.props.id);
  assert.notEqual(ids[0], ids[1]);
  assert.ok(ids.every(Boolean));
  assert.equal(inputs[0].props['aria-describedby'], `${ids[0]}-error`);
  assert.equal(tree.root.findAllByType('p')[0].props.id, `${ids[0]}-error`);
  await act(() => tree.update(fields(undefined)));
  assert.equal(tree.root.findAllByType('input')[0].props.id, ids[0]);
  assert.equal(tree.root.findAllByType('input')[0].props['aria-describedby'], undefined);
  assert.equal(tree.root.findAllByType('input')[0].props['aria-invalid'], undefined);
});

test('Textarea preserves disabled, focus styling, descriptions and handlers', async () => {
  const onChange = () => {};
  const tree = await mount(h(Textarea, {
    disabled: true, onChange, 'aria-describedby': 'note-hint', value: 'Draft',
  }));
  const textarea = tree.root.findByType('textarea');
  assert.equal(textarea.props.disabled, true);
  assert.equal(textarea.props.onChange, onChange);
  assert.equal(textarea.props.value, 'Draft');
  assert.equal(textarea.props['aria-describedby'], 'note-hint');
  assert.match(textarea.props.className, /focus:ring-ring/);
  assert.match(textarea.props.className, /disabled:cursor-not-allowed/);
});

test('Card stays a content container by default; opt-in click gets keyboard parity', async () => {
  const tree = await mount(h(Card, null, h(CardTitle, null, 'Lead details')));
  let card = tree.root.findByType('div');
  assert.equal(card.props.role, undefined);
  assert.equal(card.props.tabIndex, undefined);
  assert.equal(card.props.onKeyDown, undefined);
  assert.deepEqual(tree.root.findByType('h3').children, ['Lead details']);
  let clicks = 0;
  const onClick = () => { clicks++; };
  await act(() => tree.update(h(Card, { onClick }, 'Open record')));
  card = tree.root.findByType('div');
  assert.equal(card.props.role, 'button');
  assert.equal(card.props.tabIndex, 0);
  await act(() => card.props.onClick());
  const target = {};
  let prevented = 0;
  const event = key => ({ key, target, currentTarget: target, preventDefault() { prevented++; } });
  await act(() => {
    card.props.onKeyDown(event('Enter'));
    card.props.onKeyDown(event(' '));
    card.props.onKeyDown(event('Escape'));
    card.props.onKeyDown({ ...event('Enter'), repeat: true });
    card.props.onKeyDown({ ...event(' '), target: {} });
  });
  assert.equal(clicks, 3);
  assert.equal(prevented, 2);
});

test('Badge retains every variant, indigo alias and existing status labels', async () => {
  const variants = ['default', 'success', 'warning', 'danger', 'muted', 'indigo'];
  const tree = await mount(h('div', null,
    ...variants.map(variant => h(Badge, { key: variant, variant }, variant)),
    ...['new', 'active', 'cold', 'converted', 'opted_out', 'custom'].map(status =>
      h(LeadStatusBadge, { key: status, status }))));
  const spans = tree.root.findAllByType('span');
  assert.equal(spans.length, 12);
  assert.match(spans[5].props.className, /bg-accent text-primary/);
  assert.deepEqual(spans.slice(6).map(n => n.children[0]),
    ['New', 'Active', 'Cold', 'Converted', 'Opted Out', 'custom']);
});

test('Empty and Error states keep useful text and action handlers without icon toppers or live regions', async () => {
  let actions = 0;
  const onAction = () => { actions++; };
  const tree = await mount(h('div', null,
    h(EmptyState, { icon: Search, title: 'No leads', description: 'Try another search.',
      action: { label: 'Clear search', onClick: onAction } }),
    h(ErrorState, { message: 'Unable to fetch records.', onRetry: onAction })));
  assert.match(JSON.stringify(tree.toJSON()), /Try another search/);
  assert.match(JSON.stringify(tree.toJSON()), /Unable to fetch records/);
  const buttons = tree.root.findAllByType('button');
  assert.equal(buttons.length, 2);
  await act(() => buttons.forEach(n => n.props.onClick()));
  assert.equal(actions, 2);
  assert.equal(tree.root.findAllByType('svg').length, 0);
  assert.equal(tree.root.findAll(n => n.props['aria-live'] || n.props.role === 'alert').length, 0);
});

test('Skeleton families are decorative and reduced-motion-ready', async () => {
  for (const component of [Skeleton, SkeletonCard, SkeletonRow, SkeletonTable]) {
    const tree = await mount(h(component));
    assert.equal(tree.toJSON().props['aria-hidden'], 'true');
    const blocks = tree.root.findAllByType(Skeleton);
    for (const block of blocks) {
      assert.match(block.findByType('div').props.className, /motion-reduce:animate-none/);
    }
  }
});

test('Home provides real links, landmarks, an in-page learn target and no nested interactive markup', async () => {
  const tree = await mount(h(MemoryRouter, null, h(HomePage)));
  assert.equal(tree.root.findAllByType('header').length, 1);
  assert.equal(tree.root.findAllByType('main').length, 1);
  assert.equal(tree.root.findAllByType('footer').length, 1);
  assert.equal(tree.root.findAllByType('h1').length, 1);
  assert.equal(tree.root.findByType('main').props.id, 'main-content');
  const links = tree.root.findAllByType('a');
  const hrefs = links.map(n => n.props.href);
  for (const href of ['/login', '#workspace', '/terms', '/privacy', '#main-content']) {
    assert.ok(hrefs.includes(href), `Missing ${href}`);
  }
  assert.ok(!hrefs.includes('/signup'));
  assert.equal(tree.root.findAll(n => n.type === 'section' && n.props.id === 'workspace').length, 1);
  assert.equal(tree.root.findAllByType('button').length, 0);
  for (const link of links) {
    assert.equal(link.findAll(n => n !== link && ['a', 'button', 'input', 'select', 'textarea'].includes(n.type)).length, 0);
  }
  assert.match(JSON.stringify(tree.toJSON()), /Choose Sign Up on the sign-in page/);
});

test('Home local LCP image has intrinsic dimensions and a useful failure replacement retaining caption', async () => {
  const tree = await mount(h(MemoryRouter, null, h(HomePage)));
  const image = tree.root.findByType('img');
  assert.equal(image.props.src, '/images/campus-north-mx-granger.webp');
  assert.equal(image.props.width, 1400);
  assert.equal(image.props.height, 1050);
  assert.equal(image.props.loading, 'eager');
  assert.equal(image.props.fetchPriority, 'high');
  assert.match(image.props.alt, /residential campus buildings.*courtyard.*blue sky/);
  const captionText = () => tree.root.findByType('figcaption').findAllByType('span')
    .map(n => n.children.filter(child => typeof child === 'string').join(''));
  const caption = captionText();
  await act(() => image.props.onError());
  assert.equal(tree.root.findAllByType('img').length, 0);
  assert.match(JSON.stringify(tree.toJSON()), /photograph is unavailable/);
  assert.deepEqual(captionText(), caption);
  assert.match(captionText().join(' '), /Not a property listing/);
});
