require.config({
  baseUrl: "/assets/javascripts/",
  fileExclusionRegExp: /^lib$/,
  paths: {
    marked: '/webjars/marked/0.3.6/marked.min',
    i18n: '../vendor/i18n',
    'from-me-to-you': '../vendor/me2u'
  }
});

require([
  'common/config',
  'document/annotation/common/baseTextApp',
  'document/annotation/tei/selection/highlighter',
  'document/annotation/tei/selection/selectionHandler',
  'document/annotation/tei/selection/phraseAnnotator'
], function(Config, BaseTextApp, Highlighter, SelectionHandler, PhraseAnnotator) {

  jQuery(document).ready(function() {
    var isHTTPS = location.protocol === 'https:',
        teiURL = jsRoutes.controllers.document.DocumentController
          .getRaw(Config.documentId, Config.partSequenceNo).absoluteURL(isHTTPS),

        contentNode = document.getElementById('content'),

        highlighter = new Highlighter(contentNode),
        selector = new SelectionHandler(contentNode, highlighter),
        phraseAnnotator = new PhraseAnnotator(contentNode, highlighter),

        CETEIcean = new CETEI();
        // Override default list, note, table, and ref behaviors so they don't introduce new text into the DOM
        CETEIcean.addBehaviors({
          "tei": {
            "ref": function(elt) {
              var a = document.createElement("a");
              while(elt.firstChild) {
                a.appendChild(elt.removeChild(elt.firstChild));
              }
              a.setAttribute("href", this.rw(elt.getAttribute("target")));
              elt.appendChild(a);
            },
            "list": null,
            "note": null,
            "table": null,
            "teiHeader": function(e) {
              e.hidden = true;
            }
          }
        });

    CETEIcean.getHTML5(teiURL).then(function(data) {
      document.getElementById("content").appendChild(data);
      new BaseTextApp(contentNode, highlighter, selector, phraseAnnotator);
    });
  });

});
