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
      if (app?.querySelector('.customers-panel') && app.querySelector('.invoice-archive-panel') && app.querySelector('.overlay-debtor-name')) {
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
const servicePreviewOutputs = new Set([
  'department',
  'chapterCode',
  'vatRegistration',
  'serviceAddress',
  'servicePostalCode',
  'revenueAccount'
]);

function outputText(key) {
  return app.querySelector(`#invoice-preview [data-output="${key}"]`)?.textContent ?? '';
}

function assertServiceOnlyPreview(context) {
  [...app.querySelectorAll('#invoice-preview [data-output]')].forEach(output => {
    const key = output.dataset.output;
    if (servicePreviewOutputs.has(key)) return;
    assertEqual(`${context}: ${key} remains blank`, output.textContent, '');
  });
  servicePreviewOutputs.forEach(key => {
    assertEqual(`${context}: ${key} follows the saved service field`, outputText(key), app.getElementById(key)?.value.trim() ?? '');
  });
}

assertEqual('Footer developer link text', app.querySelector('.app-footer a')?.textContent.trim(), 'Developed by Markellos Markides');
assertEqual('Footer developer link href', app.querySelector('.app-footer a')?.href, 'https://markellosecosystem.com/');
assertEqual('Footer developer link opens a new tab', app.querySelector('.app-footer a')?.target, '_blank');
assertEqual('Footer developer link uses safe rel', app.querySelector('.app-footer a')?.rel, 'noopener noreferrer');
assert('Footer developer link has an accessible name', app.querySelector('.app-footer a')?.getAttribute('aria-label')?.includes('Developed by Markellos Markides'));
assert('Footer includes the Cyprus Republic copyright', app.querySelector('.app-footer')?.textContent.includes('© 2026 Κυπριακή Δημοκρατία'));
['Δήλωση Απορρήτου', 'Πολιτική Cookies', 'Δήλωση Προσβασιμότητας', 'Νομική Σημείωση / Όροι Χρήσης'].forEach(linkText => {
  assert(`Footer includes ${linkText}`, [...app.querySelectorAll('.footer-links a')].some(link => link.textContent.trim() === linkText));
});
assert('Footer does not show cookie settings when no optional cookies are used', ![...app.querySelectorAll('.footer-links a')].some(link => link.textContent.trim() === 'Ρυθμίσεις Cookies'));
assertEqual('Footer is fixed', app.defaultView.getComputedStyle(app.querySelector('.app-footer')).position, 'fixed');
assertEqual('Footer uses a white background', app.defaultView.getComputedStyle(app.querySelector('.app-footer')).backgroundColor, 'rgb(255, 255, 255)');
assert('Η εφαρμογή είναι ορατή στην εκκίνηση', !app.getElementById('application-view')?.hidden);
assertEqual('Η αρχική κατάσταση είναι το shell', app.querySelector('.workspace')?.dataset.activeView, 'home');
assert('Η αριστερή πλοήγηση είναι ορατή', isVisible(app.getElementById('landing-view')));
assert('Η πρόσθετη στήλη είναι αρχικά κρυμμένη', !isVisible(app.querySelector('.editor-panel')));
assert('Η προεπισκόπηση είναι ορατή στην αρχική', isVisible(app.querySelector('.preview-panel')));
assert('Το έντυπο υπάρχει στην αρχική', isVisible(app.getElementById('invoice-preview')));
assertServiceOnlyPreview('Initial A4 preview');

const cards = [...app.querySelectorAll('.nav-card')];
assert('Κανένα βασικό κουμπί δεν είναι ενεργό στην αρχική', cards.every(card => !card.hasAttribute('aria-current')));
assertEqual('Πλήθος κουμπιών πλοήγησης', cards.length, 5);
assertEqual('Κουμπί 1', cards[0]?.textContent.trim(), 'Αύξων Αριθμός Τιμολογίου');
assertEqual('Κουμπί 2', cards[1]?.textContent.trim(), 'Στοιχεία Τμήματος / Υπηρεσίας');
assertEqual('Κουμπί 3', cards[2]?.textContent.trim(), 'Στοιχεία Οφειλέτη / Πελάτη');
assertEqual('Κουμπί 4', cards[3]?.textContent.trim(), 'Αρχείο Οφειλετών / Πελατών');
assertEqual('Κουμπί 5', cards[4]?.textContent.trim(), 'Αρχείο Τιμολογίων');
assert('Τα στοιχεία πλοήγησης είναι κουμπιά', cards.every(card => card.tagName === 'BUTTON' && card.type === 'button'));
assert('Δεν υπάρχει πλέον η καρτέλα Έκδοση Τιμολογίου', !cards.some(card => card.textContent.trim() === 'Έκδοση Τιμολογίου'));
assert('Δεν υπάρχει κουμπί προβολής τιμολογίου', !cards.some(card => card.dataset.viewTarget === 'preview'));
assert('Δεν υπάρχει μήνυμα καλωσορίσματος', !app.body.textContent.includes('Καλωσήρθατε'));
assert('Δεν υπάρχουν dashboard στοιχεία στην αρχική', !app.querySelector('canvas, [class*="chart"], [class*="stat"], [class*="kpi"]'));

const actions = [...app.querySelectorAll('.invoice-actions button')];
assertEqual('Πλήθος κουμπιών ενεργειών πάνω από το έντυπο', actions.length, 3);
assertEqual('Ενέργεια 1', actions[0]?.id, 'clear-form');
assertEqual('Ενέργεια 2', actions[1]?.id, 'print-form');
assertEqual('Ενέργεια 3', actions[2]?.id, 'download-pdf');
assert('Τα κουμπιά ενεργειών είναι ακριβώς πριν από το έντυπο', app.querySelector('.preview-panel .invoice-actions')?.nextElementSibling?.id === 'preview-title' && app.getElementById('preview-title')?.nextElementSibling?.id === 'invoice-preview');
assert('Ο τίτλος προεπισκόπησης δεν μπαίνει οπτικά ανάμεσα στα κουμπιά και το έντυπο', app.defaultView.getComputedStyle(app.getElementById('preview-title')).display === 'none');

const previewRect = app.getElementById('invoice-preview').getBoundingClientRect();
assert('Το έντυπο διατηρεί αναλογία Α4', Math.abs((previewRect.width / previewRect.height) - (210 / 297)) < 0.02);

cards[0].click();
assertEqual('Ενεργή προβολή αρίθμησης', app.querySelector('.workspace')?.dataset.activeView, 'numbering');
assert('Η πρόσθετη στήλη ανοίγει στην αρίθμηση', isVisible(app.querySelector('.editor-panel')));
assert('Το ενεργό βασικό κουμπί επισημαίνεται', cards[0].getAttribute('aria-current') === 'page');
assert('Η αρίθμηση κρατά ορατή την προεπισκόπηση', isVisible(app.querySelector('.preview-panel')));
assert('Τα IDs ενεργειών διατηρούνται', app.getElementById('clear-form') && app.getElementById('print-form') && app.getElementById('download-pdf'));
assertServiceOnlyPreview('Numbering tab before invoice input');
assertEqual('Ο πρώτος επόμενος αριθμός είναι 00001', app.getElementById('next-invoice-number')?.textContent.trim(), '00001');
assert('Ο αριθμός τιμολογίου είναι μόνο για ανάγνωση', app.getElementById('invoiceNumber')?.readOnly);
assert('Ο αύξων αριθμός δεν εμφανίζεται στο Α4 πριν την καταχώριση', outputText('invoiceNumber') === '');
assert('Το πεδίο αύξοντα αριθμού εμφανίζεται στην αρίθμηση', isVisible(fieldWrapper('invoiceNumber')));
['debtorName', 'netAmount', 'vatRate', 'signDate'].forEach(id => {
  assert(`Το πεδίο ${id} δεν εμφανίζεται στην αρίθμηση`, !isVisible(fieldWrapper(id)));
});
assert('Ο συντελεστής Φ.Π.Α. δεν έχει αποθήκευση προτύπου υπηρεσίας', !app.getElementById('vatRate')?.hasAttribute('data-template-key') && !fieldWrapper('vatRate')?.querySelector('.template-controls'));
cards[0].click();
assertEqual('Δεύτερο πάτημα στο ενεργό κουμπί κλείνει τη στήλη', app.querySelector('.workspace')?.dataset.activeView, 'home');
assert('Η πρόσθετη στήλη κρύβεται μετά το δεύτερο πάτημα', !isVisible(app.querySelector('.editor-panel')));
cards[0].click();

cards[1].click();
assertEqual('Ενεργή προβολή στοιχείων υπηρεσίας', app.querySelector('.workspace')?.dataset.activeView, 'service');
assertServiceOnlyPreview('Service tab before invoice input');
['department', 'chapterCode', 'vatRegistration', 'serviceAddress', 'servicePostalCode', 'revenueAccount', 'signatoryName'].forEach(id => {
  assert(`Η ρύθμιση ${id} εμφανίζεται στα στοιχεία υπηρεσίας`, isVisible(fieldWrapper(id)));
});
['invoiceNumber', 'issueDate', 'debtorName', 'netAmount', 'vatRate', 'signDate'].forEach(id => {
  assert(`Το πεδίο τιμολογίου ${id} δεν εμφανίζεται στα στοιχεία υπηρεσίας`, !isVisible(fieldWrapper(id)));
});

cards[2].click();
assertEqual('Ενεργή προβολή στοιχείων οφειλέτη', app.querySelector('.workspace')?.dataset.activeView, 'debtor');
assert('Τα στοιχεία οφειλέτη είναι αρχικά διαθέσιμα', isVisible(fieldWrapper('debtorName')));
assert('Ο αύξων αριθμός δεν εμφανίζεται στα στοιχεία οφειλέτη', !isVisible(fieldWrapper('invoiceNumber')));
assert('Η επιλογή οφειλέτη για το τρέχον τιμολόγιο υπάρχει', isVisible(app.getElementById('currentCustomerSelect')?.closest('.field')));
assertServiceOnlyPreview('Debtor tab before invoice input');

cards[3].click();
assertEqual('Ενεργή προβολή πελατών', app.querySelector('.workspace')?.dataset.activeView, 'customers');
assert('Πάνελ πελατών υπάρχει', isVisible(app.querySelector('.customers-panel')));
assertServiceOnlyPreview('Customers tab before invoice input');

cards[4].click();
assertEqual('Ενεργή προβολή αρχείου τιμολογίων', app.querySelector('.workspace')?.dataset.activeView, 'archive');
assert('Πάνελ αρχείου τιμολογίων υπάρχει', isVisible(app.querySelector('.invoice-archive-panel')));
assertServiceOnlyPreview('Archive tab before invoice input');
app.querySelector('[data-view-close]').click();
assertEqual('Το x κλείνει την πρόσθετη στήλη', app.querySelector('.workspace')?.dataset.activeView, 'home');
assert('Κανένα βασικό κουμπί δεν μένει ενεργό μετά το x', cards.every(card => !card.hasAttribute('aria-current')));
assertServiceOnlyPreview('Home after closing tabs before invoice input');

cards[2].click();
app.getElementById('debtorName').value = 'SUN TOWER PLAZA LTD';
app.getElementById('debtorName').dispatchEvent(new Event('input', { bubbles: true }));
assertEqual('Debtor input starts filling the A4 preview', outputText('debtorName'), 'SUN TOWER PLAZA LTD');
app.querySelector('[data-view-close]').click();

app.getElementById('page-settings').click();
assert('Ο διάλογος ρυθμίσεων ανοίγει', app.getElementById('page-settings-dialog')?.open);
assert('Ο διάλογος ρυθμίσεων έχει επιλογές εμφάνισης', app.getElementById('page-color-theme') && app.getElementById('page-font-size') && app.getElementById('page-font-family'));
app.getElementById('page-color-theme').value = 'teal';
app.getElementById('page-color-theme').dispatchEvent(new Event('change', { bubbles: true }));
assert('Η επιλογή χρώματος εφαρμόζεται άμεσα', app.body.classList.contains('page-theme-teal'));
app.getElementById('reset-page-appearance').click();
assert('Η επαναφορά αφαιρεί τις ρυθμίσεις εμφάνισης', !app.body.classList.contains('page-theme-teal'));
app.getElementById('page-settings-dialog')?.close();
assert('Η εστίαση επιστρέφει στις ρυθμίσεις σελίδας', app.activeElement === app.getElementById('page-settings'));

frame.remove();
