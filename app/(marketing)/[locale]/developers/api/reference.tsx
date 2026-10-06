// Renders the /v1 OpenAPI document (convex/publicApi/openapi) as the API
// reference: one block per operation, one table per object. The prose that
// comes from the document is English, like the API itself.
import type { ReactNode } from "react";
import { CodeBlock } from "@/components/marketing/code-block";
import { InlineCode } from "@/components/marketing/section";
import { openApiDocument } from "@/convex/publicApi/openapi";
import type { Operation, Response, Schema } from "@/convex/publicApi/openapi/types";

export type ReferenceLabels = {
  parameters: string;
  requestBody: string;
  responses: string;
  request: string;
  example: string;
  name: string;
  type: string;
  required: string;
  description: string;
  status: string;
  code: { copy: string; copied: string };
};

const METHOD_STYLE: Record<string, string> = {
  get: "bg-[#1d4ed8]",
  post: "bg-[#15803d]",
  put: "bg-[#b45309]",
  patch: "bg-[#b45309]",
  delete: "bg-[#b91c1c]",
};

const schemaName = (ref: string) => ref.split("/").pop() ?? ref;

export const objectAnchor = (name: string) => `object-${name.toLowerCase()}`;

/** `/forms` and its operations, in document order. */
export function operationsOf(tag: string) {
  return Object.entries(openApiDocument.paths).flatMap(([path, item]) =>
    Object.entries(item).flatMap(([method, op]) =>
      op && (op as Operation).tags.includes(tag) ? [{ path, method, op: op as Operation }] : [],
    ),
  );
}

/** Inline Markdown code spans (`x`) as InlineCode; the document's only markup. */
export function Prose({ text }: { text?: string }) {
  if (!text) return null;
  return text.split(/(`[^`]+`)/).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? <InlineCode key={i}>{part.slice(1, -1)}</InlineCode> : part,
  );
}

function TypeLabel({ schema }: { schema: Schema }): ReactNode {
  if (schema.$ref) {
    const name = schemaName(schema.$ref);
    return (
      <a href={`#${objectAnchor(name)}`} className="underline underline-offset-3">
        {name}
      </a>
    );
  }
  if (schema.type === "array" && schema.items) {
    return (
      <>
        <TypeLabel schema={schema.items} />
        []
      </>
    );
  }
  if (schema.enum) return schema.enum.map((v) => `"${v}"`).join(" | ");
  if (schema.properties) {
    // An inline wrapper, like `{ data: Form[] }`.
    const entries = Object.entries(schema.properties);
    return (
      <>
        {"{ "}
        {entries.map(([name, property], i) => (
          <span key={name}>
            {name}: <TypeLabel schema={property} />
            {i < entries.length - 1 ? ", " : ""}
          </span>
        ))}
        {" }"}
      </>
    );
  }
  return Array.isArray(schema.type) ? schema.type.join(" | ") : (schema.type ?? "any");
}

export function PropertyTable({ schema, labels }: { schema: Schema; labels: ReferenceLabels }) {
  const required = new Set(schema.required ?? []);
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="bg-muted/60 text-foreground">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">{labels.name}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">{labels.type}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold">{labels.description}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {Object.entries(schema.properties ?? {}).map(([name, property]) => (
            <tr key={name}>
              <td className="px-4 py-3 align-top font-mono text-[13px] whitespace-nowrap text-foreground">
                {name}
                {required.has(name) && (
                  <span className="ml-1.5 font-sans text-xs text-muted-foreground">{labels.required}</span>
                )}
              </td>
              <td className="px-4 py-3 align-top font-mono text-[13px]">
                <TypeLabel schema={property} />
              </td>
              <td className="px-4 py-3 align-top">
                <Prose text={property.description} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function resolveResponse(response: Response | { $ref: string }): Response {
  if ("$ref" in response) {
    return openApiDocument.components.responses[schemaName(response.$ref)];
  }
  return response;
}

function curlOf(method: string, path: string, op: Operation) {
  const lines = [`curl${method === "get" ? "" : ` -X ${method.toUpperCase()}`} ${openApiDocument.servers[0].url}${path}`];
  lines.push(`  -H "Authorization: Bearer $VINK_API_KEY"`);
  const body = op.requestBody && Object.entries(op.requestBody.content)[0];
  if (body) {
    const [type, media] = body;
    if (type === "multipart/form-data") {
      // curl sets the Content-Type, with its boundary, itself.
      lines.push(`  -F "file=@document.pdf"`);
    } else {
      lines.push(`  -H "Content-Type: ${type}"`);
      lines.push(
        type === "application/json"
          ? `  -d '${JSON.stringify(media.example ?? {})}'`
          : `  --data-binary @${type === "application/pdf" ? "document.pdf" : "file"}`,
      );
    }
  }
  return lines.join(" \\\n");
}

/** One operation: what it does, its inputs, its answers and an example. */
export function OperationBlock({
  method,
  path,
  op,
  labels,
}: {
  method: string;
  path: string;
  op: Operation;
  labels: ReferenceLabels;
}) {
  const responses = Object.entries(op.responses).map(([status, r]) => ({ status, response: resolveResponse(r) }));
  const success = responses.find((r) => r.status.startsWith("2"))?.response.content?.["application/json"];
  return (
    <article id={op.operationId} className="flex scroll-mt-24 flex-col gap-4 border-t pt-8 first:border-t-0 first:pt-0">
      <h3 className="text-lg font-semibold text-foreground">{op.summary}</h3>
      <p className="flex items-center gap-2.5 font-mono text-sm text-foreground">
        <b className={`rounded px-1.5 py-0.5 text-xs font-semibold text-white ${METHOD_STYLE[method] ?? "bg-muted"}`}>
          {method.toUpperCase()}
        </b>
        <span className="break-all">/v1{path}</span>
      </p>
      <p>
        <Prose text={op.description} />
      </p>

      {op.parameters && op.parameters.length > 0 && (
        <>
          <h4 className="font-semibold text-foreground">{labels.parameters}</h4>
          <PropertyTable
            labels={labels}
            schema={{
              type: "object",
              required: op.parameters.filter((p) => p.required).map((p) => p.name),
              properties: Object.fromEntries(
                op.parameters.map((p) => [p.name, { ...p.schema, description: p.description }]),
              ),
            }}
          />
        </>
      )}

      {op.requestBody && (
        <>
          <h4 className="font-semibold text-foreground">{labels.requestBody}</h4>
          <p>
            <Prose text={op.requestBody.description} />
          </p>
        </>
      )}

      <h4 className="font-semibold text-foreground">{labels.responses}</h4>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[28rem] text-left text-sm">
          <thead className="bg-muted/60 text-foreground">
            <tr>
              <th scope="col" className="w-24 px-4 py-2.5 font-semibold">{labels.status}</th>
              <th scope="col" className="px-4 py-2.5 font-semibold">{labels.description}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {responses.map(({ status, response }) => (
              <tr key={status}>
                <td className="px-4 py-3 align-top font-mono text-[13px] text-foreground">{status}</td>
                <td className="px-4 py-3">
                  <Prose text={response.description} />
                  {response.content?.["application/json"].schema && (
                    <span className="ml-1.5 font-mono text-[13px]">
                      (<TypeLabel schema={response.content["application/json"].schema} />)
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CodeBlock code={curlOf(method, path, op)} language="text" header={labels.request} copyLabels={labels.code} />
      {success?.example !== undefined && (
        <CodeBlock
          code={JSON.stringify(success.example, null, 2)}
          language="json"
          header={labels.example}
          maxHeight="28rem"
        />
      )}
    </article>
  );
}
