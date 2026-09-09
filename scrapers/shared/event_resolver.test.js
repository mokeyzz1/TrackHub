const test = require('node:test');
const assert = require('node:assert/strict');
const { EventResolver } = require('./event_resolver');

function source(aliases, catalog, orders = []) {
  return { from(table) { return {
    select() { return this; },
    order(column, options) { orders.push([table, column, options]); return this; },
    async range(from, to) { return { data: (table === 'event_aliases' ? aliases : catalog).slice(from, to + 1), error: null }; },
  }; } };
}

test('event aliases preserve same-target variants and load in stable page order', async () => {
  const resolver = new EventResolver();
  const orders = [];
  const aliases = Array.from({ length: 1000 }, (_, i) => ({ raw_name: `event ${i}`, event_type_id: 1 }));
  aliases.push({ raw_name: ' EVENT 0 ', event_type_id: 1 });
  assert.equal(await resolver.load(source(aliases, [{ event_type_id: 1, measure: 'time' }], orders)), 1000);
  assert.equal(resolver.resolve('Event 0'), 1);
  assert.equal(resolver.details('event 0').measure, 'time');
  assert.deepEqual(orders, [
    ['event_aliases', 'raw_name', { ascending: true }],
    ['event_aliases', 'raw_name', { ascending: true }],
    ['event_types', 'event_type_id', { ascending: true }],
  ]);
});

test('conflicting normalized aliases fail closed across page boundaries', async () => {
  const resolver = new EventResolver();
  const aliases = Array.from({ length: 1000 }, (_, i) => ({ raw_name: `event ${i}`, event_type_id: 1 }));
  aliases.push({ raw_name: ' EVENT 0 ', event_type_id: 2 });
  await assert.rejects(resolver.load(source(aliases, [{ event_type_id: 1 }, { event_type_id: 2 }])), /Conflicting normalized event alias/);
  assert.throws(() => resolver.resolve('event 0'), /before load/);
});

test('a failed catalog reload cannot leave the resolver marked ready', async () => {
  const resolver = new EventResolver();
  await resolver.load(source([{ raw_name: '100m', event_type_id: 1 }], [{ event_type_id: 1 }]));
  await assert.rejects(resolver.load(source([{ raw_name: '100m', event_type_id: 1 }], [])), /no loaded catalog target/);
  assert.throws(() => resolver.details('100m'), /before load/);
  assert.throws(() => resolver.detailsById(1), /before load/);
});

function queueSource({ lookup = async () => ({ data: null }), write = async () => ({ error: null }) } = {}) {
  return { from() { return {
    select() { return this; },
    eq(_key, value) {
      if (this.pending) return write(this.pending);
      this.key = value;
      return this;
    },
    maybeSingle() { return lookup(this.key); },
    update(value) { this.pending = value; return this; },
    insert(value) { return write(value); },
  }; } };
}

test('unmapped lookup errors preserve review evidence and never attempt a write', async () => {
  const resolver = new EventResolver();
  resolver.unmapped.set('Unfamiliar event', 2);
  await assert.rejects(resolver.flushUnmapped(queueSource({
    lookup: async () => ({ error: { message: 'offline' } }),
    write: async () => { assert.fail('must not write after lookup failure'); },
  })), /lookup failed: offline/);
  assert.equal(resolver.unmapped.get('Unfamiliar event'), 2);
});

test('partial unmapped flush retains failed and unattempted entries without replaying acknowledged counts', async () => {
  const resolver = new EventResolver();
  resolver.unmapped = new Map([['first', 1], ['second', 2], ['third', 3]]);
  await assert.rejects(resolver.flushUnmapped(queueSource({
    write: async row => ({ error: row.raw_name === 'second' ? { message: 'write failed' } : null }),
  })), /write failed/);
  assert.deepEqual([...resolver.unmapped], [['second', 2], ['third', 3]]);
  assert.equal(await resolver.flushUnmapped(queueSource()), 2);
  assert.equal(resolver.unmapped.size, 0);
});

test('unmapped flush adds numeric counts and preserves misses arriving during the write', async () => {
  const resolver = new EventResolver();
  resolver.unmapped.set('new event', 2);
  await resolver.flushUnmapped(queueSource({
    lookup: async () => ({ data: { seen_count: '10' } }),
    write: async row => {
      assert.equal(row.seen_count, 12);
      resolver.unmapped.set('new event', 3);
      return { error: null };
    },
  }));
  assert.equal(resolver.unmapped.get('new event'), 1);
});
