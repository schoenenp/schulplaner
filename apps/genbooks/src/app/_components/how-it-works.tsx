'use client'
import { CheckCircle, Settings, Calendar } from "lucide-react"

export default function HowItWorks() {
	return (
		<section className="section-shell py-8 lg:py-12">
			<h2 className="mb-6 text-3xl font-bold text-info-950 lg:text-4xl">So funktioniert’s</h2>
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<div className="content-card p-6">
					<Settings className="mb-4 h-8 w-8 text-pirrot-blue-500" />
					<h3 className="mb-2 text-lg font-bold">1. Planer konfigurieren</h3>
					<p className="text-info-700">Titel, Zeitraum, Bundesland und Inhalte auswählen.</p>
				</div>
				<div className="content-card p-6">
					<Calendar className="mb-4 h-8 w-8 text-pirrot-blue-500" />
					<h3 className="mb-2 text-lg font-bold">2. Vorschau prüfen</h3>
					<p className="text-info-700">Live‑Vorschau ansehen und Details anpassen.</p>
				</div>
				<div className="content-card p-6">
					<CheckCircle className="mb-4 h-8 w-8 text-pirrot-blue-500" />
					<h3 className="mb-2 text-lg font-bold">3. Bestellung abschließen</h3>
					<p className="text-info-700">Sicher bezahlen und Bestellstatus verfolgen.</p>
				</div>
			</div>
		</section>
	)
}
