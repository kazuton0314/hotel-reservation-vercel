import { CompanionPublicForm } from "@/components/companions/CompanionPublicForm";
import { getReservationByAccessKey } from "@/lib/actions/companion-public";
import { companionFormMessages } from "@/lib/i18n/companion-form";

type PageProps = {
  params: Promise<{ accessKey: string }>;
};

export default async function CompanionPublicPage({ params }: PageProps) {
  const { accessKey } = await params;
  const decoded = decodeURIComponent(accessKey);
  const { reservation, error } = await getReservationByAccessKey(decoded);
  const t = companionFormMessages("ja");

  if (error) {
    return (
      <div className="companions-public-inner">
        <header className="companions-public-header">
          <h1>{t.title}</h1>
        </header>
        <p className="companions-error">
          {t.loadError}: {error}
        </p>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="companions-public-inner">
        <header className="companions-public-header">
          <h1>{t.title}</h1>
        </header>
        <p className="companions-hint">{t.invalidLink}</p>
      </div>
    );
  }

  return (
    <>
      <div className="companions-public-inner">
        <dl className="companions-summary">
          <div className="companions-summary-row">
            <dt>{t.checkIn}</dt>
            <dd>{reservation.check_in ?? "—"}</dd>
          </div>
          <div className="companions-summary-row">
            <dt>{t.checkOut}</dt>
            <dd>{reservation.check_out ?? "—"}</dd>
          </div>
          <div className="companions-summary-row">
            <dt>{t.guests}</dt>
            <dd>{reservation.guest_total ?? "—"}</dd>
          </div>
        </dl>
      </div>

      <CompanionPublicForm
        accessKey={decoded}
        alreadyAnswered={Boolean(reservation.companion_form_answered)}
        representativeName={reservation.representative_name}
      />
    </>
  );
}
