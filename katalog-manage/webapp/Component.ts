import AppComponent from "sap/fe/core/AppComponent";
import Router from "sap/ui/core/routing/Router";

/**
 * @namespace com.nalet.katalog
 */
export default class Component extends AppComponent {
  public static metadata = {
    manifest: "json"
  };

  public init(...args: any[]): void {
    // @ts-expect-error - super.init is variadic and the parent typing is loose.
    super.init(...args);
    this._dispatchInboundToInnerRoute();
  }

  /**
   * The Fiori Launchpad opens this app with hashes like
   *   #Series-list&/?sap-iapp-state=…
   * The substring after `&/` is the inner hash UI5's router sees — here
   * just `?sap-iapp-state=…`. With five list-reports in one Component,
   * the empty-pattern MoviesList route (`:?query:`) matches first and we
   * always land on Movies regardless of the inbound clicked. The fix
   * below reads the inbound from the outer hash and navigates to the
   * matching inner route once the router has finished its own init.
   */
  private _dispatchInboundToInnerRoute(): void {
    const hash = (typeof window !== "undefined" ? window.location.hash : "") || "";
    const m = hash.match(/^#([^&?]+)/);
    if (!m) return;
    const intent = m[1];

    // Only redirect when the inbound has NO inner deep-link path. The
    // launchpad uses `&/` as the separator; anything after that other
    // than a bare `?query` is the app's own deep-link (e.g. an object
    // page URL like `Series(<id>)`), which we must not override.
    const ampIdx = hash.indexOf("&/");
    if (ampIdx >= 0) {
      const inner = hash.slice(ampIdx + 2);
      if (inner && !inner.startsWith("?")) return;
    }

    const innerRoute: Record<string, string> = {
      "Series-list":   "SeriesList",
      "Music-list":    "AlbumsList",
      "Katalog-items": "ItemsList",
      "Katalog-scans": "ScanJobsList",
      "Downloads-manage": "DownloadJobsList",
    };
    const target = innerRoute[intent];
    if (!target) return;

    // Defer until the router has initialised; otherwise navTo is a no-op.
    setTimeout(() => {
      const router = this.getRouter() as Router | undefined;
      if (router) router.navTo(target, {}, true);
    }, 0);
  }
}
