"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/trpc/react";
import LoadingSpinner from "@/app/_components/loading-spinner";
import {
  Activity,
  BarChart3,
  CalendarClock,
  ClipboardCopyIcon,
  Target,
  TrendingUp,
} from "lucide-react";
import { DashboardSkeleton } from "./dashboard-states";

const CONNECT_COUNTRY_OPTIONS = [
  { code: "AT", label: "Österreich (AT)" },
  { code: "DE", label: "Deutschland (DE)" },
] as const;

const CONNECT_COUNTRY_CODE_SET: ReadonlySet<string> = new Set(
  CONNECT_COUNTRY_OPTIONS.map((option) => option.code),
);

const DEFAULT_CAMPAIGN_MAX_REDEMPTIONS = "10";
const DEFAULT_CAMPAIGN_VALID_DAYS = "90";
type CampaignEditState = {
  maxRedemptions: string;
  validForDays: string;
};

type CampaignUpdateNotice = {
  variant: "rotated" | "updated";
  message: string;
  token?: string;
};

function inferConnectCountryFromBrowser(): string {
  if (typeof navigator === "undefined") {
    return "AT";
  }

  const candidates = [navigator.language, ...navigator.languages];
  for (const locale of candidates) {
    const normalized = locale.replace(/_/g, "-");
    const parts = normalized.split("-");
    for (const part of parts) {
      const upper = part.toUpperCase();
      if (/^[A-Z]{2}$/.test(upper) && CONNECT_COUNTRY_CODE_SET.has(upper)) {
        return upper;
      }
    }
  }

  return "AT";
}

function formatUnixDate(unix?: number): string {
  if (!unix) {
    return "Unbegrenzt";
  }
  return new Date(unix * 1000).toLocaleDateString("de-DE");
}

function inferValidDaysFromExpiresAt(expiresAt?: number): string {
  if (!expiresAt) {
    return DEFAULT_CAMPAIGN_VALID_DAYS;
  }
  const diffMs = expiresAt * 1000 - Date.now();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return String(Math.max(diffDays, 1));
}

function formatEuro(amountCents: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amountCents / 100);
}

function formatSubscriptionOption(option: {
  interval: "month" | "year" | null;
  unitAmount: number | null;
  currency: string | null;
}): string {
  const amount =
    typeof option.unitAmount === "number" && option.currency
      ? new Intl.NumberFormat("de-DE", {
          style: "currency",
          currency: option.currency.toUpperCase(),
        }).format(option.unitAmount / 100)
      : "Preis";

  const intervalLabel =
    option.interval === "month"
      ? "Monat"
      : option.interval === "year"
        ? "Jahr"
        : "Intervall";

  return `${amount} / ${intervalLabel}`;
}

function friendlyErrorMessage(
  rawMessage: string | undefined,
  fallback: string,
): string {
  if (!rawMessage) {
    return fallback;
  }
  if (
    rawMessage.includes("Invalid `") ||
    rawMessage.includes("Cannot read properties of undefined") ||
    rawMessage.includes("Unknown argument `")
  ) {
    return fallback;
  }
  return rawMessage;
}

type SessionUser = {
  id?: string | undefined;
  name?: string | null | undefined;
  email?: string | null | undefined;
  image?: string | null | undefined;
};

function SubscriptionLockedSection(props: {
  locked: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`relative ${props.className}`}>
      <div
        className={
          props.locked
            ? "pointer-events-none opacity-60 blur-[2px] select-none"
            : undefined
        }
      >
        {props.children}
      </div>
      {props.locked ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="rounded bg-white/90 px-3 py-2 text-center text-xs font-semibold">
            Aktives Partner-Programm-Abo erforderlich
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function ProfileSection(user: SessionUser) {
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [customPromoCode, setCustomPromoCode] = useState("");
  const [campaignMaxRedemptions, setCampaignMaxRedemptions] = useState(
    DEFAULT_CAMPAIGN_MAX_REDEMPTIONS,
  );
  const [campaignValidDays, setCampaignValidDays] = useState(
    DEFAULT_CAMPAIGN_VALID_DAYS,
  );
  const [connectCountry, setConnectCountry] = useState("AT");
  const [campaignEdits, setCampaignEdits] = useState<
    Record<string, CampaignEditState>
  >({});
  const [campaignUpdateNotice, setCampaignUpdateNotice] =
    useState<CampaignUpdateNotice | null>(null);
  const [campaignLinkCopyFeedback, setCampaignLinkCopyFeedback] = useState("");
  const [copyingCampaignId, setCopyingCampaignId] = useState<string | null>(
    null,
  );
  const searchParams = useSearchParams();
  const utils = api.useUtils();

  const partnerStatus = api.partner.getStatus.useQuery();
  const userBooks = api.book.getUserBooks.useQuery(undefined, {
    enabled: partnerStatus.data?.onboardingComplete === true,
  });
  const campaigns = api.partner.listCampaigns.useQuery(undefined, {
    enabled: partnerStatus.data?.onboardingComplete === true,
  });
  const salesOverview = api.partner.getSalesOverview.useQuery(undefined, {
    enabled: partnerStatus.data?.onboardingComplete === true,
  });

  const startOnboarding = api.partner.startConnectOnboarding.useMutation({
    onSuccess: (data) => {
      window.location.href = data.onboardingUrl;
    },
  });

  const finalizeOnboarding = api.partner.finalizeConnectOnboarding.useMutation({
    onSuccess: async () => {
      await utils.partner.getStatus.invalidate();
      await utils.user.getMyRole.invalidate();
      await utils.partner.listCampaigns.invalidate();
      await utils.partner.getSalesOverview.invalidate();
    },
  });

  const createCampaign = api.partner.createCampaign.useMutation({
    onSuccess: async () => {
      await utils.partner.listCampaigns.invalidate();
      await utils.partner.getSalesOverview.invalidate();
      setCustomPromoCode("");
      setCampaignMaxRedemptions(DEFAULT_CAMPAIGN_MAX_REDEMPTIONS);
      setCampaignValidDays(DEFAULT_CAMPAIGN_VALID_DAYS);
    },
  });

  const startSubscriptionCheckout =
    api.partner.startSubscriptionCheckout.useMutation({
      onSuccess: (data) => {
        window.location.href = data.checkoutUrl;
      },
    });

  const openSubscriptionPortal = api.partner.openSubscriptionPortal.useMutation(
    {
      onSuccess: (data) => {
        window.location.href = data.portalUrl;
      },
    },
  );

  const updateCampaign = api.partner.updateCampaign.useMutation({
    onMutate: () => {
      setCampaignUpdateNotice(null);
      setCampaignLinkCopyFeedback("");
    },
    onSuccess: async (data, variables) => {
      await utils.partner.listCampaigns.invalidate();
      await utils.partner.getSalesOverview.invalidate();
      const isRotatedCampaign = data.id !== variables.campaignId;
      setCampaignUpdateNotice(
        isRotatedCampaign
          ? {
              variant: "rotated",
              message:
                "Kampagne wurde mit neuen Limits neu erstellt. Bitte den neuen Link verwenden.",
              token: data.token,
            }
          : {
              variant: "updated",
              message: "Kampagnen-Einstellungen wurden gespeichert.",
            },
      );
    },
  });
  useEffect(() => {
    setConnectCountry(inferConnectCountryFromBrowser());
  }, []);

  useEffect(() => {
    const hasReturned =
      searchParams.get("partner_return") === "1" ||
      searchParams.get("partner_refresh") === "1";

    if (hasReturned && !finalizeOnboarding.isPending) {
      finalizeOnboarding.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const subscriptionRedirectState = searchParams.get("partner_sub");
    if (!subscriptionRedirectState) {
      return;
    }

    void utils.partner.getStatus.invalidate();
  }, [searchParams, utils.partner.getStatus]);

  useEffect(() => {
    if (!campaigns.data) {
      return;
    }

    setCampaignEdits((prev) => {
      const next = { ...prev };
      for (const campaign of campaigns.data) {
        next[campaign.id] ??= {
          maxRedemptions: String(campaign.maxRedemptions ?? 1),
          validForDays: inferValidDaysFromExpiresAt(campaign.expiresAt),
        };
      }
      return next;
    });
  }, [campaigns.data]);

  const templateOptions = useMemo(
    () => (userBooks.data ?? []).filter((book) => Boolean(book.isTemplate)),
    [userBooks.data],
  );
  const subscription = partnerStatus.data?.subscription;
  const hasActiveSubscription = subscription?.isActive ?? false;
  const role = partnerStatus.data?.role ?? "USER";
  const roleLabel =
    role === "PARTNER" || role === "SPONSOR"
      ? "Partner-Konto"
      : role === "ADMIN"
        ? "Administrator"
        : role === "STAFF"
          ? "Team"
          : "Standardkonto";
  const isConnectReady = partnerStatus.data?.onboardingComplete === true;
  const subscriptionLabel = !partnerStatus.data?.subscription
    .requiredPriceConfigured
    ? "Nicht konfiguriert"
    : hasActiveSubscription
      ? "Aktiv"
      : "Inaktiv";
  const hasPartnerAccess =
    partnerStatus.data?.role === "PARTNER" ||
    partnerStatus.data?.role === "SPONSOR" ||
    partnerStatus.data?.role === "ADMIN" ||
    partnerStatus.data?.role === "STAFF";
  const configuredPriceOptions = subscription?.configuredPriceOptions ?? [];
  const campaignItems = useMemo(() => campaigns.data ?? [], [campaigns.data]);
  const campaignOverview = useMemo(() => {
    const nowUnix = Date.now() / 1000;
    const withMeta = campaignItems.map((campaign) => {
      const redemptionValue =
        typeof campaign.activeRedemptions === "number"
          ? campaign.activeRedemptions
          : campaign.timesRedeemed;
      const limit = campaign.maxRedemptions;
      const remaining =
        typeof limit === "number"
          ? Math.max(limit - redemptionValue, 0)
          : undefined;
      const utilizationPercent =
        typeof limit === "number" && limit > 0
          ? Math.min(100, Math.round((redemptionValue / limit) * 100))
          : undefined;
      const daysToExpire =
        typeof campaign.expiresAt === "number"
          ? Math.ceil((campaign.expiresAt - nowUnix) / 86400)
          : undefined;
      return {
        ...campaign,
        redemptionValue,
        remaining,
        utilizationPercent,
        daysToExpire,
      };
    });

    const totalRedeemed = withMeta.reduce(
      (sum, campaign) => sum + campaign.redemptionValue,
      0,
    );
    const totalLimitedCapacity = withMeta.reduce(
      (sum, campaign) => sum + (campaign.maxRedemptions ?? 0),
      0,
    );
    const totalRemaining = withMeta.reduce(
      (sum, campaign) => sum + (campaign.remaining ?? 0),
      0,
    );
    const limitedUtilizationPercent =
      totalLimitedCapacity > 0
        ? Math.round((totalRedeemed / totalLimitedCapacity) * 100)
        : 0;

    const topCampaigns = [...withMeta]
      .sort((a, b) => b.redemptionValue - a.redemptionValue)
      .slice(0, 5);

    const expiringSoon = withMeta
      .filter(
        (campaign) =>
          typeof campaign.daysToExpire === "number" &&
          campaign.daysToExpire >= 0 &&
          campaign.daysToExpire <= 30,
      )
      .sort(
        (a, b) =>
          (a.daysToExpire ?? Number.POSITIVE_INFINITY) -
          (b.daysToExpire ?? Number.POSITIVE_INFINITY),
      )
      .slice(0, 4);

    return {
      totalRedeemed,
      totalLimitedCapacity,
      totalRemaining,
      limitedUtilizationPercent,
      topCampaigns,
      expiringSoon,
    };
  }, [campaignItems]);
  const maxTopCampaignRedeemed = Math.max(
    1,
    ...campaignOverview.topCampaigns.map(
      (campaign) => campaign.redemptionValue,
    ),
  );

  const setCampaignEditField = (
    campaignId: string,
    field: keyof CampaignEditState,
    value: string,
  ) => {
    setCampaignEdits((prev) => ({
      ...prev,
      [campaignId]: {
        maxRedemptions: prev[campaignId]?.maxRedemptions ?? "1",
        validForDays:
          prev[campaignId]?.validForDays ?? DEFAULT_CAMPAIGN_VALID_DAYS,
        [field]: value,
      },
    }));
  };

  const handleCopyCampaignLink = async (link: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCampaignLinkCopyFeedback("Kopieren nicht unterstützt.");
      return;
    }

    try {
      await navigator.clipboard.writeText(link);
      setCampaignLinkCopyFeedback("Neuer Link wurde kopiert.");
    } catch {
      setCampaignLinkCopyFeedback("Link konnte nicht kopiert werden.");
    }
  };

  if (partnerStatus.isLoading) {
    return (
      <div className="relative flex flex-1 flex-col gap-4 lg:min-h-96">
        <DashboardSkeleton rows={3} />
        <DashboardSkeleton rows={4} />
      </div>
    );
  }

  return (
    <div className="content-card rise-in relative flex flex-1 flex-col gap-6 p-4 lg:min-h-96">
      <div className="content-card border-pirrot-blue-200 to-pirrot-blue-50/50 border bg-gradient-to-br from-white p-5">
        <h2 className="text-2xl font-black uppercase">Profil</h2>
        <p className="text-info-700 mt-2 text-sm">
          Persönliche Kontodaten und Ihr aktueller Partner-Status auf einen
          Blick.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="field-shell rounded-lg p-3">
            <p className="text-info-700 text-xs uppercase">E-Mail</p>
            <p className="mt-1 text-sm font-semibold">{user.email ?? "-"}</p>
          </div>
          <div className="field-shell rounded-lg p-3">
            <p className="text-info-700 text-xs uppercase">Konto-Typ</p>
            <p className="mt-1 text-sm font-semibold">{roleLabel}</p>
          </div>
          <div className="field-shell rounded-lg p-3">
            <p className="text-info-700 text-xs uppercase">Stripe Connect</p>
            <p
              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                isConnectReady
                  ? "bg-pirrot-green-100 text-pirrot-green-800"
                  : "bg-pirrot-blue-100 text-pirrot-blue-800"
              }`}
            >
              {isConnectReady ? "Verbunden" : "Nicht verbunden"}
            </p>
          </div>
          <div className="field-shell rounded-lg p-3">
            <p className="text-info-700 text-xs uppercase">Partner-Abo</p>
            <p
              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                hasActiveSubscription
                  ? "bg-pirrot-green-100 text-pirrot-green-800"
                  : "bg-pirrot-blue-100 text-pirrot-blue-800"
              }`}
            >
              {subscriptionLabel}
            </p>
          </div>
        </div>
      </div>

      {hasPartnerAccess ? (
        <div className="content-card p-4">
          <h3 className="text-xl font-bold">Partner-Bereich</h3>
          <p className="text-info-700 mt-2 text-sm">
            Eingehende Partner-Bestellungen und Archiv finden Sie jetzt im
            eigenen Bereich.
          </p>
          <a
            href="/dashboard?view=partner"
            className="btn-soft mt-3 inline-flex px-3 py-2 text-sm"
          >
            Zum Partner-Bereich
          </a>
        </div>
      ) : null}

      {!partnerStatus.data?.onboardingComplete ? (
        <div className="flex flex-col gap-6">
          <div className="content-card flex flex-col gap-3 p-4">
            <h3 className="text-xl font-bold">Partner-Programm-Abo</h3>
            {configuredPriceOptions.length > 0 ? (
              <ul className="text-sm">
                {configuredPriceOptions.map((priceOption) => (
                  <li key={priceOption.id}>
                    <b>{formatSubscriptionOption(priceOption)}</b>
                  </li>
                ))}
              </ul>
            ) : null}
            {!partnerStatus.data?.subscription.requiredPriceConfigured ? (
              <p className="text-pirrot-red-500 text-sm">
                Preis-ID fehlt. Konfigurieren Sie
                `STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID` und/oder
                `STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID`, damit das Abo
                gestartet werden kann.
              </p>
            ) : hasActiveSubscription ? (
              <>
                <p className="text-sm">
                  Status: <b>Aktiv</b>
                  {partnerStatus.data?.subscription.cancelAtPeriodEnd
                    ? " (endet am Periodenende)"
                    : ""}
                </p>
                <p className="text-info-700 text-xs">
                  Laufzeit bis:{" "}
                  {formatUnixDate(
                    partnerStatus.data?.subscription.currentPeriodEnd ??
                      undefined,
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => openSubscriptionPortal.mutate()}
                  disabled={
                    openSubscriptionPortal.isPending ||
                    startSubscriptionCheckout.isPending
                  }
                  className="btn-soft w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openSubscriptionPortal.isPending
                    ? "Öffne..."
                    : "Abo verwalten"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Abo zuerst abschließen, danach wird Stripe Connect
                  freigeschaltet.
                </p>
                <div className="flex flex-wrap gap-2">
                  {configuredPriceOptions.map((priceOption) => (
                    <button
                      key={priceOption.id}
                      type="button"
                      onClick={() =>
                        startSubscriptionCheckout.mutate({
                          priceId: priceOption.id,
                        })
                      }
                      disabled={
                        startSubscriptionCheckout.isPending ||
                        openSubscriptionPortal.isPending
                      }
                      className="btn-solid w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {startSubscriptionCheckout.isPending
                        ? "Weiterleitung..."
                        : `Abo starten (${formatSubscriptionOption(priceOption)})`}
                    </button>
                  ))}
                </div>
              </>
            )}
            {startSubscriptionCheckout.error && (
              <p className="text-pirrot-red-500 text-sm">
                {startSubscriptionCheckout.error.message}
              </p>
            )}
            {openSubscriptionPortal.error && (
              <p className="text-pirrot-red-500 text-sm">
                {openSubscriptionPortal.error.message}
              </p>
            )}
          </div>

          {hasActiveSubscription ? (
            <div className="content-card flex flex-col gap-3 p-4">
              <h3 className="text-xl font-bold">Partner werden</h3>
              <p className="text-sm">
                Verbinden Sie Ihr Stripe-Konto, um Partner-Kampagnen zu
                erstellen.
              </p>
              <>
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="connect-country"
                    className="text-sm font-semibold"
                  >
                    Land für Stripe Connect
                  </label>
                  <select
                    id="connect-country"
                    value={connectCountry}
                    onChange={(event) => setConnectCountry(event.target.value)}
                    disabled={
                      startOnboarding.isPending || finalizeOnboarding.isPending
                    }
                    className="field-shell w-fit px-3 py-2 text-sm"
                  >
                    {CONNECT_COUNTRY_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-info-700 text-xs">
                    Das Land kann nach Erstellung des Connect-Kontos nicht mehr
                    im Dashboard geändert werden.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={
                    startOnboarding.isPending || finalizeOnboarding.isPending
                  }
                  onClick={() =>
                    startOnboarding.mutate({
                      country: connectCountry,
                    })
                  }
                  className="btn-solid w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {startOnboarding.isPending
                    ? "Weiterleitung..."
                    : "Partner werden"}
                </button>
              </>
              {startOnboarding.error && (
                <p className="text-pirrot-red-500 text-sm">
                  {startOnboarding.error.message}
                </p>
              )}
              {finalizeOnboarding.error && (
                <p className="text-pirrot-red-500 text-sm">
                  {finalizeOnboarding.error.message}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div
            className={`field-shell p-4 ${
              hasActiveSubscription
                ? "bg-pirrot-green-100/30"
                : "bg-pirrot-blue-100/30"
            }`}
          >
            <h3 className="text-xl font-bold">
              {hasActiveSubscription
                ? "Partner-Programm aktiv"
                : "Partner-Programm-Abo erforderlich"}
            </h3>
            <p className="text-sm">
              Ihre Vorlagen sind Ihre Produkte. Steuern Sie Ihre Kampagnen
              zentral über Laufzeit, Nutzung und Aktiv-Status.
            </p>
          </div>

          <div className="content-card flex flex-col gap-3 p-4">
            <h3 className="text-xl font-bold">Partner-Programm-Abo</h3>
            {configuredPriceOptions.length > 0 ? (
              <ul className="text-sm">
                {configuredPriceOptions.map((priceOption) => (
                  <li key={priceOption.id}>
                    <b>{formatSubscriptionOption(priceOption)}</b>
                  </li>
                ))}
              </ul>
            ) : null}
            {!partnerStatus.data?.subscription.requiredPriceConfigured ? (
              <p className="text-pirrot-red-500 text-sm">
                Preis-ID fehlt. Konfigurieren Sie
                `STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID` und/oder
                `STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID`, damit das Abo
                gestartet werden kann.
              </p>
            ) : hasActiveSubscription ? (
              <>
                <p className="text-sm">
                  Status: <b>Aktiv</b>
                  {partnerStatus.data?.subscription.cancelAtPeriodEnd
                    ? " (endet am Periodenende)"
                    : ""}
                </p>
                <p className="text-info-700 text-xs">
                  Laufzeit bis:{" "}
                  {formatUnixDate(
                    partnerStatus.data?.subscription.currentPeriodEnd ??
                      undefined,
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => openSubscriptionPortal.mutate()}
                  disabled={
                    openSubscriptionPortal.isPending ||
                    startSubscriptionCheckout.isPending
                  }
                  className="btn-soft w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {openSubscriptionPortal.isPending
                    ? "Öffne..."
                    : "Abo verwalten"}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Ohne aktives Abo können keine Kampagnen erstellt oder
                  reaktiviert werden.
                </p>
                <div className="flex flex-wrap gap-2">
                  {configuredPriceOptions.map((priceOption) => (
                    <button
                      key={priceOption.id}
                      type="button"
                      onClick={() =>
                        startSubscriptionCheckout.mutate({
                          priceId: priceOption.id,
                        })
                      }
                      disabled={
                        startSubscriptionCheckout.isPending ||
                        openSubscriptionPortal.isPending
                      }
                      className="btn-solid w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {startSubscriptionCheckout.isPending
                        ? "Weiterleitung..."
                        : `Abo starten (${formatSubscriptionOption(priceOption)})`}
                    </button>
                  ))}
                </div>
              </>
            )}
            {startSubscriptionCheckout.error && (
              <p className="text-pirrot-red-500 text-sm">
                {startSubscriptionCheckout.error.message}
              </p>
            )}
            {openSubscriptionPortal.error && (
              <p className="text-pirrot-red-500 text-sm">
                {openSubscriptionPortal.error.message}
              </p>
            )}
          </div>

          <SubscriptionLockedSection
            locked={!hasActiveSubscription}
            className="content-card flex flex-col gap-3 p-4"
          >
            <h3 className="text-xl font-bold">Sales Übersicht</h3>
            {salesOverview.isLoading ? (
              <LoadingSpinner />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="field-shell p-3 text-sm">
                  <p className="text-info-700">Kampagnen</p>
                  <p className="text-2xl font-black">
                    {salesOverview.data?.campaignCount ?? 0}
                  </p>
                  <p className="text-info-700 text-xs">
                    Aktiv: {salesOverview.data?.activeCampaignCount ?? 0}
                  </p>
                </div>
                <div className="field-shell p-3 text-sm">
                  <p className="text-info-700">Einlösungen</p>
                  <p className="text-2xl font-black">
                    {salesOverview.data?.totalRedemptions ?? 0}
                  </p>
                  <p className="text-info-700 text-xs">
                    Offen: {salesOverview.data?.remainingRedemptions ?? 0}
                    {" · "}
                    Storniert: {salesOverview.data?.canceledRedemptions ?? 0}
                  </p>
                </div>
                <div className="field-shell p-3 text-sm">
                  <p className="text-info-700">Abgerechnete Partner-Summe</p>
                  <p className="text-2xl font-black">
                    {(
                      (salesOverview.data?.billedPartnerAmountCents ?? 0) / 100
                    ).toFixed(2)}{" "}
                    EUR
                  </p>
                  <p className="text-info-700 text-xs">
                    Rechnungen: {salesOverview.data?.partnerInvoiceCount ?? 0}
                  </p>
                </div>
              </div>
            )}
            {salesOverview.error && (
              <p className="text-pirrot-red-500 text-sm">
                {friendlyErrorMessage(
                  salesOverview.error.message,
                  "Sales-Übersicht konnte nicht geladen werden.",
                )}
              </p>
            )}
          </SubscriptionLockedSection>

          <SubscriptionLockedSection
            locked={!hasActiveSubscription}
            className="content-card flex flex-col gap-4 p-4"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="text-pirrot-blue-700" size={18} />
              <h3 className="text-xl font-bold">Erweiterte Kampagnenanalyse</h3>
            </div>
            {campaigns.isLoading || salesOverview.isLoading ? (
              <LoadingSpinner />
            ) : campaignItems.length === 0 ? (
              <p className="text-info-700 text-sm">
                Noch keine Kampagnendaten vorhanden.
              </p>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="field-shell flex flex-col gap-1 p-3 text-sm">
                    <p className="text-info-700 inline-flex items-center gap-2">
                      <Activity size={14} />
                      Nutzungsgrad (limitierte Kampagnen)
                    </p>
                    <p className="text-2xl font-black">
                      {campaignOverview.limitedUtilizationPercent}%
                    </p>
                    <p className="text-info-700 text-xs">
                      {campaignOverview.totalRedeemed} von{" "}
                      {campaignOverview.totalLimitedCapacity} Einlösungen
                    </p>
                  </div>
                  <div className="field-shell flex flex-col gap-1 p-3 text-sm">
                    <p className="text-info-700 inline-flex items-center gap-2">
                      <Target size={14} />
                      Offene Einlösungen
                    </p>
                    <p className="text-2xl font-black">
                      {campaignOverview.totalRemaining}
                    </p>
                    <p className="text-info-700 text-xs">
                      über limitierte Kampagnen hinweg
                    </p>
                  </div>
                  <div className="field-shell flex flex-col gap-1 p-3 text-sm">
                    <p className="text-info-700 inline-flex items-center gap-2">
                      <TrendingUp size={14} />Ø Einlösungen je Kampagne
                    </p>
                    <p className="text-2xl font-black">
                      {(
                        campaignOverview.totalRedeemed /
                        Math.max(campaignItems.length, 1)
                      ).toFixed(1)}
                    </p>
                    <p className="text-info-700 text-xs">
                      bei {campaignItems.length} Kampagnen
                    </p>
                  </div>
                  <div className="field-shell flex flex-col gap-1 p-3 text-sm">
                    <p className="text-info-700 inline-flex items-center gap-2">
                      <BarChart3 size={14} />
                      Partner-Umsatz
                    </p>
                    <p className="text-2xl font-black">
                      {formatEuro(
                        salesOverview.data?.billedPartnerAmountCents ?? 0,
                      )}
                    </p>
                    <p className="text-info-700 text-xs">
                      Rechnungen: {salesOverview.data?.partnerInvoiceCount ?? 0}
                    </p>
                  </div>
                </div>

                <div className="field-shell flex flex-col gap-3 p-3 text-sm">
                  <p className="font-semibold">
                    Top-Kampagnen nach Einlösungen
                  </p>
                  {campaignOverview.topCampaigns.length === 0 ? (
                    <p className="text-info-700 text-xs">
                      Noch keine Einlösungen vorhanden.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {campaignOverview.topCampaigns.map((campaign) => {
                        const barPercent = Math.max(
                          8,
                          Math.round(
                            (campaign.redemptionValue /
                              maxTopCampaignRedeemed) *
                              100,
                          ),
                        );
                        return (
                          <div key={campaign.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold">
                                {campaign.code}
                              </span>
                              <span className="text-info-700">
                                {campaign.redemptionValue} aktive Einlösungen
                              </span>
                            </div>
                            <div className="bg-pirrot-blue-100 h-2.5 rounded-full">
                              <div
                                className="from-pirrot-blue-500 to-pirrot-blue-700 h-full rounded-full bg-gradient-to-r"
                                style={{ width: `${barPercent}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="field-shell flex flex-col gap-2 p-3 text-sm xl:col-span-2">
                  <p className="inline-flex items-center gap-2 font-semibold">
                    <CalendarClock size={14} />
                    Kampagnen mit Ablauf in den nächsten 30 Tagen
                  </p>
                  {campaignOverview.expiringSoon.length === 0 ? (
                    <p className="text-info-700 text-xs">
                      Keine Kampagnen laufen in den nächsten 30 Tagen ab.
                    </p>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-2">
                      {campaignOverview.expiringSoon.map((campaign) => (
                        <li
                          key={campaign.id}
                          className="rounded bg-white/55 p-2"
                        >
                          <p className="font-semibold">{campaign.code}</p>
                          <p className="text-info-700 text-xs">
                            {campaign.daysToExpire === 0
                              ? "Läuft heute ab"
                              : `Läuft in ${campaign.daysToExpire} Tagen ab`}
                          </p>
                          <p className="text-info-700 text-xs">
                            Einlösungen: {campaign.timesRedeemed}
                            {typeof campaign.activeRedemptions === "number" &&
                            typeof campaign.canceledRedemptions === "number"
                              ? ` (aktiv ${campaign.activeRedemptions}, storniert ${campaign.canceledRedemptions})`
                              : ""}
                            {typeof campaign.maxRedemptions === "number"
                              ? ` / ${campaign.maxRedemptions}`
                              : " / Unbegrenzt"}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {campaigns.error && (
              <p className="text-pirrot-red-500 text-sm">
                {friendlyErrorMessage(
                  campaigns.error.message,
                  "Kampagnen konnten nicht geladen werden.",
                )}
              </p>
            )}
          </SubscriptionLockedSection>

          <SubscriptionLockedSection
            locked={!hasActiveSubscription}
            className="content-card flex flex-col gap-3 p-4"
          >
            <h3 className="text-xl font-bold">Kampagne erstellen</h3>
            {userBooks.isLoading ? (
              <LoadingSpinner />
            ) : templateOptions.length === 0 ? (
              <p className="text-sm">
                Keine Vorlagen gefunden. Markieren Sie zuerst einen Planer als
                Vorlage.
              </p>
            ) : (
              <>
                <label htmlFor="templateId" className="text-sm font-semibold">
                  Vorlage
                </label>
                <select
                  id="templateId"
                  value={selectedTemplateId}
                  onChange={(event) =>
                    setSelectedTemplateId(event.target.value)
                  }
                  className="field-shell p-2"
                >
                  <option value="">Bitte auswählen</option>
                  {templateOptions.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>

                <div className="grid gap-2 md:grid-cols-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="promoCode"
                      className="text-sm font-semibold"
                    >
                      Promo-Code (optional)
                    </label>
                    <input
                      id="promoCode"
                      value={customPromoCode}
                      onChange={(event) =>
                        setCustomPromoCode(event.target.value.toUpperCase())
                      }
                      className="field-shell p-2"
                      placeholder="Automatisch, wenn leer"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="campaign-max-redemptions"
                      className="text-sm font-semibold"
                    >
                      Max. Einlösungen
                    </label>
                    <input
                      id="campaign-max-redemptions"
                      type="number"
                      min={1}
                      max={1000}
                      value={campaignMaxRedemptions}
                      onChange={(event) =>
                        setCampaignMaxRedemptions(event.target.value)
                      }
                      className="field-shell p-2"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="campaign-valid-days"
                      className="text-sm font-semibold"
                    >
                      Laufzeit (Tage)
                    </label>
                    <input
                      id="campaign-valid-days"
                      type="number"
                      min={1}
                      max={365}
                      value={campaignValidDays}
                      onChange={(event) =>
                        setCampaignValidDays(event.target.value)
                      }
                      className="field-shell p-2"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={
                    !selectedTemplateId ||
                    createCampaign.isPending ||
                    !hasActiveSubscription
                  }
                  onClick={() =>
                    createCampaign.mutate({
                      templateId: selectedTemplateId,
                      promoCode: customPromoCode || undefined,
                      maxRedemptions:
                        Number.parseInt(campaignMaxRedemptions, 10) || 1,
                      validForDays: Number.parseInt(campaignValidDays, 10) || 1,
                    })
                  }
                  className="btn-solid w-fit px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createCampaign.isPending
                    ? "Erstelle..."
                    : "Kampagne erstellen"}
                </button>
                {!hasActiveSubscription && (
                  <p className="text-info-700 text-xs">
                    Für neue Kampagnen ist ein aktives Partner-Programm-Abo
                    erforderlich.
                  </p>
                )}
                {createCampaign.error && (
                  <p className="text-pirrot-red-500 text-sm">
                    {createCampaign.error.message}
                  </p>
                )}
              </>
            )}

            {createCampaign.data && (
              <div className="field-shell mt-2 p-3 text-sm">
                <p>
                  <b>Promo-Code:</b> {createCampaign.data.promoCode}
                </p>
                <p>
                  <b>Max. Einlösungen:</b> {createCampaign.data.maxRedemptions}
                </p>
                <p>
                  <b>Ablauf:</b> {formatUnixDate(createCampaign.data.expiresAt)}
                </p>
                <p className="break-all">
                  <b>Link:</b>{" "}
                  {typeof window !== "undefined"
                    ? `${window.location.origin}/template?t=${createCampaign.data.token}`
                    : createCampaign.data.token}
                </p>
              </div>
            )}
          </SubscriptionLockedSection>

          <SubscriptionLockedSection
            locked={!hasActiveSubscription}
            className="content-card flex flex-col gap-3 p-4"
          >
            <h3 className="text-xl font-bold">Meine Kampagnen</h3>
            {!hasActiveSubscription && (
              <p className="text-info-700 text-xs">
                Kampagnen können ohne aktives Abo pausiert, aber nicht
                reaktiviert oder erweitert werden.
              </p>
            )}
            {campaignUpdateNotice && (
              <div
                className={`rounded border p-3 text-sm ${
                  campaignUpdateNotice.variant === "rotated"
                    ? "border-pirrot-green-300/50 bg-pirrot-green-100/50"
                    : "border-pirrot-blue-300/50 bg-pirrot-blue-100/50"
                }`}
              >
                <p>
                  <b>
                    {campaignUpdateNotice.variant === "rotated"
                      ? "Hinweis zur Link-Aenderung:"
                      : "Update:"}
                  </b>{" "}
                  {campaignUpdateNotice.message}
                </p>
                {campaignUpdateNotice.token && (
                  <>
                    <p className="mt-2 break-all">
                      <b>Neuer Link:</b>{" "}
                      {typeof window !== "undefined"
                        ? `${window.location.origin}/template?t=${campaignUpdateNotice.token}`
                        : campaignUpdateNotice.token}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const token = campaignUpdateNotice.token;
                        if (!token || typeof window === "undefined") {
                          return;
                        }
                        const nextLink = `${window.location.origin}/template?t=${token}`;
                        void handleCopyCampaignLink(nextLink);
                      }}
                      className="btn-soft mt-2 px-3 py-2"
                    >
                      Link kopieren
                    </button>
                    {campaignLinkCopyFeedback && (
                      <p className="mt-2 text-xs">{campaignLinkCopyFeedback}</p>
                    )}
                  </>
                )}
              </div>
            )}
            {campaigns.isLoading ? (
              <LoadingSpinner />
            ) : campaigns.data && campaigns.data.length > 0 ? (
              <ul className="flex flex-col gap-3">
                {campaigns.data.map((campaign, index) => (
                  <li
                    key={campaign.id}
                    className="field-shell stagger-item p-3 text-sm"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <p>
                      <b>Code:</b> {campaign.code}
                    </p>
                    <p>
                      <b>Status:</b> {campaign.active ? "Aktiv" : "Pausiert"}
                    </p>
                    <p>
                      <b>Einlösungen:</b> {campaign.timesRedeemed} /{" "}
                      {campaign.maxRedemptions ?? "Unbegrenzt"}
                    </p>
                    {typeof campaign.activeRedemptions === "number" &&
                    typeof campaign.canceledRedemptions === "number" ? (
                      <p>
                        <b>Aktiv:</b> {campaign.activeRedemptions}{" "}
                        <b className="ml-2">Storniert:</b>{" "}
                        {campaign.canceledRedemptions}
                      </p>
                    ) : null}
                    <p>
                      <b>Ablauf:</b> {formatUnixDate(campaign.expiresAt)}
                    </p>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          typeof navigator !== "undefined" &&
                          navigator.clipboard
                        ) {
                          try {
                            await navigator.clipboard.writeText(
                              typeof window !== "undefined"
                                ? `${window.location.origin}/template?t=${campaign.token}`
                                : campaign.token,
                            );
                            setCopyingCampaignId(campaign.id);
                            setTimeout(() => setCopyingCampaignId(null), 2000);
                          } catch {
                            // silently fail
                          }
                        }
                      }}
                      className="border-pirrot-blue-300/40 bg-pirrot-blue-50/50 hover:bg-pirrot-blue-100 mt-2 flex w-full items-center gap-2 rounded border p-2 text-left"
                    >
                      <span className="text-pirrot-blue-700 grow font-mono text-sm break-all">
                        {typeof window !== "undefined"
                          ? `${window.location.origin}/template?t=${campaign.token}`
                          : campaign.token}
                      </span>
                      <span className="text-pirrot-blue-600 bg-pirrot-blue-100 shrink-0 rounded p-2 py-4">
                        <ClipboardCopyIcon className="h-5 w-5" />
                      </span>
                    </button>
                    {copyingCampaignId === campaign.id && (
                      <p className="mt-1 text-xs font-medium text-green-600">
                        In die Zwischenablage kopiert
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={
                          updateCampaign.isPending ||
                          (!hasActiveSubscription && !campaign.active)
                        }
                        onClick={() =>
                          updateCampaign.mutate({
                            campaignId: campaign.id,
                            active: !campaign.active,
                          })
                        }
                        className="btn-soft px-3 py-2 disabled:opacity-50"
                      >
                        {campaign.active ? "Pausieren" : "Aktivieren"}
                      </button>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold">
                          Max. Einlösungen
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={
                            campaignEdits[campaign.id]?.maxRedemptions ??
                            String(campaign.maxRedemptions ?? 1)
                          }
                          onChange={(event) =>
                            setCampaignEditField(
                              campaign.id,
                              "maxRedemptions",
                              event.target.value,
                            )
                          }
                          className="field-shell p-2"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-xs font-semibold">
                          Laufzeit (Tage)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={
                            campaignEdits[campaign.id]?.validForDays ??
                            inferValidDaysFromExpiresAt(campaign.expiresAt)
                          }
                          onChange={(event) =>
                            setCampaignEditField(
                              campaign.id,
                              "validForDays",
                              event.target.value,
                            )
                          }
                          className="field-shell p-2"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={
                            updateCampaign.isPending || !hasActiveSubscription
                          }
                          onClick={() =>
                            updateCampaign.mutate({
                              campaignId: campaign.id,
                              maxRedemptions:
                                Number.parseInt(
                                  campaignEdits[campaign.id]?.maxRedemptions ??
                                    String(campaign.maxRedemptions ?? 1),
                                  10,
                                ) || 1,
                              validForDays:
                                Number.parseInt(
                                  campaignEdits[campaign.id]?.validForDays ??
                                    inferValidDaysFromExpiresAt(
                                      campaign.expiresAt,
                                    ),
                                  10,
                                ) || 1,
                            })
                          }
                          className="btn-solid w-full px-3 py-2 disabled:opacity-50"
                        >
                          Einstellungen speichern
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm">Noch keine Kampagnen erstellt.</p>
            )}
            {updateCampaign.error && (
              <p className="text-pirrot-red-500 text-sm">
                {updateCampaign.error.message}
              </p>
            )}
          </SubscriptionLockedSection>
        </div>
      )}
    </div>
  );
}
