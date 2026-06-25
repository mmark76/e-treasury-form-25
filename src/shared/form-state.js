export function getFormValues(form) {
  const values = {};
  form.querySelectorAll('input[id], textarea[id], select[id]').forEach(field => {
    values[field.id] = field.value;
  });
  return values;
}

export function setFormValues(form, values) {
  Object.entries(values).forEach(([id, value]) => {
    const field = form.querySelector(`#${CSS.escape(id)}`);
    if (!field) return;
    field.value = value ?? '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export function getFieldValue(id) {
  return document.getElementById(id)?.value.trim() ?? '';
}

