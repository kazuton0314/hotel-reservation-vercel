"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CustomerListItem,
  CustomerSearchCriteria,
} from "@/lib/queries/customers";
import { buildCustomerSearchHref } from "@/lib/utils/customer-history-link";

const SEARCH_FIELDS: {
  key: keyof CustomerSearchCriteria;
  label: string;
  placeholder: string;
}[] = [
  { key: "name", label: "名前", placeholder: "代表者名・ふりがな" },
  { key: "email", label: "メール", placeholder: "example@mail.com" },
  { key: "phone", label: "電話番号", placeholder: "09012345678" },
  { key: "reservationId", label: "予約ID", placeholder: "STUDIO-MT149" },
  { key: "customerId", label: "顧客ID", placeholder: "CU-2026-0001" },
];

type Props = {
  initialCriteria?: CustomerSearchCriteria;
  initialResults?: CustomerListItem[];
  initialError?: string | null;
};

function criteriaFromSearchParams(
  searchParams: URLSearchParams
): CustomerSearchCriteria {
  const read = (key: keyof CustomerSearchCriteria): string =>
    (searchParams.get(key) ?? "").trim();
  const criteria: CustomerSearchCriteria = {};
  const name = read("name");
  const email = read("email");
  const phone = read("phone");
  const reservationId = read("reservationId");
  const customerId = read("customerId");
  if (name) criteria.name = name;
  if (email) criteria.email = email;
  if (phone) criteria.phone = phone;
  if (reservationId) criteria.reservationId = reservationId;
  if (customerId) criteria.customerId = customerId;
  return criteria;
}

export function CustomersView({
  initialCriteria = {},
  initialResults,
  initialError = null,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlKey = searchParams.toString();
  const [criteria, setCriteria] = useState<CustomerSearchCriteria>(initialCriteria);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, startTransition] = useTransition();

  // 詳細から戻ったときなど、URL の条件を入力欄へ反映
  useEffect(() => {
    setCriteria(criteriaFromSearchParams(searchParams));
    setError(initialError);
  }, [urlKey, searchParams, initialError]);

  const results =
    initialResults === undefined ? null : initialResults;

  const runSearch = useCallback(() => {
    const active = Object.fromEntries(
      Object.entries(criteria).filter(([, v]) => String(v ?? "").trim())
    ) as CustomerSearchCriteria;
    if (!Object.keys(active).length) {
      setError("いずれかの条件を入力してください");
      return;
    }
    setError(null);
    const href = buildCustomerSearchHref(active);
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [criteria, router]);

  return (
    <>
      <p className="form-hint">複数入力可。いずれか1つでも一致すれば表示（OR検索）</p>
      <div className="customers-search-form">
        {SEARCH_FIELDS.map((f) => (
          <div key={f.key} className="form-group customers-field">
            <label htmlFor={`cust-${f.key}`}>{f.label}</label>
            <Input
              type="search"
              id={`cust-${f.key}`}
              className="customers-field-input"
              placeholder={f.placeholder}
              value={criteria[f.key] ?? ""}
              autoComplete="off"
              onChange={(e) =>
                setCriteria((prev) => ({ ...prev, [f.key]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  runSearch();
                }
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="default"
          disabled={pending}
          onClick={runSearch}
        >
          {pending ? "検索中…" : "検索"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => {
            setCriteria({});
            setError(null);
            startTransition(() => {
              router.replace("/customers", { scroll: false });
            });
          }}
        >
          クリア
        </Button>
      </div>

      <div id="customers-body">
        {error ? <div className="empty">{error}</div> : null}
        {pending && results === null ? (
          <div className="inline-loading">検索中…</div>
        ) : null}
        {results === null && !pending && !error ? (
          <p className="empty" style={{ padding: 16 }}>
            条件を入力して検索してください
          </p>
        ) : null}
        {results && results.length === 0 && !error ? (
          <div className="empty">該当する顧客はありません</div>
        ) : null}
        {results && results.length > 0 ? (
          <>
            <p className="form-section-label">{results.length}件</p>
            {results.map((c) => {
              const openId = c.customerId || c.customerKey;
              return (
                <Link
                  key={openId}
                  href={`/customers/${encodeURIComponent(openId)}`}
                  className="card customer-card block"
                >
                  <div className="customer-card-head">
                    <p className="card-title list-card-title">
                      {c.representativeName || "—"}
                    </p>
                    {c.isRepeater ? (
                      <span className="badge badge-confirmed">リピーター</span>
                    ) : null}
                  </div>
                  {c.customerId ? (
                    <p className="card-sub">{c.customerId}</p>
                  ) : null}
                  <p className="card-sub">
                    来館 {c.visitCount}回
                    {c.lastCheckOut ? ` / 最終OUT ${c.lastCheckOut}` : ""}
                  </p>
                  {c.email ? (
                    <p className="card-row">
                      <strong>メール:</strong> {c.email}
                    </p>
                  ) : null}
                  {c.phone ? (
                    <p className="card-row">
                      <strong>電話:</strong> {c.phone}
                    </p>
                  ) : null}
                  {c.nameKana ? (
                    <p className="card-row">
                      <strong>ふりがな:</strong> {c.nameKana}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </>
        ) : null}
      </div>
    </>
  );
}
