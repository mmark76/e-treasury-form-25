const ONES = ['', 'ΕΝΑ', 'ΔΥΟ', 'ΤΡΙΑ', 'ΤΕΣΣΕΡΑ', 'ΠΕΝΤΕ', 'ΕΞΙ', 'ΕΠΤΑ', 'ΟΚΤΩ', 'ΕΝΝΕΑ'];
const FEMININE_ONES = ['', 'ΜΙΑ', 'ΔΥΟ', 'ΤΡΕΙΣ', 'ΤΕΣΣΕΡΙΣ', 'ΠΕΝΤΕ', 'ΕΞΙ', 'ΕΠΤΑ', 'ΟΚΤΩ', 'ΕΝΝΕΑ'];
const TEENS = {
  10: 'ΔΕΚΑ', 11: 'ΕΝΤΕΚΑ', 12: 'ΔΩΔΕΚΑ', 13: 'ΔΕΚΑΤΡΙΑ', 14: 'ΔΕΚΑΤΕΣΣΕΡΑ',
  15: 'ΔΕΚΑΠΕΝΤΕ', 16: 'ΔΕΚΑΕΞΙ', 17: 'ΔΕΚΑΕΠΤΑ', 18: 'ΔΕΚΑΟΚΤΩ', 19: 'ΔΕΚΑΕΝΝΕΑ'
};
const TENS = ['', '', 'ΕΙΚΟΣΙ', 'ΤΡΙΑΝΤΑ', 'ΣΑΡΑΝΤΑ', 'ΠΕΝΗΝΤΑ', 'ΕΞΗΝΤΑ', 'ΕΒΔΟΜΗΝΤΑ', 'ΟΓΔΟΝΤΑ', 'ΕΝΕΝΗΝΤΑ'];
const HUNDREDS = ['', 'ΕΚΑΤΟΝ', 'ΔΙΑΚΟΣΙΑ', 'ΤΡΙΑΚΟΣΙΑ', 'ΤΕΤΡΑΚΟΣΙΑ', 'ΠΕΝΤΑΚΟΣΙΑ', 'ΕΞΑΚΟΣΙΑ', 'ΕΠΤΑΚΟΣΙΑ', 'ΟΚΤΑΚΟΣΙΑ', 'ΕΝΝΙΑΚΟΣΙΑ'];
const FEMININE_HUNDREDS = ['', 'ΕΚΑΤΟΝ', 'ΔΙΑΚΟΣΙΕΣ', 'ΤΡΙΑΚΟΣΙΕΣ', 'ΤΕΤΡΑΚΟΣΙΕΣ', 'ΠΕΝΤΑΚΟΣΙΕΣ', 'ΕΞΑΚΟΣΙΕΣ', 'ΕΠΤΑΚΟΣΙΕΣ', 'ΟΚΤΑΚΟΣΙΕΣ', 'ΕΝΝΙΑΚΟΣΙΕΣ'];

function underThousand(number, feminine = false) {
  if (number === 0) return '';

  const words = [];
  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;

  if (hundreds) {
    const hundredsWords = feminine ? FEMININE_HUNDREDS : HUNDREDS;
    words.push(number === 100 ? 'ΕΚΑΤΟ' : hundredsWords[hundreds]);
  }

  if (remainder >= 10 && remainder <= 19) {
    words.push(TEENS[remainder]);
    return words.join(' ');
  }

  const tens = Math.floor(remainder / 10);
  const ones = remainder % 10;

  if (tens) words.push(TENS[tens]);
  if (ones) words.push((feminine ? FEMININE_ONES : ONES)[ones]);

  return words.join(' ');
}

function integerToGreekWords(number) {
  const safeNumber = Math.max(0, Math.min(999999, Math.trunc(number)));
  if (safeNumber === 0) return 'ΜΗΔΕΝ';

  const thousands = Math.floor(safeNumber / 1000);
  const remainder = safeNumber % 1000;
  const words = [];

  if (thousands === 1) {
    words.push('ΧΙΛΙΑ');
  } else if (thousands > 1) {
    words.push(`${underThousand(thousands, true)} ΧΙΛΙΑΔΕΣ`);
  }

  if (remainder) words.push(underThousand(remainder));
  return words.join(' ');
}

export function amountToGreekWords(amount) {
  const roundedCents = Math.round(Math.max(0, Number(amount) || 0) * 100);
  const euros = Math.floor(roundedCents / 100);
  const cents = roundedCents % 100;

  const euroLabel = euros === 1 ? 'ΕΥΡΩ' : 'ΕΥΡΩ';
  const centLabel = cents === 1 ? 'ΣΕΝΤ' : 'ΣΕΝΤ';
  const euroWords = `${integerToGreekWords(euros)} ${euroLabel}`;

  if (cents === 0) return euroWords;
  return `${euroWords} ΚΑΙ ${integerToGreekWords(cents)} ${centLabel}`;
}
