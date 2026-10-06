const form = {
    id: "form_1",
    fields: [
        { key: "license_plate", label: "Kenteken", type: "text", required: true },
        { key: "kind", label: "Soort", type: "choice", required: false, options: ["repair", "service"] },
        {
            key: "lines",
            label: "Regels",
            type: "list",
            required: false,
            fields: [
                { key: "description", label: "Omschrijving", type: "text", required: true },
                { key: "quantity", label: "Aantal", type: "number", required: false },
            ],
        },
    ],
};

it("makes the chosen Form's Fields the data collection, with a List Field as an array of rows", () => {
    assert.deepStrictEqual(formFieldsSpec([{ id: "other", fields: [] }, form], "form_1"), {
        name: "data",
        label: "Fields",
        type: "collection",
        spec: [
            { name: "license_plate", label: "Kenteken", type: "text" },
            { name: "kind", label: "Soort", type: "text" },
            {
                name: "lines",
                label: "Regels",
                type: "array",
                spec: [
                    { name: "description", label: "Omschrijving", type: "text" },
                    { name: "quantity", label: "Aantal", type: "number" },
                ],
            },
        ],
    });
});

it("gives an empty data collection when the Form is gone", () => {
    assert.deepStrictEqual(formFieldsSpec([form], "deleted").spec, []);
});
