/**
 * Deploys the Vink custom app from `src/` to Make through the SDK Apps REST API, without VS Code.
 *
 *   npx tsx integrations/make/deploy.mts [--dry-run] [--origin <label>]
 *
 * Does what the Make Apps Editor's "Deploy to Make" does, and writes the same `idMapping`
 * into `src/makecomapp.json`, so either tool can deploy later:
 *   1. Pairs every local component with a remote one (`origins[n].idMapping`). A missing one is
 *      created; Make picks the name of a connection or webhook, so that name is recorded.
 *   2. Updates metadata (label, description, type, crud, connection, webhook) that differs.
 *   3. Uploads every code file whose content differs from Make's (MD5 from `/checksum`, then a
 *      text compare); identical codes are not sent. A second run therefore sends nothing.
 * `--dry-run` only reads from Make and prints the plan.
 *
 * The API token is read from the origin's `apikeyFile` and never printed.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type ComponentType = "connection" | "webhook" | "module" | "rpc" | "function";
type Mapping = { local: string | null; remote: string | null };
type Origin = {
  label?: string;
  baseUrl: string;
  appId: string;
  appVersion: number;
  apikeyFile: string;
  idMapping?: Record<ComponentType | "endpoint", Mapping[]>;
};
type Component = {
  label?: string;
  description?: string;
  connectionType?: string;
  webhookType?: string;
  moduleType?: string;
  actionCrud?: string;
  connection?: string;
  altConnection?: string;
  webhook?: string;
  codeFiles: Record<string, string | null>;
};
type MakecomappJson = {
  generalCodeFiles: Record<string, string | null>;
  components: Record<ComponentType, Record<string, Component | null>> & { endpoint?: object };
  origins: Origin[];
};
type Checksums = Record<string, { name: string; checksum: Record<string, string | null> }[]>;

const JSONC = "application/jsonc";
const JSON_ = "application/json";
const JS = "application/javascript";
const MD = "text/markdown";

/** Local code type → API section and content type (as the Make Apps Editor defines them). */
const GENERAL_CODES: Record<string, { section: string; checksumKey: string; type: string }> = {
  base: { section: "base", checksumKey: "base", type: JSONC },
  common: { section: "common", checksumKey: "common", type: JSON_ },
  readme: { section: "readme", checksumKey: "content", type: MD },
  groups: { section: "groups", checksumKey: "groups", type: JSON_ },
};
const COMPONENT_CODES: Record<ComponentType, Record<string, { section: string; type: string }>> = {
  connection: {
    communication: { section: "api", type: JSONC },
    params: { section: "parameters", type: JSONC },
    common: { section: "common", type: JSON_ },
    scopeList: { section: "scopes", type: JSONC },
    defaultScope: { section: "scope", type: JSONC },
    installSpec: { section: "installSpec", type: JSONC },
    installDirectives: { section: "install", type: JSONC },
  },
  webhook: {
    communication: { section: "api", type: JSONC },
    params: { section: "parameters", type: JSONC },
    attach: { section: "attach", type: JSONC },
    detach: { section: "detach", type: JSONC },
    update: { section: "update", type: JSONC },
    requiredScope: { section: "scope", type: JSONC },
  },
  module: {
    communication: { section: "api", type: JSONC },
    epoch: { section: "epoch", type: JSONC },
    staticParams: { section: "parameters", type: JSONC },
    mappableParams: { section: "expect", type: JSONC },
    interface: { section: "interface", type: JSONC },
    samples: { section: "samples", type: JSONC },
    scope: { section: "scope", type: JSONC },
  },
  rpc: {
    communication: { section: "api", type: JSONC },
    params: { section: "parameters", type: JSONC },
  },
  function: {
    code: { section: "code", type: JS },
    test: { section: "test", type: JS },
  },
};
/** Same order as the extension: connections before what references them. */
const ORDER: ComponentType[] = ["connection", "rpc", "webhook", "module", "function"];
const CHECKSUM_LIST: Record<ComponentType, string> = {
  connection: "accounts",
  webhook: "hooks",
  module: "modules",
  rpc: "rpcs",
  function: "functions",
};
const MODULE_TYPE_ID: Record<string, number> = {
  trigger: 1,
  action: 4,
  search: 9,
  instant_trigger: 10,
  responder: 11,
  universal: 12,
};

// ---------------------------------------------------------------- setup

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const originLabel = args.includes("--origin") ? args[args.indexOf("--origin") + 1] : undefined;

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "src");
const makecomappPath = resolve(srcDir, "makecomapp.json");
const makecomapp: MakecomappJson = JSON.parse(readFileSync(makecomappPath, "utf8"));
const origin = originLabel ? makecomapp.origins.find((o) => o.label === originLabel) : makecomapp.origins[0];
if (!origin) throw new Error(`No origin ${originLabel ?? ""} in makecomapp.json`);
const token = readFileSync(resolve(srcDir, origin.apikeyFile), "utf8").trim();
const apiBase = `${origin.baseUrl}/v2/sdk/apps`;
const appPath = `${origin.appId}/${origin.appVersion}`;

/** "type localId" of components that a dry run would create (nothing to read for them in Make). */
const plannedNew = new Set<string>();
const stats = { created: 0, metadata: 0, uploaded: 0, unchanged: 0, failed: 0 };
const failures: string[] = [];

function md5(text: string) {
  return createHash("md5").update(text).digest("hex");
}

class MakeApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    what: string,
  ) {
    super(`${what} → HTTP ${status}: ${body}`);
  }
}

async function api<T = unknown>(
  method: string,
  path: string,
  opts: { json?: unknown; text?: string; type?: string; raw?: boolean } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Token ${token}`,
    // The Make Apps Editor sends this on local-development writes; kept so both tools behave alike.
    "imt-vsce-localmode": "true",
  };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = JSON_;
    body = JSON.stringify(opts.json);
  } else if (opts.text !== undefined) {
    headers["Content-Type"] = opts.type ?? "text/plain";
    body = opts.text;
  }
  const response = await fetch(`${apiBase}/${path}`, { method, headers, body });
  const text = await response.text();
  if (!response.ok) throw new MakeApiError(response.status, text, `${method} /sdk/apps/${path}`);
  return (opts.raw ? text : text ? JSON.parse(text) : {}) as T;
}

function readLocal(file: string) {
  return readFileSync(resolve(srcDir, file), "utf8");
}

function saveMakecomapp() {
  writeFileSync(makecomappPath, JSON.stringify(makecomapp, null, 4) + "\n");
}

// ---------------------------------------------------------------- id mapping

origin.idMapping ??= { connection: [], webhook: [], module: [], rpc: [], function: [], endpoint: [] };
const idMapping = origin.idMapping;
for (const type of [...ORDER, "endpoint"] as const) idMapping[type] ??= [];

function remoteNameOf(type: ComponentType, localId: string | undefined): string | null | undefined {
  if (!localId) return undefined;
  const found = idMapping[type].find((m) => m.local === localId);
  return found ? found.remote : undefined;
}

/** Metadata body as the extension sends it, with references turned into remote names. */
function metadataBody(type: ComponentType, c: Component) {
  const body: Record<string, unknown> = {};
  if (type !== "function" && c.label) body.label = c.label;
  if (type === "module" && c.description) body.description = c.description;
  if (type === "module" && c.moduleType) body.typeId = MODULE_TYPE_ID[c.moduleType];
  if (type === "module" && c.moduleType === "action" && c.actionCrud !== undefined) body.crud = c.actionCrud;
  if (type === "module" && c.moduleType === "instant_trigger") body.webhook = remoteNameOf("webhook", c.webhook) ?? null;
  if (type === "module" || type === "webhook" || type === "rpc") {
    body.connection = remoteNameOf("connection", c.connection) ?? null;
    body.altConnection = remoteNameOf("connection", c.altConnection) ?? null;
  }
  return body;
}

function componentPath(type: ComponentType, remote?: string) {
  // Connections and webhooks are not versioned; the rest live under the app version.
  if (type === "connection" || type === "webhook") {
    return remote ? `${type}s/${remote}` : `${origin!.appId}/${type}s`;
  }
  return `${appPath}/${type}s${remote ? `/${remote}` : ""}`;
}

// ---------------------------------------------------------------- remote state

type RemoteLists = Record<ComponentType, { name: string; label?: string }[]>;

async function loadRemote(): Promise<{ lists: RemoteLists; checksums: Checksums }> {
  const [connections, webhooks, modules, rpcs, functions, checksums] = await Promise.all([
    api<{ appConnections: { name: string; label: string }[] }>("GET", `${origin!.appId}/connections`),
    api<{ appWebhooks: { name: string; label: string }[] }>("GET", `${origin!.appId}/webhooks`),
    api<{ appModules: { name: string; label: string }[] }>("GET", `${appPath}/modules`),
    api<{ appRpcs: { name: string; label: string }[] }>("GET", `${appPath}/rpcs`),
    api<{ appFunctions: { name: string }[] }>("GET", `${appPath}/functions`),
    api<Checksums>("GET", `${appPath}/checksum`),
  ]);
  return {
    lists: {
      connection: connections.appConnections ?? [],
      webhook: webhooks.appWebhooks ?? [],
      module: modules.appModules ?? [],
      rpc: rpcs.appRpcs ?? [],
      function: functions.appFunctions ?? [],
    },
    checksums,
  };
}

// ---------------------------------------------------------------- steps

/** Step 1: every local component gets a remote name; missing ones are created. */
async function alignComponents(lists: RemoteLists) {
  for (const type of ORDER) {
    for (const [localId, component] of Object.entries(makecomapp.components[type] ?? {})) {
      if (!component) continue;
      const mapped = remoteNameOf(type, localId);
      if (mapped === null) {
        console.log(`  skip    ${type} ${localId} (idMapping says remote: null)`);
        continue;
      }
      const taken = new Set(idMapping[type].map((m) => m.remote));
      if (mapped !== undefined) {
        if (lists[type].some((r) => r.name === mapped)) continue;
        console.log(`  missing ${type} ${localId} → ${mapped} is mapped but gone in Make; creating a new one`);
        idMapping[type] = idMapping[type].filter((m) => m.local !== localId);
      } else {
        // Not mapped yet: pair with a remote component of the same name (module, rpc, function) or,
        // for a connection or webhook, the single unpaired one with the same label (a run that
        // stopped before it saved makecomapp.json).
        const candidates =
          type === "connection" || type === "webhook"
            ? lists[type].filter((r) => r.label === component.label && !taken.has(r.name))
            : lists[type].filter((r) => r.name === localId);
        if (candidates.length === 1) {
          idMapping[type].push({ local: localId, remote: candidates[0].name });
          console.log(`  pair    ${type} ${localId} → ${candidates[0].name} (exists in Make)`);
          if (!dryRun) saveMakecomapp();
          continue;
        }
      }

      const body: Record<string, unknown> = { ...metadataBody(type, component) };
      if (type === "connection") body.type = component.connectionType;
      if (type === "webhook") body.type = component.webhookType;
      if (type === "module") body.moduleInitMode = "blank";
      if (type === "module" || type === "rpc" || type === "function") body.name = localId;

      if (dryRun) {
        console.log(`  create  ${type} ${localId} ${JSON.stringify(body)}`);
        // Placeholder so later references and code uploads show in the plan.
        idMapping[type].push({ local: localId, remote: type === "connection" || type === "webhook" ? `<new ${type}>` : localId });
        plannedNew.add(`${type} ${localId}`);
        continue;
      }
      try {
        const response = await api<Record<string, { name: string }>>("POST", componentPath(type), { json: body });
        const remote = type === "connection" ? response.appConnection.name : type === "webhook" ? response.appWebhook.name : localId;
        idMapping[type].push({ local: localId, remote });
        saveMakecomapp();
        stats.created++;
        console.log(`  created ${type} ${localId} → ${remote}`);
      } catch (e) {
        stats.failed++;
        failures.push(`create ${type} ${localId}: ${(e as Error).message}`);
        console.log(`  FAILED  create ${type} ${localId}: ${(e as Error).message}`);
      }
    }
  }
}

/** Step 2: PATCH metadata of paired components where it differs from Make. */
async function deployMetadata() {
  for (const type of ORDER) {
    if (type === "function") continue;
    for (const [localId, component] of Object.entries(makecomapp.components[type] ?? {})) {
      const remote = component ? remoteNameOf(type, localId) : null;
      if (!component || !remote || plannedNew.has(`${type} ${localId}`)) continue;
      const wanted = metadataBody(type, component);
      const detail = Object.values(await api<Record<string, Record<string, unknown>>>("GET", componentPath(type, remote)))[0];
      const differs = Object.entries(wanted).filter(([key, value]) => (detail[key] ?? null) !== value);
      if (differs.length === 0) continue;
      const patch = Object.fromEntries(differs);
      console.log(`  patch   ${type} ${localId} (${remote}) ${JSON.stringify(patch)}`);
      if (dryRun) continue;
      try {
        await api("PATCH", componentPath(type, remote), { json: patch });
        stats.metadata++;
      } catch (e) {
        stats.failed++;
        failures.push(`metadata ${type} ${localId}: ${(e as Error).message}`);
        console.log(`  FAILED  metadata ${type} ${localId}: ${(e as Error).message}`);
      }
    }
  }
}

/** Upload one code unless Make has the same content already. */
async function deployCode(what: string, path: string, file: string, type: string, remoteChecksums: string[], isNew = false) {
  const content = readLocal(file);
  if (remoteChecksums.includes(md5(content))) {
    stats.unchanged++;
    return;
  }
  // Checksum missing or different: compare the text itself (Make may hash a normalised copy).
  if (!isNew) {
    try {
      const remoteText = await api<string>("GET", path, { raw: true });
      // Make stores plain JSON codes (groups, common) re-formatted, so compare those by value.
      const sameJson = type === JSON_ && JSON.stringify(JSON.parse(remoteText)) === JSON.stringify(JSON.parse(content));
      if (remoteText === content || sameJson) {
        stats.unchanged++;
        return;
      }
    } catch (e) {
      if (!(e instanceof MakeApiError)) throw e;
    }
  }
  console.log(`  upload  ${what} ← ${file}`);
  if (dryRun) return;
  try {
    await api("PUT", path, { text: content, type });
    stats.uploaded++;
  } catch (e) {
    stats.failed++;
    failures.push(`upload ${what}: ${(e as Error).message}`);
    console.log(`  FAILED  upload ${what}: ${(e as Error).message}`);
  }
}

function checksumsFor(checksums: Checksums, list: string, name: string | null, keys: string[]) {
  const entry = name === null ? checksums[list]?.[0] : checksums[list]?.find((c) => c.name === name);
  if (!entry) return [];
  return keys.flatMap((k) => [entry.checksum[k], entry.checksum[`${k}_jsonc`]]).filter((v): v is string => !!v);
}

/** Step 3: upload the app's general codes and every component code. */
async function deployCodes(checksums: Checksums) {
  for (const [codeType, file] of Object.entries(makecomapp.generalCodeFiles)) {
    if (!file) continue;
    const def = GENERAL_CODES[codeType];
    if (!def) throw new Error(`Unknown general code ${codeType}`);
    const sums = checksumsFor(checksums, "app", null, [codeType, def.checksumKey]);
    await deployCode(`app ${def.section}`, `${appPath}/${def.section}`, file, def.type, sums);
  }
  for (const type of ORDER) {
    for (const [localId, component] of Object.entries(makecomapp.components[type] ?? {})) {
      const remote = component ? remoteNameOf(type, localId) : null;
      if (!component || !remote) continue;
      if (failures.some((f) => f.startsWith(`create ${type} ${localId}:`))) {
        console.log(`  skip    ${type} ${localId} codes (component was not created)`);
        continue;
      }
      for (const [codeType, file] of Object.entries(component.codeFiles)) {
        if (!file) continue;
        const def = COMPONENT_CODES[type][codeType];
        if (!def) throw new Error(`Unknown code ${codeType} of ${type} ${localId}`);
        const sums = checksumsFor(checksums, CHECKSUM_LIST[type], remote, [codeType, def.section]);
        await deployCode(
          `${type} ${remote} ${def.section}`,
          `${componentPath(type, remote)}/${def.section}`,
          file,
          def.type,
          sums,
          plannedNew.has(`${type} ${localId}`),
        );
      }
    }
  }
}

// ---------------------------------------------------------------- run

console.log(`${dryRun ? "Dry run: plan for" : "Deploying to"} ${origin.baseUrl} app ${origin.appId} v${origin.appVersion}`);
const app = await api<{ app: { name: string; label: string } }>("GET", appPath);
console.log(`Remote app: ${app.app.name} "${app.app.label}"`);
const { lists, checksums } = await loadRemote();
console.log("Components:");
await alignComponents(lists);
console.log("Metadata:");
await deployMetadata();
console.log("Codes:");
await deployCodes(checksums);

console.log(
  `\n${dryRun ? "Dry run, nothing written. " : ""}created ${stats.created}, metadata patched ${stats.metadata}, ` +
    `codes uploaded ${stats.uploaded}, codes unchanged ${stats.unchanged}, failed ${stats.failed}`,
);
for (const f of failures) console.log(`  - ${f}`);
process.exitCode = stats.failed > 0 ? 1 : 0;
