const results = document.getElementById('results');

function report(name, passed, detail = '') {
  const row = document.createElement('p');
  row.className = passed ? 'pass' : 'fail';
  row.textContent = passed ? `✓ ${name}` : `✗ ${name}${detail ? `: ${detail}` : ''}`;
  results.appendChild(row);
  if (!passed) throw new Error(row.textContent);
}

function assertEqual(name, actual, expected) {
  report(name, Object.is(actual, expected), `αναμενόταν «${expected}», λήφθηκε «${actual}»`);
}

function assert(name, value) {
  report(name, Boolean(value));
}

function loadAppFrame() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    frame.src = '../index.html';
    frame.addEventListener('load', () => {
      waitForApp(frame).then(() => resolve(frame), reject);
    }, { once: true });
    frame.addEventListener('error', reject, { once: true });
    document.body.append(frame);
  });
}

function waitForApp(frame) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function check() {
      const app = frame.contentDocument;
      if (app?.querySelector('.customers-panel') && app.querySelector('.invoice-archive-panel')) {
        resolve();
        return;
      }

      if (Date.now() - started > 3000) {
        reject(new Error('Η εφαρμογή δεν ολοκλήρωσε την αρχικοποίηση.'));
        return;
      }

      setTimeout(check, 50);
    }

    check();
  });
}

const frame = await loadAppFrame();
const app = frame.contentDocument;

function isVisible(element) {
  if (!element) return false;

  for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
    const style = app.defaultView.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }

  return true;
}

function fieldWrapper(id) {
  return app.getElementById(id)?.closest('.field');
}

assertEqual('Τίτλος εφαρμογής', app.title, 'e-Treasury Form 25');
assertEqual('Κείμενο κεφαλίδας', app.querySelector('.app-header h1')?.textContent.trim(), 'e-Treasury Form 25');
assert('Κουμπί Ρυθμίσεις Σελίδας', app.getElementById('page-settings'));
assert('Η αρχική είναι ορατή στην εκκίνηση', !app.getElementById('landing-view')?.hidden);
assert('Η εφαρμογή είναι κρυφή στην εκκίνηση', app.getElementById('application-view')?.hidden);

const cards = [...app.querySelectorAll('.nav-card')];
assertEqual('Πλήθος καρτών πλοήγησης', cards.length, 5);
assertEqual('Κάρτα 1', cards[0]?.textContent.trim(), 'Έκδοση Τιμολογίου');
assertEqual('Κάρτα 2', cards[1]?.textContent.trim(), 'Ρυθμίσεις Τμήματος / Υπηρεσίας');
assertEqual('Κάρτα 3', cards[2]?.textContent.trim(), 'Αρχείο Οφειλετών / Πελατών');
assertEqual('Κάρτα 4', cards[3]?.textContent.trim(), 'Αρχείο Τιμολογίων');
assertEqual('Κάρτα 5', cards[4]?.textContent.trim(), 'Προβολή Τιμολογίου');
assert('Οι κάρτες είναι κουμπιά', cards.every(card => card.tagName === 'BUTTON' && card.type === 'button'));
assert('Δεν υπάρχει μήνυμα καλωσορίσματος', !app.getElementById('landing-view')?.textContent.includes('Καλωσήρθατε'));
assert('Δεν υπάρχουν charts στην αρχική', !app.getElementById('landing-view')?.querySelector('canvas, svg, [class*="chart"], [class*="stat"]'));

cards[0].click();
assert('Η έκδοση τιμολογίου ανοίγει την εφαρμογή', !app.getElementById('application-view')?.hidden);
assertEqual('Ενεργή προβολή έκδοσης', app.querySelector('.workspace')?.dataset.activeView, 'issue');
assert('Τα κουμπιά τιμολογίου διατηρούν τα IDs τους', app.getElementById('clear-form') && app.getElementById('print-form') && app.getElementById('download-pdf'));
assert('Τα κουμπιά ενεργειών δεν είναι στην αρχική', app.getElementById('landing-view') && !app.getElementById('landing-view').contains(app.getElementById('clear-form')));
assert('Η προεπισκόπηση δεν εμφανίζεται στην έκδοση', !isVisible(app.querySelector('.preview-panel')));
['department', 'chapterCode', 'vatRegistration', 'serviceAddress', 'servicePostalCode', 'revenueAccount', 'signatoryName', 'signDate'].forEach(id => {
  assert(`Η σταθερή ρύθμιση ${id} δεν εμφανίζεται στην έκδοση`, !isVisible(fieldWrapper(id)));
});
assert('Ο συντελεστής Φ.Π.Α. τιμολογίου παραμένει διαθέσιμος στην έκδοση', isVisible(fieldWrapper('vatRate')));

app.querySelector('[data-view-target="home"]').click();
assert('Επιστροφή στην αρχική', !app.getElementById('landing-view')?.hidden && app.getElementById('application-view')?.hidden);

cards[1].click();
assertEqual('Ενεργή προβολή ρυθμίσεων υπηρεσίας', app.querySelector('.workspace')?.dataset.activeView, 'service');
['department', 'chapterCode', 'vatRegistration', 'serviceAddress', 'servicePostalCode', 'revenueAccount', 'vatRate', 'signatoryName'].forEach(id => {
  assert(`Η ρύθμιση ${id} εμφανίζεται στις ρυθμίσεις υπηρεσίας`, isVisible(fieldWrapper(id)));
});
['invoiceNumber', 'issueDate', 'debtorName', 'netAmount', 'signDate'].forEach(id => {
  assert(`Το πεδίο τιμολογίου ${id} δεν εμφανίζεται στις ρυθμίσεις υπηρεσίας`, !isVisible(fieldWrapper(id)));
});
app.querySelector('[data-view-target="home"]').click();
assert('Επιστροφή από ρυθμίσεις υπηρεσίας', !app.getElementById('landing-view')?.hidden && app.getElementById('application-view')?.hidden);

cards[2].click();
assertEqual('Ενεργή προβολή πελατών', app.querySelector('.workspace')?.dataset.activeView, 'customers');
assert('Πάνελ πελατών υπάρχει', app.querySelector('.customers-panel'));
app.querySelector('[data-view-target="home"]').click();
assert('Επιστροφή από πελάτες', !app.getElementById('landing-view')?.hidden && app.getElementById('application-view')?.hidden);

cards[3].click();
assertEqual('Ενεργή προβολή αρχείου τιμολογίων', app.querySelector('.workspace')?.dataset.activeView, 'archive');
assert('Πάνελ αρχείου τιμολογίων υπάρχει', app.querySelector('.invoice-archive-panel'));
app.querySelector('[data-view-target="home"]').click();
assert('Επιστροφή από αρχείο τιμολογίων', !app.getElementById('landing-view')?.hidden && app.getElementById('application-view')?.hidden);

cards[4].click();
assertEqual('Ενεργή προβολή τιμολογίου', app.querySelector('.workspace')?.dataset.activeView, 'preview');
assert('Η προεπισκόπηση υπάρχει', app.getElementById('invoice-preview'));
assert('Η προεπισκόπηση εμφανίζεται μόνο στην προβολή τιμολογίου', isVisible(app.querySelector('.preview-panel')));
app.querySelector('[data-view-target="home"]').click();
assert('Επιστροφή από προβολή τιμολογίου', !app.getElementById('landing-view')?.hidden && app.getElementById('application-view')?.hidden);

app.getElementById('page-settings').click();
assert('Ο διάλογος ρυθμίσεων ανοίγει', app.getElementById('page-settings-dialog')?.open);
assert('Ο διάλογος ρυθμίσεων έχει επιλογές εμφάνισης', app.getElementById('page-color-theme') && app.getElementById('page-font-size') && app.getElementById('page-font-family'));
app.getElementById('page-color-theme').value = 'teal';
app.getElementById('page-color-theme').dispatchEvent(new Event('change', { bubbles: true }));
assert('Η επιλογή χρώματος εφαρμόζεται άμεσα', app.body.classList.contains('page-theme-teal'));
app.getElementById('page-font-size').value = 'large';
app.getElementById('page-font-size').dispatchEvent(new Event('change', { bubbles: true }));
assert('Το μέγεθος γραμμάτων εφαρμόζεται άμεσα', app.body.classList.contains('page-font-large'));
app.getElementById('page-font-family').value = 'serif';
app.getElementById('page-font-family').dispatchEvent(new Event('change', { bubbles: true }));
assert('Η γραμματοσειρά εφαρμόζεται άμεσα', app.body.classList.contains('page-font-serif'));
app.getElementById('reset-page-appearance').click();
assert('Η επαναφορά αφαιρεί τις ρυθμίσεις εμφάνισης', !app.body.classList.contains('page-theme-teal') && !app.body.classList.contains('page-font-large') && !app.body.classList.contains('page-font-serif'));
app.getElementById('page-settings-dialog')?.close();
assert('Η εστίαση επιστρέφει στις ρυθμίσεις σελίδας', app.activeElement === app.getElementById('page-settings'));

frame.remove();
