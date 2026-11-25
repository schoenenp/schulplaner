import { test, expect } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { buildCustomCover } from "./custom-cover";
const width=436.535,height=612.283;
test("accepts four pages at the template dimensions",async()=>{const doc=await PDFDocument.create();for(let i=0;i<4;i++)doc.addPage([width,height]).drawText(`U${i+1}`);const result=await PDFDocument.load(await buildCustomCover(await doc.save(),"application/pdf",width,height));expect(result.getPageCount()).toBe(4);expect(result.getPage(0).getWidth()).toBeCloseTo(width);});
test("rejects wrong page counts and page sizes",async()=>{const doc=await PDFDocument.create();doc.addPage([width,height]);await expect(buildCustomCover(await doc.save(),"application/pdf",width,height)).rejects.toThrow("genau 4");for(let i=0;i<3;i++)doc.addPage([100,100]);await expect(buildCustomCover(await doc.save(),"application/pdf",width,height)).rejects.toThrow("PDF-Seiten");});
test("builds a four page cover from a PNG",async()=>{const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=","base64");const result=await PDFDocument.load(await buildCustomCover(bytes,"image/png",width,height));expect(result.getPageCount()).toBe(4);for(const p of result.getPages())expect(p.getWidth()).toBeCloseTo(width);});
test("rejects unsupported or corrupt uploads",async()=>{await expect(buildCustomCover(new Uint8Array([1,2]),"text/html",width,height)).rejects.toThrow("Bitte ein");await expect(buildCustomCover(new Uint8Array([1,2]),"application/pdf",width,height)).rejects.toThrow();});

test("flattens a filled cover field without leaving invalid page annotations", async () => {
  const source = await PDFDocument.create();
  const front = source.addPage([width, height]);
  for (let i = 0; i < 3; i++) source.addPage([width, height]);
  const field = source.getForm().createTextField("LABEL");
  field.addToPage(front, { x: 40, y: 500, width: 200, height: 30 });
  field.setText("Meine Schule");
  const result = await PDFDocument.load(await buildCustomCover(await source.save(), "application/pdf", width, height));
  expect(result.getForm().getFields()).toHaveLength(0);
  expect(result.getPage(0).node.Annots()).toBeUndefined();
  expect(result.getPage(0).node.Contents()).toBeDefined();
});
