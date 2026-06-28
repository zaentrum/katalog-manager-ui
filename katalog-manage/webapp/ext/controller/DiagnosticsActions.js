/*
 * Diagnostics toolbar action: "View JSON".
 *
 * The CDS ItemDiagnostics entity carries two big JSON blobs per item —
 * ffprobeData (full ffprobe -show_streams + -show_format output of the
 * primary source file) and folderListing (every file in the source's
 * containing directory with a role heuristic). They render fine in the
 * sub-Object-Page facets as MultiLineText, but the operator usually
 * just wants a quick look without leaving the parent page. This
 * controller pops a Dialog with three IconTabBar tabs (Header /
 * ffprobe / Folder listing) backed by sap.ui.codeeditor.CodeEditor
 * for syntax highlighting + line numbers + scrolling.
 *
 * Wired through manifest.json:
 *   sections.Diagnostics.actions.ViewJson.press →
 *     com.nalet.katalog.ext.controller.DiagnosticsActions.viewJson
 *
 * The `this` context is the parent ObjectPage controller, so we read
 * the item ID from getBindingContext() — same pattern as the existing
 * ObjectPageActions handlers. The diagnostics row is fetched fresh via
 * the OData V4 model (<itemPath>/diagnostics) so we don't need to
 * worry about cache staleness when the populator re-ran since the
 * page last rendered.
 *
 * The dialog is REBUILT FROM SCRATCH on every click and destroyed on
 * close — the FE ObjectPage controller is reused across item
 * navigations, so caching the dialog instance would carry over both
 * the captured closure over `diag` (Copy buttons would emit stale
 * data) and a dangling addDependent ref if the view is ever recycled.
 * Fragment parse is cheap; correctness wins.
 */
sap.ui.define([
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (MessageBox, MessageToast) {
  "use strict";

  function extractItemId(oBindingContext) {
    if (!oBindingContext) return null;
    var obj = oBindingContext.getObject && oBindingContext.getObject();
    if (obj && obj.ID) return obj.ID;
    // Fall back to parsing the path — same pattern as ObjectPageActions.
    var path = oBindingContext.getPath();
    var m = /\(([^)]+)\)/.exec(path || "");
    return m ? m[1] : null;
  }

  function prettyJson(raw) {
    if (raw === null || raw === undefined || raw === "") return "(empty)";
    try {
      // Both blobs are written by the populator as already-serialised
      // JSON strings, so we re-parse and re-stringify with indentation
      // to get a human-readable view.
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch (e) {
      return raw;  // not parseable JSON — display verbatim
    }
  }

  function copyTextFromDialog(oEv, modelPath) {
    // Read the JSON straight off the dialog's bound JSONModel rather
    // than from a captured `diag` closure — that captured value would
    // be the FIRST invocation's data forever (the controller is reused
    // across items by the FE shell). Reading from the model means
    // Copy always tracks what the operator currently sees.
    var oBtn = oEv.getSource();
    var oDialog = oBtn.getParent();
    while (oDialog && !oDialog.isA("sap.m.Dialog")) {
      oDialog = oDialog.getParent();
    }
    if (!oDialog) return;
    var oModel = oDialog.getModel("dx");
    var value = oModel ? oModel.getProperty(modelPath) : "";
    if (!navigator.clipboard) {
      MessageBox.warning("Clipboard not available in this context. "
        + "Use the CodeEditor's right-click menu instead.");
      return;
    }
    navigator.clipboard.writeText(value || "").then(function () {
      MessageToast.show("Copied " + (value || "").length + " chars");
    }, function (err) {
      MessageBox.error("Clipboard write failed: " + err.message);
    });
  }

  return {
    viewJson: function (oEvent) {
      var oController = this;
      var oBindingContext = oController.getBindingContext
        ? oController.getBindingContext()
        : (oEvent && oEvent.getSource && oEvent.getSource().getBindingContext());
      var itemId = extractItemId(oBindingContext);
      if (!itemId) {
        MessageBox.error("Couldn't determine the item ID from the current page.");
        return;
      }
      var oModel = oBindingContext.getModel();
      // ItemDiagnostics is Composition of many (cardinality 1 in
      // practice) so we read it as a list and take the first row.
      var listPath = oBindingContext.getPath() + "/diagnostics";
      var oListBinding = oModel.bindList(listPath, undefined, undefined, undefined, {
        $select: "ID,sourcePath,sourceSize,sourceMtime,generatedAt,ffprobeData,folderListing,notes"
      });
      oListBinding.requestContexts(0, 1).then(function (aContexts) {
        if (!aContexts || aContexts.length === 0) {
          MessageBox.information("No diagnostics row for this item yet. "
            + "Run the populator (scripts/populate_item_diagnostics.py).",
            { title: "View JSON" });
          return;
        }
        var diag = aContexts[0].getObject();
        // FE V4 ExtensionAPI exposes loadFragment which wires the
        // fragment to the parent view's lifecycle for us — drop it on
        // raw sap.ui.core.Fragment.load and you orphan the dialog onto
        // the static UIArea, so a "open, then back-button" gesture
        // leaks the CodeEditor's ACE instances every time. The id
        // suffix only needs to be unique among concurrent dialogs of
        // the same page; FE prefixes it with the view id internally.
        oController.loadFragment({
          id: "DiagnosticsDialog::" + Date.now(),
          name: "com.nalet.katalog.ext.fragment.DiagnosticsDialog",
          controller: {
            onClose: function (oEv) {
              var dlg = oEv.getSource().getParent();
              dlg.close();
            },
            onCopyFfprobe: function (oEv) {
              copyTextFromDialog(oEv, "/ffprobeData");
            },
            onCopyFolder: function (oEv) {
              copyTextFromDialog(oEv, "/folderListing");
            }
          }
        }).then(function (oDialog) {
          // Defence-in-depth: when the user closes via the dialog's own
          // Close button or backdrop, destroy promptly so we don't
          // accumulate dialogs across rapid open/close cycles on the
          // same OP. loadFragment's view-scoped lifecycle handles the
          // navigate-away case.
          oDialog.attachAfterClose(function () { oDialog.destroy(); });
          var oJsonModel = new (sap.ui.model.json.JSONModel)({
            sourcePath:    diag.sourcePath,
            sourceSize:    diag.sourceSize,
            sourceMtime:   diag.sourceMtime,
            generatedAt:   diag.generatedAt,
            ffprobeData:   prettyJson(diag.ffprobeData),
            folderListing: prettyJson(diag.folderListing),
            notes:         diag.notes || ""
          });
          oDialog.setModel(oJsonModel, "dx");
          oDialog.open();
        }).catch(function (err) {
          MessageBox.error("Couldn't open the diagnostics dialog: " + err.message);
        });
      }).catch(function (err) {
        MessageBox.error("Failed to load diagnostics: " + err.message);
      });
    }
  };
});
