"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";

type SwaggerRequest = { credentials?: RequestCredentials };
type SwaggerUIFactory = ((options: Record<string, unknown>) => unknown) & {
  presets: { apis: unknown };
};

declare global {
  interface Window {
    SwaggerUIBundle?: SwaggerUIFactory;
  }
}

export function SwaggerDocs() {
  const initialized = useRef(false);
  const [bundleReady, setBundleReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!bundleReady || initialized.current || !window.SwaggerUIBundle) return;
    initialized.current = true;
    const root = document.getElementById("swagger-ui");

    try {
      const SwaggerUIBundle = window.SwaggerUIBundle;
      SwaggerUIBundle({
        url: "/api/openapi",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis],
        layout: "BaseLayout",
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: "none",
        filter: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
        validatorUrl: null,
        requestInterceptor: (request: SwaggerRequest) => {
          request.credentials = "include";
          return request;
        },
        onComplete: () => root?.setAttribute("data-ready", "true"),
      });
    } catch {
      queueMicrotask(() => setLoadError(true));
    }
  }, [bundleReady]);

  return (
    <div className="min-h-screen bg-background">
      <Script
        id="swagger-ui-bundle"
        src="/vendor/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => setBundleReady(true)}
        onError={() => setLoadError(true)}
      />
      {loadError ? (
        <p className="p-8 text-sm text-destructive" role="alert">
          Unable to load the interactive API documentation.
        </p>
      ) : null}
      <div id="swagger-ui" aria-busy={!bundleReady} />
    </div>
  );
}
