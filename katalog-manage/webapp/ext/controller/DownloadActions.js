/*
 * Custom actions for the Downloads tile.
 *
 *   newDownload     — List Report header button. Opens a small dialog and
 *                     POSTs /katalog-api/api/downloads, which the
 *                     katalog-manager-api DownloadConsoleController forwards
 *                     to the download-gateway. The job appears in the table
 *                     a few seconds later via the Kafka read-model
 *                     projection, so we just toast + close.
 *
 *   cancelDownload  — Object Page header button. DELETEs the bound job by
 *                     its (adapter, clientJobId) identity (same prefix).
 *
 * Reads never come through here — the table binds the DownloadJobs OData
 * entity directly. This file is commands only.
 *
 * The /katalog-api/ prefix is what the console reverse-proxy uses to reach
 * the katalog Spring app; auth is the existing JWT filter chain.
 */
sap.ui.define([
  "sap/ui/core/Fragment",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Fragment, MessageToast, MessageBox) {
  "use strict";

  var DOWNLOADS_API = "/katalog-api/api/downloads";
  var _oDialog;

  function byId(sId) {
    return Fragment.byId("newDownloadFrag", sId);
  }

  function closeDialog() {
    if (_oDialog) {
      _oDialog.close();
    }
  }

  function queueDownload() {
    var oSource = byId("ndSource");
    var sAdapter = byId("ndAdapter").getSelectedKey();
    var sSource = (oSource.getValue() || "").trim();
    var sTitle = (byId("ndTitle").getValue() || "").trim();
    var sWanted = (byId("ndWanted").getValue() || "").trim();

    if (!sSource) {
      oSource.setValueState("Error");
      oSource.setValueStateText("A source URL / magnet / .nzb is required.");
      return;
    }
    oSource.setValueState("None");

    fetch(DOWNLOADS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        adapter: sAdapter,
        source: sSource,
        title: sTitle,
        wantedItemId: sWanted
      })
    }).then(function (resp) {
      return resp.json().then(function (body) {
        return { ok: resp.ok, body: body };
      });
    }).then(function (r) {
      if (!r.ok) {
        throw new Error((r.body && r.body.error) || "request failed");
      }
      MessageToast.show((r.body && r.body.message)
        || "Queued — it'll appear in the list shortly.");
      // Reset for the next entry and close.
      byId("ndSource").setValue("");
      byId("ndTitle").setValue("");
      byId("ndWanted").setValue("");
      closeDialog();
    }).catch(function (err) {
      MessageBox.error("Could not queue download: " + err.message);
    });
  }

  // Stable controller object the fragment's press handlers resolve against,
  // independent of how Fiori Elements binds `this` on the action handler.
  var oDialogController = {
    onQueueDownload: queueDownload,
    onCancelDialog: closeDialog
  };

  return {
    /** List Report header action — open the New-download dialog. */
    newDownload: function () {
      if (_oDialog) {
        _oDialog.open();
        return;
      }
      Fragment.load({
        id: "newDownloadFrag",
        name: "com.nalet.katalog.ext.fragment.NewDownloadDialog",
        controller: oDialogController
      }).then(function (oDialog) {
        _oDialog = oDialog;
        oDialog.open();
      }).catch(function (err) {
        MessageBox.error("Couldn't open the dialog: " + err.message);
      });
    },

    /** Object Page header action — cancel the bound job. */
    cancelDownload: function (oEvent) {
      var oCtx = this.getBindingContext
        ? this.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var oObj = oCtx && oCtx.getObject ? oCtx.getObject() : null;
      if (!oObj || !oObj.adapter || !oObj.clientJobId) {
        MessageBox.error("Couldn't determine which download to cancel.");
        return;
      }
      MessageBox.confirm("Cancel this download on " + oObj.adapter + "?", {
        title: "Cancel download",
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) {
            return;
          }
          fetch(DOWNLOADS_API + "/" + encodeURIComponent(oObj.adapter)
                + "/" + encodeURIComponent(oObj.clientJobId), {
            method: "DELETE",
            headers: { "Accept": "application/json" },
            credentials: "same-origin"
          }).then(function (resp) {
            if (!resp.ok) {
              return resp.text().then(function (t) {
                throw new Error(t || resp.statusText);
              });
            }
            MessageToast.show("Cancelled.");
          }).catch(function (err) {
            MessageBox.error("Cancel failed: " + err.message);
          });
        }
      });
    }
  };
});
