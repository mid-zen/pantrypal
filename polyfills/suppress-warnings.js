// Runs before any module — suppresses non-fatal RN feature flag console.errors
(function () {
  var _err = console.error;
  console.error = function () {
    var msg = arguments[0];
    if (typeof msg === 'string' && (
      msg.indexOf('disableEventLoopOnBridgeless') !== -1 ||
      msg.indexOf('Could not access feature flag') !== -1
    )) return;
    _err.apply(console, arguments);
  };
})();
