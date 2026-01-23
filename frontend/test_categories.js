const data = require('./meet_59182_complete.json');

const isLive = data.events.some(event =>
  (event.results?.rs && event.results.rs.length > 0) ||
  (event.heats?.it && event.heats.it.some(h => h.pr || h.prc))
);

const hasMulti = data.events.some(event =>
  event.name.toLowerCase().includes('pent') ||
  event.name.toLowerCase().includes('hept') ||
  event.name.toLowerCase().includes('decathlon')
);

const hasSprints = data.events.some(event =>
  /\b(60|100|200|400)m?\b/i.test(event.name) &&
  !event.name.toLowerCase().includes('hurdle')
);

const hasHurdles = data.events.some(event =>
  event.name.toLowerCase().includes('hurdle')
);

const hasDistance = data.events.some(event =>
  /\b(800|1000|1500|3000|5000|10000|mile)\b/i.test(event.name.toLowerCase())
);

const hasField = data.events.some(event =>
  /jump|throw|vault|shot|discus|javelin|hammer/i.test(event.name.toLowerCase())
);

console.log('Meet Analysis:');
console.log('Is Live:', isLive);
console.log('Has Multi-Events:', hasMulti);
console.log('Has Sprints:', hasSprints);
console.log('Has Hurdles:', hasHurdles);
console.log('Has Distance:', hasDistance);
console.log('Has Field:', hasField);
