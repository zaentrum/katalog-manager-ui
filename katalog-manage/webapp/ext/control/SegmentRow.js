/*
 * Tiny Element class used as a row inside SegmentBar's `entries`
 * aggregation. The aggregation pattern is the only way to bind a
 * sap.ui.model.odata.v4 navigation collection into a custom UI5
 * control (a plain "object" property binding fails with
 * "Type 'sap.ui.model.odata.type.Raw' does not support formatting"
 * because v4 doesn't materialise navigation collections as JS arrays
 * for property bindings).
 */
sap.ui.define(["sap/ui/core/Element"], function (Element) {
  "use strict";

  return Element.extend("com.nalet.katalog.ext.control.SegmentRow", {
    metadata: {
      properties: {
        kind:    { type: "string", defaultValue: "" },
        startMs: { type: "int",    defaultValue: 0  },
        endMs:   { type: "int",    defaultValue: 0  },
        // The detector that produced this row — `tidb`, `manual`,
        // `chapter`, `chromaprint`, `blackframe`, `silence`. Surfaced
        // as a hover-tooltip suffix on SegmentBar so reviewers can
        // tell community-verified bands from locally-inferred ones.
        source:  { type: "string", defaultValue: "" }
      }
    }
  });
});
