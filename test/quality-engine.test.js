const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const quality = require('../server/services/qualityEngine');

test('qualityEngine: inspectDeliverable accurately rates real and non-existent files', () => {
  // Missing file
  const missing = quality.inspectDeliverable({ file_path: 'nonexistent/path/doc.pdf' });
  assert.equal(missing.score, 0);
  assert.ok(missing.issues.length > 0);

  // Temporary valid deliverable
  const tmpFile = path.resolve(process.cwd(), 'test-quality-tmp.pdf');
  fs.writeFileSync(tmpFile, 'A'.repeat(1000));
  try {
    const valid = quality.inspectDeliverable({ file_path: 'test-quality-tmp.pdf' });
    assert.equal(valid.score, 25);
    assert.equal(valid.issues.length, 0);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('qualityEngine: inspectContent detects thin bodies and missing markup', () => {
  const thin = quality.inspectContent({ name: 'Valid Product Name', html_content: '<p>Too short</p>' });
  assert.ok(thin.score < 25);
  assert.ok(thin.issues.some(i => i.includes('structural body')));

  const rich = quality.inspectContent({
    name: 'Autonomous Operations Playbook',
    html_content: '<div><h1>Header</h1><table class="grid"><tr><td>Item</td></tr></table>' + 'x'.repeat(400) + '</div>'
  });
  assert.equal(rich.score, 25);
  assert.equal(rich.issues.length, 0);
});

test('qualityEngine: inspectDefects catches placeholder tokens and raw templates', () => {
  const clean = quality.inspectDefects({ name: 'Executive Dashboard', html_content: '<div>Clean content without templates</div>' });
  assert.equal(clean.score, 15);
  assert.equal(clean.issues.length, 0);

  const placeholder = quality.inspectDefects({
    name: 'Executive Dashboard',
    html_content: '<div>Welcome to {{company_name}} Lorem ipsum dolor sit amet</div>'
  });
  assert.equal(placeholder.score, 0);
  assert.ok(placeholder.issues.some(i => i.includes('placeholder')));
});

test('qualityEngine: auditProduct computes end-to-end score and assigns FLIGHT_READY verdict', () => {
  const tmpDeliverable = path.resolve(process.cwd(), 'test-flight-ready.pdf');
  const tmpPreview = path.resolve(process.cwd(), 'test-flight-ready.jpg');
  fs.writeFileSync(tmpDeliverable, 'Content'.repeat(200));
  fs.writeFileSync(tmpPreview, 'Preview'.repeat(200));

  try {
    const perfectProduct = {
      id: 9991,
      name: 'Drone Surveying Flight Operations Checklist',
      type: 'checklist',
      price: '$14.99',
      theme: 'Onyx Volt',
      file_path: 'test-flight-ready.pdf',
      preview_path: 'test-flight-ready.jpg',
      html_content: '<div><h1>Operational Guide</h1><div class="card">Substance here</div>' + 'Data'.repeat(100) + '</div>'
    };

    const audit = quality.auditProduct(perfectProduct);
    assert.equal(audit.verdict, 'FLIGHT_READY');
    assert.equal(audit.flightReady, true);
    assert.ok(audit.score >= 85);
    assert.equal(audit.issues.length, 0);
  } finally {
    if (fs.existsSync(tmpDeliverable)) fs.unlinkSync(tmpDeliverable);
    if (fs.existsSync(tmpPreview)) fs.unlinkSync(tmpPreview);
  }
});
