function getDeviceInfo(success, error, opts) {
    success("Dummy browser bluetooth info");
}

module.exports = {
    getDeviceInfo: getDeviceInfo
};

require('cordova/exec/proxy').add('Bluetooth', module.exports);