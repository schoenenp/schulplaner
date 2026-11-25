export const metadata = { title: "E-Mail prüfen" };

export default function CheckEmailPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3">
      <h1 className="text-3xl">Bitte prüfen Sie Ihr Postfach</h1>
      <p className="text-muted">
        Wir haben Ihnen einen Anmeldelink geschickt. Er ist 60 Minuten gültig. Falls keine
        E-Mail ankommt, sehen Sie bitte auch im Spam-Ordner nach.
      </p>
    </div>
  );
}
