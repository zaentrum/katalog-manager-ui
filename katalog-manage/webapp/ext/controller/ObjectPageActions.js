/*
 * Custom Object Page header actions for Movies / Series / Episodes.
 *
 * Two buttons:
 *   - Migrate / Package — enqueues the item (or every episode of a
 *     series) for shaka-packager via POST /api/items/{id}/package.
 *   - Validate          — checks on-disk state via POST /api/items/{id}/validate
 *
 * Both are bound through the manifest's controlConfiguration.actions
 * map on each ObjectPage target; the framework passes the bound
 * context to the press handler so we can read ID without prompting.
 *
 * The katalog-api/ prefix is what the console reverse-proxy uses to
 * forward calls to the katalog Spring app inside the cluster — same
 * prefix already used by every artwork URL the catalog returns.
 */
sap.ui.define([
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (MessageToast, MessageBox) {
  "use strict";

  var API_PREFIX = "/katalog-api/api/items";
  // The TMDB enrichment endpoint lives under /api/enrich, not /api/items —
  // it's been around since the original catalog import and we hit it from
  // here without changing its URL shape.
  var ENRICH_PREFIX = "/katalog-api/api/enrich/items";

  function extractItemId(oBindingContext) {
    if (!oBindingContext) {
      return null;
    }
    var obj = oBindingContext.getObject();
    if (obj && obj.ID) {
      return obj.ID;
    }
    // Fall back to parsing the binding path. Path looks like
    // "/Movies(00111617-...)" — pull out the UUID.
    var path = oBindingContext.getPath();
    var match = /\(([^)]+)\)/.exec(path || "");
    return match ? match[1] : null;
  }

  function postJSON(url) {
    return fetch(url, {
      method: "POST",
      headers: { "Accept": "application/json" },
      credentials: "same-origin"
    }).then(function (resp) {
      if (!resp.ok) {
        return resp.text().then(function (txt) {
          throw new Error(resp.status + " " + (txt || resp.statusText));
        });
      }
      return resp.json();
    });
  }

  return {
    /**
     * Migrate / Package button handler. Sends POST /package — server
     * decides whether to enqueue (idempotent) or report already-active.
     */
    enqueuePackaging: function (oEvent) {
      var oBindingContext = this.getBindingContext
        ? this.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var itemId = extractItemId(oBindingContext);
      if (!itemId) {
        MessageBox.error("Couldn't determine the item ID from the current page.");
        return;
      }
      MessageToast.show("Enqueueing for packaging…");
      postJSON(API_PREFIX + "/" + encodeURIComponent(itemId) + "/package")
        .then(function (body) {
          var msg = body.message || "Done.";
          if (body.episodesEnqueued !== undefined) {
            MessageToast.show(msg + " (" + body.episodesEnqueued + "/"
              + body.episodesTotal + " episodes)");
          } else {
            MessageToast.show(msg);
          }
        })
        .catch(function (err) {
          MessageBox.error("Packaging request failed: " + err.message);
        });
    },

    /**
     * Validate button handler. Reports on-disk state via toast for
     * "ok" outcomes; opens a MessageBox for anything that needs
     * attention so it's not just a flash on the screen.
     */
    /**
     * Refresh-from-TMDB button. Synchronously triggers EnrichmentService
     * for this item via POST /api/enrich/items/{id}. The server fetches
     * fresh metadata (title overrides, overview, cast, trailers,
     * artwork) and writes them through the existing TMDB enrichment
     * code path. After completion, ItemTrailerLinks gets the trailer
     * URLs from TMDB's /videos endpoint so the Trailers facet picks
     * them up on the next page load.
     */
    refreshTmdb: function (oEvent) {
      var oBindingContext = this.getBindingContext
        ? this.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var itemId = extractItemId(oBindingContext);
      if (!itemId) {
        MessageBox.error("Couldn't determine the item ID from the current page.");
        return;
      }
      MessageToast.show("Refreshing from TMDB…");
      postJSON(ENRICH_PREFIX + "/" + encodeURIComponent(itemId))
        .then(function (body) {
          var status = body.status || body.state || "unknown";
          var detail = body.tmdbId
            ? "TMDB " + body.tmdbId + (body.changes ? ", " + body.changes + " fields updated" : "")
            : (body.message || status);
          if (status === "ok" || status === "done" || status === "updated") {
            MessageToast.show("Refreshed from TMDB: " + detail);
          } else if (status === "not_found") {
            MessageBox.warning("TMDB has no match for this item.",
              { title: "Refresh from TMDB" });
          } else {
            MessageBox.information(detail, { title: "Refresh from TMDB: " + status });
          }
        })
        .catch(function (err) {
          MessageBox.error("TMDB refresh failed: " + err.message);
        });
    },

    /**
     * Download-trailer button. Asks katalog-app to enqueue every
     * not-yet-downloaded ItemTrailerLinks URL with the oDownloader
     * daemon. The actual file copy + PlaybackAsset write happens
     * asynchronously via the @Scheduled poller (~15 s cadence), so
     * this handler just confirms the queue accepted the job.
     */
    fetchTrailers: function (oEvent) {
      var oBindingContext = this.getBindingContext
        ? this.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var itemId = extractItemId(oBindingContext);
      if (!itemId) {
        MessageBox.error("Couldn't determine the item ID from the current page.");
        return;
      }
      MessageToast.show("Asking oDownloader to fetch trailers…");
      postJSON(API_PREFIX + "/" + encodeURIComponent(itemId) + "/fetch-trailers")
        .then(function (body) {
          var msg = body.message || "Requested.";
          if (body.enqueued > 0) {
            MessageToast.show("Queued " + body.enqueued + " trailer(s). "
              + "They'll appear in the Files facet once the download finishes.");
          } else {
            MessageBox.information(msg, { title: "Download trailer" });
          }
        })
        .catch(function (err) {
          MessageBox.error("Trailer fetch failed: " + err.message);
        });
    },

    validateItem: function (oEvent) {
      var oBindingContext = this.getBindingContext
        ? this.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var itemId = extractItemId(oBindingContext);
      if (!itemId) {
        MessageBox.error("Couldn't determine the item ID from the current page.");
        return;
      }
      MessageToast.show("Validating…");
      postJSON(API_PREFIX + "/" + encodeURIComponent(itemId) + "/validate")
        .then(function (body) {
          // Series: roll-up message with counts.
          if (body.episodes !== undefined) {
            var summary = body.message || "Validation complete.";
            // Anything but "all ok" → MessageBox so it stays on screen.
            if (body.sourceMissing > 0 || body.stale > 0 || body.noPackage > 0) {
              MessageBox.warning(summary, { title: body.title || "Validation" });
            } else {
              MessageToast.show(summary);
            }
            return;
          }
          // Single item.
          var code = body.code || "unknown";
          var msg = body.message || code;
          if (code === "ok") {
            MessageToast.show(msg);
          } else if (code === "source_missing" || code === "stale") {
            MessageBox.warning(msg, { title: "Validation: " + code });
          } else if (code === "no_package") {
            MessageBox.information(msg, { title: "Not packaged yet" });
          } else {
            MessageBox.information(msg, { title: code });
          }
        })
        .catch(function (err) {
          MessageBox.error("Validation request failed: " + err.message);
        });
    }
  };
});
