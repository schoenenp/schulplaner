export default function ProfileSection(user: {
  name?: string | null;
  email?: string | null;
}) {
  return (
    <section className="content-card space-y-4 p-5">
      <h2 className="text-2xl font-bold">Profil</h2>
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="field-shell px-4 py-3">
          <dt className="text-sm text-info-700">Name</dt>
          <dd className="font-semibold">{user.name ?? "–"}</dd>
        </div>
        <div className="field-shell px-4 py-3">
          <dt className="text-sm text-info-700">E-Mail</dt>
          <dd className="break-words font-semibold">{user.email ?? "–"}</dd>
        </div>
      </dl>
    </section>
  );
}
