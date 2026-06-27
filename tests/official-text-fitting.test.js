const results = document.getElementById('results');

function report(name, passed, detail = '') {
  const row = document.createElement('p');
  row.className = passed ? 'pass' : 'fail';
  row.textContent = passed ? `✓ ${name}` : `✗ ${name}${detail ? `: ${detail}` : ''}`;
  results.appendChild(row);
  if (!passed) throw new Error(row.textContent);
}

function assert(name, value, detail = '') {
  report(name, Boolean(value), detail);
}

function assertEqual(name, actual, expected) {
  report(name, Object.is(actual, expected), `expected "${expected}", received "${actual}"`);
}

function loadAppFrame() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.position = 'absolute';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = '1200px';
    frame.style.height = '1600px';
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
      if (app?.querySelector('.overlay-debtor-name') && app.querySelector('.overlay-debtor-location')) {
        resolve();
        return;
      }

      if (Date.now() - started > 3000) {
        reject(new Error('The official preview did not finish initializing.'));
        return;
      }

      setTimeout(check, 50);
    }

    check();
  });
}

function nextFrame(frame) {
  return new Promise(resolve => frame.contentWindow.requestAnimationFrame(() => resolve()));
}

async function setInvoiceValue(frame, id, value) {
  const app = frame.contentDocument;
  const input = app.getElementById(id);
  input.value = value;
  input.dispatchEvent(new frame.contentWindow.Event('input', { bubbles: true }));
  await nextFrame(frame);
}

const frame = await loadAppFrame();
const app = frame.contentDocument;
app.querySelector('[data-view-target="debtor"]').click();
await nextFrame(frame);

const debtorName = app.querySelector('.overlay-debtor-name');
const debtorLocation = app.querySelector('.overlay-debtor-location');
const debtorTaxId = app.querySelector('.overlay-debtor-tax-id');
await setInvoiceValue(frame, 'debtorAddress', 'ADDRESS SENTINEL');

await setInvoiceValue(frame, 'debtorName', 'SUN TOWER PLAZA LTD');
assertEqual('English company debtor name is complete', debtorName.textContent, 'SUN TOWER PLAZA LTD');
assert('English company debtor name is not clipped horizontally', debtorName.scrollWidth <= debtorName.clientWidth);
assert('English company debtor name fits inside its row height', debtorName.scrollHeight <= debtorName.clientHeight);
assertEqual('English company debtor name keeps normal font size', debtorName.style.fontSize, '');
assertEqual('English company debtor name stays on one line', debtorName.dataset.fitWrapped, 'false');
assert('English company debtor name does not overlap tax identity area', debtorName.getBoundingClientRect().right <= debtorTaxId.getBoundingClientRect().left);
assert('English company debtor name stays above debtor address', debtorName.getBoundingClientRect().bottom <= debtorLocation.getBoundingClientRect().top);
assert('Debtor address remains separate from debtor name', debtorLocation.textContent.includes('ADDRESS SENTINEL') && !debtorName.textContent.includes('ADDRESS SENTINEL'));

await setInvoiceValue(frame, 'debtorName', 'ΠΑΓΚΥΠΡΙΟΣ ΟΡΓΑΝΙΣΜΟΣ ΔΙΑΧΕΙΡΙΣΗΣ ΥΠΗΡΕΣΙΩΝ ΛΤΔ');
assertEqual('Long Greek debtor name is complete', debtorName.textContent, 'ΠΑΓΚΥΠΡΙΟΣ ΟΡΓΑΝΙΣΜΟΣ ΔΙΑΧΕΙΡΙΣΗΣ ΥΠΗΡΕΣΙΩΝ ΛΤΔ');
assert('Long Greek debtor name uses fitting or controlled wrapping', debtorName.scrollWidth <= debtorName.clientWidth || debtorName.dataset.fitWrapped === 'true');
assert('Long Greek debtor name fits inside its row height', debtorName.scrollHeight <= debtorName.clientHeight);
assert('Long Greek debtor name does not overwrite debtor address', debtorName.getBoundingClientRect().bottom <= debtorLocation.getBoundingClientRect().top);

await setInvoiceValue(frame, 'debtorName', 'ABC LTD');
assertEqual('Short debtor name is complete', debtorName.textContent, 'ABC LTD');
assertEqual('Short debtor name keeps normal font size', debtorName.style.fontSize, '');
assertEqual('Short debtor name does not wrap', debtorName.dataset.fitWrapped, 'false');

await setInvoiceValue(frame, 'netAmount', '15.00');
await setInvoiceValue(frame, 'vatRate', '19');
assertEqual('Net euros do not use leading zeroes', app.querySelector('.overlay-net-euros').textContent, '15');
assertEqual('Net cents stay two digits', app.querySelector('.overlay-net-cents').textContent, '00');
assertEqual('VAT euros do not use leading zeroes', app.querySelector('.overlay-vat-euros').textContent, '2');
assertEqual('VAT cents stay two digits', app.querySelector('.overlay-vat-cents').textContent, '85');
assertEqual('Gross euros do not use leading zeroes', app.querySelector('.overlay-gross-euros').textContent, '17');
assertEqual('Gross cents stay two digits', app.querySelector('.overlay-gross-cents').textContent, '85');
assertEqual('Bottom gross euros do not use leading zeroes', app.querySelector('.overlay-bottom-gross-euros').textContent, '17');
assertEqual('Analysis euros do not use leading zeroes', app.querySelector('.overlay-analysis-euros').textContent, '17');

frame.remove();
