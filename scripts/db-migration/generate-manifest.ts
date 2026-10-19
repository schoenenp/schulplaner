import { createHash } from "node:crypto";
import { Prisma } from "db";
import { resolve } from "node:path";

const schema = resolve(import.meta.dir, "../../packages/db/prisma/schema.prisma");
const migration = resolve(import.meta.dir, "../../packages/db/prisma/migrations/0_postgresql_init/migration.sql");
const migrationSQL = await Bun.file(migration).text();
const models = Prisma.dmmf.datamodel.models;
const enums = new Map(Prisma.dmmf.datamodel.enums.map(e => [e.name, e.values.map(v => v.dbName ?? v.name)]));
const tables = models.map(model => ({
  name: model.dbName ?? model.name,
  columns: model.fields.filter(f => f.kind !== "object").map(f => ({
    name: f.dbName ?? f.name,
    type: f.kind === "enum" ? "Enum" : f.type,
    pgType: f.kind === "enum" ? f.type : f.nativeType?.[0] === "Citext" ? "citext"
      : ({ String: "text", Int: "int4", Boolean: "bool", DateTime: "timestamp", Json: "jsonb" }[f.type]),
    required: f.isRequired,
    // Draft quantity did not exist in the legacy MySQL source.
    ...(model.name === "Book" && f.name === "quantity" ? { sourceDefault: "1" } : {}),
    dbDefault: typeof f.default === "object" && f.default !== null && "name" in f.default
      ? f.default.name === "now" ? "__now__" : f.default.name === "autoincrement" ? "__sequence__" : null
      : f.hasDefaultValue ? String(f.default) : null,
    ...(f.kind === "enum" ? { values: enums.get(f.type) } : {}),
    ...(typeof f.default === "object" && f.default !== null && "name" in f.default && f.default.name === "autoincrement"
      ? { autoIncrement: true } : {}),
  })),
  keys: model.fields.filter(f => f.isId).map(f => f.dbName ?? f.name).length
    ? model.fields.filter(f => f.isId).map(f => f.dbName ?? f.name)
    : model.primaryKey?.fields ?? model.fields.filter(f => f.isUnique).slice(0, 1).map(f => f.dbName ?? f.name),
  uniques: [
    ...model.fields.filter(f => f.isId || f.isUnique).map(f => [f.dbName ?? f.name]),
    ...(model.primaryKey ? [model.primaryKey.fields] : []),
    ...model.uniqueFields,
  ],
  references: model.fields.filter(f => f.kind === "object" && f.relationFromFields?.length).map(f => ({
    columns: f.relationFromFields!.map(n => model.fields.find(x => x.name === n)!.dbName ?? n),
    table: models.find(m => m.name === f.type)!.dbName ?? f.type,
    targets: f.relationToFields!,
    onDelete: f.relationOnDelete ?? (f.isRequired ? "Restrict" : "SetNull"),
    onUpdate: f.relationOnUpdate ?? "Cascade",
  })),
}));
for (const model of models) {
  for (const field of model.fields.filter(f => f.kind === "object" && f.isList && !f.relationFromFields?.length)) {
    const other = models.find(m => m.name === field.type)!;
    const inverse = other.fields.find(f => f.type === model.name && f.relationName === field.relationName && f.isList);
    if (!inverse || model.name >= other.name) continue;
    tables.push({
      name: `_${field.relationName}`,
      columns: [model, other].map((m, i) => ({ name: i === 0 ? "A" : "B", type: m.fields.find(f => f.isId)!.type, pgType: m.fields.find(f => f.isId)!.type === "Int" ? "int4" : "text", required: true, dbDefault: null })),
      keys: ["A", "B"],
      uniques: [["A", "B"]],
      references: [model, other].map((m, i) => ({
        columns: [i === 0 ? "A" : "B"], table: m.dbName ?? m.name,
        targets: [m.fields.find(f => f.isId)!.dbName ?? "id"], onDelete: "Cascade", onUpdate: "Cascade",
      })),
    });
  }
}
if (tables.some(t => !t.keys.length)) throw new Error("Every table needs a stable key for migration");
const manifest = {
  version: 1,
  schemaSha256: createHash("sha256").update(await Bun.file(schema).text()).digest("hex"),
  migrationSha256: createHash("sha256").update(migrationSQL).digest("hex"),
  targetIndexes: [...migrationSQL.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "([^"]+)"\(([^;]+)\);/g)].map(match => ({
    name: match[1], table: match[2], columns: [...match[3]!.matchAll(/"([^"]+)"/g)].map(column => column[1]),
  })),
  tables,
};
await Bun.write(resolve(import.meta.dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Generated manifest for ${tables.length} physical tables`);
