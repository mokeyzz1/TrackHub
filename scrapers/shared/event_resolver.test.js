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
