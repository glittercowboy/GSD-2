import { useState, useEffect } from "react";
import { AppShellWithMode } from "./components/layout/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProviderPickerScreen } from "./components/auth/ProviderPickerScreen";
import { TrustDialog } from "./components/permissions/TrustDialog";
import { useAuthGuard } from "./auth";
import { useTokenRefresh } from "./auth";

export default function App() {
  const { state, setAuthenticated } = useAuthGuard();
  const tokenRefresh = useTokenRefresh();

  // Trust state: checked after auth passes (PERM-02)
  const [trustStatus, setTrustStatus] = useState<"checking" | "trusted" | "needs_trust">("checking");
  const [gsdDir, setGsdDir] = useState("");

  useEffect(() => {
    if (state.status !== "authenticated") return;
    fetch("/api/trust-status")
      .then((r) => r.json())
      .then((data: { trusted: boolean; gsdDir: string }) => {
        setGsdDir(data.gsdDir);
        setTrustStatus(data.trusted ? "trusted" : "needs_trust");
      })
      .catch((err: unknown) => {
        console.error("[App] Trust check failed — treating as untrusted:", err);
        // B73: SECURITY: fail closed — network error must NOT grant trust
        setTrustStatus("needs_trust");
      });
  }, [state.status]);

  // While checking keychain — show nothing (brief flash, avoids flicker)
  if (state.status === "checking") {
    return null;
  }

  // Provider not configured, or token refresh failed and re-auth needed
  if (
    state.status === "needs_picker" ||
    (tokenRefresh.checked && tokenRefresh.needsReauth)
  ) {
    const heading =
      tokenRefresh.needsReauth && tokenRefresh.provider
        ? `Re-connect ${tokenRefresh.provider} to continue`
        : undefined;

    return (
      <ErrorBoundary>
        <ProviderPickerScreen
          heading={heading}
          onAuthenticated={setAuthenticated}
        />
      </ErrorBoundary>
    );
  }

  // Authenticated but trust not yet confirmed — brief flash (checking) or dialog
  if (state.status === "authenticated" && trustStatus === "checking") {
    return null;
  }

  if (state.status === "authenticated" && trustStatus === "needs_trust") {
    return (
      <ErrorBoundary>
        <TrustDialog
          gsdDir={gsdDir}
          onConfirm={() => setTrustStatus("trusted")}
          onAdvanced={() => {
            // Advance to AppShell (settings view handles advanced permissions)
            setTrustStatus("trusted");
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AppShellWithMode />
    </ErrorBoundary>
  );
}
