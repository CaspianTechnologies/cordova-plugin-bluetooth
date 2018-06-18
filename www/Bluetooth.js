const exec = require('cordova/exec');

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

exports.getListening = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getListening", []);
  });
};

exports.getConnected = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getConnected", []);
  });
};

exports.getReading = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "getReading", []);
  });
};

exports.enable = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "enable", []);
  });
};

exports.listPairedDevices = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "listPairedDevices", []);
  });
};

exports.startDiscovery = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "startDiscovery", []);
  });
};

exports.cancelDiscovery = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "cancelDiscovery", []);
  });
};

exports.enableDiscovery = function() {
  return new Promise(function(success,error) {
    exec(success, error, "Bluetooth", "enableDiscovery", []);
  });
};

exports.startListening = function() {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "startListening", []);
	});
};

exports.stopListening = function() {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "stopListening", []);
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

exports.startReading = function() {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "startReading", []);
	});
};

exports.stopReading = function() {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "stopReading", []);
	});
};

exports.write = function(data) {
	return new Promise(function(success,error) {
		exec(success, error, "Bluetooth", "write", [data]);
	});
};

exports.setConnectedCallback = function(callback) {
  exec(callback, () => callback(null), "Bluetooth", "setConnectedCallback", []);
};

exports.setDiscoverableCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoverableCallback", []);
};

exports.setDiscoveredCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoveredCallback", []);
};

exports.setDiscoveryCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setDiscoveryCallback", []);
};

exports.setMessageCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setMessageCallback", []);
};

exports.setStateCallback = function(callback) {
  exec(callback, null, "Bluetooth", "setStateCallback", []);
};

