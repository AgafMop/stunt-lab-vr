import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spoken, LINES } from '../src/game/script.js';

// the 2026-11-19 headset check heard "harkev", "פי שלוש או ארבע", "Beamper"
test('the words the voice got wrong go out with niqqud; subtitles keep the plain text', () => {
  assert.match(spoken({ text: 'הרכב עוצר.' }), /^הָרֶכֶב עוֹצֵר\.$/);
  assert.match(spoken({ text: 'זה לוקח פי שלושה עד ארבעה.' }), /פִּי שְׁלוֹשָׁה עַד אַרְבָּעָה/);
  assert.match(spoken({ text: 'באמפר יבדוק.' }), /^בַּמְפֶּר/);
  assert.match(spoken({ text: 'נוסעים, והרכב עוצר' }), /והָרֶכֶב/);              // a prefix letter stays, the word is fixed
  assert.equal(LINES.race_reaction2.text.includes('ְ'), false);                    // the subtitle itself is untouched
});

test('a word inside a longer word, or already with niqqud in `say`, is left alone', () => {
  assert.equal(spoken({ text: 'הרכבת' }), 'הרכבת');
  assert.equal(spoken({ text: 'x', say: 'לָרֶכֶב' }), 'לָרֶכֶב');
});

test('every line still produces text (no regexp ate a line)', () => {
  for (const [id, l] of Object.entries(LINES)) assert.ok(spoken(l).replace(/[^\u05D0-\u05EA]/g, '').length >= (l.say ?? l.text).replace(/[^\u05D0-\u05EA]/g, '').length * 0.9, id);
});
