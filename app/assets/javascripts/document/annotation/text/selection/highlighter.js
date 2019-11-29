define([
  'common/utils/annotationUtils',
  'document/annotation/common/selection/abstractHighlighter',
  'document/annotation/text/selection/style/byTagStyle',
], function(AnnotationUtils, AbstractHighlighter, ByTagStyle) {
  var TEXT = 3, // HTML DOM node type for text nodes
    STYLES = {
      BY_TAG: ByTagStyle,
    };

  var Highlighter = function(rootNode) {
    var currentStyle = false,
      /** Recursively gets all text nodes inside a given node **/
      walkTextNodes = function(node, stopOffset, nodeArray) {
        var nodes = nodeArray ? nodeArray : [],
          offset = (function() {
            var runningOffset = 0;
            nodes.forEach(function(node) {
              runningOffset += jQuery(node).text().length;
            });
            return runningOffset;
          })(),
          keepWalking = true;

        if (offset > stopOffset) return false;

        if (node.nodeType === TEXT) nodes.push(node);

        node = node.firstChild;

        while (node && keepWalking) {
          keepWalking = walkTextNodes(node, stopOffset, nodes);
          node = node.nextSibling;
        }

        return nodes;
      },
      /**
       * Given a rootNode, this helper gets all text between a given
       * start- and end-node. Basically combines walkTextNodes (above)
       * with a hand-coded dropWhile & takeWhile.
       */
      textNodesBetween = function(startNode, endNode, rootNode) {
        // To improve performance, don't walk the DOM longer than necessary
        var stopOffset = (function() {
            var rangeToEnd = rangy.createRange();
            rangeToEnd.setStart(rootNode, 0);
            rangeToEnd.setEnd(endNode, jQuery(endNode).text().length);
            return rangeToEnd.toString().length;
          })(),
          allTextNodes = walkTextNodes(rootNode, stopOffset),
          nodesBetween = [],
          len = allTextNodes.length,
          take = false,
          n,
          i;

        for (i = 0; i < len; i++) {
          n = allTextNodes[i];

          if (n === endNode) take = false;

          if (take) nodesBetween.push(n);

          if (n === startNode) take = true;
        }

        return nodesBetween;
      },
      /** Private helper method to keep things DRY for overlap/non-overlap offset computation **/
      calculateDomPositionWithin = function(textNodeProperties, charOffsets) {
        var positions = [];

        jQuery.each(textNodeProperties, function(i, props) {
          jQuery.each(charOffsets, function(j, charOffset) {
            if (charOffset >= props.start && charOffset <= props.end) {
              // Don't attach nodes for the same charOffset twice
              var previousOffset =
                positions.length > 0
                  ? positions[positions.length - 1].charOffset
                  : false;

              if (previousOffset !== charOffset)
                positions.push({
                  charOffset: charOffset,
                  node: props.node,
                  offset: charOffset - props.start,
                });
            }
          });

          // Break (i.e. return false) if all positions are computed
          return positions.length < charOffsets.length;
        });

        return positions;
      },
      /**
       * In a list of adjancent text nodes, this method computes the (node/offset)
       * pairs of a list of absolute character offsets in the total text.
       */
      charOffsetsToDOMPosition = function(charOffsets) {
        var maxOffset = Math.max.apply(null, charOffsets),
          textNodeProps = (function() {
            var start = 0;
            return walkTextNodes(rootNode, maxOffset).map(function(node) {
              var nodeLength = jQuery(node).text().length,
                nodeProps = {
                  node: node,
                  start: start,
                  end: start + nodeLength,
                };

              start += nodeLength;
              return nodeProps;
            });
          })();

        return calculateDomPositionWithin(textNodeProps, charOffsets);
      },
      wrapRange = function(range, commonRoot) {
        var root = commonRoot ? commonRoot : rootNode,
          surround = function(range) {
            var wrapper = document.createElement('SPAN');
            range.surroundContents(wrapper);
            return wrapper;
          };

        if (range.startContainer === range.endContainer) {
          return [surround(range)];
        } else {
          // The tricky part - we need to break the range apart and create
          // sub-ranges for each segment
          var nodesBetween = textNodesBetween(
            range.startContainer,
            range.endContainer,
            root
          );

          // Start with start and end nodes
          var startRange = rangy.createRange();
          startRange.selectNodeContents(range.startContainer);
          startRange.setStart(range.startContainer, range.startOffset);
          var startWrapper = surround(startRange);

          var endRange = rangy.createRange();
          endRange.selectNode(range.endContainer);
          endRange.setEnd(range.endContainer, range.endOffset);
          var endWrapper = surround(endRange);

          // And wrap nodes in between, if any
          var centerWrappers = nodesBetween.reverse().map(function(node) {
            var wrapped = jQuery(node)
              .wrap('<span></span>')
              .closest('span');
            return wrapped[0];
          });

          return [startWrapper].concat(centerWrappers, [endWrapper]);
        }
      },
      updateStyles = function(annotation, spans) {
        var entityType = AnnotationUtils.getEntityType(annotation),
          statusValues = AnnotationUtils.getStatus(annotation),
          cssClass = entityType
            ? 'annotation ' + entityType.toLowerCase()
            : 'annotation';

        if (statusValues.length > 0) cssClass += ' ' + statusValues.join(' ');

        jQuery.each(spans, function(idx, span) {
          var style = currentStyle ? currentStyle.getStyle(annotation) : null;
          jQuery(span).addClass(cssClass);

          if (style) {
            span.style.backgroundColor = style.color;
            span.title = style.title;
            if (style.count && style.count > 1) {
              jQuery(span).addClass('multiple');
              span.dataset.num = style.count;
            }
          } else {
            span.style.backgroundColor = null;
            span.removeAttribute('title');
            jQuery(span).removeClass('multiple');
          }
        });
      },
      bindToElements = function(annotation, elements) {
        jQuery.each(elements, function(idx, el) {
          el.annotation = annotation;
          if (annotation.annotation_id)
            el.dataset.id = annotation.annotation_id;
        });
      },
      initPage = function(annotations) {
        var textNodes = (function() {
            var start = 0;

            // We only have one text element but, alas, browsers split them
            // up into several nodes
            return jQuery.map(rootNode.childNodes, function(node) {
              var nodeLength = jQuery(node).text().length,
                nodeProps = {
                  node: node,
                  start: start,
                  end: start + nodeLength,
                };
              start += nodeLength;
              return nodeProps;
            });
          })(),
          intersects = function(a, b) {
            return a.start < b.end && a.end > b.start;
          },
          perfectlyOverlaps = function(a, b) {
            return a.start === b.start && a.end === b.end;
          },
          setNonOverlappingRange = function(range, offset, length) {
            var positions = calculateDomPositionWithin(textNodes, [
                offset,
                offset + length,
              ]),
              startNode = positions[0].node,
              startOffset = positions[0].offset,
              endNode = positions[1].node,
              endOffset = positions[1].offset;

            if (startNode === endNode) {
              range.setStartAndEnd(startNode, startOffset, endOffset);
            } else {
              if (
                (startNode.nodeType === 1 &&
                  startNode.className.indexOf('pending') > -1) ||
                (endNode.nodeType === 1 &&
                  endNode.className.indexOf('pending') > -1)
              ) {
                return 'WELL_THIS_ARCHITECTURE_IS_BAD_PLEASE_DONT_CREATE_THIS';
              }

              range.setStart(startNode, startOffset);
              range.setEnd(endNode, endOffset);
            }
          },
          classApplier = rangy.createClassApplier('annotation');

        // We're folding over the array, with a 2-sliding window so we can
        // check if this annotation overlaps the previous one
        annotations.reduce(function(previousBounds, annotation) {
          // try {
          var anchor = parseInt(annotation.anchor.substr(12)),
            quote = AnnotationUtils.getQuote(annotation),
            bounds = { start: anchor, end: anchor + quote.length },
            range = rangy.createRange(),
            positions,
            spans;

          if (previousBounds && intersects(previousBounds, bounds)) {
            positions = charOffsetsToDOMPosition([bounds.start, bounds.end]);
            range.setStart(positions[0].node, positions[0].offset);
            range.setEnd(positions[1].node, positions[1].offset);
            spans = wrapRange(range);
            if (perfectlyOverlaps(previousBounds, bounds))
              spans.forEach(function(span) {
                span.className = 'stratified';
              });
          } else {
            // Fast rendering through Rangy's API
            if (
              setNonOverlappingRange(range, anchor, quote.length) !==
              'WELL_THIS_ARCHITECTURE_IS_BAD_PLEASE_DONT_CREATE_THIS'
            ) {
              classApplier.applyToRange(range);
              spans = [range.getNodes()[0].parentElement];
            } else {
              refreshAnnotation(annotation);
              return previousBounds;
            }
          }

          // Attach annotation data as payload to the SPANs and set id, if any
          updateStyles(annotation, spans);
          bindToElements(annotation, spans);
          return bounds;
          // } catch (error) {
          //   console.log('Invalid annotation');
          //   console.log(annotation);
          //   return previousBounds;
          // }
        }, false);
      },
      /**
       * 'Mounts' an annotation to the given spans, by applying the according
       * CSS classes, and attaching the annotation object to the elements.
       */
      convertSelectionToAnnotation = function(selection) {
        updateStyles(selection.annotation, selection.spans);

        // Add a marker class, so we can quickly retrieve all SPANs linked
        // to pending annotations (which are currently stored on the server)
        jQuery(selection.spans).addClass('pending');

        bindToElements(selection.annotation, selection.spans);
      },
      removeAnnotation = function(annotation) {
        var spans = jQuery('[data-id="' + annotation.annotation_id + '"]');
        jQuery.each(spans, function(idx, span) {
          var el = jQuery(span);
          el.replaceWith(el.contents());
        });
        rootNode.normalize();
      },
      /** Shorthand **/
      removeAnnotations = function(annotations) {
        annotations.forEach(function(a) {
          removeAnnotation(a);
        });
      },
      addClass = function(annotation, className) {
        var spans = jQuery('[data-id="' + annotation.annotation_id + '"]');
        jQuery.each(spans, function(idx, span) {
          spans.addClass(className);
        });
      },
      removeClass = function(annotation, className) {
        var spans = jQuery('[data-id="' + annotation.annotation_id + '"]');
        jQuery.each(spans, function(idx, span) {
          spans.removeClass(className);
        });
      },
      addOrRefreshAnnotations = function(annotations) {
        var existing = [],
          added = [];

        annotations.forEach(function(annotation) {
          var spans = jQuery('[data-id=' + annotation.annotation_id + ']');
          if (spans.length === 0) {
            added.push(annotation);
          } else {
            existing.push(annotation);
          }
        });

        jQuery.each(jQuery('[data-id].annotation'), function(i, span) {
          var annotation_id = span.getAttribute('data-id');
          if (
            !annotations.find(
              annotation => annotation.annotation_id === annotation_id
            )
          ) {
            removed.push({ annotation_id });
          }
        });

        existing.forEach(function(annotation) {
          refreshAnnotation(annotation);
        });
        removed.forEach(function(annotation) {
          removeAnnotation(annotation);
        });
        initPage(added);
      },
      refreshAnnotation = function(annotation) {
        var spans = jQuery('[data-id=' + annotation.annotation_id + ']');
        if (spans.length === 0) {
          // No spans with that ID? Could be a post-store refresh of a pending annotation
          spans = jQuery.grep(jQuery('.annotation.pending'), function(span) {
            return span.annotation.annotation_id === annotation.annotation_id;
          });

          spans = jQuery(spans);
        }

        // Refresh binding
        bindToElements(annotation, spans);
        spans.removeClass();
        updateStyles(annotation, spans);
        return spans.toArray();
      },
      /**
       * Returns all annotations this DOM element is enclosed in.
       *
       * Results are sorted by length, shortest first, so that the 'smallest' annotation
       * is the first in the list.
       */
      getAnnotationsAt = function(element) {
        // Helper to get all annotations in case of multipe nested annotation spans
        var getAnnotationsRecursive = function(element, a) {
            var annotations = a ? a : [],
              parent = element.parentNode;

            annotations.push(element.annotation);

            if (jQuery(parent).hasClass('annotation'))
              return getAnnotationsRecursive(parent, annotations);
            else return annotations;
          },
          sortByQuoteLength = function(annotations) {
            return annotations.sort(function(a, b) {
              return (
                AnnotationUtils.getQuote(a).length -
                AnnotationUtils.getQuote(b).length
              );
            });
          };

        return sortByQuoteLength(getAnnotationsRecursive(element));
      },
      getAnnotationAfter = function(annotation) {
        var spans = jQuery('*[data-id="' + annotation.annotation_id + '"]'),
          lastSpan = spans[spans.length - 1],
          firstNext = jQuery(lastSpan).next('.annotation');

        if (firstNext.length > 0) {
          return {
            annotation: getAnnotationsAt(firstNext[0])[0],
            bounds: firstNext[0].getBoundingClientRect(),
          };
        }
      },
      getAnnotationBefore = function(annotation) {
        var spans = jQuery('*[data-id="' + annotation.annotation_id + '"]'),
          firstSpan = spans[0],
          lastPrev = jQuery(firstSpan).prev('.annotation');

        if (lastPrev.length > 0) {
          return {
            annotation: getAnnotationsAt(lastPrev[0])[0],
            bounds: lastPrev[0].getBoundingClientRect(),
          };
        }
      },
      findById = function(id) {
        var spans = jQuery('[data-id="' + id + '"]'),
          annotation = spans.length > 0 ? spans[0].annotation : false;

        if (annotation)
          return {
            annotation: annotation,
            bounds: spans[0].getBoundingClientRect(),
          };
      },
      setColorscheme = function(name) {
        currentStyle = STYLES[name];

        // Redraw all
        jQuery('.annotation').each(function(idx, span) {
          updateStyles(span.annotation, [span]);
        });
      };

    this.bindToElements = bindToElements;
    this.convertSelectionToAnnotation = convertSelectionToAnnotation;
    this.getAnnotationsAt = getAnnotationsAt;
    this.getAnnotationBefore = getAnnotationBefore;
    this.getAnnotationAfter = getAnnotationAfter;
    this.findById = findById;
    this.initPage = initPage;
    this.addOrRefreshAnnotations = addOrRefreshAnnotations;
    this.refreshAnnotation = refreshAnnotation;
    this.removeAnnotation = removeAnnotation;
    this.removeAnnotations = removeAnnotations;
    this.addClass = addClass;
    this.removeClass = removeClass;
    this.setColorscheme = setColorscheme;
    this.updateStyles = updateStyles;
    this.wrapRange = wrapRange;

    AbstractHighlighter.apply(this);
  };
  Highlighter.prototype = Object.create(AbstractHighlighter.prototype);

  return Highlighter;
});
