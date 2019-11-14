/** Contains common high-level functionality needed for text and image 'app' entrypoints **/
define([
  'common/api',
  'common/config',
  'common/utils/placeUtils',
  'document/annotation/common/page/header',
  'from-me-to-you',
  'recogito-discovery',
  'recogito-telemetry',
], function(
  API,
  Config,
  PlaceUtils,
  Header,
  FromMeToYou,
  RecogitoDiscovery,
  RecogitoTelemetry
) {
  var useP2P = false;
  var wrapPromise = function(fauxPromise) {
    return new Promise(function(resolve, reject) {
      return fauxPromise.then(resolve).fail(reject);
    });
  };

  window.RecogitoTelemetry = RecogitoTelemetry;
  RecogitoTelemetry.initTelemetry('http://localhost:3000/event');
  console.log('User ID:', RecogitoTelemetry.getUserId());

  var BaseApp = function(annotations, highlighter, selector) {
    this.annotations = annotations;
    this.highlighter = highlighter;
    this.selector = selector;
    this.header = new Header();

    this.discovery = this.setupDiscovery();

    if (useP2P) {
      this.notebook = new FromMeToYou.RequestSwarm(
        'hypermerge:/CFTZKSVGnKVVZMf6z9Kp8QUswM6SZATtwwk63Z7L26QR',
        {
          handleError: function (err) {
            console.error('error', err);
          },
        }
      );
    }
  };

  BaseApp.prototype.setupDiscovery = function() {
    var self = this;
    var discovery = window.RecogitoDiscovery.createDiscovery(
      document.getElementById('p2p-discovery'),
      null,
      {
        userId: RecogitoTelemetry.getUserId(),
        useP2P: useP2P,
        allowOutsideClick: !!RecogitoTelemetry.getUserId(),
      }
    );
    discovery.on('cancel', function() {
      if (!RecogitoTelemetry.getUserId() || (useP2P && !!self.docUrl)) {
        window.location.pathname = '/' + Config.me;
      }
    });
    discovery.on('save', function(userId, docUrl) {
      if (!RecogitoTelemetry.getUserId()) {
        RecogitoTelemetry.sendInit();
        self.loadAnnotations();
      }
      RecogitoTelemetry.setUserId(userId);
      discovery.userId = userId
    });

    if (!RecogitoTelemetry.getUserId() || (useP2P && !!self.docUrl)) {
      discovery.open();
    } else {
      self.loadAnnotations();
    }

    var modalLink = document.createElement('a');
    modalLink.href = '#';
    modalLink.innerHTML = 'Study Settings';
    modalLink.onclick = function(event) {
      event.preventDefault();
      discovery.open();
    };
    var ref = document.querySelector('.logged-in');
    ref.parentNode.insertBefore(modalLink, ref);

    return discovery;
  };

  BaseApp.prototype.loadAnnotations = function() {
    var self = this;
    var callback =
      typeof this._postAnnotationsLoadedFixMe === 'function'
        ? this._postAnnotationsLoadedFixMe
        : null;
    var callbackWrapper = function(promise) {
      if (typeof callback !== 'function') {
        return promise;
      }

      var ret = callback(promise);
      return ret instanceof Promise ? ret : promise;
    };

    var loadAnnotations = useP2P
      ? new Promise(function(resolve) {
          self.notebook.on('ready', function() {
            self.notebook.getAnnotations().then(resolve);
          });
        })
      : wrapPromise(
          API.listAnnotationsInPart(Config.documentId, Config.partSequenceNo)
        );

    return PlaceUtils.initGazetteers().done(function() {
      callbackWrapper(loadAnnotations)
        .then(self.onAnnotationsLoaded.bind(self))
        .then(self.loadIndicator.destroy)
        .catch(self.onAnnotationsLoadError.bind(self))
        .then(self.loadIndicator.destroy);
    });
  };

  BaseApp.prototype.onAnnotationsLoaded = function(annotations) {
    // FIXME: remove this one
    console.log(annotations);

    var urlHash = window.location.hash
        ? window.location.hash.substring(1)
        : false,
      preselected,
      scrollIntoView = function(bounds) {
        var scrollTo = bounds.top - jQuery(window).height() + 100;
        if (scrollTo > 0) jQuery('html, body').animate({ scrollTop: scrollTo });
      };

    this.annotations.add(annotations);
    this.header.incrementAnnotationCount(annotations.length);
    // var startTime = new Date().getTime();
    this.highlighter.initPage(annotations);
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

  BaseApp.prototype.onAnnotationsLoadError = function(annotations) {
    // TODO visual notification
  };

  BaseApp.prototype.upsertAnnotation = function(annotationStub) {
    var self = this;
    self.header.showStatusSaving();

    var mutateP2P = function(annotation) {
      return typeof annotation.id !== 'undefined'
        ? self.notebook.updateAnnotation(annotation)
        : self.notebook.createAnnotation(annotation);
    };
    var mutateDatabase = wrapPromise(API.storeAnnotation(annotationStub));

    var mutation = useP2P
      ? mutateP2P(annotationStub)
      : mutateDatabase(annotationStub);

    mutation
      .then(function(annotation) {
        console.log(JSON.stringify(annotationStub));
        console.log(JSON.stringify(annotation));
        self.annotations.addOrReplace(annotation);
        self.header.incrementAnnotationCount();
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
    var self = this,
      // Finds the original stub that corresponds to the annotation
      findStub = function(annotation) {
        return annotationStubs.find(function(stub) {
          // Determine identity based on the anchor
          return stub.anchor === annotation.anchor;
        });
      };

    self.header.showStatusSaving();
    API.storeAnnotationBatch(annotationStubs)
      .done(function(annotations) {
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
      .fail(function(error) {
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

    this.highlighter.removeAnnotation(annotation);
    API.deleteAnnotation(annotation.annotation_id)
      .done(function() {
        self.annotations.remove(annotation);
        self.header.incrementAnnotationCount(-1);
        self.header.showStatusSaved();
      })
      .fail(function(error) {
        self.header.showSaveError(error);
      });
  };

  BaseApp.prototype.onDeleteAnnotationBatch = function(annotations) {
    var self = this,
      ids = annotations.map(function(a) {
        return a.annotation_id;
      });

    self.header.showStatusSaving();
    API.deleteAnnotationBatch(ids)
      .done(function() {
        self.highlighter.removeAnnotations(annotations);
        self.annotations.remove(annotations);
        self.header.incrementAnnotationCount(-annotations.length);
        self.header.updateContributorInfo(Config.me);
        self.header.showStatusSaved();
      })
      .fail(function(error) {
        self.header.showSaveError();
      });
  };

  return BaseApp;
});
