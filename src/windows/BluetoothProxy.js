const SERVICE_UUID = "{995f40e0-ce68-4d24-8f68-f49d2b9d661f}";

const SDP_SERVICE_NAME_ATTRIBUTE_ID = 0x100;
const SDP_SERVICE_NAME_ATTRIBUTE_TYPE = (4 << 3) | 5;

const ANDROID_STATE_OFF = 0x0000000a;
const ANDROID_STATE_TURNING_ON = 0x0000000b;
const ANDROID_STATE_ON = 0x0000000c;
const ANDROID_STATE_TURNING_OFF = 0x0000000d;

const StateMap = {};
StateMap[Windows.Devices.Radios.RadioState.disabled] = ANDROID_STATE_OFF;
StateMap[Windows.Devices.Radios.RadioState.off] = ANDROID_STATE_OFF;
StateMap[Windows.Devices.Radios.RadioState.on] = ANDROID_STATE_ON;
StateMap[Windows.Devices.Radios.RadioState.unknown] = ANDROID_STATE_OFF;

const plugin = (() => {
  let _supported = false;
  let _state = false;
  let _discovering = false;

  let _supportedCallback = null;
  let _stateCallback = null;
  let _discoveringCallback = null;
  let _discoveringInternalCallback = null;
  let _discoveredCallback = null;

  return {
    // state control
    get supported() {
      return _supported;
    },
    set supported(value) {
      if (value === _supported) {
        return;
      }

      _supported = value;
      if (_supportedCallback) {
        _supportedCallback(_supported, { keepCallback: true });
      }
    },
    // state control
    get state() {
      return _state;
    },
    set state(value) {
      if (value === _state) {
        return;
      }

      _state = value;
      if (_stateCallback) {
        _stateCallback(_state, { keepCallback: true });
      }
    },
    // discovering control
    get discovering() {
      return _discovering;
    },
    set discovering(value) {
      if (value === _discovering) {
        return;
      }

      _discovering = value;
      if (_discoveringCallback) {
        _discoveringCallback(_discovering, { keepCallback: true });
      }
      if (_discoveringInternalCallback) {
        _discoveringInternalCallback(_discovering, { keepCallback: true });
      }
    },
    // device discovered
    discovered: (device) => {
      if (_discoveredCallback) {
        _discoveredCallback(device, { keepCallback: true });
      }
    },
    set supportedCallback(callback) {
      _supportedCallback = callback;
    },
    set stateCallback(callback) {
      _stateCallback = callback;
    },
    set discoveringCallback(callback) {
      _discoveringCallback = callback;
    },
    set discoveringInternalCallback(callback) {
      _discoveringInternalCallback = callback;
    },

    set discoveredCallback(callback) {
      _discoveredCallback = callback;
    },
    // uncontrolled data
    sockets: [],
    services: [],
    writers: [],
    connectedDevices: [],
    watcher: null,
    adapter: null,
    discoveryStarted: false
  }
})();

async function getBluetoothAdapterAsync() {
  const radios = await Windows.Devices.Radios.Radio.getRadiosAsync();
  const bluetoothAdapters = radios.filter(radio => {
    return radio.name.toLowerCase() === 'bluetooth';
  });

  return bluetoothAdapters.length > 0 ? bluetoothAdapters[0] : null;
}

function stateHandler(state) {
  plugin.state = StateMap[plugin.adapter.state];
}

async function refreshAdapterState() {
  const adapter = await getBluetoothAdapterAsync();

  try {
    if (!plugin.discovering && adapter && adapter.state === Windows.Devices.Radios.RadioState.on && plugin.discoveryStarted && plugin.watcher.status !== 1) {
      plugin.watcher.start();
      plugin.discovering = true;
    }
  } catch (e) {}

  if (adapter && !plugin.adapter) {
    plugin.adapter = adapter;
  plugin.supported = true;
    plugin.adapter.addEventListener('statechanged', stateHandler);
    plugin.state = StateMap[plugin.adapter.state];
  } else if (!adapter && plugin.adapter) {
    plugin.adapter.removeEventListener('statechanged', stateHandler);
    plugin.adapter = null;
  plugin.supported = false;
    plugin.state = ANDROID_STATE_OFF;
  }
}

refreshAdapterState().then(() => setInterval(refreshAdapterState, 1000));

function setupDiscoveryWatcher(discoveredCallback, stoppedCallback) {
  const watcher = new Windows.Devices.Enumeration.DeviceInformation.createWatcher(Windows.Devices.Bluetooth.BluetoothDevice.getDeviceSelectorFromPairingState(false), null);

  let deviceArray = [];

  watcher.addEventListener("added", devInfo => {
    discoveredCallback(devInfo);

    deviceArray.push(devInfo);
  });

  watcher.addEventListener("removed", devUpdate => {
    deviceArray = deviceArray.filter(devInfo => devInfo.id !== devUpdate.id );
  });

  watcher.addEventListener("updated", devUpdate => {
    deviceArray.filter(devInfo => devInfo.id === devUpdate.id).forEach(devInfo => {
      devInfo.update(devUpdate);

      discoveredCallback(devInfo);
    });
  });

  watcher.addEventListener("enumerationcompleted", () => {
    watcher.stop();
  });

  watcher.addEventListener("stopped", () => {
    stoppedCallback();
  });

  return watcher;
}

plugin.watcher = setupDiscoveryWatcher(devInfo => {
  plugin.discovered({
    name: devInfo.name ? devInfo.name : 'Unknown',
    address: devInfo.id
  });
}, () => {
  plugin.discovering = false;
});

async function loadMessageAsync(reader, socketKey) {
  const INPUT_STREAM_BUFFER_SIZE = 16 * 1024;

  let result = [];
  let buffer = new Windows.Storage.Streams.Buffer(INPUT_STREAM_BUFFER_SIZE);
  let data = null;

  do {
    let currentSocket = plugin.sockets[socketKey];
    data = await currentSocket.inputStream.readAsync(buffer, INPUT_STREAM_BUFFER_SIZE, Windows.Storage.Streams.InputStreamOptions.partial);
    var dataReader = Windows.Storage.Streams.DataReader.fromBuffer(data);
    let dataArray = new Array(data.length);
    dataReader.readBytes(dataArray);
    result = result.concat(dataArray);
  } while (data.length === INPUT_STREAM_BUFFER_SIZE);

  return result;
}

async function findServiceAsync(id) {
  let service = await Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.fromIdAsync(id);
  if (!service) {
    const services = await listServicesAsync();
    const matching = services.filter(service => {
      return service.id.toLowerCase().indexOf(id.toLowerCase()) !== -1;
    });

    if (matching.length > 0) {
      service = await Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.fromIdAsync(matching[0].id);
    }
  }
  return service;
}

async function findDeviceAsync(id) {
  return await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(id);
}

async function listServicesAsync() {
  return await Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
    Windows.Devices.Bluetooth.Rfcomm.RfcommDeviceService.getDeviceSelector(
      Windows.Devices.Bluetooth.Rfcomm.RfcommServiceId.fromUuid(SERVICE_UUID)
    ),
    null
  );
}

async function listPairedDevicesAsync() {
  if (!plugin.adapter || plugin.adapter.state !== Windows.Devices.Radios.RadioState.on) {
    return [];
  }
  const devices = await Windows.Devices.Enumeration.DeviceInformation.findAllAsync(
    Windows.Devices.Bluetooth.BluetoothDevice.getDeviceSelector(),
    null
  );
  
  return devices.map(device => {
    return {
      name: device.name ? device.name : 'Unknown',
      address: device.id
    };
  });
}

async function getDevicesAsync(services) {
  const devices = [];
  for (const service of services) {
    const device = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(service.id);
    devices.push({
      name: device && device.name ? device.name : 'Unknown',
      address: service.id
    });
  }
  return devices;
}

async function connectToServiceAsync(service) {
  const socket = new Windows.Networking.Sockets.StreamSocket();
  await socket.connectAsync(
    service.connectionHostName,
    service.connectionServiceName,
    Windows.Networking.Sockets.SocketProtectionLevel.plainSocket
  );

  return socket;
}

function dispatchEvent(event) {
  cordova.plugins.bluetooth.BluetoothSocket.dispatchEvent(event);
}

function dispatchCloseEvent(socketKey) {
  const event = {
      type: "Close",
      socketKey: socketKey
  };
  dispatchEvent(event);
}

function dispatchConnectedEvent(socketKey) {
  const event = {
      type: "Connected",
      name: "",
      address: "",
      socketKey: socketKey,
  };
  dispatchEvent(event);
}

function dispatchDataReceivedEvent(socketKey, data) {
  const event = {
      type: "DataReceived",
      data: data,
      socketKey: socketKey,
  };
  dispatchEvent(event);
}

async function readSocket(socketKey, successCallback, errorCallback) {
  if (!plugin.sockets[socketKey]) {
      errorCallback("Not connected");
      return;
  }

  let reader = null;
  successCallback();

  try {
    reader = new Windows.Storage.Streams.DataReader(plugin.sockets[socketKey].inputStream);

    do {
      const message = await loadMessageAsync(reader, socketKey);
      dispatchDataReceivedEvent(socketKey, message);
    } while (plugin.sockets[socketKey] !== null);
  } catch (e) {
    dispatchCloseEvent(socketKey);
    closeSocket(socketKey);
    errorCallback(e);
  } finally {
    reader.detachStream();
  }
}

function closeSocket(socketKey, successCallback, errorCallback) {
  plugin.connectedDevices[socketKey] = null;
  try {
    if (plugin.writers[socketKey]) {
      plugin.writers[socketKey].detachStream();
      plugin.writers[socketKey] = null;
    }

    if (plugin.sockets[socketKey]) {
      plugin.sockets[socketKey].close();
      plugin.sockets[socketKey] = null;
    }
    this.dispatchCloseEvent(socketKey);
    successCallback();
  } catch (e) {
    errorCallback(e);
  }
}

cordova.commandProxy.add("Bluetooth", {
  getSupported: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();
      successCallback(adapter !== null)
    } catch (e) {
      errorCallback(e);
    }
  },
  getState: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();
      if (adapter) {
        successCallback(StateMap[adapter.state]);
      } else {
        successCallback(StateMap[Windows.Devices.Radios.RadioState.unknown]);
      }
    } catch (e) {
      errorCallback(e);
    }
  },
  getDiscoverable: (successCallback, errorCallback) => {
    successCallback(false);
  },
  requestEnable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  enable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  disable: (successCallback, errorCallback) => {
    try {
      Windows.System.Launcher.launchUriAsync(Windows.Foundation.Uri("ms-settings-bluetooth:"));
      successCallback()
    } catch (e) {
      errorCallback(e)
    }
  },
  listPairedDevices: async (successCallback, errorCallback) => {
    try {
      const adapter = await getBluetoothAdapterAsync();

      const devices = await listPairedDevicesAsync();

      successCallback(devices);
    } catch (e) {
      errorCallback(e);
    }
  },
    startDiscovery: async (successCallback, errorCallback) => {
        if (plugin.discoveryStarted && !plugin.discovering) {
            successCallback();
            return;
        }
    if (plugin.discovering) {
      errorCallback("Already discovering");
      return;
    }

    try {
      plugin.discovering = true;
      plugin.discoveryStarted = true;

      const adapter = await getBluetoothAdapterAsync();

      plugin.watcher.start();

      successCallback();
    } catch (e) {
      plugin.discovering = false;
      errorCallback(e);
    }
  },
  cancelDiscovery: async (successCallback, errorCallback) => {
    if (!plugin.discovering) {
      errorCallback("Not discovering");
      return;
    }

    try {
      plugin.discoveryStarted = false;
      plugin.watcher.stop();

      successCallback()
    } catch (e) {
      errorCallback(e);
    }
  },
  enableDiscovery: (successCallback, errorCallback) => {
    errorCallback('Discoverable mode is not supported');
  },
  startServer: (successCallback, errorCallback) => {
    errorCallback('Listening mode is not supported');
  },
  stopServer: (successCallback, errorCallback) => {
    errorCallback('Listening mode is not supported');
  },
  open: async (successCallback, errorCallback, params) => {
    const socketKey = params[0];
    const deviceAddress = params[1];

    try {
      const adapter = await getBluetoothAdapterAsync();

      if (!adapter || !adapter.state === Windows.Devices.Radios.RadioState.on) {
        errorCallback("Bluetooth is not enabled");
        return;
      }

      if (plugin.connectedDevices[socketKey]) {
        errorCallback("Already connected");
        return;
      }

      plugin.services[socketKey] = await findServiceAsync(deviceAddress);
      if (plugin.services[socketKey]) {
        plugin.sockets[socketKey] = await connectToServiceAsync(plugin.services[socketKey]);
        plugin.writers[socketKey] = new Windows.Storage.Streams.DataWriter(plugin.sockets[socketKey].outputStream);
        plugin.connectedDevices[socketKey] = deviceAddress;
        dispatchConnectedEvent(socketKey);
        readSocket(socketKey, () => { }, () => { });
        successCallback();
        return;
      }

      const bluetoothDevice = await Windows.Devices.Bluetooth.BluetoothDevice.fromIdAsync(deviceAddress);

      if (!bluetoothDevice) {
        errorCallback('Failed to find a device with id: ' + deviceAddress);
        return;
      }

      const pairingResult = await bluetoothDevice.deviceInformation.pairing.pairAsync();

      if (!pairingResult || (pairingResult.status !== 3 && pairingResult.status !== Windows.Devices.Enumeration.DevicePairingResultStatus.paired)) {
        errorCallback('Failed to pair devices');
        return;
      }

      plugin.services[socketKey] = await findServiceAsync(deviceAddress);
      if (plugin.services[socketKey]) {
        plugin.sockets[socketKey] = await connectToServiceAsync(plugin.services[socketKey]);
        plugin.writers[socketKey] = new Windows.Storage.Streams.DataWriter(plugin.sockets[socketKey].outputStream);
        plugin.connectedDevices[socketKey] = deviceAddress;
        dispatchConnectedEvent(socketKey);
        readSocket(socketKey, () => {}, () => {});
        successCallback();
        return;
      }

      errorCallback('Failed to pair and then connect');
    } catch (e) {
      if (plugin.writers[socketKey]) {
        plugin.writers[socketKey].detachStream();
        plugin.writers[socketKey] = null;
      }

      if (plugin.sockets[socketKey]) {
        plugin.sockets[socketKey].close();
        plugin.sockets[socketKey] = null;
        dispatchCloseEvent(socketKey);
      }
      errorCallback(e);
    }
  },
  close: (successCallback, errorCallback, params) => {
    const socketKey = params[0];
    closeSocket(socketKey, successCallback, errorCallback);
  },
  write: async (successCallback, errorCallback, params) => {
    try {
      const socketKey = params[0];
      const data = params[1];

      plugin.writers[socketKey].writeBytes(data);
      await plugin.writers[socketKey].storeAsync();
      successCallback()
    } catch (e) {
      errorCallback(e);
    }
  },
  setSupportedCallback: successCallback => plugin.supportedCallback = successCallback,
  setDiscoveredCallback: successCallback => plugin.discoveredCallback = successCallback,
  setDiscoveryCallback: successCallback => plugin.discoveringCallback = successCallback,
  setInternalDiscoveryCallback: successCallback => plugin.discoveringInternalCallback = successCallback,
  setStateCallback: successCallback => plugin.stateCallback = successCallback,
  setDiscoverableCallback: () => {},
  setListeningCallback: () => {},
});