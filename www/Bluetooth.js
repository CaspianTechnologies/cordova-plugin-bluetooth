var exec = require('cordova/exec');

exports.getDeviceInfo = function(success, error) {
    exec(success, error, "Bluetooth", "getDeviceInfo", []);
};
