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
  var useP2P = true;
  var wrapPromise = function(fauxPromise) {
    return new Promise(function(resolve, reject) {
      return fauxPromise.then(resolve).fail(reject);
    });
  };

  window.RecogitoTelemetry = RecogitoTelemetry;
  RecogitoTelemetry.initTelemetry(
    'https://thesis-telemetry.kassel.works/event'
  );
  console.log('User ID:', RecogitoTelemetry.getUserId());

  var BaseApp = function(annotations, highlighter, selector) {
    this.annotations = annotations;
    this.highlighter = highlighter;
    this.selector = selector;
    this.header = new Header();

    this.discoveryDialog = this.setupDiscovery();
  };

  BaseApp.prototype.setupDiscovery = function() {
    var self = this;
    var target =
      location.protocol +
      '//' +
      location.host +
      '/document/' +
      Config.documentId;

    var container = document.getElementById('p2p-discovery');
    var discoveryDialog = window.RecogitoDiscovery.createDiscovery(
      container,
      null,
      {
        userId: RecogitoTelemetry.getUserId(),
        useP2P: useP2P,
        allowOutsideClick: !!RecogitoTelemetry.getUserId(),
      }
    );
    discoveryDialog.on('cancel', function() {
      if (!RecogitoTelemetry.getUserId() || (useP2P && !!self.docUrl)) {
        window.location.pathname = '/' + Config.me;
      }
    });
    discoveryDialog.on('save', function(userId, docUrl) {
      self.docUrl = docUrl;

      if (!RecogitoTelemetry.getUserId()) {
        RecogitoTelemetry.sendInit();
      }

      /* FIXME: old swarm should be destroyed and replaced by the new
          one that points to the other (?) notebook. */
      if (useP2P) {
        if (!self.notebook) {
          self.initSwarm().then(function() {
            self.loadAnnotations();
          });
        }
      } else {
        self.loadAnnotations();
      }

      RecogitoTelemetry.setUserId(userId);
      discoveryDialog.userId = userId;
    });

    if (!RecogitoTelemetry.getUserId() || (useP2P && !self.docUrl)) {
      discoveryDialog.open();
    } else {
      RecogitoTelemetry.sendInit();
      self.loadAnnotations();
    }

    this.discoverySwarm = new FromMeToYou.DiscoverySwarm(target);
    this.discoverySwarm.on('ready', function() {
      self.discoverySwarm.on('announce', function(url) {
        discoveryDialog.setDocuments(self.discoverySwarm.uniqueAnnouncements);
      });
    });

    var modalLink = document.createElement('a');
    modalLink.href = '#';
    modalLink.innerHTML = 'Study Settings';
    modalLink.onclick = function(event) {
      event.preventDefault();
      discoveryDialog.open();
    };
    var ref = document.querySelector('.logged-in');
    ref.parentNode.insertBefore(modalLink, ref);

    return discoveryDialog;
  };

  BaseApp.prototype.initSwarm = function() {
    var self = this;
    this.notebook = new FromMeToYou.RequestSwarm(this.docUrl, {
      handleError: function(err) {
        console.error('error', err);
      },
    });

    return new Promise(resolve => self.notebook.on('ready', resolve));
  };

  BaseApp.prototype.loadAnnotations = function() {
    var self = this;
    var loadAnnotations = useP2P
      ? function() {
          return self.notebook.getAnnotations();
        }
      : function() {
          wrapPromise(
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
        .then(self.pollAnnotations.bind(self));
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

    var processed = this.postProcessAnnotations(annotations);
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

  BaseApp.prototype.pollAnnotations = function() {
    if (!useP2P || !this.notebook) {
      return;
    }

    var self = this;
    this.notebook.getAnnotations({ subscribe: true }).then(subscription => {
      self.subscription = subscription;
      self.subscription.on('pub', annotations => {
        try {
          var processed = self.postProcessAnnotations(
            self.preProcessAnnotations(annotations)
          );
          self.annotations.addOrReplace(processed);
          // FIXME: add this again (not increment---replace)
          // this.header.incrementAnnotationCount(annotations.length);
          self.highlighter.addOrRefreshAnnotations(processed);
        } catch (err) {
          console.error('Error while loading annotations in real-time:\n', err);
        }
      });
    });
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
        ? self.notebook.updateAnnotation(annotation)
        : self.notebook.createAnnotation(annotation);
    };
    var mutateDatabase = function() {
      return wrapPromise(API.storeAnnotation(annotationStub));
    };

    var mutation = useP2P
      ? mutateP2P(annotationStub)
      : mutateDatabase(annotationStub);

    mutation
      .then(function(annotation) {
        if (!annotationStub.annotation_id) {
          window.RecogitoTelemetry.sendCreate(annotation);
        } else {
          window.RecogitoTelemetry.sendEdit(annotation);
        }

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
    var self = this;
    // Finds the original stub that corresponds to the annotation
    var findStub = function(annotation) {
      return annotationStubs.find(function(stub) {
        // Determine identity based on the anchor
        return stub.anchor === annotation.anchor;
      });
    };

    var mutateP2P = function(annotations) {
      return Promise.all(
        annotations.map(function(annotation) {
          return typeof annotation.id !== 'undefined'
            ? self.notebook.updateAnnotation(annotation)
            : self.notebook.createAnnotation(annotation);
        })
      );
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
