"use client";
import { useState } from "react";
import { UploadCloud, CheckCircle2 } from "lucide-react";
import { useFormAction } from "@/components/use-form-action";
import { FormMessage } from "@/components/form-message";
import { uploadOwnCover } from "../actions";
export function CoverUpload({bookId,currentName,thumbnail}:{bookId:string;currentName:string;thumbnail:string|null}) {
 const {state,pending,onSubmit}=useFormAction(uploadOwnCover.bind(null,bookId));
 const [filename,setFilename]=useState("");
 return <div className="cover-upload"><div className="cover-current">{thumbnail && <img src={thumbnail} alt="Aktuell ausgewählter Umschlag"/>}<div><span className="flex items-center gap-2 text-sm"><CheckCircle2 size={16}/> Ausgewählt</span><strong>{currentName}</strong></div></div>
 <form onSubmit={onSubmit} className="flex flex-col gap-4"><label className="upload-zone"><UploadCloud size={30}/><strong>Euer Bild. Euer Cover.</strong><span>{filename || "JPG, PNG oder 4-seitiges PDF auswählen"}</span><input name="file" type="file" accept="image/jpeg,image/png,application/pdf" required disabled={pending} onChange={e=>setFilename(e.target.files?.[0]?.name??"")}/></label>
 <p className="text-sm text-muted">Bild: vollständig auf der Vorderseite, bei Bedarf mit weißen Rändern. Die anderen drei Seiten bleiben weiß. PDF: vier fertige Seiten in der Reihenfolge Vorderseite, innen vorne, innen hinten, Rückseite – im Format des Standardumschlags. Max. 20 MB.</p><p className="text-sm text-muted">Eigene Designs werden ohne zusätzlichen Titelaufdruck übernommen. Bitte Text bereits im Bild oder PDF anlegen.</p><FormMessage state={state}/><button className="btn-primary" disabled={pending}>{pending?"Umschlag wird vorbereitet …":"Eigenen Umschlag verwenden"}</button></form></div>;
}
