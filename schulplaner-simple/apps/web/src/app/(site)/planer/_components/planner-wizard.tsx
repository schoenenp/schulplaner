"use client";
import { Children, createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
const WizardContext = createContext<(() => void) | null>(null);
export function useWizardNext() { return useContext(WizardContext); }
const labels = ["Euer Jahr", "Termine", "Umschlag", "Vorschau"];
const notes = ["Kleine Pläne. Große Ideen.", "Mehr als Hausaufgaben.", "Macht es zu eurem.", "Bereit für den Schulalltag."];
export function PlannerWizard({children, bookId}: {children: ReactNode; bookId: string}) {
 const [step,setStep]=useState(0);
 const screens=Children.toArray(children);
 function go(next: number) { setStep(next); window.scrollTo({top:0,behavior:"smooth"}); }
 return <WizardContext.Provider value={()=>go(Math.min(step+1,3))}><div className={`planner-app tone-${step}`}>
 <div className="wizard-top"><Link href="/planer"><ArrowLeft size={18}/> Meine Planer</Link><span>GESTALTEN · {step+1} / 4</span><span className="wizard-save">Schritt für Schritt zu eurem Heft</span></div>
 <nav className="wizard-progress" aria-label="Fortschritt">{labels.map((label,i)=><span key={label} aria-current={step===i?"step":undefined} className={i<=step?"active":""}><b>0{i+1}</b> {label}</span>)}</nav>
 <div className="wizard-stage"><aside className="wizard-art" aria-hidden="true"><span className="art-tag"><Sparkles size={16}/> EUER SCHULJAHR</span><h2>{notes[step]}</h2><div className="book-art"><span>HEY,<br/>ZUKUNFT!</span><i>Ideen · Pläne · Lieblingsmomente</i><b>✳</b></div><span className="art-sticker">100 %<br/>euer Ding.</span><p>A5 · Klammerheftung<br/>Ein ganzes Jahr voller Möglichkeiten.</p></aside>
 <div className="wizard-content">{screens.map((screen,i)=><div key={i} hidden={i!==step}>{screen}</div>)}
 <div className="wizard-bottom">{step>0?<button type="button" className="btn-secondary" onClick={()=>go(step-1)}><ArrowLeft size={18}/> Zurück</button>:<span/>}{step>0 && step<3?<button type="button" className="btn-primary" onClick={()=>go(step+1)}>Weiter <ArrowRight size={18}/></button>:step===3?<Link className="btn-primary" href={`/planer/${bookId}/bestellen`}>Zur Bestellung <ArrowRight size={18}/></Link>:null}</div></div></div>
 </div></WizardContext.Provider>;
}
