import { APP_VERSION, BUILD_TIMESTAMP, COMMIT_HASH, APP_VERSION_LABEL } from '../src/config/version.js';

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

function loadAppFrame(width = 1366, height = 900) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.position = 'absolute';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = `${width}px`;
    frame.style.height = `${height}px`;
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

localStorage.clear();

const frame = await loadAppFrame();
const app = frame.contentDocument;
app.defaultView.confirm = () => true;

function isVisible(element) {
  if (!element) return false;

  for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
    const style = app.defaultView.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }

  return true;
}

function fieldWrapper(id) {
  return app.getElementById(id)?.closest('.field, .invoice-number-card');
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
const reservedPreviewOutputs = new Set(['invoiceNumber', 'fullInvoiceIdentifier']);

function outputText(key) {
  return app.querySelector(`#invoice-preview [data-output="${key}"]`)?.textContent ?? '';
}

function waitForCondition(description, predicate) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    function check() {
      if (predicate()) {
        resolve();
        return;
      }

      if (Date.now() - started > 3000) {
        reject(new Error(description));
        return;
      }

      setTimeout(check, 50);
    }

    check();
  });
}

function assertServiceOnlyPreview(context) {
  [...app.querySelectorAll('#invoice-preview [data-output]')].forEach(output => {
    const key = output.dataset.output;
    if (servicePreviewOutputs.has(key)) return;
    if (reservedPreviewOutputs.has(key)) return;
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
const footer = app.querySelector('.app-footer');
const footerStyle = app.defaultView.getComputedStyle(footer);
const footerRect = footer.getBoundingClientRect();
const mainStyle = app.defaultView.getComputedStyle(app.querySelector('main'));
const footerCreditsRect = app.querySelector('.footer-credits').getBoundingClientRect();
const footerLinksRect = app.querySelector('.footer-links').getBoundingClientRect();
const versionRect = app.getElementById('app-version').getBoundingClientRect();
const viewportCenter = app.documentElement.clientWidth / 2;
assertEqual('Footer is fixed to the viewport', footerStyle.position, 'fixed');
assertEqual('Footer is anchored to the bottom edge', footerStyle.bottom, '0px');
assertEqual('Footer is anchored to the left edge', footerStyle.left, '0px');
assertEqual('Footer is anchored to the right edge', footerStyle.right, '0px');
assert('Footer spans the available viewport width', Math.abs(footerRect.width - app.documentElement.clientWidth) <= 1);
assert('Footer uses a z-index above page content', Number(footerStyle.zIndex) >= 30);
assert('Footer is compact on desktop', footerRect.height >= 44 && footerRect.height <= 56);
assert('Main layout reserves at least the footer height', parseFloat(mainStyle.paddingBottom) >= footerRect.height);
assert('Footer credits are geometrically centered in the viewport', Math.abs((footerCreditsRect.left + footerCreditsRect.width / 2) - viewportCenter) <= 2);
assert('Footer legal links are geometrically centered in the viewport', Math.abs((footerLinksRect.left + footerLinksRect.width / 2) - viewportCenter) <= 2);
assert(
  'Footer centered content stays clear of the version column',
  Math.max(footerCreditsRect.right, footerLinksRect.right) <= versionRect.left ||
    Math.min(footerCreditsRect.left, footerLinksRect.left) >= versionRect.right ||
    Math.max(footerCreditsRect.bottom, footerLinksRect.bottom) <= versionRect.top ||
    Math.min(footerCreditsRect.top, footerLinksRect.top) >= versionRect.bottom
);
assert('Footer version is pinned at the far right', footerRect.right - versionRect.right <= 32);
assert('Footer version is lower contrast than the main footer text', footerStyle.color !== app.defaultView.getComputedStyle(app.getElementById('app-version')).color);
assertEqual('Footer uses a white background', footerStyle.backgroundColor, 'rgb(255, 255, 255)');
assertEqual('Footer version element exists once', app.querySelectorAll('#app-version').length, 1);
assert('Footer contains the application version', app.getElementById('app-version')?.textContent.includes(APP_VERSION));
assert('Footer contains the build timestamp', app.getElementById('app-version')?.textContent.includes(BUILD_TIMESTAMP));
assertEqual('Footer uses dev as the temporary uncommitted commit marker', COMMIT_HASH, 'dev');
assert('Footer contains the temporary commit marker', app.getElementById('app-version')?.textContent.includes(COMMIT_HASH));
assertEqual('Footer version text uses the fixed release label', app.getElementById('app-version')?.textContent.trim(), APP_VERSION_LABEL);
assert('Footer version is excluded from print output', app.getElementById('app-version')?.closest('.no-print'));
assert('Η εφαρμογή είναι ορατή στην εκκίνηση', !app.getElementById('application-view')?.hidden);
assertEqual('Η αρχική κατάσταση είναι το shell', app.querySelector('.workspace')?.dataset.activeView, 'home');
assert('Η αριστερή πλοήγηση είναι ορατή', isVisible(app.getElementById('landing-view')));
assert('Η πρόσθετη στήλη είναι αρχικά κρυμμένη', !isVisible(app.querySelector('.editor-panel')));
assert('Η προεπισκόπηση είναι ορατή στην αρχική', isVisible(app.querySelector('.preview-panel')));
assert('Το έντυπο υπάρχει στην αρχική', isVisible(app.getElementById('invoice-preview')));
assertServiceOnlyPreview('Initial A4 preview');

const cards = [...app.querySelectorAll('.nav-card')];
assert('Κανένα βασικό κουμπί δεν είναι ενεργό στην αρχική', cards.every(card => !card.hasAttribute('aria-current')));
assertEqual('Πλήθος κουμπιών πλοήγησης', cards.length, 6);
assertEqual('Κουμπί 1', cards[0]?.textContent.trim(), 'Αριθμός και Ημερομηνία Τιμολογίου');
assertEqual('Κουμπί 2', cards[1]?.textContent.trim(), 'Στοιχεία Τμήματος / Υπηρεσίας');
assertEqual('Κουμπί 3', cards[2]?.textContent.trim(), 'Στοιχεία Οφειλέτη / Πελάτη');
assertEqual('Κουμπί 4', cards[3]?.textContent.trim(), 'Στοιχεία Χρέωσης / Φ.Π.Α.');
assertEqual('Κουμπί 5', cards[4]?.textContent.trim(), 'Αρχείο Οφειλετών / Πελατών');
assertEqual('Κουμπί 6', cards[5]?.textContent.trim(), 'Αρχείο Τιμολογίων');
assert('Τα στοιχεία πλοήγησης είναι κουμπιά', cards.every(card => card.tagName === 'BUTTON' && card.type === 'button'));
assert('Δεν υπάρχει πλέον η καρτέλα Έκδοση Τιμολογίου', !cards.some(card => card.textContent.trim() === 'Έκδοση Τιμολογίου'));
assert('Δεν υπάρχει κουμπί προβολής τιμολογίου', !cards.some(card => card.dataset.viewTarget === 'preview'));
assert('Δεν υπάρχει μήνυμα καλωσορίσματος', !app.body.textContent.includes('Καλωσήρθατε'));
assert('Δεν υπάρχουν dashboard στοιχεία στην αρχική', !app.querySelector('canvas, [class*="chart"], [class*="stat"], [class*="kpi"]'));

const actions = [...app.querySelectorAll('.invoice-actions button')];
assertEqual('Πλήθος κουμπιών ενεργειών πάνω από το έντυπο', actions.length, 5);
assertEqual('Ενέργεια 1', actions[0]?.id, 'clear-form');
assertEqual('Ενέργεια 2', actions[1]?.id, 'cancel-invoice');
assertEqual('Ενέργεια 3', actions[2]?.id, 'register-invoice');
assertEqual('Ενέργεια 4', actions[3]?.id, 'print-form');
assertEqual('Ενέργεια 5', actions[4]?.id, 'download-pdf');
assertEqual('Το κουμπί οριστικοποίησης εμφανίζει δύο γραμμές κειμένου', app.getElementById('register-invoice')?.querySelectorAll('span').length, 2);
assertEqual('Πρώτη γραμμή οριστικοποίησης', app.getElementById('register-invoice')?.querySelectorAll('span')[0]?.textContent.trim(), 'Οριστικοποίηση Τιμολογίου');
assertEqual('Δεύτερη γραμμή οριστικοποίησης', app.getElementById('register-invoice')?.querySelectorAll('span')[1]?.textContent.trim(), 'και Καταχώρηση στο Αρχείο Τιμολογίων');
assertEqual('Το κουμπί οριστικοποίησης υπάρχει μία φορά', app.querySelectorAll('#register-invoice').length, 1);
assert('Το κουμπί οριστικοποίησης είναι πράσινο με λευκό κείμενο', app.defaultView.getComputedStyle(app.getElementById('register-invoice')).backgroundColor === 'rgb(25, 135, 84)' && app.defaultView.getComputedStyle(app.getElementById('register-invoice')).color === 'rgb(255, 255, 255)');
assert('Τα κουμπιά ενεργειών είναι ακριβώς πριν από το έντυπο', app.querySelector('.preview-panel .invoice-actions')?.nextElementSibling?.id === 'preview-title' && app.getElementById('preview-title')?.nextElementSibling?.id === 'invoice-preview');
assert('Ο τίτλος προεπισκόπησης δεν μπαίνει οπτικά ανάμεσα στα κουμπιά και το έντυπο', app.defaultView.getComputedStyle(app.getElementById('preview-title')).display === 'none');

const previewRect = app.getElementById('invoice-preview').getBoundingClientRect();
assert('Το έντυπο διατηρεί αναλογία Α4', Math.abs((previewRect.width / previewRect.height) - (210 / 297)) < 0.02);

cards[0].click();
assertEqual('Ενεργή προβολή αρίθμησης', app.querySelector('.workspace')?.dataset.activeView, 'numbering');
await waitForCondition('Ο δεσμευμένος αριθμός δεν εμφανίστηκε στο προσχέδιο.', () => app.getElementById('invoiceNumber')?.value === '00001');
assert('Η πρόσθετη στήλη ανοίγει στην αρίθμηση', isVisible(app.querySelector('.editor-panel')));
assert('Το ενεργό βασικό κουμπί επισημαίνεται', cards[0].getAttribute('aria-current') === 'page');
assert('Η αρίθμηση κρατά ορατή την προεπισκόπηση', isVisible(app.querySelector('.preview-panel')));
assert('Τα IDs ενεργειών διατηρούνται', app.getElementById('clear-form') && app.getElementById('cancel-invoice') && app.getElementById('register-invoice') && app.getElementById('print-form') && app.getElementById('download-pdf'));
assertServiceOnlyPreview('Numbering tab before invoice input');
assertEqual('Ο πρώτος δεσμευμένος αριθμός είναι ΜΜ/00001', app.getElementById('next-invoice-number')?.textContent.trim(), 'ΜΜ/00001');
assertEqual('Η κατάσταση αριθμού δείχνει προσχέδιο', app.getElementById('invoice-number-status')?.textContent.trim(), 'ΠΡΟΣΧΕΔΙΟ / ΔΕΣΜΕΥΜΕΝΟ');
assertEqual('Η ένδειξη πάνω από το έντυπο δείχνει τον ενεργό σύντομο αριθμό', app.getElementById('active-invoice-status-number')?.textContent.trim(), 'ΜΜ/00001');
assertEqual('Η ένδειξη πάνω από το έντυπο δείχνει badge προσχεδίου', app.getElementById('active-invoice-status-badge')?.textContent.trim(), 'ΠΡΟΣΧΕΔΙΟ / ΔΕΣΜΕΥΜΕΝΟ');
assert('Το badge προσχεδίου έχει την κατάλληλη class', app.getElementById('active-invoice-status-badge')?.classList.contains('invoice-status-reserved'));
assert('Ο αριθμός τιμολογίου είναι μόνο για ανάγνωση', app.getElementById('invoiceNumber')?.readOnly);
assertEqual('Το πεδίο αριθμού τιμολογίου έχει δεσμευμένο αριθμό πριν την καταχώριση', app.getElementById('invoiceNumber')?.value, '00001');
assertEqual('Το πεδίο αριθμού τιμολογίου δείχνει placeholder δέσμευσης', app.getElementById('invoiceNumber')?.placeholder, 'Δεσμεύεται αυτόματα');
assert('Η εκδούσα μονάδα κλειδώνει όσο υπάρχει ενεργό δεσμευμένο draft', app.getElementById('issuerUnitCode')?.readOnly);
assert('Το serviceId κλειδώνει όσο υπάρχει ενεργό δεσμευμένο draft', app.getElementById('serviceId')?.readOnly);
assert('Δεν υπάρχει ξεχωριστή ένδειξη τρέχοντος αριθμού τιμολογίου', !app.getElementById('current-invoice-number'));
assert('Το πεδίο αριθμού τιμολογίου δεν εμφανίζει 00000 πριν την καταχώριση', app.getElementById('invoiceNumber')?.value !== '00000');
assert('Η παλιά ένδειξη Στοιχεία έκδοσης δεν εμφανίζεται στην αρίθμηση', ![...app.querySelectorAll('legend')].some(legend => isVisible(legend) && legend.textContent.trim() === 'Στοιχεία έκδοσης'));
assertEqual('Ο σύντομος δεσμευμένος αριθμός εμφανίζεται στο Α4 πριν την καταχώριση', outputText('invoiceNumber'), 'ΜΜ/00001');
assertEqual('Ο πλήρης δεσμευμένος κωδικός εμφανίζεται στο Α4 πριν την καταχώριση', outputText('fullInvoiceIdentifier'), 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΜΜ / 00001');
assert('Το πεδίο αύξοντα αριθμού εμφανίζεται στην αρίθμηση', isVisible(fieldWrapper('invoiceNumber')));
const nextNumberCard = app.querySelector('.numbering-summary div');
const invoiceNumberCard = fieldWrapper('invoiceNumber');
const nextNumberStyle = app.defaultView.getComputedStyle(nextNumberCard);
const invoiceNumberStyle = app.defaultView.getComputedStyle(invoiceNumberCard);
['backgroundColor', 'borderTopColor', 'borderTopStyle', 'borderTopWidth', 'borderRadius', 'paddingTop'].forEach(property => {
  assertEqual(`Η κάρτα αριθμού τιμολογίου ταιριάζει οπτικά: ${property}`, invoiceNumberStyle[property], nextNumberStyle[property]);
});
['debtorName', 'netAmount', 'vatRate', 'signDate'].forEach(id => {
  assert(`Το πεδίο ${id} δεν εμφανίζεται στην αρίθμηση`, !isVisible(fieldWrapper(id)));
});
assert('Ο συντελεστής Φ.Π.Α. δεν έχει αποθήκευση προτύπου υπηρεσίας', !app.getElementById('vatRate')?.hasAttribute('data-template-key') && !fieldWrapper('vatRate')?.querySelector('.template-controls'));
assert('Η ημερομηνία έκδοσης εμφανίζεται στην αρίθμηση', isVisible(fieldWrapper('issueDate')));
['department', 'serviceId', 'issuerUnitCode', 'chapterCode', 'vatRegistration', 'serviceAddress', 'employeeName', 'employeeCode'].forEach(id => {
  assert(`Το υπηρεσιακό πεδίο ${id} δεν εμφανίζεται στην αρίθμηση`, !isVisible(fieldWrapper(id)));
});
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
assertEqual('Ενεργή προβολή στοιχείων χρέωσης', app.querySelector('.workspace')?.dataset.activeView, 'charge');
['description', 'billingPeriod', 'netAmount', 'vatRate', 'vatAmount', 'grossAmount', 'paymentType'].forEach(id => {
  assert(`Το πεδίο ${id} εμφανίζεται στα στοιχεία χρέωσης`, isVisible(fieldWrapper(id)));
});
['invoiceNumber', 'issueDate', 'debtorName', 'signDate'].forEach(id => {
  assert(`Το πεδίο ${id} δεν εμφανίζεται στα στοιχεία χρέωσης`, !isVisible(fieldWrapper(id)));
});
assert('Το ποσό Φ.Π.Α. είναι μόνο για ανάγνωση', app.getElementById('vatAmount')?.readOnly);
assert('Το συνολικό ποσό είναι μόνο για ανάγνωση', app.getElementById('grossAmount')?.readOnly);
app.getElementById('netAmount').value = '100';
app.getElementById('netAmount').dispatchEvent(new Event('input', { bubbles: true }));
assertEqual('Ο αυτόματος υπολογισμός εμφανίζει ποσό Φ.Π.Α.', app.getElementById('vatAmount')?.value, '19.00');
assertEqual('Ο αυτόματος υπολογισμός εμφανίζει συνολικό ποσό', app.getElementById('grossAmount')?.value, '119.00');
assertEqual('Η προεπισκόπηση ενημερώνει τον καθαρό αριθμό', outputText('netEuros'), '100');
assertEqual('Η προεπισκόπηση ενημερώνει τον Φ.Π.Α.', outputText('vatEuros'), '19');
assertEqual('Η προεπισκόπηση ενημερώνει το σύνολο', outputText('grossEuros'), '119');

cards[4].click();
assertEqual('Ενεργή προβολή πελατών', app.querySelector('.workspace')?.dataset.activeView, 'customers');
assert('Πάνελ πελατών υπάρχει', isVisible(app.querySelector('.customers-panel')));
assertServiceOnlyPreview('Customers tab before invoice input');

cards[5].click();
assertEqual('Ενεργή προβολή αρχείου τιμολογίων', app.querySelector('.workspace')?.dataset.activeView, 'archive');
assert('Πάνελ αρχείου τιμολογίων υπάρχει', isVisible(app.querySelector('.invoice-archive-panel')));
assertServiceOnlyPreview('Archive tab before invoice input');
assert('Το κουμπί οριστικοποίησης δεν βρίσκεται πλέον στην καρτέλα αρχείου', !app.querySelector('.invoice-archive-panel #register-invoice'));
assert('Οι λειτουργίες εξαγωγής και επαναφοράς παραμένουν στην καρτέλα αρχείου', ['Λήψη του αρχείου μου', 'Λήψη αναφοράς CSV', 'Επαναφορά προσωπικού αρχείου'].every(text => [...app.querySelectorAll('.invoice-archive-panel button')].some(button => button.textContent.trim() === text)));
assertEqual('Footer version remains present after navigation', app.getElementById('app-version')?.textContent.trim(), APP_VERSION_LABEL);
app.querySelector('[data-view-close]').click();
assertEqual('Το x κλείνει την πρόσθετη στήλη', app.querySelector('.workspace')?.dataset.activeView, 'home');
assert('Κανένα βασικό κουμπί δεν μένει ενεργό μετά το x', cards.every(card => !card.hasAttribute('aria-current')));
assertServiceOnlyPreview('Home after closing tabs before invoice input');

cards[2].click();
app.getElementById('debtorName').value = 'SUN TOWER PLAZA LTD';
app.getElementById('debtorName').dispatchEvent(new Event('input', { bubbles: true }));
assertEqual('Debtor input starts filling the A4 preview', outputText('debtorName'), 'SUN TOWER PLAZA LTD');
assertEqual('Το Α4 εμφανίζει τον δεσμευμένο σύντομο κωδικό πριν την καταχώριση', outputText('invoiceNumber'), 'ΜΜ/00001');
assertEqual('Το Α4 εμφανίζει τον δεσμευμένο πλήρη κωδικό πριν την καταχώριση', outputText('fullInvoiceIdentifier'), 'ΥΕΕΒ-ΥΕ-ΚΔΧΚΕ-ΜΜ / 00001');
assertEqual('Το watermark είναι κενό για δεσμευμένο προσχέδιο', outputText('cancelledWatermark'), '');
app.querySelector('[data-view-close]').click();

const expectedEmployeeCode = app.getElementById('employeeCode')?.value.trim().toUpperCase() ?? '';
const expectedIssuerUnitCode = app.getElementById('issuerUnitCode')?.value.trim() ?? '';
app.getElementById('clear-form').click();
assertEqual('Ο καθαρισμός πεδίων διατηρεί τον δεσμευμένο αριθμό', app.getElementById('invoiceNumber')?.value, '00001');
assertEqual('Ο καθαρισμός πεδίων αδειάζει τον οφειλέτη', app.getElementById('debtorName')?.value, '');
assertEqual('Ο καθαρισμός πεδίων επαναφέρει το καθαρό ποσό', app.getElementById('netAmount')?.value, '0.00');
assertEqual('Ο καθαρισμός πεδίων διατηρεί τον κωδικό υπαλλήλου', app.getElementById('employeeCode')?.value.trim().toUpperCase(), expectedEmployeeCode);
assertEqual('Ο καθαρισμός πεδίων διατηρεί την εκδούσα μονάδα', app.getElementById('issuerUnitCode')?.value.trim(), expectedIssuerUnitCode);
assertEqual('Ο καθαρισμός πεδίων διατηρεί τον σύντομο κωδικό στο Α4', outputText('invoiceNumber'), `${expectedEmployeeCode}/00001`);
assertEqual('Ο καθαρισμός πεδίων διατηρεί τον πλήρη κωδικό στο Α4', outputText('fullInvoiceIdentifier'), `${expectedIssuerUnitCode}-${expectedEmployeeCode} / 00001`);

app.getElementById('debtorName').value = 'SUN TOWER PLAZA LTD';
app.getElementById('debtorName').dispatchEvent(new Event('input', { bubbles: true }));
app.getElementById('netAmount').value = '100';
app.getElementById('netAmount').dispatchEvent(new Event('input', { bubbles: true }));
app.getElementById('cancel-invoice').click();
await waitForCondition('Η ακύρωση δεν απέδωσε νέο δεσμευμένο αριθμό.', () => app.getElementById('invoiceNumber')?.value === '00002');
assertEqual('Η ακύρωση ξεκινά το επόμενο draft', app.getElementById('invoiceNumber')?.value, '00002');
assertEqual('Η ακύρωση δεν επαναχρησιμοποιεί τον ακυρωμένο σύντομο κωδικό', outputText('invoiceNumber'), `${expectedEmployeeCode}/00002`);
assertEqual('Η ακύρωση δεν επαναχρησιμοποιεί τον ακυρωμένο πλήρη κωδικό', outputText('fullInvoiceIdentifier'), `${expectedIssuerUnitCode}-${expectedEmployeeCode} / 00002`);
assertEqual('Το watermark παραμένει κενό στο νέο draft μετά την ακύρωση', outputText('cancelledWatermark'), '');

cards[5].click();
const registerButton = app.getElementById('register-invoice');
const cancelledRow = [...app.querySelectorAll('.invoice-archive-panel tbody tr')].find(row => row.textContent.includes(`${expectedEmployeeCode} / 00001`) || row.textContent.includes('00001'));
assert('Ο ακυρωμένος αριθμός εμφανίζεται στο αρχείο με badge', cancelledRow?.querySelector('.invoice-status-cancelled')?.textContent.trim() === 'ΑΚΥΡΩΜΕΝΟ / ΑΚΥΡΟ');
assert('Ο ακυρωμένος αριθμός δεν μπορεί να φορτωθεί ή να διαγραφεί', cancelledRow && !cancelledRow.querySelector('[data-action="load"], [data-action="delete"]'));

app.getElementById('debtorName').value = 'SUN TOWER PLAZA LTD';
app.getElementById('debtorName').dispatchEvent(new Event('input', { bubbles: true }));
app.getElementById('netAmount').value = '100';
app.getElementById('netAmount').dispatchEvent(new Event('input', { bubbles: true }));
registerButton.click();
await waitForCondition('Η οριστικοποίηση δεν ενημέρωσε την κατάσταση σε εκδοθέν.', () => app.getElementById('active-invoice-status-badge')?.textContent.trim() === 'ΕΚΔΟΘΕΝ / ΕΓΚΥΡΟ');
assertEqual('Η επιτυχής καταχώριση αποδίδει τον επόμενο μη ακυρωμένο αριθμό στο πεδίο', app.getElementById('invoiceNumber')?.value, '00002');
assertEqual('Το No. εμφανίζει τον σύντομο κωδικό στο Α4', outputText('invoiceNumber'), `${expectedEmployeeCode}/00002`);
assertEqual('Το πάνω αριστερό πεδίο εμφανίζει τον πλήρη κωδικό στο Α4', outputText('fullInvoiceIdentifier'), `${expectedIssuerUnitCode}-${expectedEmployeeCode} / 00002`);
assertEqual('Μετά την καταχώριση παραμένει ο εκδοθείς αριθμός στην ένδειξη', app.getElementById('next-invoice-number')?.textContent.trim(), `${expectedEmployeeCode}/00002`);
assertEqual('Το badge μετά την καταχώριση δείχνει εκδοθέν', app.getElementById('active-invoice-status-badge')?.textContent.trim(), 'ΕΚΔΟΘΕΝ / ΕΓΚΥΡΟ');
assert('Η οριστικοποίηση απενεργοποιείται για εκδοθέν τιμολόγιο', registerButton.disabled);

app.defaultView.print = () => {};
const cancelledRowAfterRegister = [...app.querySelectorAll('.invoice-archive-panel tbody tr')].find(row => row.textContent.includes(`${expectedEmployeeCode} / 00001`) || row.textContent.includes('00001'));
cancelledRowAfterRegister?.querySelector('[data-action="print"]')?.click();
await waitForCondition('Το ακυρωμένο αντίγραφο δεν φορτώθηκε για εκτύπωση.', () => app.getElementById('invoiceNumber')?.value === '00001');
assertEqual('Το ακυρωμένο αντίγραφο εμφανίζει watermark στο Α4', outputText('cancelledWatermark'), 'ΑΚΥΡΩΜΕΝΟ');
assertEqual('Το badge ακυρωμένου αντιγράφου δείχνει ακυρωμένο', app.getElementById('active-invoice-status-badge')?.textContent.trim(), 'ΑΚΥΡΩΜΕΝΟ / ΑΚΥΡΟ');
assert('Η οριστικοποίηση είναι απενεργοποιημένη για ακυρωμένο αντίγραφο', registerButton.disabled);
assert('Ο καθαρισμός είναι απενεργοποιημένος για ακυρωμένο αντίγραφο', app.getElementById('clear-form')?.disabled);

app.querySelector('.invoice-archive-panel [data-action="load"]').click();
await waitForCondition('Η φόρτωση αρχειοθετημένου τιμολογίου δεν ολοκληρώθηκε.', () => app.getElementById('invoiceNumber')?.value === '00002');
assertEqual('Η φόρτωση αρχειοθετημένου τιμολογίου εμφανίζει τον αποθηκευμένο αριθμό', app.getElementById('invoiceNumber')?.value, '00002');
assertEqual('Η φόρτωση αρχειοθετημένου τιμολογίου εμφανίζει τον σύντομο κωδικό στο Α4', outputText('invoiceNumber'), `${expectedEmployeeCode}/00002`);
assertEqual('Η φόρτωση αρχειοθετημένου τιμολογίου εμφανίζει τον πλήρη κωδικό στο Α4', outputText('fullInvoiceIdentifier'), `${expectedIssuerUnitCode}-${expectedEmployeeCode} / 00002`);
assertEqual('Το watermark είναι κενό για εκδοθέν τιμολόγιο', outputText('cancelledWatermark'), '');
assert('Η οριστικοποίηση παραμένει απενεργοποιημένη μετά τη φόρτωση εκδοθέντος', registerButton.disabled);
app.querySelector('[data-view-close]').click();

frame.contentWindow.focus();
app.getElementById('page-settings').focus();
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

localStorage.clear();
const mobileFrame = await loadAppFrame(390, 720);
const mobileApp = mobileFrame.contentDocument;
const mobileFooter = mobileApp.querySelector('.app-footer');
const mobileFooterStyle = mobileApp.defaultView.getComputedStyle(mobileFooter);
const mobileFooterRect = mobileFooter.getBoundingClientRect();
const mobileMainStyle = mobileApp.defaultView.getComputedStyle(mobileApp.querySelector('main'));
const mobileCreditsRect = mobileApp.querySelector('.footer-credits').getBoundingClientRect();
const mobileLinksRect = mobileApp.querySelector('.footer-links').getBoundingClientRect();
const mobileVersionRect = mobileApp.getElementById('app-version').getBoundingClientRect();
const mobileViewportCenter = mobileApp.documentElement.clientWidth / 2;
assertEqual('Mobile footer remains fixed', mobileFooterStyle.position, 'fixed');
assertEqual('Mobile footer remains anchored to the bottom edge', mobileFooterStyle.bottom, '0px');
assert('Mobile footer stays compact while wrapping', mobileFooterRect.height <= 112);
assert('Mobile layout reserves at least the wrapped footer height', parseFloat(mobileMainStyle.paddingBottom) >= mobileFooterRect.height);
assert('Mobile footer does not create horizontal scrolling', mobileFooter.scrollWidth <= mobileFooter.clientWidth && mobileApp.documentElement.scrollWidth <= mobileApp.documentElement.clientWidth);
assert('Mobile footer credits remain centered', Math.abs((mobileCreditsRect.left + mobileCreditsRect.width / 2) - mobileViewportCenter) <= 3);
assert('Mobile footer links remain centered', Math.abs((mobileLinksRect.left + mobileLinksRect.width / 2) - mobileViewportCenter) <= 3);
assert('Mobile footer keeps the version visible at the right edge', mobileVersionRect.width > 0 && mobileApp.documentElement.clientWidth - mobileVersionRect.right <= 16);
assertEqual('Mobile footer preserves the version label', mobileApp.getElementById('app-version')?.textContent.trim(), APP_VERSION_LABEL);

mobileFrame.remove();
