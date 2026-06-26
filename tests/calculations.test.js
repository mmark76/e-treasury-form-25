import { calculateInvoice } from '../src/features/calculations.js';
import { amountToGreekWords } from '../src/features/number-to-words.js';

const results = document.getElementById('results');

function assertEqual(name, actual, expected) {
  const row = document.createElement('p');
  const passed = Object.is(actual, expected);
  row.className = passed ? 'pass' : 'fail';
  row.textContent = passed
    ? `✓ ${name}`
    : `✗ ${name}: αναμενόταν «${expected}», λήφθηκε «${actual}»`;
  results.appendChild(row);

  if (!passed) throw new Error(row.textContent);
}

const invoice = calculateInvoice('100', '19');
assertEqual('Καθαρό ποσό', invoice.netAmount, 100);
assertEqual('Ποσό Φ.Π.Α.', invoice.vatAmount, 19);
assertEqual('Ολικό ποσό', invoice.grossAmount, 119);

const roundedInvoice = calculateInvoice('431,64', '19');
assertEqual('Υποστήριξη δεκαδικού κόμματος', roundedInvoice.netAmount, 431.64);

assertEqual(
  'Ποσό ολογράφως',
  amountToGreekWords(431.64),
  'ΤΕΤΡΑΚΟΣΙΑ ΤΡΙΑΝΤΑ ΕΝΑ ΕΥΡΩ ΚΑΙ ΕΞΗΝΤΑ ΤΕΣΣΕΡΑ ΣΕΝΤ'
);

[
  [200000, 'ΔΙΑΚΟΣΙΕΣ ΧΙΛΙΑΔΕΣ ΕΥΡΩ'],
  [300000, 'ΤΡΙΑΚΟΣΙΕΣ ΧΙΛΙΑΔΕΣ ΕΥΡΩ'],
  [400000, 'ΤΕΤΡΑΚΟΣΙΕΣ ΧΙΛΙΑΔΕΣ ΕΥΡΩ'],
  [600000, 'ΕΞΑΚΟΣΙΕΣ ΧΙΛΙΑΔΕΣ ΕΥΡΩ'],
  [900000, 'ΕΝΝΙΑΚΟΣΙΕΣ ΧΙΛΙΑΔΕΣ ΕΥΡΩ']
].forEach(([amount, expected]) => {
  assertEqual(
    `Θηλυκές εκατοντάδες χιλιάδων ${amount}`,
    amountToGreekWords(amount),
    expected
  );
});
