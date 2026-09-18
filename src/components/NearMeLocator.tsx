"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDistanceKm } from "@/lib/ui/format";
import {
  localityHref,
  locatorAdvice,
  locatorFailureFor,
  pageMayLocate,
  rankNearestLocalities,
  type LocalityPosition,
  type LocatorFailure,
  type NearestLocalities,
  type PolicyView,
} from "@/lib/ui/near-me";

type LocatorState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "failed"; failure: LocatorFailure }
  | { status: "located"; nearest: NearestLocalities };

const FIX_TIMEOUT_MS = 10_000;

function declaredPolicy(): PolicyView | undefined {
  const document_ = document as Document & {
    permissionsPolicy?: PolicyView;
    featurePolicy?: PolicyView;
  };

  return document_.permissionsPolicy ?? document_.featurePolicy;
}

function buttonLabel(state: LocatorState): string {
  if (state.status === "locating") return "Buscando tu ubicación…";
  if (state.status === "idle") return "Usar mi ubicación";
  return "Actualizar mi ubicación";
}

export function NearMeLocator({ localities }: { localities: LocalityPosition[] }) {
  const [state, setState] = useState<LocatorState>({ status: "idle" });

  function locate() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({ status: "failed", failure: "unsupported" });
      return;
    }

    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          status: "located",
          nearest: rankNearestLocalities(
            {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMetres: position.coords.accuracy,
            },
            localities,
          ),
        });
      },
      (error) => {
        console.error("geolocation failed", { code: error.code, message: error.message });
        setState({ status: "failed", failure: locatorFailureFor(error.code, pageMayLocate(declaredPolicy())) });
      },
      { timeout: FIX_TIMEOUT_MS, maximumAge: 0, enableHighAccuracy: true },
    );
  }

  return (
    <div style={{ marginBottom: 28 }}>
      <button
        type="button"
        className="pill-button"
        onClick={locate}
        disabled={state.status === "locating"}
      >
        {buttonLabel(state)}
      </button>

      <div aria-live="polite">
        <LocatorStatus state={state} />
      </div>
    </div>
  );
}

function LocatorStatus({ state }: { state: LocatorState }) {
  if (state.status === "idle" || state.status === "locating") return null;

  if (state.status === "located") return <NearestResult nearest={state.nearest} />;

  return <Advice>{locatorAdvice(state.failure)}</Advice>;
}

function NearestResult({ nearest }: { nearest: NearestLocalities }) {
  if (nearest.outcome === "fix-too-coarse") {
    return (
      <Advice>
        Tu ubicación llegó con un margen de ±{formatDistanceKm(nearest.marginKm)}, demasiado impreciso
        para ordenar las localidades. Elegí una de la lista de abajo.
      </Advice>
    );
  }

  if (nearest.outcome === "outside-the-network") {
    return (
      <Advice>
        La localidad con cargadores más cercana está a {formatDistanceKm(nearest.nearestKm)}. Si
        estás en Uruguay, probá otra vez; si no, elegí una localidad de la lista de abajo.
      </Advice>
    );
  }

  return (
    <div>
      <p className="label-caps" style={{ marginTop: 20 }}>
        Localidades más cercanas
      </p>
      <p style={{ marginTop: 6, fontSize: 12.5, color: "var(--text-muted)" }}>
        Distancia en línea recta, calculada en tu navegador. No la enviamos a nuestro servidor.
        {nearest.marginKm !== null &&
          ` Tu ubicación tiene un margen de ±${formatDistanceKm(nearest.marginKm)}, así que el orden es aproximado.`}
      </p>
      <ul role="list" className="hairline-list" style={{ marginTop: 12 }}>
        {nearest.localities.map((locality) => (
          <li key={`${locality.name}-${locality.department}`} className="row-wash">
            <Link
              href={localityHref(locality)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0",
                fontSize: 14.5,
              }}
            >
              <span>
                {locality.name}
                <span style={{ color: "var(--text-muted)" }}> · {locality.department}</span>
              </span>
              <span style={{ color: "var(--text-secondary)" }}>
                {formatDistanceKm(locality.distanceKm)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Advice({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ marginTop: 10, fontSize: 13.5, color: "var(--text-muted)" }}>{children}</p>
  );
}
