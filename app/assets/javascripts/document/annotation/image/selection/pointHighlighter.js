define([
  'common/config',
  'document/annotation/common/selection/abstractHighlighter'],

  function(Config, AbstractHighlighter) {

    var POINT_STYLE = new ol.style.Style({
          image: new ol.style.Circle({
            radius : 6,
            fill   : new ol.style.Fill({ color: [ 68, 131, 196, 1 ] }),
            stroke : new ol.style.Stroke({ color: '#1d5b9b', width: 1.5 })
          })
        }),

        POINT_STYLE_HI = new ol.style.Style({
          image: new ol.style.Circle({
            radius : 8,
            fill   : new ol.style.Fill({ color: [ 68, 131, 196, 1 ] }),
            stroke : new ol.style.Stroke({ color: '#1d5b9b', width: 1.5  })
          })
        }),

        MIN_SELECTION_DISTANCE = 10;

    var PointHighlighter = function(olMap) {

      var pointVectorSource = new ol.source.Vector({}),

          currentHighlight = false,

          /**
           * Computes the distance (in pixel) between a screen (pixel) location, and
           * a coordinate on the map.
           */
          computePxDistance = function(px, coord) {
            var otherPx = olMap.getPixelFromCoordinate(coord),
                dx = px[0] - otherPx[0],
                dy = px[1] - otherPx[1];

            return Math.sqrt(dx * dx + dy * dy);
          },

          onMousemove = function(e) {
            if (!e.dragging) {
              var closestFeature = pointVectorSource.getClosestFeatureToCoordinate(e.coordinate),
                  closestPoint = (closestFeature) ? closestFeature.getGeometry().getClosestPoint(e.coordinate) : false;

              if (closestPoint && computePxDistance(e.pixel, closestPoint) < MIN_SELECTION_DISTANCE) {
                // Highlight the clostest feature, unless already highlighted
                if (currentHighlight !== closestFeature) {

                  // Un-highlight the previous highlight, if needed
                  if (currentHighlight)
                    currentHighlight.setStyle(POINT_STYLE);

                  currentHighlight = closestFeature;
                  closestFeature.setStyle(POINT_STYLE_HI);
                }
              } else if (currentHighlight) {
                // Clear the previous highlight, if any
                currentHighlight.setStyle(POINT_STYLE);
                currentHighlight = false;
              }
            }
          },

          getCurrentHighlight = function() {
            return currentHighlight;
          },

          renderPointAnnotation = function(annotation) {
            // TODO this currently assumes 'point:' anchors only!
            var anchor = annotation.anchor,
                x = parseInt(anchor.substring(anchor.indexOf(':') + 1, anchor.indexOf(','))),
                y = - parseInt(anchor.substring(anchor.indexOf(',') + 1)),
                pointFeature = new ol.Feature({
                  'geometry': new ol.geom.Point([ x, y ])
                });

            pointFeature.set('annotation', annotation, true);
            pointVectorSource.addFeature(pointFeature);
          },

          findById = function(id) {
            // TODO implement
            // TODO must return { annotation: ..., bounds: }
          },

          initPage = function(annotations) {
            jQuery.each(annotations, function(idx, a) {
              renderPointAnnotation(a);
            });
          },

          refreshAnnotation = function(annotation) {
            // TODO implement
          },

          removeAnnotation = function(annotation) {
            // TODO make this more performant (indexing? tricky though, as ID is provided async...)
            var feature;

            pointVectorSource.forEachFeature(function(f) {
              var a = f.get('annotation');
              if (a === annotation) {
                feature = f;
                return true; // Breaks from the loop
              }
            });

            if (feature)
              pointVectorSource.removeFeature(feature);
          },

          convertSelectionToAnnotation = function(selection, annotationStub) {
            renderPointAnnotation(annotationStub);
          };

      olMap.addLayer(new ol.layer.Vector({
        source: pointVectorSource,
        style: POINT_STYLE
      }));

      olMap.on('pointermove', onMousemove);

      this.getCurrentHighlight = getCurrentHighlight;
      this.findById = findById;
      this.initPage = initPage;
      this.refreshAnnotation = refreshAnnotation;
      this.removeAnnotation = removeAnnotation;
      this.convertSelectionToAnnotation = convertSelectionToAnnotation;

      AbstractHighlighter.apply(this);
    };
    PointHighlighter.prototype = Object.create(AbstractHighlighter.prototype);

    return PointHighlighter;

});
