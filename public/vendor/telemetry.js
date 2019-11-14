(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.RecogitoTelemetry = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

var fetch = require('node-fetch');

var userId, endpoint;
var key = 'recogito-p2p-telemetry-user-id';

function initTelemetry(_endpoint) {
  return regeneratorRuntime.async(function initTelemetry$(_context) {
    while (1) {
      switch (_context.prev = _context.next) {
        case 0:
          userId = window.localStorage.getItem(key);
          endpoint = _endpoint;

        case 2:
        case "end":
          return _context.stop();
      }
    }
  });
}

function getUserId() {
  return userId;
}

function setUserId(_userId) {
  userId = _userId;
  window.localStorage.setItem(key, userId);
}

function sendEvent(event) {
  return regeneratorRuntime.async(function sendEvent$(_context2) {
    while (1) {
      switch (_context2.prev = _context2.next) {
        case 0:
          return _context2.abrupt("return", fetch(endpoint, {
            method: 'post',
            body: JSON.stringify(event),
            headers: {
              'Content-Type': 'application/json'
            }
          }));

        case 1:
        case "end":
          return _context2.stop();
      }
    }
  });
}

function sendInit() {
  return regeneratorRuntime.async(function sendInit$(_context3) {
    while (1) {
      switch (_context3.prev = _context3.next) {
        case 0:
          return _context3.abrupt("return", sendEvent({
            type: 'init',
            userId: userId
          }));

        case 1:
        case "end":
          return _context3.stop();
      }
    }
  });
}

function sendCreate(newAnnotation) {
  return regeneratorRuntime.async(function sendCreate$(_context4) {
    while (1) {
      switch (_context4.prev = _context4.next) {
        case 0:
          return _context4.abrupt("return", sendEvent({
            type: 'create',
            userId: userId,
            newAnnotation: newAnnotation
          }));

        case 1:
        case "end":
          return _context4.stop();
      }
    }
  });
}

function sendOpen(annotation) {
  return regeneratorRuntime.async(function sendOpen$(_context5) {
    while (1) {
      switch (_context5.prev = _context5.next) {
        case 0:
          return _context5.abrupt("return", sendEvent({
            type: 'open',
            userId: userId,
            annotation: annotation
          }));

        case 1:
        case "end":
          return _context5.stop();
      }
    }
  });
}

function sendWrite(annotation, newAnnotation) {
  return regeneratorRuntime.async(function sendWrite$(_context6) {
    while (1) {
      switch (_context6.prev = _context6.next) {
        case 0:
          return _context6.abrupt("return", sendEvent({
            type: 'open',
            userId: userId,
            annotation: annotation,
            newAnnotation: newAnnotation
          }));

        case 1:
        case "end":
          return _context6.stop();
      }
    }
  });
}

function sendEdit(annotation, updatedAnnotation) {
  return regeneratorRuntime.async(function sendEdit$(_context7) {
    while (1) {
      switch (_context7.prev = _context7.next) {
        case 0:
          return _context7.abrupt("return", sendEvent({
            type: 'open',
            userId: userId,
            annotation: annotation,
            updatedAnnotation: updatedAnnotation
          }));

        case 1:
        case "end":
          return _context7.stop();
      }
    }
  });
}

function sendClose(annotation) {
  return regeneratorRuntime.async(function sendClose$(_context8) {
    while (1) {
      switch (_context8.prev = _context8.next) {
        case 0:
          return _context8.abrupt("return", sendEvent({
            type: 'open',
            userId: userId,
            annotation: annotation
          }));

        case 1:
        case "end":
          return _context8.stop();
      }
    }
  });
}

module.exports = {
  initTelemetry: initTelemetry,
  getUserId: getUserId,
  setUserId: setUserId,
  sendInit: sendInit,
  sendCreate: sendCreate,
  sendOpen: sendOpen,
  sendWrite: sendWrite,
  sendEdit: sendEdit,
  sendClose: sendClose
};

},{"node-fetch":2}],2:[function(require,module,exports){
(function (global){
"use strict";

// ref: https://github.com/tc39/proposal-global
var getGlobal = function () {
	// the only reliable means to get the global object is
	// `Function('return this')()`
	// However, this causes CSP violations in Chrome apps.
	if (typeof self !== 'undefined') { return self; }
	if (typeof window !== 'undefined') { return window; }
	if (typeof global !== 'undefined') { return global; }
	throw new Error('unable to locate global object');
}

var global = getGlobal();

module.exports = exports = global.fetch;

// Needed for TypeScript and Webpack.
exports.default = global.fetch.bind(global);

exports.Headers = global.Headers;
exports.Request = global.Request;
exports.Response = global.Response;
}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{}]},{},[1])(1)
});
//# sourceMappingURL=telemetry.js.map
