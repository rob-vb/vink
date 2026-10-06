// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Make calls it from IML: formFieldsSpec(body.data, webhook.formId).
function formFieldsSpec(forms, formId) {
    // Vink's Field types as Make output types. A choice is its option's text;
    // a List Field is an array with one collection per row.
    const types = { text: "text", number: "number", date: "date", boolean: "boolean", choice: "text" };
    const toParam = (field) =>
        field.type === "list"
            ? { name: field.key, label: field.label, type: "array", spec: (field.fields || []).map(toParam) }
            : { name: field.key, label: field.label, type: types[field.type] || "text" };
    const form = (forms || []).find((candidate) => candidate.id === formId);
    return { name: "data", label: "Fields", type: "collection", spec: form ? form.fields.map(toParam) : [] };
}
