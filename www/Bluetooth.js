const exec = require('cordova/exec');

var SOCKET_EVENT = "BLUETOOTH_SOCKET_EVENT";
var SOCKET_SERVER_EVENT = "BLUETOOTH_SOCKET_SERVER_EVENT";
var CORDOVA_SERVICE_NAME = "Bluetooth";

BluetoothSocket.State = {};
BluetoothSocket.State[BluetoothSocket.State.CLOSED = 0] = "CLOSED";
BluetoothSocket.State[BluetoothSocket.State.OPENING = 1] = "OPENING";
BluetoothSocket.State[BluetoothSocket.State.OPENED = 2] = "OPENED";
BluetoothSocket.State[BluetoothSocket.State.CLOSING = 3] = "CLOSING";

BluetoothServerSocket.State = {};
BluetoothServerSocket.State[BluetoothServerSocket.State.STOPPED = 0] = "STOPPED";
BluetoothServerSocket.State[BluetoothServerSocket.State.STARTING = 1] = "STARTING";
BluetoothServerSocket.State[BluetoothServerSocket.State.STARTED = 2] = "STARTED";
BluetoothServerSocket.State[BluetoothServerSocket.State.STOPPING = 3] = "STOPPING";

function BluetoothSocket(socketKey) {
  this._state = BluetoothSocket.State.CLOSED;
  this.onData = null;
  this.onClose = null;
  this.onError = null;
  this.socketKey = socketKey || guid();
}

function BluetoothServerSocket(serverSocketKey) {
  this._state = BluetoothServerSocket.State.STOPPED;
  this.onOpened = null;
  this.onStopped = null;
  this.serverSocketKey = serverSocketKey || guid();
}

BluetoothServerSocket.prototype.start = function (success, error) {
  success = success || (() => {});
  error = error || (() => {});

  if (!this._ensureState(BluetoothServerSocket.State.STOPPED, error)) {
      return;
  }

  var socketServerEventHandler = (event) => {
      var payload = event.payload;

      if (payload.serverSocketKey !== this.serverSocketKey) {
          return;
      }

      switch (payload.type) {
      case "Connected":
          var socket = new BluetoothSocket(payload.socketKey);

          var socketEventHandler = (event) => {
              var payload = event.payload;

              if (payload.socketKey !== socket.socketKey) {
                  return;
              }

              switch (payload.type) {
              case "Close":
                  socket._state = BluetoothSocket.State.CLOSED;
                  window.document.removeEventListener(SOCKET_EVENT, socketEventHandler);
                  if (socket.onClose) {
                      socket.onClose(payload.hasError);
                  }
                  break;
              case "DataReceived":
                  if (socket.onData) {
                      socket.onData(new Uint8Array(payload.data));
                  }
                  break;
              case "Error":
                  if (socket.onError) {
                      socket.onError(payload.errorMessage);
                  }
                  break;
              default:
                  console.error("BluetoothSocketsForCordova: Unknown event type " + payload.type + ", socket key: " + payload.socketKey);
                  break;
              }
          };

          socket._state = BluetoothSocket.State.OPENED;
          window.document.addEventListener(SOCKET_EVENT, socketEventHandler);

          if (this.onOpened) {
              this.onOpened(socket);
          }
          break;
      case "Stopped":
          this._state = BluetoothServerSocket.State.STOPPED;
          window.document.removeEventListener(SOCKET_SERVER_EVENT, socketServerEventHandler);
          if (this.onStopped) {
              this.onStopped(payload.hasError);
          }
          break;
      default:
          console.error("BluetoothSocketsForCordova: Unknown event type " + payload.type + ", socket key: " + payload.socketKey);
          break;
      }
  };

  this._state = BluetoothServerSocket.State.STARTING;

  exec(
      () => {
          this._state = BluetoothServerSocket.State.STARTED;
          window.document.addEventListener(SOCKET_SERVER_EVENT, socketServerEventHandler);
          success();
      },
      (errorMessage) => {
          this._state = BluetoothServerSocket.State.STOPPED;
          error(errorMessage);
      },
      CORDOVA_SERVICE_NAME,
      "startServer",
      [ this.serverSocketKey ]
  );
};

BluetoothServerSocket.prototype.startAsync = function () {
    return new Promise((resolve, reject) => {
        return this.start(resolve, reject);
    });
};

BluetoothServerSocket.prototype.stop = function (success, error) {
    success = success || (() => {});
    error = error || (() => {});

    if (!this._ensureState(BluetoothServerSocket.State.STARTED, error)) {
        return;
    }

    this._state = BluetoothServerSocket.State.STOPPING;

    exec(
        success,
        error,
        CORDOVA_SERVICE_NAME,
        "stopServer",
        [ this.serverSocketKey ]
    );
};

BluetoothServerSocket.prototype.stopAsync = function () {
    return new Promise((resolve, reject) => {
        return this.stop(resolve, reject);
    });
};

BluetoothSocket.prototype.open = function (host, success, error) {
    success = success || (() => {});
    error = error || (() => {});

    if (!this._ensureState(BluetoothSocket.State.CLOSED, error)) {
        return;
    }

    var socketEventHandler = (event) => {
        var payload = event.payload;

        if (payload.socketKey !== this.socketKey) {
            return;
        }

        switch (payload.type) {
        case "Close":
            this._state = BluetoothSocket.State.CLOSED;
            window.document.removeEventListener(SOCKET_EVENT, socketEventHandler);
            if (this.onClose) {
                this.onClose(payload.hasError);
            }
            break;
        case "DataReceived":
            if (this.onData) {
                this.onData(new Uint8Array(payload.data));
            }
            break;
        case "Error":
            if (this.onError) {
                this.onError(payload.errorMessage);
            }
            break;
        default:
            console.error("BluetoothSocketsForCordova: Unknown event type " + payload.type + ", socket key: " + payload.socketKey);
            break;
        }
    };

    this._state = BluetoothSocket.State.OPENING;

    exec(
        () => {
            this._state = BluetoothSocket.State.OPENED;
            window.document.addEventListener(SOCKET_EVENT, socketEventHandler);
            success();
        },
        (errorMessage) => {
            this._state = BluetoothSocket.State.CLOSED;
            error(errorMessage);
        },
        CORDOVA_SERVICE_NAME,
        "open",
        [ this.socketKey, host ]
    );
};

BluetoothSocket.prototype.openAsync = function (host) {
    return new Promise((resolve, reject) => {
        return this.open(host, resolve, reject);
    });
};

BluetoothSocket.prototype.write = function (data, success, error) {
    success = success || (() => {});
    error = error || (() => {});

    if (!this._ensureState(BluetoothSocket.State.OPENED, error)) {
        return;
    }

    var dataToWrite = data instanceof Uint8Array
        ? BluetoothSocket._copyToArray(data)
        : data;

    exec(
        success,
        error,
        CORDOVA_SERVICE_NAME,
        "write",
        [ this.socketKey, dataToWrite ]
    );
};

BluetoothSocket.prototype.writeAsync = function (data) {
    return new Promise((resolve, reject) => {
        return this.write(data, resolve, reject);
    });
};

BluetoothSocket.prototype.shutdownWrite = function (success, error) {
    success = success || (() => {});
    error = error || (() => {});

    if (!this._ensureState(BluetoothSocket.State.OPENED, error)) {
        return;
    }

    exec(
        success,
        error,
        CORDOVA_SERVICE_NAME,
        "shutdownWrite",
        [ this.socketKey ]
    );
};

BluetoothSocket.prototype.shutdownWriteAsync = function () {
    return new Promise((resolve, reject) => {
        return this.shutdownWrite(resolve, reject);
    });
};

BluetoothSocket.prototype.close = function (success, error) {
    success = success || (() => {});
    error = error || (() => {});

    if (!this._ensureState(BluetoothSocket.State.OPENED, error)) {
        return;
    }

    this._state = BluetoothSocket.State.CLOSING;

    exec(
        success,
        error,
        CORDOVA_SERVICE_NAME,
        "close",
        [ this.socketKey ]
    );
};

BluetoothSocket.prototype.closeAsync = function () {
    return new Promise((resolve, reject) => {
        return this.close(resolve, reject);
    });
};

Object.defineProperty(BluetoothSocket.prototype, "state", {
    get: function () {
        return this._state;
    },
    enumerable: true,
    configurable: true
});

Object.defineProperty(BluetoothServerSocket.prototype, "state", {
    get: function () {
        return this._state;
    },
    enumerable: true,
    configurable: true
});

BluetoothSocket.prototype._ensureState = function(requiredState, errorCallback) {
    var state = this._state;
    if (state != requiredState) {
        window.setTimeout(function() {
            errorCallback("Invalid operation for this socket state: " + BluetoothSocket.State[state]);
        });
        return false;
    }
    else {
        return true;
    }
};

BluetoothServerSocket.prototype._ensureState = function(requiredState, errorCallback) {
    var state = this._state;
    if (state != requiredState) {
        window.setTimeout(function() {
            errorCallback("Invalid operation for this socket state: " + BluetoothServerSocket.State[state]);
        });
        return false;
    }
    else {
        return true;
    }
};

BluetoothSocket.dispatchEvent = function (event) {
    var eventReceive = document.createEvent("Events");
    eventReceive.initEvent(SOCKET_EVENT, true, true);
    eventReceive.payload = event;

    document.dispatchEvent(eventReceive);
};

BluetoothServerSocket.dispatchEvent = function (event) {
    var eventReceive = document.createEvent("Events");
    eventReceive.initEvent(SOCKET_SERVER_EVENT, true, true);
    eventReceive.payload = event;

    document.dispatchEvent(eventReceive);
};

BluetoothSocket._copyToArray = function (array) {
    var outputArray = new Array(array.length);
    for (var i = 0; i < array.length; i++) {
        outputArray[i] = array[i];
    }
    return outputArray;
};

var devices = new Map();
var previousDiscoveredDevices = new Map();
var deviceDiscoveredCallback, deviceGoneCallback;
exports.setDeviceDiscoveredCallback = function(callback) {
    deviceDiscoveredCallback = callback;
};

exports.setDeviceGoneCallback = function(callback) {
    deviceGoneCallback = callback;
};

var guid = (function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return function () {
        return s4() + s4() + "-" + s4() + "-" + s4() + "-" +
            s4() + "-" + s4() + s4() + s4();
    };
})();

// Register event dispatcher for Windows Phone
if (navigator.userAgent.match(/iemobile/i)) {
    window.document.addEventListener("deviceready", function () {
        exec(
            BluetoothSocket.dispatchEvent,
            function (errorMessage) {
                console.error("BluetoothSocketsForCordova: Cannot register WP event dispatcher, Error: " + errorMessage);
            },
            CORDOVA_SERVICE_NAME,
            "registerWPEventDispatcher",
            [ ]);
    });
}

exports.getSupported = function(){
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getSupported", []);
  });
};

exports.getState = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getState", []);
  });
};

exports.getDiscoverable = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getDiscoverable", []);
  });
};

exports.requestEnable = function() {
    return new Promise(function(success,error) {
        exec(success, error, "Bluetooth", "requestEnable", []);
    });
};

exports.enable = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "enable", []);
  });
};

exports.disable = function() {
    return new Promise(function(success,error) {
        exec(success, error, "Bluetooth", "disable", []);
    });
};

var listPairedDevices = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "listPairedDevices", []);
  });
};

var discoveryInProgress = false;
var state = 12;
var startDiscovery = function() {
  return new Promise(function(success,error) {
  exec(
      () => {
          discoveryInProgress = true;

          setInternalStateCallback(function (newState) {
            if (newState == 10) {
              devices.clear();
              previousDiscoveredDevices.clear();
            }

            if (newState == 12) {
              listPairedDevices().then(function (pairedDevices) {
                pairedDevices.forEach(function (device) {
                    if (deviceDiscoveredCallback && !devices.has(device.address) && !previousDiscoveredDevices.has(device.address)) {
                    devices.set(device.address, device);
                    deviceDiscoveredCallback({
                        address: device.address,
                        name: device.name,
                        paired: true
                    });
                    }
                });
              });
            }
            state = newState;
          });

          listPairedDevices().then(function(pairedDevices) {
            pairedDevices.forEach(function (device) {
              if (state == 12 && deviceDiscoveredCallback && !devices.has(device.address) && !previousDiscoveredDevices.has(device.address)) {
                devices.set(device.address, device);
                deviceDiscoveredCallback({
                  address: device.address,
                  name: device.name,
                  paired: true
                });
              }
            });
          });

          setInternalDiscoveryCallback(function (result) {
            if (!result && discoveryInProgress) {
              previousDiscoveredDevices.forEach(function(device) {
                if(devices.has(device.address))
                  return;

                if(deviceGoneCallback) {
                  deviceGoneCallback({
                    address: device.address,
                    name: device.name
                  });
                }
              });

              previousDiscoveredDevices = new Map(devices);
              devices.clear();
              startDiscovery(success, error);
            }
          });

          setDiscoveredCallback(function(device) {
            if (devices.has(device.address)) {

              deviceGoneCallback({
                address: device.address,
                name: device.name
              });

              const registeredDevice = devices.get(device.address);
              registeredDevice.name = device.name;

              deviceDiscoveredCallback({
                address: device.address,
                name: device.name,
                paired: false
              });
              return;
            }

            devices.set(device.address, device);

            if (deviceDiscoveredCallback && !previousDiscoveredDevices.has(device.address)) {
                deviceDiscoveredCallback({
                  address: device.address,
                  name: device.name,
                  paired: false
                });
              }
          });

          success();
      },
      (errorMessage) => {
        discoveryInProgress = false;
        error(errorMessage);
      },
      CORDOVA_SERVICE_NAME,
      "startDiscovery",
      []
    );
  });
};

var cancelDiscovery = function() {
  return new Promise(function(success,error) {
    discoveryInProgress = false;
    exec(success, error, "Bluetooth", "cancelDiscovery", []);
  });
};

exports.enableDiscovery = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "enableDiscovery", []);
  });
};

exports.connect = function(device) {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "connect", [device]);
	});
};

exports.disconnect = function() {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "disconnect", []);
	});
};

exports.setDiscoverableCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoverableCallback", []);
};

var setDiscoveredCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoveredCallback", []);
};

var setDiscoveryCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoveryCallback", []);
};

var setInternalDiscoveryCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setInternalDiscoveryCallback", []);
};

exports.setSupportedCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setSupportedCallback", []);
};

var internalStateCallback = () => { };
var stateCallback = () => { };

var setStateCallback = function (callback) {
  stateCallback = callback;
  exec(function (result) { internalStateCallback(result); stateCallback(result); }, null, "Bluetooth", "setStateCallback", []);
};

var setInternalStateCallback = function (callback) {
  internalStateCallback = callback;
  exec(function (result) { internalStateCallback(result); stateCallback(result); }, null, "Bluetooth", "setStateCallback", []);
};


exports.BluetoothSocket = BluetoothSocket;
exports.BluetoothServerSocket = BluetoothServerSocket;
exports.setDiscoveryCallback = setDiscoveryCallback;
exports.startDiscovery = startDiscovery;
exports.setDiscoveredCallback = setDiscoveredCallback;
exports.cancelDiscovery = cancelDiscovery;
exports.listPairedDevices = listPairedDevices;
exports.setStateCallback = setStateCallback;
module.exports = exports;