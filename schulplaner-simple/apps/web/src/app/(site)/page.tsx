import Link from "next/link";
import { getPriceList } from "@/server/settings";
import { euro } from "@/lib/format";
export const dynamic = "force-dynamic";
export default async function HomePage() {
 const prices=await getPriceList();
 const lowest=prices.priceTiers.length?Math.min(...prices.priceTiers.map(t=>t.unitAmount)):null;
 return <div className="home-app"><section className="home-hero"><div className="home-copy"><span className="eyebrow">EUER JAHR. EUER DING.</span><h1>Große Ideen.<br/>Gutes Heft.</h1><p>Euer Schulplaner ist schon durchdacht. Jetzt kommen eure Termine, eure Bilder und euer ganz eigener Look dazu.</p><Link href="/planer" className="btn-primary">Los geht’s →</Link>{lowest!==null&&<p className="mt-5 text-sm">Ab {euro(lowest)} pro Heft inkl. MwSt.</p>}</div><div className="wizard-art" aria-hidden="true"><div className="book-art"><span>HEY,<br/>ZUKUNFT!</span><i>Ideen · Pläne · Lieblingsmomente</i><b>✳</b></div><span className="art-sticker">Platz für<br/>eure Ideen.</span></div></section><div className="home-banner"><span>✳ Euer Bild aufs Cover</span><span>✳ Ferien schon drin</span><span>✳ Einfach auf Rechnung</span></div><section className="p-8 md:p-16"><h2 className="text-3xl mb-4">Ein paar Schritte. Ein ganzes Schuljahr.</h2><p className="max-w-2xl text-lg text-muted">Schuljahr festlegen, Termine ergänzen und Umschlag gestalten. Vorschau anschauen, Menge wählen, bestellen. Euer Planer kommt im A5-Format mit Klammerheftung.</p></section></div>;
}
