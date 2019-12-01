/** Contains common high-level functionality needed for text and image 'app' entrypoints **/
define([
  'common/api',
  'common/config',
  'common/utils/placeUtils',
  'document/annotation/common/page/header',
  'hyperwell',
  'recogito-telemetry',
], function(API, Config, PlaceUtils, Header, Hyperwell, RecogitoTelemetry) {
  var useP2P = true;
  var wrapPromise = function(fauxPromise) {
    return new Promise(function(resolve, reject) {
      return fauxPromise.then(resolve).fail(reject);
    });
  };
  var promiseWaterfall = function(items, callback, handleError) {
    return items.reduce((acc, val) => {
      return acc.then(function(results) {
        return callback(val)
          .catch(function(err) {
            if (typeof handleError === 'function') {
              handleError(err, val);
            } else {
              throw err;
            }
          })
          .then(function(result) {
            return Promise.resolve(results.concat([result]));
          });
      });
    }, Promise.resolve([]));
  };

  var getAnnotationId = function(annotationId) {
    return annotationId.split('/').pop();
  };
  var denormalize = function(annotations) {
    return Array.isArray(annotations)
      ? annotations.map(function(annotation) {
          return Object.assign({}, annotation, {
            annotation_id: getAnnotationId(annotation.id),
          });
        })
      : Object.assign({}, annotations, {
          annotation_id: getAnnotationId(annotations.id),
        });
  };

  window.RecogitoTelemetry = RecogitoTelemetry;
  RecogitoTelemetry.initTelemetry(
    'https://thesis-telemetry.kassel.works/event'
  );
  console.log('User ID:', RecogitoTelemetry.getUserId());

  var BaseApp = function(annotations, highlighter, selector) {
    var self = this;
    this.annotations = annotations;
    this.highlighter = highlighter;
    this.selector = selector;
    this.header = new Header();

    wrapPromise(
      $.ajax('https://recogito2-hyperwell-cnc.now.sh/notebooks.json')
    ).then(function(notebooks) {
      if (!notebooks[Config.documentId]) {
        useP2P = false;
        self.loadAnnotations();
        return;
      }

      var docUrl = notebooks[Config.documentId];
      console.log('Document URL:', docUrl);
      self.hyperwellClient = new Hyperwell.HyperwellClient(
        'hyperwell.kassel.works',
        docUrl,
        { ssl: true }
      );

      RecogitoTelemetry.setUserId(Config.me);
      RecogitoTelemetry.sendInit();
      self.loadAnnotations();
    });
  };

  BaseApp.prototype.loadAnnotations = function() {
    var self = this;
    var loadAnnotations = useP2P
      ? function() {
          return self.hyperwellClient.getAnnotations();
        }
      : function() {
          return wrapPromise(
            API.listAnnotationsInPart(Config.documentId, Config.partSequenceNo)
          );
        };

    return PlaceUtils.initGazetteers().done(function() {
      loadAnnotations()
        .then(self.preProcessAnnotations.bind(self))
        .then(self.onAnnotationsLoaded.bind(self))
        .then(self.loadIndicator.destroy)
        .catch(self.onAnnotationsLoadError.bind(self))
        .then(self.loadIndicator.destroy)
        .then(self.subscribeToAnnotations.bind(self));
    });
  };

  BaseApp.prototype.preProcessAnnotations = function(annotations) {
    return annotations;
  };

  BaseApp.prototype.postProcessAnnotations = function(annotations) {
    return annotations;
  };

  BaseApp.prototype.onAnnotationsLoaded = function(annotations) {
    var urlHash = window.location.hash
        ? window.location.hash.substring(1)
        : false,
      preselected,
      scrollIntoView = function(bounds) {
        var scrollTo = bounds.top - jQuery(window).height() + 100;
        if (scrollTo > 0) jQuery('html, body').animate({ scrollTop: scrollTo });
      };

    var processed = this.postProcessAnnotations(
      this.filterAnnotations(denormalize(annotations))
    );
    console.log(processed);
    this.annotations.add(processed);
    this.header.incrementAnnotationCount(processed.length);
    // var startTime = new Date().getTime();
    this.highlighter.initPage(processed);
    // console.log('took ' + (new Date().getTime() - startTime) + 'ms');

    if (urlHash) {
      preselected = this.highlighter.findById(urlHash);
      if (preselected) {
        this.selector.setSelection(preselected);
        scrollIntoView(preselected.bounds);
      }
    }

    // In order to support chaining
    return annotations;
  };

  BaseApp.prototype.filterAnnotations = function(annotations) {
    return annotations.filter(function(annotation) {
      if (!annotation.annotates || !annotation.annotates.filepart_id) {
        return true;
      } else {
        return annotation.annotates.filepart_id === Config.partId;
      }
    });
  };

  BaseApp.prototype.subscribeToAnnotations = function() {
    if (!useP2P) {
      return;
    }

    var self = this;
    this.hyperwellClient.subscribeToAnnotations().then(function(subscription) {
      self.subscription = subscription;
      self.subscription.on('change', diff => {
        try {
          var insertedAnnotations = self.postProcessAnnotations(
            self.filterAnnotations(
              self.preProcessAnnotations(denormalize(diff.inserted))
            )
          );
          var changedAnnotations = self.postProcessAnnotations(
            self.filterAnnotations(
              self.preProcessAnnotations(denormalize(diff.changed))
            )
          );
          if (insertedAnnotations.length > 0) {
            self.annotations.addOrReplace(insertedAnnotations);
            self.highlighter.initPage(insertedAnnotations);
          }
          if (changedAnnotations.length > 0) {
            self.annotations.addOrReplace(changedAnnotations);
            changedAnnotations.forEach(function(annotation) {
              self.highlighter.refreshAnnotation(annotation);
            });
          }

          var deletedAnnotations = denormalize(diff.deleted);
          self.highlighter.removeAnnotations(deletedAnnotations);
          self.annotations.remove(deletedAnnotations);
          self.header.incrementAnnotationCount(
            diff.inserted.length - diff.deleted.length
          );

          self.handleDiffReceived(
            insertedAnnotations,
            changedAnnotations,
            deletedAnnotations
          );
        } catch (err) {
          console.error('Error while loading annotations in real-time:\n', err);
        }
      });
    });
  };

  BaseApp.prototype.handleDiffReceived = function(inserted, changed, deleted) {
    // noop
  };

  BaseApp.prototype.onAnnotationsLoadError = function(err) {
    console.error(err);
    // TODO visual notification
  };

  BaseApp.prototype.upsertAnnotation = function(annotationStub) {
    var self = this;
    self.header.showStatusSaving();

    var mutateP2P = function(annotation) {
      return typeof annotation.id !== 'undefined'
        ? self.hyperwellClient.updateAnnotation(annotation)
        : self.hyperwellClient.createAnnotation(annotation);
    };
    var mutateDatabase = function() {
      return wrapPromise(API.storeAnnotation(annotationStub));
    };

    var mutation = useP2P
      ? mutateP2P(annotationStub)
      : mutateDatabase(annotationStub);

    mutation
      .then(function(annotation) {
        annotation = denormalize(annotation);
        if (!annotationStub.annotation_id) {
          window.RecogitoTelemetry.sendCreate(annotation);
        } else {
          window.RecogitoTelemetry.sendEdit(annotation);
        }

        // if P2P is used, changes will be pushed automatically
        if (!useP2P) {
          self.annotations.addOrReplace(annotation);
          self.header.incrementAnnotationCount();
        }
        self.header.updateContributorInfo(Config.me);
        self.header.showStatusSaved();

        // Merge server-provided properties (id, timestamps, etc.) into the annotation
        jQuery.extend(annotationStub, annotation);
        self.highlighter.refreshAnnotation(annotationStub);
      })
      .catch(function(error) {
        self.header.showSaveError(error);
      });
  };

  BaseApp.prototype.upsertAnnotationBatch = function(annotationStubs) {
    var self = this;
    // Finds the original stub that corresponds to the annotation
    var findStub = function(annotation) {
      return annotationStubs.find(function(stub) {
        // Determine identity based on the anchor
        return stub.anchor === annotation.anchor;
      });
    };

    var mutateP2P = function(annotations) {
      return promiseWaterfall(annotations, function(annotation) {
        return typeof annotation.annotation_id !== 'undefined'
          ? self.hyperwellClient.updateAnnotation(annotation)
          : self.hyperwellClient.createAnnotation(annotation);
      });
    };
    var mutateDatabase = function(annotationStubs) {
      return wrapPromise(API.storeAnnotationBatch(annotationStubs));
    };

    var mutation = useP2P
      ? mutateP2P(annotationStubs)
      : mutateDatabase(annotationStubs);

    self.header.showStatusSaving();
    mutation
      .then(function(annotations) {
        annotations = denormalize(annotations);
        self.annotations.addOrReplace(annotations);
        self.header.incrementAnnotationCount(annotations.length);
        self.header.updateContributorInfo(Config.me);
        self.header.showStatusSaved();

        annotations.forEach(function(annotation) {
          // Note: it *should* be safe to assume that the annotations come in the same
          // order as the original stubs, but we'll be a little defensive here, just in case
          var stub = findStub(annotation);
          jQuery.extend(stub, annotation);
          self.highlighter.refreshAnnotation(stub);
        });
      })
      .catch(function(error) {
        self.header.showSaveError();
      });
  };

  BaseApp.prototype.onCreateAnnotation = function(selection) {
    if (selection.isNew)
      this.highlighter.convertSelectionToAnnotation(selection);
    this.upsertAnnotation(selection.annotation);
  };

  BaseApp.prototype.onCreateAnnotationBatch = function(selections) {
    var self = this,
      annotationStubs = selections.map(function(selection) {
        if (selection.isNew)
          self.highlighter.convertSelectionToAnnotation(selection);
        return selection.annotation;
      });
    self.upsertAnnotationBatch(annotationStubs);
  };

  BaseApp.prototype.onUpdateAnnotation = function(annotationStub) {
    // TODO revert on fail?
    this.highlighter.refreshAnnotation(annotationStub);
    this.upsertAnnotation(annotationStub);
  };

  BaseApp.prototype.onDeleteAnnotation = function(annotation) {
    var self = this;

    var mutateP2P = function(annotation) {
      return self.hyperwellClient.deleteAnnotation(annotation);
    };
    var mutateDatabase = function() {
      return wrapPromise(API.deleteAnnotation(annotation.annotation_id));
    };

    var mutation = useP2P ? mutateP2P(annotation) : mutateDatabase(annotation);

    this.highlighter.removeAnnotation(annotation);
    mutation
      .catch(function(err) {
        if (err.message.indexOf('JSON.parse') > -1 && useP2P) {
          return;
        } else {
          throw err;
        }
      })
      .then(function() {
        self.annotations.remove(annotation);
        self.header.incrementAnnotationCount(-1);
        self.header.showStatusSaved();
      })
      .catch(function(error) {
        self.header.showSaveError(error);
      });
  };

  BaseApp.prototype.onDeleteAnnotationBatch = function(annotations) {
    var self = this,
      ids = annotations.map(function(a) {
        return a.annotation_id;
      });

    var mutateP2P = function(annotations) {
      return promiseWaterfall(
        annotations,
        function(annotation) {
          return self.hyperwellClient.deleteAnnotation(annotation);
        },
        function(err) {
          if (err.message.indexOf('JSON.parse') > -1 && useP2P) {
            return;
          } else {
            throw err;
          }
        }
      );
    };
    var mutateDatabase = function(ids) {
      return wrapPromise(API.deleteAnnotationBatch(ids));
    };
    var mutation = useP2P ? mutateP2P(annotations) : mutateDatabase(ids);

    self.header.showStatusSaving();
    mutation
      .then(function() {
        self.highlighter.removeAnnotations(annotations);
        self.annotations.remove(annotations);
        self.header.incrementAnnotationCount(-annotations.length);
        self.header.updateContributorInfo(Config.me);
        self.header.showStatusSaved();
      })
      .catch(function(error) {
        self.header.showSaveError();
      });
  };

  return BaseApp;
});
