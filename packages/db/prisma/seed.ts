import {
  type BookPart,
  type ModuleType,
  PrismaClient,
  Visibility,
} from "@prisma/client";

const prisma = new PrismaClient();

type ModuleTypeSeed = {
  name: string;
  minPages: number;
  maxPages: number;
};

type ExampleModuleSeed = {
  id: string;
  name: string;
  typeName: string;
  part: BookPart;
  theme: string | null;
  thumbnail: string;
};

const SEED_ID_PREFIX = "seed-example";
const MOCK_PDF_URL = "/storage/notizen.pdf";

const moduleTypes: ModuleTypeSeed[] = [
  { name: "umschlag", minPages: 4, maxPages: 4 },
  { name: "bindung", minPages: 2, maxPages: 8 },
  { name: "wochenplaner", minPages: 4, maxPages: 92 },
  { name: "sonstige", minPages: 1, maxPages: -1 },
];

const thumbnails = [
  "/assets/gen/pirgen_bg.png",
  "/assets/gen/pirgen_calendar.png",
  "/assets/gen/pirgen_img.png",
  "/assets/gen/pirgen_l_planner.png",
  "/assets/gen/pirgen_minimal.png",
  "/assets/gen/pirgen_official.png",
  "/assets/gen/pirgen_planner_double.png",
  "/assets/gen/pirgen_r_planner.png",
  "/assets/gen/pirgen_schedule.png",
  "/assets/gen/pirgen_sponsor.png",
  "/assets/gen/pirgen_text.png",
  "/assets/screenshots/acrobat_form_5.png",
];

const coverModules: Omit<ExampleModuleSeed, "id" | "typeName" | "part">[] = [
  {
    name: "Umschlag Klassisch Blau",
    theme: "klassisch",
    thumbnail: thumbnails[0]!,
  },
  {
    name: "Umschlag Minimal Hell",
    theme: "minimal",
    thumbnail: thumbnails[4]!,
  },
  {
    name: "Umschlag Schuljahr Farben",
    theme: "farbenfroh",
    thumbnail: thumbnails[2]!,
  },
  {
    name: "Umschlag Offiziell",
    theme: "offiziell",
    thumbnail: thumbnails[5]!,
  },
];

const plannerModules: Omit<ExampleModuleSeed, "id" | "typeName" | "part">[] = [
  {
    name: "Wochenplaner Kompakt",
    theme: "kompakt",
    thumbnail: thumbnails[1]!,
  },
  {
    name: "Wochenplaner Doppelseite",
    theme: "doppelseite",
    thumbnail: thumbnails[6]!,
  },
  {
    name: "Wochenplaner Links",
    theme: "linke seite",
    thumbnail: thumbnails[3]!,
  },
  {
    name: "Wochenplaner Rechts",
    theme: "rechte seite",
    thumbnail: thumbnails[7]!,
  },
];

const otherModuleNames = [
  "Notizen Liniert",
  "Notizen Kariert",
  "Notizen Blanko",
  "Kontaktliste",
  "Klassenliste",
  "Sitzplan",
  "Geburtstagskalender",
  "Ferienuebersicht",
  "Stundenplan",
  "Projektplanung",
  "Hausaufgabenliste",
  "Elterngespraeche",
  "Konferenznotizen",
  "Vertretungsplan",
  "Bewertungsraster",
  "Leseliste",
  "Materialliste",
  "Ausflugplanung",
  "Checkliste Schulstart",
  "Checkliste Halbjahr",
  "Zielplanung",
  "Reflexion Woche",
  "Reflexion Monat",
  "Freie Seiten",
  "Rasterseiten",
  "Dokumentation",
  "Jahresrueckblick",
];

const bindingModules: Omit<ExampleModuleSeed, "id" | "typeName" | "part">[] = [
  {
    name: "Klammerheftbindung",
    theme: "klammerheftbindung",
    thumbnail: thumbnails[8]!,
  },
  {
    name: "Kunststoffspirale",
    theme: "kunststoffspirale",
    thumbnail: thumbnails[9]!,
  },
  {
    name: "Hot-Melt-Bindung",
    theme: "hot-melt-bindung",
    thumbnail: thumbnails[10]!,
  },
  {
    name: "Premium-Fadenbindung",
    theme: "premium",
    thumbnail: thumbnails[11]!,
  },
];

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildExampleModules(): ExampleModuleSeed[] {
  const covers = coverModules.map((moduleItem, index) => ({
    ...moduleItem,
    id: `${SEED_ID_PREFIX}-cover-${index + 1}`,
    typeName: "umschlag",
    part: "COVER" as const,
  }));

  const planners = plannerModules.map((moduleItem, index) => ({
    ...moduleItem,
    id: `${SEED_ID_PREFIX}-planner-${index + 1}`,
    typeName: "wochenplaner",
    part: "PLANNER" as const,
  }));

  const others = otherModuleNames.map((name, index) => ({
    id: `${SEED_ID_PREFIX}-other-${String(index + 1).padStart(2, "0")}`,
    name,
    typeName: "sonstige",
    part: "DEFAULT" as const,
    theme:
      index % 3 === 0 ? "organisation" : index % 3 === 1 ? "notizen" : null,
    thumbnail: thumbnails[index % thumbnails.length]!,
  }));

  const bindings = bindingModules.map((moduleItem, index) => ({
    ...moduleItem,
    id: `${SEED_ID_PREFIX}-binding-${index + 1}`,
    typeName: "bindung",
    part: "BINDING" as const,
  }));

  return [...covers, ...planners, ...others, ...bindings];
}

async function ensureModuleTypes(): Promise<Map<string, ModuleType>> {
  const typeMap = new Map<string, ModuleType>();

  for (const typeSeed of moduleTypes) {
    const existingType = await prisma.moduleType.findFirst({
      where: { name: typeSeed.name },
    });

    const moduleType = existingType
      ? await prisma.moduleType.update({
          where: { id: existingType.id },
          data: {
            minPages: typeSeed.minPages,
            maxPages: typeSeed.maxPages,
            deletedAt: null,
          },
        })
      : await prisma.moduleType.create({
          data: typeSeed,
        });

    typeMap.set(typeSeed.name, moduleType);
  }

  return typeMap;
}

async function deletePreviousExampleSeed(): Promise<void> {
  await prisma.module.deleteMany({
    where: {
      id: {
        startsWith: SEED_ID_PREFIX,
      },
    },
  });

  await prisma.file.deleteMany({
    where: {
      id: {
        startsWith: SEED_ID_PREFIX,
      },
    },
  });
}

async function seed(): Promise<void> {
  const typeMap = await ensureModuleTypes();
  const exampleModules = buildExampleModules();

  await deletePreviousExampleSeed();

  for (const moduleItem of exampleModules) {
    const moduleType = typeMap.get(moduleItem.typeName);
    if (!moduleType) {
      throw new Error(`Missing module type: ${moduleItem.typeName}`);
    }

    const moduleSlug = slugify(moduleItem.name);

    await prisma.module.create({
      data: {
        id: moduleItem.id,
        visible: Visibility.PUBLIC,
        name: moduleItem.name,
        part: moduleItem.part,
        typeId: moduleType.id,
        theme: moduleItem.theme,
        files: {
          create: [
            {
              id: `${moduleItem.id}-pdf`,
              name: `file_${moduleSlug}.pdf`,
              size: 1,
              src: MOCK_PDF_URL,
              type: "PDF",
            },
            {
              id: `${moduleItem.id}-thumb`,
              name: `thumb_${moduleSlug}.png`,
              size: 2,
              src: moduleItem.thumbnail,
              type: "IMAGE_PNG",
            },
          ],
        },
      },
    });
  }

  console.log(
    "Seeded example modules: 4 Umschlag, 4 Wochenplaner, 27 Sonstige, 4 Bindung.",
  );
}

seed()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    return void prisma.$disconnect();
  });
