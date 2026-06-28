/*
 * Custom UI5 control that renders a stacked timeline bar from a list of
 * MediaSegments. Used by the "Timeline" section on the Movies / Series
 * object pages — see ext/fragment/SegmentTimeline.fragment.xml.
 *
 * Each segment is a coloured block whose width is proportional to its
 * duration relative to the whole file (`durationMs`). The kinds rendered
 * here match TIDB's vocabulary (intro / recap / credits / preview);
 * structural chapter atoms live in the sibling ItemChapters entity and
 * are rendered by a separate row when present. Gaps between segments
 * are filled with the neutral "content" colour. Hover tooltip shows
 * kind + start + end + duration.
 */
sap.ui.define([
  "sap/ui/core/Control"
], function (Control) {
  "use strict";

  // TIDB-aligned palette: intro / recap / credits / preview only.
  // Anything we don't recognise falls back to the neutral content tone.
  var COLORS = {
    intro:   "#a371f7", // purple
    recap:   "#7ee787", // green (info)
    credits: "#fb8500", // orange
    preview: "#79c0ff"  // light blue — post-credits teaser
  };
  var SCENE_BG = "#1f6feb"; // chino-blue, used for the "rest of the film"

  function fmt(ms) {
    if (!isFinite(ms) || ms < 0) return "0:00";
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = String(s % 60).padStart(2, "0");
    return h > 0
      ? h + ":" + String(m).padStart(2, "0") + ":" + sec
      : m + ":" + sec;
  }

  return Control.extend("com.nalet.katalog.ext.control.SegmentBar", {
    metadata: {
      properties: {
        durationMs: { type: "int", defaultValue: 0 }
      },
      // Bound as an aggregation rather than an `object` property because
      // sap.ui.model.odata.v4 does NOT materialise navigation collections
      // into JS arrays for property bindings. The fragment provides a
      // template SegmentRow per row of the `segments` association.
      aggregations: {
        entries: {
          type: "com.nalet.katalog.ext.control.SegmentRow",
          multiple: true,
          singularName: "entry"
        }
      },
      defaultAggregation: "entries"
    },

    renderer: function (rm, ctrl) {
      var rows = ctrl.getEntries() || [];
      var segs = rows.map(function (r) {
        return {
          kind:    r.getKind(),
          startMs: r.getStartMs(),
          endMs:   r.getEndMs(),
          source:  r.getSource()
        };
      }).sort(function (a, b) { return (a.startMs || 0) - (b.startMs || 0); });
      var total = ctrl.getDurationMs() || segs.reduce(function (acc, s) {
        return Math.max(acc, s.endMs || 0);
      }, 0) || 1;

      rm.openStart("div", ctrl).class("kg-segment-bar").openEnd();

      // Walk segments in order. Anything between the previous end and
      // the next segment's start is "scene" filler — that's the bulk
      // of any movie.
      var cursor = 0;
      function block(width, color, title) {
        if (width <= 0) return;
        rm.openStart("div").class("kg-segment-block");
        rm.style("flex-grow", String(width));
        rm.style("flex-basis", "0");
        rm.style("background", color);
        if (title) rm.attr("title", title);
        rm.openEnd().close("div");
      }

      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var start = Math.max(0, s.startMs || 0);
        var end   = Math.max(start, s.endMs || start);
        if (start > cursor) {
          block(start - cursor, SCENE_BG, "Scene · " + fmt(cursor) + " → " + fmt(start));
        }
        var kind = (s.kind || "").toLowerCase();
        var color = COLORS[kind] || "#8b949e";
        var label = (s.kind ? (s.kind.charAt(0).toUpperCase() + s.kind.slice(1)) : "Segment");
        // Show the source in the hover tooltip so reviewers know whether
        // the band came from TIDB (community-verified) or one of the
        // local detectors (chromaprint / blackframe / silence / chapter).
        var srcSuffix = s.source ? "  [" + s.source + "]" : "";
        var title = label + " · " + fmt(start) + " → " + fmt(end)
                    + " (" + fmt(end - start) + ")" + srcSuffix;
        block(end - start, color, title);
        cursor = Math.max(cursor, end);
      }
      if (total > cursor) {
        block(total - cursor, SCENE_BG, "Scene · " + fmt(cursor) + " → " + fmt(total));
      }

      rm.close("div");
    }
  });
});
