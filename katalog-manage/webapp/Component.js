// Canonical Component for the Fiori app. Kept hand-written as the UI5
// build's transpile-task doesn't emit a standalone Component.js into
// dist/. Component.ts is the documentation copy of the same logic for
// future TS-driven development; keep both in lockstep.
sap.ui.define([
  "sap/fe/core/AppComponent"
], function (AppComponent) {
  "use strict";

  return AppComponent.extend("com.nalet.katalog.Component", {
    metadata: {
      manifest: "json"
    },

    init: function () {
      AppComponent.prototype.init.apply(this, arguments);
      this._dispatchInboundToInnerRoute();
    },

    /**
     * The Fiori Launchpad opens this app with hashes like
     *   #Series-list&/?sap-iapp-state=…
     * The substring after `&/` is the inner hash UI5's router sees — here
     * just `?sap-iapp-state=…`. Five list-reports live in this one
     * Component and the empty-pattern MoviesList route (`:?query:`)
     * matches first, so without this dispatcher we land on Movies no
     * matter which inbound was clicked. Read the inbound out of the
     * outer hash and navigate to the right inner route once the router
     * has finished its own init.
     */
    _dispatchInboundToInnerRoute: function () {
      var hash = (typeof window !== "undefined" ? window.location.hash : "") || "";
      var m = hash.match(/^#([^&?]+)/);
      if (!m) return;
      var intent = m[1];

      // Only redirect when the inbound has NO inner deep-link path. The
      // launchpad uses `&/` as the separator; anything after that other
      // than a bare `?query` is the app's own deep-link (e.g. an object
      // page URL like `Series(<id>)`), which we must not override.
      var ampIdx = hash.indexOf("&/");
      if (ampIdx >= 0) {
        var inner = hash.slice(ampIdx + 2);
        if (inner && !inner.startsWith("?")) return;
      }

      var innerRoute = {
        "Series-list":        "SeriesList",
        "Music-list":         "AlbumsList",
        "Katalog-items":      "ItemsList",
        "Katalog-scans":      "ScanJobsList",
        "Katalog-processing": "ProcessingList",
        "Katalog-settings":   "SettingsList",
        "Downloads-manage":   "DownloadJobsList"
      };
      var target = innerRoute[intent];
      if (!target) return;

      var that = this;
      // Defer until the router has initialised; otherwise navTo is a no-op.
      setTimeout(function () {
        var router = that.getRouter();
        if (router) router.navTo(target, {}, true);
      }, 0);
    }
  });
});
